const { app, BrowserWindow, ipcMain, nativeImage, desktopCapturer, shell } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const steamworks = require('steamworks.js');
const { ROOT, resolveRoute, resolveRoleHome } = require('./routes');

let steamClient = null;
let currentAppId = null;

let win;
let riftProcess = null;
let conduitProcess = null;
let currentPairingCode = null;
let conduitHubPollTimer = null;
let conduitLaunchTimeout = null;

// Windows machines can fail creating default GPU cache folders (Access denied).
// Force cache paths to a writable temp location to avoid noisy startup errors.
if (process.platform === 'win32') {
    try {
        const cacheRoot = path.join(app.getPath('temp'), 'arena-chain-electron-cache');
        fs.mkdirSync(cacheRoot, { recursive: true });
        app.commandLine.appendSwitch('disk-cache-dir', cacheRoot);
        app.commandLine.appendSwitch('user-data-dir', path.join(cacheRoot, 'user-data'));
    } catch (e) {
        console.warn('[Electron] Cache path override failed:', e.message);
    }
}

function resolveRiftDir() {
    const configured = process.env.RIFT_DIR;
    const candidates = [
        configured,
        path.join(ROOT, '..', 'backend-nest-Rank_and_ELO', 'rift'),
        path.join(ROOT, '..', 'backend-nest-matchmakingcs2back', 'backend-nest-matchmakingcs2back', 'rift'),
        path.join(ROOT, '..', '..', 'backend-nest-matchmakingcs2back', 'backend-nest-matchmakingcs2back', 'rift'),
        path.join(ROOT, '..', '..', 'backend-nest-Rank_and_ELO', 'rift'),
    ].filter(Boolean);

    for (const dir of candidates) {
        const srcIndex = path.join(dir, 'src', 'index.ts');
        const pkg = path.join(dir, 'package.json');
        if (fs.existsSync(srcIndex) && fs.existsSync(pkg)) {
            return dir;
        }
    }

    return null;
}

function clearConduitLaunchWatchers() {
    if (conduitHubPollTimer) {
        clearInterval(conduitHubPollTimer);
        conduitHubPollTimer = null;
    }
    if (conduitLaunchTimeout) {
        clearTimeout(conduitLaunchTimeout);
        conduitLaunchTimeout = null;
    }
}

/**
 * Mimic Conduit stores the hub JWT in %APPDATA%\\Mimic\\token (see Persistence.cs).
 * The 6-digit pairing code is inside the JWT payload — same as the Conduit window.
 */
function getMimicTokenPath() {
    const appData = process.env.APPDATA;
    if (!appData) return null;
    return path.join(appData, 'Mimic', 'token');
}

function getHubCodeFromMimicTokenFile() {
    const tokenPath = getMimicTokenPath();
    if (!tokenPath || !fs.existsSync(tokenPath)) return null;
    try {
        const token = fs.readFileSync(tokenPath, 'utf8').trim();
        const parts = token.split('.');
        if (parts.length < 2) return null;
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const rem = b64.length % 4;
        if (rem) b64 += '='.repeat(4 - rem);
        const json = Buffer.from(b64, 'base64').toString('utf8');
        const payload = JSON.parse(json);
        const code = payload && payload.code;
        if (typeof code === 'string' && /^\d{6}$/.test(code)) return code;
        return null;
    } catch {
        return null;
    }
}

