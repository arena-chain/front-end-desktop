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
    onGameflowPhase: (cb) =>
        ipcRenderer.on('gameflow-phase-update', (_, phase) => cb(phase)),
    /**
     * Forward LCU gameflow phase from Rift/Conduit (renderer) to start/stop Live Client polling in main.
     */
    reportGameflowPhaseForLivePolling: (phase) => {
        const p = String(phase ?? '')
            .replace(/^"|"$/g, '')
            .trim();
        if (p === 'InProgress') {
            ipcRenderer.send('start-live-polling');
        } else if (p === 'EndOfGame' || p === 'None' || p === 'Lobby') {
            ipcRenderer.send('stop-live-polling');
        }
    },
};

if (typeof window !== 'undefined') {
    window.electronApp = api;
}
