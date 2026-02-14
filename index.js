const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");

let win;

// Robust navigation handler
const handleNavigation = (url) => {
    if (url.includes('accessToken=') && url.includes('refreshToken=')) {
        const urlParams = new URLSearchParams(url.split('?')[1]);
        const accessToken = urlParams.get('accessToken');
        const refreshToken = urlParams.get('refreshToken');

        if (accessToken && refreshToken) {
            let role = 'player';
            try {
                const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
                role = payload.role || 'player';
            } catch (e) {
                console.error('JWT Decode failed', e);
            }

            let dashboardPath = 'player/dashboard.html';
            if (role === 'admin') dashboardPath = 'admin/dashboard.html';
            else if (role === 'referee') dashboardPath = 'referee/dashboard.html';
            else if (role === 'team_manager') dashboardPath = 'team_manager/dashboard.html';

            if (win) {
                win.loadFile(path.join(__dirname, dashboardPath)).then(() => {
                    win.webContents.executeJavaScript(`
                        localStorage.setItem('accessToken', '${accessToken}');
                        localStorage.setItem('refreshToken', '${refreshToken}');
                        fetch('http://localhost:3000/auth/profile', {
                            headers: { 'Authorization': 'Bearer ${accessToken}' }
                        }).then(r => r.json()).then(data => {
                            if (data.user) {
                                localStorage.setItem('user', JSON.stringify(data.user));
                                window.location.reload(); 
                            }
                        }).catch(err => console.error(err));
                    `);
                });
            }
            return true;
        }
    }
    return false;
};

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile(path.join(__dirname, "auth/login/index.html"));

    // Intercept both the old way and the new custom protocol way
    session.defaultSession.webRequest.onBeforeRequest({
        urls: ['*://*/*accessToken=*', 'arenachain://*']
    }, (details, callback) => {
        if (handleNavigation(details.url)) {
            callback({ cancel: true });
        } else {
            callback({});
        }
    });
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
        case 'forgot-password':
            filePath = 'auth/forgot-password/index.html';
            break;
        case 'verify-otp':
            filePath = 'auth/verify-otp/index.html';
            break;
        case 'reset-password':
            filePath = 'auth/reset-password/index.html';
            break;
        case 'admin-dashboard':
            filePath = 'admin/dashboard.html';
            break;
        case 'admin-tournaments':
            filePath = 'admin/tournaments.html';
            break;
        case 'admin-leagues':
            filePath = 'admin/leagues.html';
            break;
        case 'player-profile':
            filePath = 'player/profile.html';
            break;
        case 'player-leagues':
            filePath = 'player/leagues.html';
            break;
        case 'player-dashboard':
            filePath = 'player/dashboard.html';
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
