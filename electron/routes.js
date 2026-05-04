const path = require('path');

const ROOT = path.join(__dirname, '..');

const ROUTES = {
    login: 'src/auth/login/index.html',
    register: 'src/auth/register/index.html',
    'admin-dashboard': 'src/admin/dashboard.html',
    'admin-tournaments': 'src/admin/tournaments.html',
    'training-dashboard': 'src/player/training/dashboard.html',
    'training-game': 'src/player/training/game.html',
    'training-result': 'src/player/training/result.html',
    'player-channel': 'src/player/channel/channel_dashboard.html',
    'stream-studio': 'src/player/stream/stream_studio.html',
};

const ROLE_HOME = {
    player: 'src/player/dashboard/dashboard.html',
    admin: 'src/admin/dashboard.html',
    referee: 'src/referee/dashboard.html',
    team_manager: 'src/team_manager/dashboard.html',
};

function resolveRoute(routeName) {
    const relativePath = ROUTES[routeName];
    return relativePath ? path.join(ROOT, relativePath) : null;
}

function resolveRoleHome(role) {
    return path.join(ROOT, ROLE_HOME[role] || ROLE_HOME.player);
}

module.exports = {
    ROOT,
    ROUTES,
    ROLE_HOME,
    resolveRoute,
    resolveRoleHome,
};
