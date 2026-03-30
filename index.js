const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
const path = require("path");

let win;

function createWindow() {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets/logo.png'));
    
    win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 620,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        backgroundColor: '#0a0b0f',
        titleBarStyle: 'hiddenInset',
        frame: true,
        icon: icon
    });

    if (process.platform === 'darwin') {
        app.dock.setIcon(icon);
    }

    win.loadFile(path.join(__dirname, "src/auth/login/index.html"));
    win.maximize();
    win.webContents.openDevTools(); // Remove this line when done debugging
}

app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

// IPC Handlers
ipcMain.on('navigate-to', (event, page) => {
    let filePath = '';

    switch (page) {
        case 'login':
            filePath = 'src/auth/login/index.html';
            break;
        case 'register':
            filePath = 'src/auth/register/index.html';
            break;
        case 'admin-dashboard':
            filePath = 'src/admin/dashboard.html';
            break;
        case 'admin-tournaments':
            filePath = 'src/admin/tournaments.html';
            break;
        case 'player-dashboard':
            filePath = 'src/player/dashboard/dashboard.html';
            break;
        case 'training-dashboard':
            filePath = 'src/player/training/dashboard.html';
            break;
        case 'training-game':
            filePath = 'src/player/training/game.html';
            break;
        case 'training-result':
            filePath = 'src/player/training/result.html';
            break;
        default:
            return; // Invalid page
    }

    win.loadFile(path.join(__dirname, filePath));
});

ipcMain.on('login-success', (event, { role }) => {
    let filePath = '';

    switch (role) {
        case 'player':
            filePath = 'src/player/dashboard/dashboard.html';
            break;
        case 'admin':
            filePath = 'src/admin/dashboard.html';
            break;
        case 'referee':
            filePath = 'src/referee/dashboard.html';
            break;
        case 'team_manager':
            filePath = 'src/team_manager/dashboard.html';
            break;
        default:
            filePath = 'src/player/dashboard/dashboard.html'; // Default fallback
    }

    win.loadFile(path.join(__dirname, filePath));
});
