const { ipcRenderer } = require('electron');

const _storedUrl = localStorage.getItem('arena_base_url') || 'http://localhost:3000';
const BASE_URL = _storedUrl.replace(/\/api\/?$/, '').replace(/\/$/, '') + '/api';

const TOKEN_KEYS = {
    access: 'arena_access_token',
    refresh: 'arena_refresh_token',
    user: 'arena_user',
};

function getAccessToken() {
    return localStorage.getItem(TOKEN_KEYS.access);
}

function getRefreshToken() {
    return localStorage.getItem(TOKEN_KEYS.refresh);
}

function getUser() {
    try {
        const raw = localStorage.getItem(TOKEN_KEYS.user) || localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function storeAuth(accessToken, refreshToken, user) {
    localStorage.setItem(TOKEN_KEYS.access, accessToken);
    localStorage.setItem(TOKEN_KEYS.refresh, refreshToken);
    localStorage.setItem('token', accessToken);
    if (user) {
        localStorage.setItem(TOKEN_KEYS.user, JSON.stringify(user));
        localStorage.setItem('user', JSON.stringify(user));
    }
}

function clearAuth() {
    localStorage.removeItem(TOKEN_KEYS.access);
    localStorage.removeItem(TOKEN_KEYS.refresh);
    localStorage.removeItem(TOKEN_KEYS.user);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

async function refreshAccessToken() {
    const rt = getRefreshToken();
    if (!rt) throw new Error('No refresh token available');

    const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
    });

    if (!res.ok) throw new Error('Token refresh failed');

    const data = await res.json();
    storeAuth(data.accessToken, data.refreshToken, getUser());
    return data.accessToken;
}

async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

    if (res.status === 401 && token) {
        try {
            const newToken = await refreshAccessToken();
            headers['Authorization'] = `Bearer ${newToken}`;
            res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
        } catch {
            clearAuth();
            ipcRenderer.send('navigate-to', 'login');
            throw new Error('Session expired. Please log in again.');
        }
    }

    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const err = new Error(errBody.message || `Request failed (${res.status})`);
        err.status = res.status;
        err.body = errBody;
        throw err;
    }

    return res.json();
}

function getPrimaryRole(roles) {
    if (!roles || !roles.length) return 'player';
    const priority = ['admin', 'referee', 'team_manager', 'player'];
    for (const r of priority) {
        if (roles.includes(r)) return r;
    }
    return roles[0];
}

async function login(email, password) {
    const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
    storeAuth(data.accessToken, data.refreshToken, data.user);
    return data;
}

async function register(formData, role) {
    const endpointMap = {
        player: '/auth/register/player',
        team_manager: '/auth/register/team-manager',
        referee: '/auth/register/referee',
    };
    const endpoint = endpointMap[role] || endpointMap.player;

    const data = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(formData),
    });
    storeAuth(data.accessToken, data.refreshToken, data.user || null);
    return data;
}

function logout() {
    clearAuth();
    ipcRenderer.send('navigate-to', 'login');
}

function requireAuth() {
    if (!getAccessToken()) {
        ipcRenderer.send('navigate-to', 'login');
        return false;
    }
    return true;
}

module.exports = {
    BASE_URL,
    apiRequest,
    login,
    register,
    logout,
    requireAuth,
    getUser,
    getAccessToken,
    getRefreshToken,
    getPrimaryRole,
    clearAuth,
    storeAuth,
};
