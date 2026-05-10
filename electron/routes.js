const path = require('path');

const ROOT = path.join(__dirname, '..');

const ROUTES = {
    login: 'src/auth/login/index.html',
    register: 'src/auth/register/index.html',
    verify: 'src/auth/verify/index.html',
    'player-dashboard': 'src/player/dashboard/dashboard.html',
    'admin-dashboard': 'src/admin/dashboard.html',
    'admin-tournaments': 'src/admin/tournaments.html',
    'training-dashboard': 'src/player/training/dashboard.html',
    'training-game': 'src/player/training/game.html',
    'training-result': 'src/player/training/result.html',
    'duel-dashboard': 'src/player/duel/dashboard.html',
    'duel-game': 'src/player/duel/game.html',
    'duel-result': 'src/player/duel/result.html',
    'player-channel': 'src/player/channel/channel_dashboard.html',
    'stream-studio': 'src/player/stream/stream_studio.html',
    'player-example': 'src/player/pages/example.html',
    'player-news': 'src/player/news/news.html',
    'player-missions': 'src/player/missions/missions.html',
    'player-matchmaking': 'src/player/match/matchmaking.html',
    'player-market': 'src/player/market/market.html',
    'player-events': 'src/player/events/events.html',
    'player-rewards': 'src/player/rewards/rewards.html',
    'player-profile': 'src/player/profile/profile.html',
    'player-friends': 'src/player/freinds/freinds.html',
    'player-recent-games': 'src/player/recent_games/recent_games.html',
    'player-chat': 'src/player/chat/chat.html',
    'player-stream-dashboard': 'src/player/stream/stream_dashboard.html',
    'player-league': 'src/player/league/league.html',
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
