const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Default when no file and no localStorage override.
 * 127.0.0.1 avoids some Windows "localhost" → IPv6 resolution issues.
 */
const DEFAULT_API_ORIGIN = 'http://127.0.0.1:3000';

/**
 * Optional file next to package.json (project root): { "apiOrigin": "http://127.0.0.1:3000" }
 * Highest priority — edit this file so the app always hits your machine without localStorage.
 */
function loadApiOriginFromFile() {
    try {
        const configPath = path.join(__dirname, '..', 'arena-api.json');
        if (!fs.existsSync(configPath)) return null;
        const raw = fs.readFileSync(configPath, 'utf8');
        const j = JSON.parse(raw);
        const o = j.apiOrigin || j.baseUrl || j.apiURL;
        if (o && typeof o === 'string') return normalizeApiOrigin(o);
    } catch (e) {
        console.warn('[Arena] arena-api.json ignored:', e.message || e);
    }
    return null;
}

let _cachedFileOrigin = undefined;
function getFileOriginCached() {
    if (_cachedFileOrigin === undefined) _cachedFileOrigin = loadApiOriginFromFile();
    return _cachedFileOrigin;
}

function normalizeApiOrigin(raw) {
    if (!raw || typeof raw !== 'string') return DEFAULT_API_ORIGIN;
    let s = raw.trim();
    if (!s) return DEFAULT_API_ORIGIN;
    s = s.replace(/\/api\/?$/i, '');
    s = s.replace(/\/+$/, '');
    return s || DEFAULT_API_ORIGIN;
}

function getArenaBaseOrigin() {
    const fromFile = getFileOriginCached();
    if (fromFile) return fromFile;
    try {
        const stored = localStorage.getItem('arena_base_url');
        if (stored) return normalizeApiOrigin(stored);
    } catch (_) {
        /* ignore */
    }
    return DEFAULT_API_ORIGIN;
}

/**
 * Persist server root (e.g. http://localhost:3000 or your deployed host). No /api suffix.
 */
function setArenaBaseUrl(raw) {
    const normalized = normalizeApiOrigin(raw);
    try {
        localStorage.setItem('arena_base_url', normalized);
    } catch (_) {
        /* ignore */
    }
    return normalized;
}

function getBaseUrl() {
    return `${getArenaBaseOrigin()}/api`;
}

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

    const base = getBaseUrl();
    const res = await fetch(`${base}/auth/refresh`, {
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

    const base = getBaseUrl();
    const url = `${base}${endpoint}`;
    let res;
    try {
        res = await fetch(url, { ...options, headers });
    } catch (e) {
        const reason = e && e.message ? e.message : String(e);
        const hint =
            'Check: (1) Backend running on port 3000 (`npm run start:dev` in backend-nest1). ' +
            '(2) `arena-api.json` apiOrigin in front-end-desktop. ' +
            '(3) DevTools Console for [Arena] API base log. ' +
            'Clear wrong host: localStorage.removeItem("arena_base_url")';
        const err = new Error(`Cannot reach API at ${url} — ${reason}. ${hint}`);
        err.networkError = true;
        err.cause = e;
        throw err;
    }

    if (res.status === 401 && token) {
        try {
            const newToken = await refreshAccessToken();
            headers['Authorization'] = `Bearer ${newToken}`;
            res = await fetch(url, { ...options, headers });
        } catch {
            clearAuth();
            ipcRenderer.send('navigate-to', 'login');
            throw new Error('Session expired. Please log in again.');
        }
    }

    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const m = errBody.message;
        const text =
            Array.isArray(m) ? m.join(', ') : typeof m === 'string' ? m : '';
        const err = new Error(text || `Request failed (${res.status})`);
        err.status = res.status;
        err.body = errBody;
        throw err;
    }

    const raw = await res.text();
    if (!raw || !raw.trim()) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
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

/**
 * Merge PATCH /auth/profile user payload into stored session user (keeps id, role, profile, etc.).
 * Backend returns { message, user } with Mongo _id on user.
 */
function mergeSessionUserFromApi(apiUser) {
    if (!apiUser || typeof apiUser !== 'object') return getUser();
    const prev = getUser() || {};
    const id = apiUser.id != null ? apiUser.id : apiUser._id;
    const merged = {
        ...prev,
        id: id != null ? String(id) : prev.id,
        nickname: apiUser.nickname != null ? apiUser.nickname : prev.nickname,
        email: apiUser.email != null ? apiUser.email : prev.email,
        avatar: apiUser.avatar != null ? apiUser.avatar : prev.avatar,
        country: apiUser.country != null ? apiUser.country : prev.country,
        role: apiUser.role != null ? apiUser.role : prev.role,
        profile: apiUser.profile !== undefined ? apiUser.profile : prev.profile,
        isEmailVerified:
            apiUser.isEmailVerified != null ? apiUser.isEmailVerified : prev.isEmailVerified,
    };
    storeAuth(getAccessToken(), getRefreshToken(), merged);
    return merged;
}

/**
 * Update current account (same contract as Flutter AuthApi.updateProfile).
 * @param {{ nickname?: string; region?: string; avatar?: string }} patch
 */
async function updateProfile(patch) {
    const body = {};
    if (patch.nickname != null) body.nickname = patch.nickname;
    if (patch.region != null) body.region = patch.region;
    if (patch.avatar != null) body.avatar = patch.avatar;
    const data = await apiRequest('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
    });
    const apiUser = data && data.user != null ? data.user : data;
    return mergeSessionUserFromApi(apiUser);
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
    if (data.accessToken) {
        storeAuth(data.accessToken, data.refreshToken, data.user || null);
    }
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

try {
    if (typeof localStorage !== 'undefined') {
        const fileO = getFileOriginCached();
        console.info(
            '[Arena] API base:',
            getBaseUrl(),
            fileO ? '(from arena-api.json)' : '(no arena-api.json — using localStorage or default)',
        );
    }
} catch (_) {
    /* non-renderer context */
}

module.exports = {
    DEFAULT_API_ORIGIN,
    getBaseUrl,
    getArenaBaseOrigin,
    setArenaBaseUrl,
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
    updateProfile,
    mergeSessionUserFromApi,
};
