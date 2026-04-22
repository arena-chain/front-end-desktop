'use strict';

const { requireAuth, logout, getUser } = require('../../../shared/api');
const tournamentService = require('./tournamentService');

if (!requireAuth()) {
    throw new Error('Not authenticated');
}

const params = new URLSearchParams(window.location.search);
const tournamentId = params.get('id');

function markTournamentNavActive() {
    const tournamentNav = document.getElementById('nav-page-tournaments');
    if (!tournamentNav) return;

    tournamentNav.classList.remove('text-gray-500');
    tournamentNav.classList.add('bg-[#00ff87]', 'text-[#0a0b0f]');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'TBA';
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function statusBadgeClass(status) {
    const map = {
        ONGOING: 'bg-red-500/10 text-red-300 border-red-500/20',
        OPEN_REGISTRATION: 'bg-[#00ff87]/10 text-[#00ff87] border-[#00ff87]/20',
        UPCOMING: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
        COMPLETED: 'bg-white/10 text-white/60 border-white/10',
        BLOCKED: 'bg-red-500/10 text-red-300 border-red-500/20',
        REJECTED: 'bg-red-500/10 text-red-300 border-red-500/20',
        PENDING_APPROVAL: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
        DRAFT: 'bg-white/10 text-white/60 border-white/10',
    };
    return map[status] || 'bg-white/10 text-white/60 border-white/10';
}

function renderStandings(rows) {
    const host = document.getElementById('standings-body');
    host.innerHTML = '';

    rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-white/5 last:border-0';
        tr.innerHTML = `
            <td class="px-4 py-3 text-sm font-black ${row.rank === 1 ? 'text-yellow-300' : 'text-white'}">${row.rank}</td>
            <td class="px-4 py-3 text-sm font-bold text-white">${escapeHtml(row.team.name)}</td>
            <td class="px-4 py-3 text-sm text-gray-400">${row.played}</td>
            <td class="px-4 py-3 text-sm text-green-300">${row.wins}</td>
            <td class="px-4 py-3 text-sm text-red-300">${row.losses}</td>
            <td class="px-4 py-3 text-sm font-black text-white">${row.points}</td>
            <td class="px-4 py-3 text-sm ${row.gameDiff >= 0 ? 'text-green-300' : 'text-red-300'}">${row.gameDiff >= 0 ? '+' : ''}${row.gameDiff}</td>
        `;
        host.appendChild(tr);
    });
}

function renderParticipants(teams) {
    const host = document.getElementById('participants-grid');
    host.innerHTML = '';

    if (!teams.length) {
        host.innerHTML = '<p class="col-span-full text-sm text-gray-500">Participants will appear once registrations begin.</p>';
        return;
    }

    teams.forEach((team) => {
        const card = document.createElement('div');
        card.className = 'rounded-3xl border border-white/5 bg-white/[0.03] p-5 text-center';
        card.innerHTML = `
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-black/40 text-lg font-black text-[#00ff87]">
                ${escapeHtml((team.name || '?').charAt(0))}
            </div>
            <p class="mt-4 text-sm font-black uppercase tracking-tight text-white">${escapeHtml(team.name)}</p>
            <p class="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Seed #${team.seed || '?'}</p>
        `;
        host.appendChild(card);
    });
}

function renderRules(rules) {
    const host = document.getElementById('rules-list');
    host.innerHTML = '';
    rules.forEach((rule) => {
        const li = document.createElement('li');
        li.className = 'rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-sm text-gray-300';
        li.textContent = rule;
        host.appendChild(li);
    });
}

function renderPrizes(prizes) {
    const host = document.getElementById('prize-list');
    host.innerHTML = '';
    prizes.forEach((prize) => {
        const div = document.createElement('div');
        div.className = 'rounded-2xl border border-[#00ff87]/10 bg-[#00ff87]/5 px-4 py-4';
        div.innerHTML = `
            <p class="text-[10px] font-black uppercase tracking-[0.18em] text-[#00ff87]">${escapeHtml(prize.place)}</p>
            <p class="mt-2 text-xl font-black text-white">$${Number(prize.amount || 0).toLocaleString()}</p>
        `;
        host.appendChild(div);
    });
}

function renderRounds(rounds) {
    const host = document.getElementById('bracket-rounds');
    host.innerHTML = '';

    if (!rounds.length) {
        host.innerHTML = '<p class="text-sm text-gray-500">Bracket will be generated once enough teams are registered.</p>';
        return;
    }

    rounds.forEach((round) => {
        const column = document.createElement('div');
        column.className = 'min-w-[260px] flex-1';
        column.innerHTML = `
            <p class="mb-4 text-center text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">${escapeHtml(round.name)}</p>
            <div class="space-y-4"></div>
        `;
        const list = column.querySelector('div');

        round.matches.forEach((match) => {
            const node = document.createElement('div');
            node.className = 'overflow-hidden rounded-2xl border border-white/10 bg-[#141419]';
            node.innerHTML = `
                <div class="border-b border-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">${escapeHtml(match.status)}</div>
                <div class="space-y-2 p-3">
                    <div class="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-3">
                        <span class="text-sm font-bold text-white">${escapeHtml(match.team1.name)}</span>
                        <span class="text-sm font-black text-[#00ff87]">${match.score1 === null ? '-' : match.score1}</span>
                    </div>
                    <div class="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-3">
                        <span class="text-sm font-bold text-white">${escapeHtml(match.team2.name)}</span>
                        <span class="text-sm font-black text-[#00ff87]">${match.score2 === null ? '-' : match.score2}</span>
                    </div>
                </div>
            `;
            list.appendChild(node);
        });

        host.appendChild(column);
    });
}

