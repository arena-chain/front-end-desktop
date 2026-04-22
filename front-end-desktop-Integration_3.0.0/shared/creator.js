const { BASE_URL, getAccessToken, getUser } = require('./api');

const ROOT_URL = BASE_URL.replace(/\/api\/?$/, '');

function authHeaders() {
    const token = getAccessToken();
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function parseResponse(response, fallbackMessage) {
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || fallbackMessage || 'Request failed');
    }

    return response.json();
}

async function getMyChannel() {
    const response = await fetch(`${BASE_URL}/channel/my`, {
        headers: authHeaders(),
    });

    if (response.status === 404) return null;
    return parseResponse(response, 'Failed to load your channel');
}

async function createChannel(payload) {
    const response = await fetch(`${BASE_URL}/channel`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return parseResponse(response, 'Failed to create channel');
}

async function updateChannel(id, payload) {
    const response = await fetch(`${BASE_URL}/channel/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return parseResponse(response, 'Failed to update channel');
}

async function getMyStreams() {
    const response = await fetch(`${BASE_URL}/stream/my`, {
        headers: authHeaders(),
    });
    return parseResponse(response, 'Failed to load streams');
}

async function createStream(payload) {
    const response = await fetch(`${BASE_URL}/stream`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return parseResponse(response, 'Failed to create stream');
}

async function updateStream(id, payload) {
    const response = await fetch(`${BASE_URL}/stream/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return parseResponse(response, 'Failed to update stream');
}

async function startStream(id) {
    const response = await fetch(`${BASE_URL}/stream/${id}/start`, {
        method: 'PATCH',
        headers: authHeaders(),
    });
    return parseResponse(response, 'Failed to start stream');
}

async function endStream(id) {
    const response = await fetch(`${BASE_URL}/stream/${id}/end`, {
        method: 'PATCH',
        headers: authHeaders(),
    });
    return parseResponse(response, 'Failed to end stream');
}

async function getLiveStreams() {
    const response = await fetch(`${BASE_URL}/stream/live`, {
        cache: 'no-store',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });
    return parseResponse(response, 'Failed to load live streams');
}

async function getChannelMessages(channelId, limit = 50) {
    const response = await fetch(`${BASE_URL}/chat/channel/${channelId}?limit=${limit}`, {
        headers: {
            'Content-Type': 'application/json',
        },
    });
    return parseResponse(response, 'Failed to load chat messages');
}

let socketLoaderPromise = null;
let rtcConfigPromise = null;

function ensureSocketIoClient() {
    if (window.io) {
        return Promise.resolve(window.io);
    }

    if (!socketLoaderPromise) {
        socketLoaderPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${ROOT_URL}/socket.io/socket.io.js`;
            script.onload = () => window.io ? resolve(window.io) : reject(new Error('Socket.IO client failed to load'));
            script.onerror = () => reject(new Error('Unable to load Socket.IO client'));
            document.head.appendChild(script);
        });
    }

    return socketLoaderPromise;
}

async function createLiveSocket() {
    const io = await ensureSocketIoClient();
    return io(ROOT_URL, {
        auth: { token: getAccessToken() },
        transports: ['websocket', 'polling'],
    });
}

async function getIceServers() {
    if (!rtcConfigPromise) {
        rtcConfigPromise = fetch(`${BASE_URL}/stream/rtc-config`, {
            headers: {
                'Content-Type': 'application/json',
            },
        })
            .then(async (response) => {
                if (!response.ok) {
                    return [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                    ];
                }

                const data = await response.json();
                return data.iceServers?.length
                    ? data.iceServers
                    : [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                    ];
            })
            .catch(() => ([
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ]));
    }

    return rtcConfigPromise;
}

function buildChannelPayload(draft) {
    const user = getUser();
    return {
        name: draft.channelName || `${user?.nickname || 'Arena'} Live`,
        description: draft.description || 'Live channel created from desktop studio.',
        categories: [draft.category, ...(draft.tags || '').split(',')]
            .map((item) => item && item.trim())
            .filter(Boolean),
    };
}

module.exports = {
    BASE_URL,
    ROOT_URL,
    getMyChannel,
    createChannel,
    updateChannel,
    getMyStreams,
    createStream,
    updateStream,
    startStream,
    endStream,
    getLiveStreams,
    getChannelMessages,
    createLiveSocket,
    getIceServers,
    buildChannelPayload,
};
