const { BASE_URL, getAccessToken } = require('./api');

const ROOT_URL = BASE_URL.replace(/\/api\/?$/, '');

let socketLoaderPromise = null;
let presenceSocket = null;
let listeners = [];

function ensureSocketIoClient() {
    if (socketLoaderPromise) return socketLoaderPromise;

    if (window.io) {
        socketLoaderPromise = Promise.resolve(window.io);
        return socketLoaderPromise;
    }

    socketLoaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${ROOT_URL}/socket.io/socket.io.js`;
        script.onload = () =>
            window.io ? resolve(window.io) : reject(new Error('Socket.IO failed'));
        script.onerror = () => reject(new Error('Unable to load Socket.IO'));
        document.head.appendChild(script);
    });

    return socketLoaderPromise;
}

async function connectPresence() {
    if (presenceSocket && presenceSocket.connected) return presenceSocket;

    const token = getAccessToken();
    if (!token) return null;

    const io = await ensureSocketIoClient();

    presenceSocket = io(`${ROOT_URL}/presence`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 10,
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

    return presenceSocket;
}

function disconnectPresence() {
    if (presenceSocket) {
        presenceSocket.disconnect();
        presenceSocket = null;
    }
}

function getFriends() {
    return new Promise((resolve) => {
        if (!presenceSocket || !presenceSocket.connected) {
            resolve([]);
            return;
        }
        presenceSocket.emit('get-friends', {}, (response) => {
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
    getFriends,
    updateStatus,
    onPresence,
};
