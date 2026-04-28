const { getArenaBaseOrigin, getAccessToken } = require('./api');

let socketLoaderPromise = null;
let presenceSocket = null;
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

function clearListeners() {
    listeners = [];
}

async function connectPresence() {
    const token = getAccessToken();
    if (!token) return null;

    if (presenceSocket && presenceSocket.connected) {
        setTimeout(() => emit('connected'), 0);
        return presenceSocket;
    }

    if (connectPromise) return connectPromise;

    connectPromise = _doConnect(token);
    try {
        return await connectPromise;
    } finally {
        connectPromise = null;
    }
}

async function _doConnect(token) {
    if (presenceSocket) {
        presenceSocket.disconnect();
        presenceSocket = null;
    }

    const io = await ensureSocketIoClient();
    const root = getArenaBaseOrigin();

    presenceSocket = io(`${root}/presence`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
    });

    presenceSocket.on('connect', () => {
        emit('connected');
    });

    presenceSocket.on('disconnect', () => {
        emit('disconnected');
    });

    presenceSocket.on('friend-online', (data) => {
        emit('friend-online', data);
    });

    presenceSocket.on('friend-offline', (data) => {
        emit('friend-offline', data);
    });

    presenceSocket.on('friend-status', (data) => {
        emit('friend-status', data);
    });

    presenceSocket.on('presence-ready', (data) => {
        emit('presence-ready', data);
    });

    return presenceSocket;
}

function disconnectPresence() {
    if (presenceSocket) {
        presenceSocket.disconnect();
        presenceSocket = null;
    }
}

function isConnected() {
    return !!(presenceSocket && presenceSocket.connected);
}

function getFriends() {
    return new Promise((resolve) => {
        if (!presenceSocket || !presenceSocket.connected) {
            resolve([]);
            return;
        }
        const timeout = setTimeout(() => resolve([]), 5000);
        presenceSocket.emit('get-friends', {}, (response) => {
            clearTimeout(timeout);
            resolve(response?.friends || []);
        });
    });
}

function updateStatus(status, game, details) {
    if (!presenceSocket || !presenceSocket.connected) return;
    presenceSocket.emit('update-status', { status, game, details });
}

function onPresence(event, callback) {
    listeners.push({ event, callback });
    return () => {
        listeners = listeners.filter(
            (l) => !(l.event === event && l.callback === callback),
        );
    };
}

function emit(event, data) {
    for (const l of listeners) {
        if (l.event === event) {
            try {
                l.callback(data);
            } catch (e) {
                console.error('presence listener error:', e);
            }
        }
    }
}

module.exports = {
    connectPresence,
    disconnectPresence,
    clearListeners,
    isConnected,
    getFriends,
    updateStatus,
    onPresence,
};
