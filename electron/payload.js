const { ROUTES, ROLE_HOME } = require('./routes');

function getRouteNames() {
    return Object.keys(ROUTES);
}

function getRoleHomes() {
    return { ...ROLE_HOME };
}

module.exports = {
    getRouteNames,
    getRoleHomes,
};
