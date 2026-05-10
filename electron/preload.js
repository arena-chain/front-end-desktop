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
    getPairingPayload: () => ipcRenderer.invoke('get-pairing-payload'),
    getLanIpCandidates: () => ipcRenderer.invoke('get-lan-ip-candidates'),
    stopConduit: () => ipcRenderer.invoke('stop-conduit'),
    onConduitCode: (cb) => ipcRenderer.on('conduit-code', (_, code) => cb(code)),
    onConduitStopped: (cb) => ipcRenderer.on('conduit-stopped', () => cb()),
    onConduitError: (cb) => ipcRenderer.on('conduit-error', (_, err) => cb(err)),
    onMobilePaired: (cb) => ipcRenderer.on('mobile-paired', () => cb()),
    
    // Steamworks
    steamInit: (appId) => ipcRenderer.invoke('steam-init', appId),
    steamGetStatus: () => ipcRenderer.invoke('steam-get-status'),
    steamCreateLobby: (data) => ipcRenderer.invoke('steam-create-lobby', data),
    steamJoinLobby: (data) => ipcRenderer.invoke('steam-join-lobby', data),
    steamInviteFriend: (data) => ipcRenderer.invoke('steam-invite-friend', data),
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

    // LCU Automation
    lcuStatus: () => ipcRenderer.invoke('lcu-get-status'),
    createLcuLobby: (data) => ipcRenderer.invoke('lcu-create-match-lobby', data),
};

if (typeof window !== 'undefined') {
    window.electronApp = api;
}
