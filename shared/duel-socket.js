const { io } = require('socket.io-client');
const { getAccessToken } = require('./api');

class DuelSocket {
    constructor() {
        this.socket = null;
        this.baseUrl = 'http://127.0.0.1:3000/duel';
    }

    connect() {
        if (this.socket && this.socket.connected) return this.socket;

        const token = getAccessToken();
        this.socket = io(this.baseUrl, {
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