function startRift() {
    // Port cleanup for 51001 to prevent EADDRINUSE
    try {
        if (process.platform === 'win32') {
            console.log('[Rift] Pre-launch cleanup: Checking port 51001...');
            execSync('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :51001\') do taskkill /f /pid %a', { stdio: 'ignore' });
        }
    } catch (_) {}

    const riftDir = resolveRiftDir();
    if (!riftDir) {
        console.error('[Rift] Could not locate rift directory. Set RIFT_DIR env var or place backend next to desktop project.');
        if (win) {
            win.webContents.send(
                'conduit-error',
                'Rift backend not found. Set RIFT_DIR or place backend-nest project next to this desktop folder.',
            );
        }
        return;
    }
    console.log('[Rift] Using directory:', riftDir);
    const distIndex = path.join(riftDir, 'dist', 'index.js');

    try {
        if (!fs.existsSync(distIndex)) {
            console.log('[Rift] Compiling TypeScript...');
            execSync('npx tsc -p .', { cwd: riftDir, stdio: 'inherit' });
        }
    } catch (e) {
        console.error('[Rift] TypeScript compilation failed:', e.message);
    }

    riftProcess = spawn('node', ['dist/index.js'], {
        cwd: riftDir,
        env: {
            ...process.env,
            RIFT_JWT_SECRET: 'local-dev-mimic-secret',
            // Must not use 3000 — NestJS API uses 3000 (/api/...). Rift default in repo is 51001.
            PORT: '51001',
        },
    });

    riftProcess.stdout.on('data', (data) => {
        const text = data.toString().trim();
        console.log('[Rift]', text);

        if (text.includes('[+] Peer connected to') && currentPairingCode) {
            if (win) win.webContents.send('mobile-paired');
        }
    });

    riftProcess.stderr.on('data', (data) => {
        console.error('[Rift Error]', data.toString().trim());
    });

    riftProcess.on('error', (err) => {
        console.error('[Rift] Failed to spawn process:', err);
        if (err.code === 'ENOENT') {
            console.error('[Rift] NODE was not found in path. Background service failed to start.');
            if (win) {
                win.webContents.send('conduit-error', 'Rift background service: Node.js not found. Please install Node.js.');
            }
        }
    });

    riftProcess.on('exit', (code) => {
        console.log('[Rift] Process exited with code', code);
        riftProcess = null;
    });
}

function launchConduit() {
    return new Promise((resolve, reject) => {
        if (conduitProcess) {
            resolve(currentPairingCode);
            return;
        }

        const conduitPath = path.join(ROOT, '..', 'resources', 'Conduit.exe');
        if (!fs.existsSync(conduitPath)) {
            reject(new Error(`Conduit.exe not found at ${conduitPath}`));
            return;
        }

        const resourcesDir = path.dirname(conduitPath);
        let launchPhase = 'pending';
        let stderrBuf = '';

        let preSpawnTokenContent = null;
        try {
            const tp = getMimicTokenPath();
            if (tp && fs.existsSync(tp)) preSpawnTokenContent = fs.readFileSync(tp, 'utf8');
        } catch (_) {
            /* ignore */
        }
        const spawnStartedAt = Date.now();
        let usedStaleTokenFallback = false;

        conduitProcess = spawn(conduitPath, [], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: resourcesDir,
        });

        const onPairingCodeFound = (code) => {
            if (launchPhase !== 'pending') return;
            launchPhase = 'hasCode';
            clearConduitLaunchWatchers();
            currentPairingCode = code;
            if (win) win.webContents.send('conduit-code', code);
            resolve(code);
        };

        const failLaunch = (message) => {
            if (launchPhase !== 'pending') return;
            launchPhase = 'failed';
            clearConduitLaunchWatchers();
            conduitProcess = null;
            currentPairingCode = null;
            if (win) win.webContents.send('conduit-error', message);
            reject(new Error(message));
        };

        conduitHubPollTimer = setInterval(() => {
            if (launchPhase !== 'pending') {
                clearConduitLaunchWatchers();
                return;
            }
            const tokenPath = getMimicTokenPath();
            if (!tokenPath || !fs.existsSync(tokenPath)) return;
            let content;
            let mtime;
            try {
                content = fs.readFileSync(tokenPath, 'utf8');
                mtime = fs.statSync(tokenPath).mtimeMs;
            } catch {
                return;
            }
            const tokenUpdated =
                content !== preSpawnTokenContent || mtime >= spawnStartedAt - 1000;
            const code = getHubCodeFromMimicTokenFile();
            if (!code) return;

            if (tokenUpdated) {
                console.log('[Conduit] Pairing code from Mimic token file:', code);
                onPairingCodeFound(code);
                return;
            }

            // Valid JWT was already on disk; Conduit may skip rewriting the file (ConnectionManager.cs).
            if (!usedStaleTokenFallback && Date.now() - spawnStartedAt >= 2500) {
                usedStaleTokenFallback = true;
                console.log('[Conduit] Pairing code from existing Mimic token file:', code);
                onPairingCodeFound(code);
            }
        }, 400);

        conduitLaunchTimeout = setTimeout(() => {
            if (launchPhase === 'pending') {
                failLaunch(
                    'Timed out waiting for a pairing code. Open League of Legends so Mimic can connect, and ensure Rift is running (port 51001).',
                );
            }
        }, 120000);

        conduitProcess.stdout.on('data', (data) => {
            const text = data.toString();
            console.log('[Conduit]', text.trim());
            const match = text.match(/\b(\d{6})\b/);
            if (match && launchPhase === 'pending') {
                onPairingCodeFound(match[1]);
            }
        });

        conduitProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderrBuf += chunk;
            console.error('[Conduit Error]', chunk.trim());
        });

        conduitProcess.on('error', (err) => {
            console.error('[Conduit] Failed to start:', err.message);
            failLaunch(err.message || 'Failed to start Conduit.exe');
        });

        conduitProcess.on('exit', (code, signal) => {
            if (launchPhase === 'failed') {
                return;
            }

            conduitProcess = null; // child has ended
            clearConduitLaunchWatchers();

            if (launchPhase === 'hasCode') {
                currentPairingCode = null;
                if (win) win.webContents.send('conduit-stopped');
                return;
            }

            currentPairingCode = null;
            const resourceMissing = stderrBuf.includes('MissingManifestResourceException');
            const msg = resourceMissing
                ? 'Conduit.exe is missing embedded resources (often a bad copy or antivirus damaged the file). Fix: (1) In Avast, restore Conduit.exe if quarantined and add an exclusion for desktop version/resources/Conduit.exe. (2) Rebuild Conduit in Visual Studio from your Mimic/conduit project (Release) and copy bin/Release/Conduit.exe into resources/ — do not copy only part of the output.'
                : `Conduit exited before showing a code (exit ${code}${signal ? ', signal ' + signal : ''}). If security software blocked Conduit.exe, allow it and try again.`;

            failLaunch(msg);
        });
    });
}

