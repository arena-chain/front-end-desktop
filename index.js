const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
const path = require("path");

let win;

// Register protocol for deep linking (arenachain://)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('arenachain', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('arenachain')
}

// Handle protocol on Windows/Linux (deep links)
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine) => {
    // Someone tried to run a second instance, we should focus our window.
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()

      // Handle the deep link
      const url = commandLine.pop()
      if (typeof url === 'string') {
        handleDeepLink(url)
      }
    }
  })
}

function handleDeepLink(url) {
  console.log('App received deep link:', url);
  if (url.includes('arenachain://success')) {
    try {
      const urlObj = new URL(url.replace('arenachain://success', 'http://localhost'))
      const accessToken = urlObj.searchParams.get('accessToken')
      const refreshToken = urlObj.searchParams.get('refreshToken')
      
      if (accessToken && win) {
        win.webContents.send('google-auth-success', { accessToken, refreshToken })
      }
    } catch (e) {
      console.error('Failed to handle deep link:', e)
    }
  }
}

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

// Google Login Integration
ipcMain.on('google-login', (event) => {
    console.log('Starting Google Login with API prefix...');
    
    let authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true // Safer for external auth windows
        }
    });

    // Use the backend URL with the correct /api prefix (required as per backend main.ts)
    const authUrl = 'http://localhost:3000/api/auth/google';
    console.log('Loading auth URL:', authUrl);
    authWindow.loadURL(authUrl);

    const handleCallback = (url) => {
        if (!url) return;
        console.log('Intercepted URL:', url);
        
        if (url.includes('arenachain://success') || url.includes('accessToken=')) {
            try {
                // Parse tokens from URL (supporting both deep link and HTTP fallback)
                let searchParams;
                if (url.includes('arenachain://')) {
                    searchParams = new URL(url.replace('arenachain://success', 'http://localhost')).searchParams;
                } else {
                    searchParams = new URL(url).searchParams;
                }
                
                const accessToken = searchParams.get('accessToken');
                const refreshToken = searchParams.get('refreshToken');

                if (accessToken) {
                    console.log('Google Auth Success! Returning tokens to renderer.');
                    // Use the original event sender to ensure it reaches the correct caller
                    event.sender.send('google-auth-success', { accessToken, refreshToken });
                    
                    // Close the window after a tiny delay to ensure IPC is sent
                    setTimeout(() => {
                        if (authWindow && !authWindow.isDestroyed()) {
                            authWindow.close();
                        }
                    }, 500);
                }
            } catch (err) {
                console.error('Error parsing Google callback:', err);
            }
        }
    };

    // Monitor all types of navigation and page updates
    authWindow.webContents.on('will-navigate', (e, url) => handleCallback(url));
    authWindow.webContents.on('did-navigate', (e, url) => handleCallback(url));
    authWindow.webContents.on('did-redirect-navigation', (e, url) => handleCallback(url));
    
    // Also monitor search params changes in case of SPA-like transitions
    authWindow.webContents.on('did-finish-load', () => {
        handleCallback(authWindow.webContents.getURL());
    });

    authWindow.on('closed', () => {
        authWindow = null;
    });
});


