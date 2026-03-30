const { contextBridge, ipcRenderer } = require('electron');
const payload = require('./payload');

contextBridge.exposeInMainWorld('electronApp', {
    navigate: (routeName) => ipcRenderer.send('navigate-to', routeName),
    loginSuccess: (role) => ipcRenderer.send('login-success', { role }),
    getRouteNames: () => payload.getRouteNames(),
    getRoleHomes: () => payload.getRoleHomes(),
    getDesktopSources: () => ipcRenderer.invoke('desktop-sources'),
    versions: process.versions,
});