function stopConduit() {
    clearConduitLaunchWatchers();
    if (conduitProcess) {
        conduitProcess.kill();
        conduitProcess = null;
        currentPairingCode = null;
    }
}

function createWindow() {
    const icon = nativeImage.createFromPath(path.join(ROOT, 'assets/logo.png'));

    win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 620,
        backgroundColor: '#0a0b0f',
        titleBarStyle: 'hiddenInset',
        frame: true,
        icon,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            // file:// HTML must call http://127.0.0.1:3000 — default webSecurity blocks that fetch
            webSecurity: false,
        },
    });

    if (process.platform === 'darwin') {
        app.dock.setIcon(icon);
    }

    win.loadFile(resolveRoute('login'));
    win.maximize();
}

function navigateTo(routeName) {
    const filePath = resolveRoute(routeName);
    if (!filePath || !win) return;
    win.loadFile(filePath);
}

app.whenReady().then(() => {
    startRift();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (riftProcess) riftProcess.kill();
    if (conduitProcess) conduitProcess.kill();
});

ipcMain.on('navigate-to', (event, routeName) => {
    navigateTo(routeName);
});

ipcMain.on('login-success', (event, { role }) => {
    if (!win) return;
    win.loadFile(resolveRoleHome(role));
});

ipcMain.handle('desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
    });

    return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail?.toDataURL() || null,
        appIcon: source.appIcon?.toDataURL() || null,
    }));
});

