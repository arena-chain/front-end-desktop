const { getBaseUrl, getArenaBaseOrigin, getAccessToken, getUser, apiRequest } = require('./api');

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
        const m = error.message;
        const text = Array.isArray(m) ? m.join(', ') : typeof m === 'string' ? m : '';
        throw new Error(text || fallbackMessage || 'Request failed');
    }

    const raw = await response.text();
    if (!raw || !raw.trim()) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

async function getMyChannel() {
    try {
        return await apiRequest('/channel/my');
    } catch (e) {
        if (e.status === 404) return null;
        throw e;
    }
}

async function createChannel(payload) {
    return apiRequest('/channel', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

async function updateChannel(id, payload) {
    return apiRequest(`/channel/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    });
}

async function getMyStreams() {
    const response = await fetch(`${getBaseUrl()}/stream/my`, {
        headers: authHeaders(),
    });
    return parseResponse(response, 'Failed to load streams');
}

async function createStream(payload) {
    const response = await fetch(`${getBaseUrl()}/stream`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return parseResponse(response, 'Failed to create stream');
}

async function updateStream(id, payload) {
    const response = await fetch(`${getBaseUrl()}/stream/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    return parseResponse(response, 'Failed to update stream');
}

async function startStream(id) {
    const response = await fetch(`${getBaseUrl()}/stream/${id}/start`, {
        method: 'PATCH',
        headers: authHeaders(),
    });
    return parseResponse(response, 'Failed to start stream');
}

async function endStream(id) {
    const response = await fetch(`${getBaseUrl()}/stream/${id}/end`, {
        method: 'PATCH',
        headers: authHeaders(),
    });
    return parseResponse(response, 'Failed to end stream');
}

async function getLiveStreams() {
    const response = await fetch(`${getBaseUrl()}/stream/live`, {
        cache: 'no-store',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    });
    return parseResponse(response, 'Failed to load live streams');
}

async function getChannelMessages(channelId, limit = 50) {
    const response = await fetch(`${getBaseUrl()}/chat/channel/${channelId}?limit=${limit}`, {
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

    const root = getArenaBaseOrigin();
    if (!socketLoaderPromise) {
        socketLoaderPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${root}/socket.io/socket.io.js`;
            script.onload = () => window.io ? resolve(window.io) : reject(new Error('Socket.IO client failed to load'));
            script.onerror = () => reject(new Error('Unable to load Socket.IO client'));
            document.head.appendChild(script);
        });
    }

    return socketLoaderPromise;
}

async function createLiveSocket() {
    const io = await ensureSocketIoClient();
    return io(getArenaBaseOrigin(), {
        auth: { token: getAccessToken() },
        transports: ['websocket', 'polling'],
    });
}

async function getIceServers() {
    if (!rtcConfigPromise) {
        rtcConfigPromise = fetch(`${getBaseUrl()}/stream/rtc-config`, {
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

function splitList(s) {
    if (!s || !String(s).trim()) return [];
    return String(s)
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter(Boolean);
}

function buildChannelPayload(draft) {
    const user = getUser();
    const name = (draft.channelName || `${user?.nickname || 'Arena'} Live`).trim();
    const description = (draft.description || 'Live channel created from desktop studio.').trim();
    const categories = [...new Set([...splitList(draft.category), ...splitList(draft.tags)])];

    const payload = {
        name,
        description,
    };
    if (categories.length) payload.categories = categories;

    const avatar = draft.avatar && String(draft.avatar).trim();
    if (avatar) payload.avatarUrl = avatar;

    return payload;
}

module.exports = {
    getBaseUrl,
    getServerOrigin: getArenaBaseOrigin,
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
