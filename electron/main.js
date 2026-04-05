const { app, BrowserWindow, ipcMain, nativeImage, desktopCapturer } = require('electron');
const path = require('path');
const { ROOT, resolveRoute, resolveRoleHome } = require('./routes');

let win;

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
