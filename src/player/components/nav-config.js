/**
 * Single source of truth for player-area file routes (Electron file:// navigation).
 * Paths are relative to `src/player/`.
 */
const path = require('path');
const { pathToFileURL } = require('url');

const PLAYER_ROOT = path.join(__dirname, '..');

const PLAYER_PAGES = {
    dashboard: 'dashboard/dashboard.html',
    matchmaking: 'match/matchmaking.html',
    channel: 'channel/channel_dashboard.html',
    streams: 'stream/stream_dashboard.html',
    streamStudio: 'stream/stream_studio.html',
    streamWatch: 'stream/stream.html',
    events: 'events/events.html',
    rewards: 'rewards/rewards.html',
    market: 'market/market.html',
    profile: 'profile/profile.html',
    settings: 'settings/settings.html',
    news: 'news/news.html',
    missions: 'missions/missions.html',
    friends: 'freinds/freinds.html',
    recentGames: 'recent_games/recent_games.html',
    chat: 'chat/chat.html',
    training: 'training/dashboard.html',
};

function href(key) {
    const rel = PLAYER_PAGES[key];
    if (!rel) throw new Error(`nav-config: unknown page key "${key}"`);
    return pathToFileURL(path.join(PLAYER_ROOT, rel)).href;
}

function normalizePath(p) {
    return (p || '').replace(/\\/g, '/').toLowerCase();
}

function parseLocation() {
    const pathname = normalizePath(window.location.pathname);
    const parts = pathname.split('/').filter(Boolean);
    const file = parts.length ? parts[parts.length - 1] : '';
    const folder = parts.length >= 2 ? parts[parts.length - 2] : '';
    const base = file.replace(/\.html$/i, '');
    return { pathname, parts, file, folder, base };
}

function isDashboardPage() {
    const { folder, base } = parseLocation();
    return folder === 'dashboard' && base === 'dashboard';
}

/** Which left-rail primary item should look active for the current file. */
function resolveActiveSidebarNavId() {
    const { base, folder } = parseLocation();

    const byBase = {
        matchmaking: 'nav-matchmaking',
        channel_dashboard: 'nav-channel',
        stream_dashboard: 'nav-streams',
        stream_studio: 'nav-streams',
        stream: 'nav-streams',
    };
    if (byBase[base]) return byBase[base];

    if (folder === 'match' && base === 'matchmaking') return 'nav-matchmaking';

    return 'nav-play';
}

const LEGACY_COMPONENT_MAP = {
    'left_side_navbar.html': 'sidebar.html',
    'top_navbar.html': 'topbar.html',
    'right_navbar.html': 'right-rail.html',
};

function resolveComponentFilename(srcAttr) {
    if (!srcAttr || typeof srcAttr !== 'string') return null;
    const base = path.basename(srcAttr.trim());
    return LEGACY_COMPONENT_MAP[base] || base;
}

module.exports = {
    PLAYER_ROOT,
    PLAYER_PAGES,
    href,
    parseLocation,
    isDashboardPage,
    resolveActiveSidebarNavId,
    resolveComponentFilename,
};
