'use strict';

const { apiRequest, getUser } = require('../../../shared/api');

const TOURNAMENTS_ENDPOINT = '/tournements';
const CATALOG_ENDPOINT = '/catalog';
const TEAM_MANAGER_TEAM_ENDPOINT = '/team-manager/me/team';

const STATUS_BUCKETS = {
    active: ['ONGOING', 'OPEN_REGISTRATION'],
    upcoming: ['UPCOMING', 'DRAFT', 'PENDING_APPROVAL'],
    completed: ['COMPLETED', 'CANCELLED', 'REJECTED', 'BLOCKED'],
};

function normalizeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function inferStatus(tournament) {
    const explicitStatus = tournament.status || '';
    if (explicitStatus) return explicitStatus;

    const now = Date.now();
    const start = normalizeDate(tournament.startDate)?.getTime() || 0;
    const end = normalizeDate(tournament.endDate)?.getTime() || 0;

    if (start && start > now) return 'UPCOMING';
    if (end && end < now) return 'COMPLETED';
    return 'ONGOING';
}

function normalizeTeam(team, index = 0) {
    if (!team) return { id: `tbd-${index}`, name: 'TBD', logo: '', seed: index + 1 };
    if (typeof team === 'string') return { id: team, name: `Team ${team.slice(-4).toUpperCase()}`, logo: '', seed: index + 1 };
    return {
        id: team._id || team.id || `team-${index}`,
        name: team.name || team.tag || `Team ${index + 1}`,
        logo: team.logo || team.logoUrl || '',
        seed: team.seed || index + 1,
        players: Array.isArray(team.players) ? team.players : [],
    };
}

function buildRules(t) {
    const rules = [];
    const raw = t.rules;
    if (Array.isArray(raw)) raw.forEach(r => typeof r === 'string' && rules.push(r.trim()));
    else if (raw && typeof raw === 'object') Object.entries(raw).forEach(([k, v]) => v && rules.push(`${k.replace(/_/g, ' ')}: ${v}`));
    
    if (!rules.length) {
        rules.push(`Format: ${(t.format || 'SINGLE_ELIMINATION').replace(/_/g, ' ')}`);
        rules.push(`Maximum teams: ${t.maxTeams || 16}`);
    }
    return rules;
}

function normalizeTournament(raw) {
    const status = inferStatus(raw);
    const teams = Array.isArray(raw.teams) ? raw.teams.map((team, i) => normalizeTeam(team, i)) : [];
    
    return {
        ...raw,
        _id: raw._id || raw.id,
        status,
        teams,
        prizePool: Number(raw.prizePool || 0),
        currentTeams: Number(raw.currentTeams || teams.length || 0),
        maxTeams: Number(raw.maxTeams || 16),
        gameTitle: (raw.gameId && typeof raw.gameId === 'object' && raw.gameId.title) || raw.game || 'ESPORTS',
        organizerName: (raw.organizerId && typeof raw.organizerId === 'object' && (raw.organizerId.username || raw.organizerId.name)) || 'Arena Chain',
        rulesList: buildRules(raw),
        bucket: STATUS_BUCKETS.active.includes(status) ? 'active' : STATUS_BUCKETS.completed.includes(status) ? 'completed' : 'upcoming',
        isLive: status === 'ONGOING',
    };
}

async function fetchTournaments() {
    const data = await apiRequest(TOURNAMENTS_ENDPOINT);
    return Array.isArray(data) ? data.map(normalizeTournament) : [];
}

async function fetchTournamentById(id) {
    const data = await apiRequest(`${TOURNAMENTS_ENDPOINT}/${id}`);
    return normalizeTournament(data);
}

async function fetchGames() {
    const data = await apiRequest(CATALOG_ENDPOINT);
    return Array.isArray(data) ? data : [];
}

async function createTournament(data) {
    const result = await apiRequest(TOURNAMENTS_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    return normalizeTournament(result);
}

async function getMyManagedTeam() {
    try {
        const team = await apiRequest(TEAM_MANAGER_TEAM_ENDPOINT);
        return team ? normalizeTeam(team) : null;
    } catch (e) { return null; }
}

async function registerManagedTeam(tournamentId) {
    const team = await getMyManagedTeam();
    if (!team) throw new Error('No managed team found.');
    const data = await apiRequest(`${TOURNAMENTS_ENDPOINT}/${tournamentId}/register-team`, {
        method: 'POST',
        body: JSON.stringify({ teamId: team.id }),
    });
    return normalizeTournament(data);
}

async function unregisterManagedTeam(tournamentId, teamId) {
    const targetId = teamId || (await getMyManagedTeam())?.id;
    if (!targetId) throw new Error('No team found.');
    const data = await apiRequest(`${TOURNAMENTS_ENDPOINT}/${tournamentId}/unregister-team/${targetId}`, { method: 'DELETE' });
    return normalizeTournament(data);
}

function getViewerTeamId() {
    const u = getUser();
    return u?.teamManagerProfile?.teamId || u?.teamId || u?.team?._id || '';
}

function isViewerRegistered(t) {
    const id = getViewerTeamId();
    return id ? (t.teams || []).some(team => team.id === id) : false;
}

module.exports = {
    fetchTournaments,
    fetchTournamentById,
    fetchGames,
    createTournament,
    getMyManagedTeam,
    registerManagedTeam,
    unregisterManagedTeam,
    getViewerTeamId,
    isViewerRegistered,
};