ipcMain.handle('launch-conduit', async () => {
    try {
        await launchConduit();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-conduit-code', async () => currentPairingCode);

ipcMain.handle('stop-conduit', async () => {
    stopConduit();
    return { success: true };
});

ipcMain.handle('open-external-link', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ──────────────────────────────────────────────────────────
// STEAMWORKS IPC HANDLERS
// ──────────────────────────────────────────────────────────

ipcMain.handle('steam-init', async (event, appId) => {
    const targetId = parseInt(appId, 10) || 480;
    console.log(`[Steam] IPC: steam-init called with AppID: ${targetId}`);
    
    if (steamClient) {
        if (currentAppId === targetId) return { success: true, appId: currentAppId };
        console.warn(`[Steam] Already initialized with ${currentAppId}, cannot switch to ${targetId} without restart.`);
        return { 
            success: false, 
            error: `Steam is already initialized for another game (AppID ${currentAppId}). Please restart the launcher to switch games.`,
            alreadyInitialized: true,
            currentAppId
        };
    }

    try {
        console.log(`[Steam] Attempting to init with AppID ${targetId}...`);
        steamClient = steamworks.init(targetId);
        currentAppId = targetId;
        console.log(`[Steam] SUCCESS: Initialized with AppID ${currentAppId}`);
        return { success: true, appId: currentAppId };
    } catch (e) {
        console.error(`[Steam] CRITICAL ERROR during initialization for AppID ${targetId}:`, e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('steam-get-status', async () => {
    if (!steamClient) return { initialized: false };
    try {
        return {
            initialized: true,
            steamId: steamClient.localplayer.getSteamId().toString(),
            personaName: steamClient.localplayer.getName(),
            appId: currentAppId
        };
    } catch (e) {
        console.error('[Steam] Failed to get status (session might be lost):', e.message);
        return { initialized: false, error: e.message };
    }
});

ipcMain.handle('steam-create-lobby', async (event, { gameId, mode }) => {
    console.log(`[Steam] IPC: steam-create-lobby called for gameId=${gameId}, mode=${mode}`);
    if (!steamClient) {
        console.error('[Steam] Create Lobby failed: Steam not initialized');
        throw new Error('Steam not initialized');
    }
    
    try {
        console.log('[Steam] Creating lobby (Public, 10 members)...');
        const lobby = await steamClient.matchmaking.createLobby(1, 10);
        const lobbyIdStr = lobby.id.toString();
        console.log(`[Steam] LOBBY CREATED: ${lobbyIdStr}`);
        
        // Set metadata
        lobby.setData('matchId', gameId);
        lobby.setData('mode', mode);
        console.log(`[Steam] Metadata set: matchId=${gameId}, mode=${mode}`);
        
        const hostId = steamClient.localplayer.getSteamId().toString();
        console.log(`[Steam] My SteamID (Host): ${hostId}`);
        
        return { 
            success: true, 
            lobbyId: lobbyIdStr,
            hostSteamId: hostId
        };
    } catch (e) {
        console.error('[Steam] LOBBY CREATION FAILED:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('steam-join-lobby', async (event, { lobbyId }) => {
    console.log(`[Steam] IPC: steam-join-lobby called for lobbyId=${lobbyId}`);
    if (!steamClient) {
        console.error('[Steam] Join Lobby failed: Steam not initialized');
        throw new Error('Steam not initialized');
    }
    
    try {
        console.log(`[Steam] Attempting to join lobby ${lobbyId} (Type: ${typeof lobbyId})...`);
        // steamworks.js requires BigInt for IDs
        const lobby = await steamClient.matchmaking.joinLobby(BigInt(lobbyId));
        console.log(`[Steam] Joined lobby successfully! ID: ${lobby.id.toString()}`);
        return { success: true, lobbyId: lobby.id.toString() };
    } catch (e) {
        console.error('[Steam] Failed to join lobby:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('steam-invite-friend', async (event, { steamId, lobbyId }) => {
    console.log(`[Steam] IPC: steam-invite-friend called for friend=${steamId}, lobby=${lobbyId}`);
    if (!steamClient) {
        console.error('[Steam] Invite failed: Steam not initialized');
        throw new Error('Steam not initialized');
    }
    
    try {
        steamClient.friends.inviteUserToLobby(BigInt(steamId), BigInt(lobbyId));
        console.log('[Steam] Invite request sent to Steam.');
        return { success: true };
    } catch (e) {
        console.error('[Steam] Invite failed:', e);
        return { success: false, error: e.message };
    }
});

// ──────────────────────────────────────────────────────────
// LCU / LEAGUE OF LEGENDS IPC HANDLERS
// ──────────────────────────────────────────────────────────

const { LcuService } = require('./lcu.service');
const lcu = new LcuService();

ipcMain.handle('lcu-create-match-lobby', async (event, { opponentNames, gameMode }) => {
    try {
        console.log(`[LCU] Starting automation for ${gameMode} vs ${opponentNames}`);
        
        const connected = await lcu.connect();
        if (!connected) {
            throw new Error('LCU_NOT_DETECTED: League of Legends lockfile not found. Please ensure the game is fully logged in.');
        }

        await lcu.createCustomLobby(gameMode);
        const results = await lcu.invitePlayers(opponentNames);

        return { success: true, ...results };
    } catch (e) {
        console.error('[LCU] Automation failed:', e);
        // Return full error message for debugging
        return { success: false, error: `${e.name}: ${e.message}` };
    }
});

ipcMain.handle('lcu-get-status', async () => {
    const connected = await lcu.connect();
    return { connected };
});

ipcMain.handle('lcu-accept-lobby-invites', async () => {
    try {
        return await lcu.acceptAllReceivedInvitations();
    } catch (e) {
        console.error('[LCU] lcu-accept-lobby-invites:', e);
        return { success: false, error: e.message, accepted: 0, total: 0 };
    }
});
