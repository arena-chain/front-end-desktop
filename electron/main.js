const { app, BrowserWindow, ipcMain, nativeImage, desktopCapturer } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ROOT, resolveRoute, resolveRoleHome } = require('./routes');
const { registerLiveGameIpc } = require('./electron-live-game/main');

registerLiveGameIpc(ipcMain);

let win;

/** Forward gameflow phase string to dashboard (preload: onGameflowPhase). */
function forwardGameflowPhaseToRenderer(phase) {
    if (!win || phase == null) return;
    const p = String(phase)
        .replace(/^"|"$/g, '')
        .trim();
    if (!p) return;
    try {
        if (win.webContents.isDestroyed()) return;
    } catch {
        return;
    }
    win.webContents.send('gameflow-phase-update', p);
}

/** NestJS live-game namespace → dashboard gameflow (start/stop Live Client polling). */
function connectNestLiveGameSocket() {
    const baseUrl = process.env.NEST_LIVE_GAME_URL || 'http://127.0.0.1:3000';
    try {
        const { io } = require('socket.io-client');
        const nestSocket = io(`${baseUrl}/live-game`, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
        });
        nestSocket.on('connect', () => console.log('[live-game] Socket.io connected:', baseUrl));
        nestSocket.on('game-started', () => forwardGameflowPhaseToRenderer('InProgress'));
        nestSocket.on('game-ended', () => forwardGameflowPhaseToRenderer('EndOfGame'));
        nestSocket.on('connect_error', (err) =>
            console.warn('[live-game] Socket.io:', err?.message || err),
        );
    } catch (e) {
        console.error('[live-game] socket.io-client failed:', e);
    }
}

let riftProcess = null;
let conduitProcess = null;
let currentPairingCode = null;
let conduitHubPollTimer = null;
let conduitLaunchTimeout = null;

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
    const riftDir = path.join('C:\\Users\\HP\\Desktop\\Khamessi\\PI\\backend-nest1\\rift');
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
        const raw = data.toString();
        const text = raw.trim();
        console.log('[Rift]', text);

        if (raw.includes('[+] Peer connected to') && currentPairingCode) {
            if (win) win.webContents.send('mobile-paired');
        }
    });

    riftProcess.stderr.on('data', (data) => {
        console.error('[Rift Error]', data.toString().trim());
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
    connectNestLiveGameSocket();

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
