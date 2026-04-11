/**
 * contextBridge requires contextIsolation: true. This app uses nodeIntegration + contextIsolation: false,
 * so we attach to window directly (same as exposing APIs without contextBridge).
 */
const { ipcRenderer } = require('electron');
const payload = require('./payload');

const api = {
    navigate: (routeName) => ipcRenderer.send('navigate-to', routeName),
    loginSuccess: (role) => ipcRenderer.send('login-success', { role }),
    getRouteNames: () => payload.getRouteNames(),
    getRoleHomes: () => payload.getRoleHomes(),
    getDesktopSources: () => ipcRenderer.invoke('desktop-sources'),
    versions: process.versions,
    launchConduit: () => ipcRenderer.invoke('launch-conduit'),
    getConduitCode: () => ipcRenderer.invoke('get-conduit-code'),
    stopConduit: () => ipcRenderer.invoke('stop-conduit'),
    onConduitCode: (cb) => ipcRenderer.on('conduit-code', (_, code) => cb(code)),
    onConduitStopped: (cb) => ipcRenderer.on('conduit-stopped', () => cb()),
    onConduitError: (cb) => ipcRenderer.on('conduit-error', (_, err) => cb(err)),
    onMobilePaired: (cb) => ipcRenderer.on('mobile-paired', () => cb()),
};

if (typeof window !== 'undefined') {
    window.electronApp = api;
}
