const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 1600,
        height: 1000,
        minWidth: 1440,
        minHeight: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        backgroundColor: '#0a0b0f',
        titleBarStyle: 'hiddenInset',
        frame: true
    });

    win.loadFile(path.join(__dirname, "auth/login/index.html"));
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
            filePath = 'auth/login/index.html';
            break;
        case 'register':
            filePath = 'auth/register/index.html';
            break;
        case 'admin-dashboard':
            filePath = 'admin/dashboard.html';
            break;
        case 'admin-tournaments':
            filePath = 'admin/tournaments.html';
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
            filePath = 'player/dashboard.html';
            break;
        case 'admin':
            filePath = 'admin/dashboard.html';
            break;
        case 'referee':
            filePath = 'referee/dashboard.html';
            break;
        case 'team_manager':
            filePath = 'team_manager/dashboard.html';
            break;
        default:
            filePath = 'player/dashboard.html'; // Default fallback
    }

    win.loadFile(path.join(__dirname, filePath));
});
