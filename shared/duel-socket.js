const { io } = require('socket.io-client');
const { getAccessToken, getArenaBaseOrigin } = require('./api');

class DuelSocket {
    constructor() {
        this.socket = null;
    }

    connect() {
        if (this.socket && this.socket.connected) return this.socket;

        const token = getAccessToken();
        const baseUrl = `${getArenaBaseOrigin()}/duel`;
        this.socket = io(baseUrl, {
            auth: { token },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        this.socket.on('connect', () => {
            console.log('[DuelSocket] Connected to server');
        });

        this.socket.on('connect_error', (error) => {
            console.error('[DuelSocket] Connection error:', error);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[DuelSocket] Disconnected:', reason);
        });

        return this.socket;
    }

    getSocket() {
        if (!this.socket) return this.connect();
        return this.socket;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

// Singleton instance
const duelSocketInstance = new DuelSocket();
module.exports = duelSocketInstance;
