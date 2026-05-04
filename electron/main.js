const { app, BrowserWindow, ipcMain, nativeImage, desktopCapturer } = require('electron');
const path = require('path');
const { ROOT, resolveRoute, resolveRoleHome } = require('./routes');

// Register protocol for deep linking (arenachain://)
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('arenachain', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('arenachain');
}

// Handle protocol on Windows/Linux (deep links)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
            const url = commandLine.pop();
            if (typeof url === 'string') handleDeepLink(url);
        }
    });
}

function handleDeepLink(url) {
    if (!url || typeof url !== 'string' || !url.includes('accessToken=')) return;
    console.log('Finalizing login via deep link:', url);
    try {
        const paramsStr = url.includes('?') ? url.split('?')[1] : (url.includes('success') ? url.split('success')[1] : '');
        const searchParams = new URLSearchParams(paramsStr);
        const accessToken = searchParams.get('accessToken');
        const refreshToken = searchParams.get('refreshToken');
        
        if (accessToken) {
            if (win) {
                win.webContents.send('google-auth-success', { accessToken, refreshToken });
                console.log('Sent tokens to renderer');
            } else {
                console.warn('Main window not ready for deep link tokens');
                // Store tokens for when win is ready
                global.pendingAuth = { accessToken, refreshToken };
            }
        }
    } catch (e) {
        console.error('Failed to parse deep link URL:', e);
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
    createWindow();

    // Check for initial deep link (Windows/Linux)
    const protocolArg = process.argv.find(arg => arg.startsWith('arenachain://'));
    if (protocolArg) handleDeepLink(protocolArg);

    // If we have pending auth from handleDeepLink before win was ready
    if (global.pendingAuth && win) {
        win.webContents.on('did-finish-load', () => {
            win.webContents.send('google-auth-success', global.pendingAuth);
            global.pendingAuth = null;
        });
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('navigate-to', (event, routeName) => {
    navigateTo(routeName);
});

ipcMain.on('login-success', (event, { role }) => {
    if (!win) return;
    win.loadFile(resolveRoleHome(role));
});

// Google Login Integration
ipcMain.on('google-login', (event) => {
    console.log('Starting Google Login (Integrated)...');
    
    let authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true 
        }
    });

    // Use the backend URL (OAuth routes are now excluded from the /api prefix in main.ts)
    const authUrl = 'http://localhost:3000/auth/google';
    console.log('Loading auth URL:', authUrl);
    authWindow.loadURL(authUrl);

    const checkUrl = (url) => {
        if (!url || !url.includes('accessToken=')) return;
        console.log('Auth window navigated to success URL:', url);
        try {
            const paramsStr = url.includes('?') ? url.split('?')[1] : (url.includes('success') ? url.split('success')[1] : '');
            const searchParams = new URLSearchParams(paramsStr);
            const accessToken = searchParams.get('accessToken');
            const refreshToken = searchParams.get('refreshToken');

            if (accessToken && win) {
                win.webContents.send('google-auth-success', { accessToken, refreshToken });
                console.log('Dispatched auth success to main window');
            }
            if (authWindow && !authWindow.isDestroyed()) {
                setTimeout(() => { if (authWindow && !authWindow.isDestroyed()) authWindow.close(); }, 800);
            }
        } catch (err) {
            console.error('Error parsing Google callback URL:', err);
        }
    };

    authWindow.webContents.on('will-navigate', (e, url) => checkUrl(url));
    authWindow.webContents.on('did-navigate', (e, url) => checkUrl(url));
    authWindow.webContents.on('did-redirect-navigation', (e, url) => checkUrl(url));
    authWindow.webContents.on('did-finish-load', () => checkUrl(authWindow.webContents.getURL()));

    authWindow.on('closed', () => { authWindow = null; });
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

