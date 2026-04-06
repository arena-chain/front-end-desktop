const { getArenaBaseOrigin, getAccessToken } = require('./api');

let socketLoaderPromise = null;
let mmSocket = null;
let connectPromise = null;
let listeners = [];

function ensureSocketIoClient() {
    if (socketLoaderPromise) return socketLoaderPromise;

    if (window.io) {
        socketLoaderPromise = Promise.resolve(window.io);
        return socketLoaderPromise;
    }

    const root = getArenaBaseOrigin();
    socketLoaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${root}/socket.io/socket.io.js`;
        script.onload = () =>
            window.io ? resolve(window.io) : reject(new Error('Socket.IO failed'));
        script.onerror = () => reject(new Error('Unable to load Socket.IO'));
        document.head.appendChild(script);
    });

    return socketLoaderPromise;
}

async function connectMatchmaking() {
    const token = getAccessToken();
    if (!token) return null;

    if (mmSocket && mmSocket.connected) return mmSocket;
    if (connectPromise) return connectPromise;

    connectPromise = _doConnect(token);
    try {
        return await connectPromise;
    } finally {
        connectPromise = null;
    }
}

async function _doConnect(token) {
    if (mmSocket) {
        mmSocket.disconnect();
        mmSocket = null;
    }

    const io = await ensureSocketIoClient();
    const root = getArenaBaseOrigin();

    mmSocket = io(`${root}/matchmaking`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
    });

    mmSocket.on('connect', () => emit('connected'));
    mmSocket.on('disconnect', () => emit('disconnected'));
    mmSocket.on('mm:connected', (data) => emit('mm:connected', data));
    mmSocket.on('mm:match-found', (data) => emit('mm:match-found', data));
    mmSocket.on('mm:player-response', (data) => emit('mm:player-response', data));
    mmSocket.on('mm:game-room-ready', (data) => emit('mm:game-room-ready', data));
    mmSocket.on('mm:match-cancelled', (data) => emit('mm:match-cancelled', data));
    mmSocket.on('mm:match-completed', (data) => emit('mm:match-completed', data));

    return mmSocket;
}

function disconnectMatchmaking() {
    if (mmSocket) {
        mmSocket.disconnect();
        mmSocket = null;
    }
}

function isConnected() {
    return !!(mmSocket && mmSocket.connected);
}

function joinGameRoom(gameId) {
    if (mmSocket && mmSocket.connected) {
        mmSocket.emit('mm:join-game-room', { gameId });
    }
}

function onMatchmaking(event, callback) {
    listeners.push({ event, callback });
    return () => {
        listeners = listeners.filter(
            (l) => !(l.event === event && l.callback === callback),
        );
    };
}

function clearListeners() {
    listeners = [];
}

function emit(event, data) {
    for (const l of listeners) {
        if (l.event === event) {
            try {
                l.callback(data);
            } catch (e) {
                console.error('matchmaking-ws listener error:', e);
            }
        }
    }
}

module.exports = {
    connectMatchmaking,
    disconnectMatchmaking,
    isConnected,
    joinGameRoom,
    onMatchmaking,
    clearListeners,
};