function renderResults(rounds) {
    const host = document.getElementById('results-list');
    host.innerHTML = '';

    const allMatches = rounds.flatMap((round) => round.matches).filter((match) => match.status === 'COMPLETED' || match.status === 'LIVE');
    if (!allMatches.length) {
        host.innerHTML = '<p class="text-sm text-gray-500">Results will appear as soon as matches start.</p>';
        return;
    }

    allMatches.forEach((match) => {
        const article = document.createElement('article');
        article.className = 'rounded-2xl border border-white/5 bg-white/[0.03] p-4';
        article.innerHTML = `
            <div class="flex items-center justify-between gap-4">
                <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">${escapeHtml(match.round)}</p>
                    <p class="mt-2 text-sm font-bold text-white">${escapeHtml(match.team1.name)} vs ${escapeHtml(match.team2.name)}</p>
                </div>
                <div class="text-right">
                    <p class="text-lg font-black text-[#00ff87]">${match.score1 === null ? '-' : match.score1} : ${match.score2 === null ? '-' : match.score2}</p>
                    <p class="text-[10px] font-black uppercase tracking-[0.18em] ${match.status === 'LIVE' ? 'text-red-300' : 'text-gray-500'}">${escapeHtml(match.status)}</p>
                </div>
            </div>
        `;
        host.appendChild(article);
    });
}

async function updateRegistrationButton(tournament) {
    const button = document.getElementById('registration-button');
    const viewerTeamId = tournamentService.getViewerTeamId();
    const viewerRegistered = tournamentService.isViewerRegistered(tournament);
    const canRegister = tournament.registrationOpen && tournament.status !== 'BLOCKED' && tournament.status !== 'REJECTED';

    if (!canRegister) {
        button.disabled = true;
        button.className = 'w-full rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-[11px] font-black uppercase tracking-[0.18em] text-red-300';
        button.textContent = 'Registration Closed';
        return;
    }

    if (viewerRegistered) {
        button.disabled = false;
        button.className = 'w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-white/10';
        button.textContent = 'Unregister Team';
        button.onclick = async () => {
            try {
                button.disabled = true;
                button.textContent = 'Removing...';
                const updated = await tournamentService.unregisterManagedTeam(tournament._id, viewerTeamId);
                await hydrate(updated);
            } catch (error) {
                console.error(error);
                window.alert(error.message || 'Unable to unregister your team.');
                await hydrate(tournament);
            }
        };
        return;
    }

    button.disabled = false;
    button.className = 'w-full rounded-2xl bg-[#00ff87] px-4 py-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#0a0b0f] transition hover:bg-[#00e67a]';
    button.textContent = 'Register Team';
    button.onclick = async () => {
        try {
            button.disabled = true;
            button.textContent = 'Registering...';
            const updated = await tournamentService.registerManagedTeam(tournament._id);
            await hydrate(updated);
        } catch (error) {
            console.error(error);
            window.alert(error.message || 'Unable to register your managed team.');
            await hydrate(tournament);
        }
    };
}

async function hydrate(tournament) {
    document.getElementById('player-name').textContent =
        getUser()?.nickname || getUser()?.name || 'Arena Player';
    document.getElementById('tournament-title').textContent = tournament.name;
    document.getElementById('tournament-game').textContent = tournament.gameTitle;
    document.getElementById('tournament-status').textContent = tournament.status.replace(/_/g, ' ');
    document.getElementById('tournament-status').className =
        `inline-flex rounded-xl border px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${statusBadgeClass(tournament.status)}`;
    document.getElementById('tournament-description').textContent =
        tournament.description || 'Tournament overview will be published soon.';
    document.getElementById('summary-prize').textContent = `$${Number(tournament.prizePool || 0).toLocaleString()}`;
    document.getElementById('summary-start').textContent = formatDate(tournament.startDate);
    document.getElementById('summary-teams').textContent = `${tournament.currentTeams}/${tournament.maxTeams}`;
    document.getElementById('sidebar-organizer').textContent = tournament.organizerName;
    document.getElementById('sidebar-format').textContent = (tournament.format || 'SINGLE_ELIMINATION').replace(/_/g, ' ');
    document.getElementById('sidebar-window').textContent = `${formatDate(tournament.startDate)} - ${formatDate(tournament.endDate)}`;
    document.getElementById('sidebar-live').textContent = tournament.isLive ? 'Live tracking active' : 'Waiting for kickoff';

    renderStandings(tournament.standings);
    renderParticipants(tournament.teams);
    renderRules(tournament.rulesList);
    renderPrizes(tournament.prizeBreakdown);
    renderRounds(tournament.rounds);
    renderResults(tournament.rounds);
    await updateRegistrationButton(tournament);
}

async function init() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => logout());
    markTournamentNavActive();

    if (!tournamentId) {
        document.getElementById('tournament-title').textContent = 'Tournament not found';
        return;
    }

    try {
        const tournament = await tournamentService.fetchTournamentById(tournamentId);
        await hydrate(tournament);
    } catch (error) {
        console.error('Unable to load tournament details:', error);
        document.getElementById('tournament-title').textContent = 'Tournament not found';
        document.getElementById('tournament-description').textContent =
            error.message || 'Unable to load tournament details.';
    }
}

init();
