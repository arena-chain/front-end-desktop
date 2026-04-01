(function () {
    'use strict';
    const { apiRequest } = require('../../../shared/api');

    const GAME_ICONS = {
        lol: { label: 'LoL', bg: '#0bc6e3', text: '#0bc6e3' },
        valorant: { label: 'VAL', bg: '#ff4654', text: '#ff4654' },
        all: { label: 'ALL', bg: '#00ff87', text: '#00ff87' },
    };

    const REWARD_LABELS = { xp: 'XP', tokens: 'Tokens', nft: 'NFT' };

    const CRITERIA_LABELS = {
        play_match: 'Play matches',
        complete_training: 'Training sessions',
        play_with_friends: 'Play with friends',
        send_friend_request: 'Friend requests sent',
        add_friend: 'Friends added',
        watch_stream: 'Streams watched',
        go_live: 'Go live',
    };

    let state = {
        missions: [],
        dailyResetsAt: null,
        weeklyResetsAt: null,
        scope: 'all',
        timerInterval: null,
    };

    function $(id) { return document.getElementById(id); }

    function escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    // ── Timer ──────────────────────────────────────────────────

    function formatCountdown(isoStr) {
        if (!isoStr) return '';
        const diff = new Date(isoStr).getTime() - Date.now();
        if (diff <= 0) return 'Resetting...';
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
        return `${h}h ${m}m`;
    }

    function startTimers() {
        if (state.timerInterval) clearInterval(state.timerInterval);
        updateTimerDisplays();
        state.timerInterval = setInterval(updateTimerDisplays, 60000);
    }

    function updateTimerDisplays() {
        const dailyBadge = document.querySelector('[data-timer="daily"]');
        const weeklyBadge = document.querySelector('[data-timer="weekly"]');
        if (dailyBadge) dailyBadge.textContent = `Resets in ${formatCountdown(state.dailyResetsAt)}`;
        if (weeklyBadge) weeklyBadge.textContent = `Resets in ${formatCountdown(state.weeklyResetsAt)}`;
    }

    // ── Filter ─────────────────────────────────────────────────

    function filtered() {
        if (state.scope === 'all') return state.missions;
        return state.missions.filter(m => m.scope === state.scope);
    }

    // ── Render helpers ─────────────────────────────────────────

    function renderStatsBar() {
        const bar = $('stats-bar');
        if (!bar) return;
        const all = state.missions;
        const completed = all.filter(m => m.userProgress?.completed).length;
        const claimed = all.filter(m => m.userProgress?.claimed).length;
        bar.innerHTML = `
            <div class="glass-panel rounded-xl px-4 py-2 text-center">
                <p class="text-[10px] text-gray-500 uppercase tracking-wide">Active</p>
                <p class="text-lg font-black text-white">${all.length}</p>
            </div>
            <div class="glass-panel rounded-xl px-4 py-2 text-center">
                <p class="text-[10px] text-gray-500 uppercase tracking-wide">Completed</p>
                <p class="text-lg font-black text-[#00ff87]">${completed}</p>
            </div>
            <div class="glass-panel rounded-xl px-4 py-2 text-center">
                <p class="text-[10px] text-gray-500 uppercase tracking-wide">Claimed</p>
                <p class="text-lg font-black text-[#22d3ee]">${claimed}</p>
            </div>`;
    }

    function gameBadgeHtml(game) {
        const g = GAME_ICONS[game] || GAME_ICONS.all;
        return `<div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style="background:${g.bg}15">
            <span class="font-black text-sm" style="color:${g.text}">${g.label}</span>
        </div>`;
    }

    function scopeIcon(scope) {
        if (scope === 'friends') {
            return `<span class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#a855f7] flex items-center justify-center" title="Friends mission">
                <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </span>`;
        }
        return '';
    }

    function progressPct(m) {
        if (!m.criteria?.target) return 0;
        return Math.min(100, Math.round(((m.userProgress?.current || 0) / m.criteria.target) * 100));
    }

    function rewardHtml(m) {
        const label = REWARD_LABELS[m.rewardType] || m.rewardType;
        const amt = m.rewardAmount >= 1000 ? `${(m.rewardAmount / 1000).toFixed(m.rewardAmount % 1000 === 0 ? 0 : 1)}k` : m.rewardAmount;
        return `<span class="text-[#00ff87] font-black text-lg">+${amt} ${label}</span>`;
    }

    // ── Daily card ─────────────────────────────────────────────

    function renderDailyCard(m) {
        const pct = progressPct(m);
        const cur = m.userProgress?.current || 0;
        const target = m.criteria?.target || 1;
        const completed = m.userProgress?.completed;
        const claimed = m.userProgress?.claimed;
        const color = m.iconColor || '#00ff87';

        let actionHtml = '';
        if (claimed) {
            actionHtml = `<div class="absolute top-0 right-0 p-4">
                <div class="w-8 h-8 rounded-full bg-[#00ff87] flex items-center justify-center text-[#0a0b0f]">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
            </div>`;
        } else if (completed) {
            actionHtml = `<div class="absolute top-0 right-0 p-3">
                <button class="claim-btn claim-ready px-4 py-1.5 bg-[#00ff87] text-[#0a0b0f] text-xs font-black rounded-lg hover:bg-[#00e67a] transition-all uppercase tracking-wide" data-mission-id="${m._id}">Claim</button>
            </div>`;
        } else {
            actionHtml = `<div class="absolute top-0 right-0 p-4">${rewardHtml(m)}</div>`;
        }

        const opacity = claimed ? 'opacity-60' : '';
        const glowBorder = completed && !claimed ? `border-[#00ff87]/30` : '';

        return `<div class="glass-panel p-6 rounded-3xl relative overflow-hidden group hover:border-[${color}]/30 transition-colors ${opacity} ${glowBorder}">
            ${claimed ? '<div class="absolute inset-0 bg-[#00ff87]/5 pointer-events-none"></div>' : ''}
            ${actionHtml}
            <div class="relative inline-block">
                ${gameBadgeHtml(m.game)}
                ${scopeIcon(m.scope)}
            </div>
            <h3 class="text-lg font-bold text-white mb-1 leading-tight">${escHtml(m.title)}</h3>
            <p class="text-sm text-gray-400 mb-1">${escHtml(m.description)}</p>
            <p class="text-[10px] text-gray-600 mb-4 uppercase tracking-wide">${CRITERIA_LABELS[m.criteria?.type] || m.criteria?.type || ''}</p>
            <div class="mb-2 flex items-center justify-between text-xs font-bold">
                <span class="text-white">Progress</span>
                <span style="color:${color}">${cur} / ${target}</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width:${pct}%; background:${color}"></div>
            </div>
        </div>`;
    }

    // ── Weekly card ─────────────────────────────────────────────

    function weeklyGradient(m) {
        const c1 = m.iconColor || '#a855f7';
        const c2 = m.scope === 'friends' ? '#a855f7' : '#00ff87';
        return `from-[${c1}] to-[${c2}]`;
    }

    function renderWeeklyCard(m) {
        const pct = progressPct(m);
        const cur = m.userProgress?.current || 0;
        const target = m.criteria?.target || 1;
        const completed = m.userProgress?.completed;
        const claimed = m.userProgress?.claimed;
        const color = m.iconColor || '#a855f7';
        const rewardLabel = REWARD_LABELS[m.rewardType] || m.rewardType;
        const rewardAmt = m.rewardAmount >= 1000
            ? m.rewardAmount.toLocaleString()
            : m.rewardAmount;

        let statusHtml = '';
        if (claimed) {
            statusHtml = `<div class="flex-shrink-0 flex flex-col items-center gap-1">
                <div class="w-12 h-12 rounded-full bg-[#00ff87] flex items-center justify-center text-[#0a0b0f]">
                    <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <span class="text-[10px] font-bold text-[#00ff87] uppercase">Claimed</span>
            </div>`;
        } else if (completed) {
            statusHtml = `<div class="flex-shrink-0 flex flex-col items-center gap-2">
                <button class="claim-btn claim-ready px-5 py-2.5 bg-[#00ff87] text-[#0a0b0f] text-sm font-black rounded-xl hover:bg-[#00e67a] transition-all uppercase tracking-wide" data-mission-id="${m._id}">Claim</button>
                <span class="text-xs text-gray-500 font-bold uppercase">+${rewardAmt} ${rewardLabel}</span>
            </div>`;
        } else {
            statusHtml = `<div class="flex-shrink-0 flex flex-col items-center gap-2">
                <span class="text-2xl font-black text-white">+${rewardAmt}</span>
                <span class="text-xs text-gray-500 font-bold tracking-widest uppercase">${rewardLabel}</span>
            </div>`;
        }

        const opacity = claimed ? 'opacity-60' : '';

        const iconSvg = m.scope === 'friends'
            ? `<svg class="w-10 h-10 mb-1" style="color:${color}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`
            : `<svg class="w-10 h-10 mb-1" style="color:${color}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`;

        return `<div class="glass-panel rounded-3xl p-1 relative overflow-hidden group ${opacity}">
            <div class="absolute inset-0 bg-gradient-to-r" style="background:linear-gradient(to right,${color}33,#00ff8733); opacity:0.2;"></div>
            <div class="bg-[#12141c] rounded-[22px] p-6 relative z-10 flex flex-col md:flex-row gap-6 items-center">
                <div class="w-24 h-24 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 border" style="background:${color}15;border-color:${color}50;box-shadow:0 0 20px ${color}33">
                    ${iconSvg}
                    <span class="text-[10px] font-black text-white tracking-widest uppercase">${m.scope === 'friends' ? 'Co-op' : rewardLabel}</span>
                </div>
                <div class="flex-1 w-full text-center md:text-left">
                    <div class="flex items-center gap-2 mb-1 justify-center md:justify-start">
                        <h3 class="text-xl font-bold text-white leading-tight">${escHtml(m.title)}</h3>
                        ${m.scope === 'friends' ? '<span class="px-2 py-0.5 bg-[#a855f7]/20 text-[#a855f7] text-[10px] font-bold rounded-full uppercase">Friends</span>' : ''}
                    </div>
                    <p class="text-sm text-gray-400 mb-4">${escHtml(m.description)}</p>
                    <div class="mb-2 flex items-center justify-between text-xs font-bold">
                        <span class="text-white">Progress</span>
                        <span style="color:${color}">${cur} / ${target}</span>
                    </div>
                    <div class="progress-bar-bg h-3">
                        <div class="progress-bar-fill" style="width:${pct}%; background:${color}"></div>
                    </div>
                </div>
                ${statusHtml}
            </div>
        </div>`;
    }

    // ── Section renderers ──────────────────────────────────────

    function renderSection(containerId, type, label, timerKey, badgeColor, missions) {
        const container = $(containerId);
        if (!container) return;

        if (!missions.length) {
            container.innerHTML = '';
            return;
        }

        const isWeekly = type === 'weekly' || type === 'special';
        const cols = isWeekly ? 'lg:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3';
        const cards = missions.map(m => isWeekly ? renderWeeklyCard(m) : renderDailyCard(m)).join('');

        const timerHtml = timerKey
            ? `<span class="px-3 py-1 text-xs font-bold rounded-full" style="background:${badgeColor}33;color:${badgeColor}" data-timer="${timerKey}">Resets in —</span>`
            : '';

        container.innerHTML = `
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <h2 class="text-2xl font-bold text-white uppercase tracking-wide">${label}</h2>
                    ${timerHtml}
                </div>
            </div>
            <div class="grid grid-cols-1 ${cols} gap-6">${cards}</div>`;
    }

    function renderAll() {
        const missions = filtered();
        const daily = missions.filter(m => m.type === 'daily');
        const weekly = missions.filter(m => m.type === 'weekly');
        const special = missions.filter(m => m.type === 'special');

        renderSection('daily-section', 'daily', 'Daily Quests', 'daily', '#00ff87', daily);
        renderSection('weekly-section', 'weekly', 'Weekly Operations', 'weekly', '#a855f7', weekly);
        renderSection('special-section', 'special', 'Special Missions', null, '#f59e0b', special);

        const empty = $('empty-state');
        if (empty) empty.classList.toggle('hidden', missions.length > 0);

        renderStatsBar();
        updateTimerDisplays();
        bindClaimButtons();
    }

    // ── Loading skeleton ───────────────────────────────────────

    function showLoading() {
        const daily = $('daily-section');
        if (!daily) return;
        daily.innerHTML = `
            <div class="flex items-center gap-3 mb-6">
                <div class="skeleton h-8 w-40"></div>
                <div class="skeleton h-6 w-28"></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${Array(3).fill('<div class="skeleton h-52 rounded-3xl"></div>').join('')}
            </div>`;
        const weekly = $('weekly-section');
        if (weekly) {
            weekly.innerHTML = `
                <div class="flex items-center gap-3 mb-6">
                    <div class="skeleton h-8 w-48"></div>
                    <div class="skeleton h-6 w-28"></div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    ${Array(2).fill('<div class="skeleton h-40 rounded-3xl"></div>').join('')}
                </div>`;
        }
    }

    // ── Claim ──────────────────────────────────────────────────

    function bindClaimButtons() {
        document.querySelectorAll('.claim-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const missionId = btn.dataset.missionId;
                btn.disabled = true;
                btn.textContent = 'Claiming...';

                try {
                    const result = await apiRequest(`/mission/${missionId}/claim`, { method: 'POST' });
                    const m = state.missions.find(x => x._id === missionId);
                    if (m) {
                        m.userProgress.claimed = true;
                    }
                    showClaimToast(`+${result.rewardAmount} ${REWARD_LABELS[result.rewardType] || result.rewardType} claimed!`);
                    renderAll();
                } catch (err) {
                    btn.disabled = false;
                    btn.textContent = 'Claim';
                    console.error('Claim failed:', err);
                }
            });
        });
    }

    function showClaimToast(text) {
        const toast = $('claim-toast');
        const toastText = $('claim-toast-text');
        if (!toast) return;
        if (toastText) toastText.textContent = text;
        toast.classList.remove('translate-y-4', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
        setTimeout(() => {
            toast.classList.add('translate-y-4', 'opacity-0');
            toast.classList.remove('translate-y-0', 'opacity-100');
        }, 2500);
    }

    // ── Fetch ──────────────────────────────────────────────────

    async function fetchMissions() {
        showLoading();
        try {
            const data = await apiRequest('/mission/active');
            state.missions = data.missions || [];
            state.dailyResetsAt = data.dailyResetsAt;
            state.weeklyResetsAt = data.weeklyResetsAt;
            renderAll();
            startTimers();
        } catch (err) {
            console.error('Failed to fetch missions:', err);
            $('daily-section').innerHTML = '';
            $('weekly-section').innerHTML = '';
            const empty = $('empty-state');
            if (empty) {
                empty.classList.remove('hidden');
                empty.querySelector('h3').textContent = 'Could not load missions';
                empty.querySelector('p').textContent = err.message || 'Please try again later.';
            }
        }
    }

    // ── Seed (auto-seed if empty) ──────────────────────────────

    async function ensureSeeded() {
        try {
            const data = await apiRequest('/mission/active');
            if (!data.missions || data.missions.length === 0) {
                await apiRequest('/mission/seed', { method: 'POST' });
            }
        } catch {}
    }

    // ── Init ───────────────────────────────────────────────────

    function activateTab(scope) {
        document.querySelectorAll('.scope-tab').forEach(t => {
            const isTarget = t.dataset.scope === scope;
            t.classList.toggle('is-active', isTarget);
            t.style.backgroundColor = isTarget ? '#00ff87' : '';
            t.classList.toggle('text-white', isTarget);
            t.classList.toggle('text-gray-400', !isTarget);
        });
        state.scope = scope;
    }

    function init() {
        // Read ?scope= from URL to pre-select a tab
        const params = new URLSearchParams(window.location.search);
        const urlScope = params.get('scope');
        if (urlScope === 'friends' || urlScope === 'individual') {
            activateTab(urlScope);
        }

        // Scope tabs
        document.querySelectorAll('.scope-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                activateTab(tab.dataset.scope);
                renderAll();
            });
        });

        // Logout
        function bindLogout() {
            const lb = document.getElementById('logoutBtn');
            if (!lb) return false;
            lb.addEventListener('click', () => {
                try { const api = require('../../../shared/api'); if (api.logout) api.logout(); } catch {}
            });
            return true;
        }
        if (!bindLogout()) setTimeout(bindLogout, 100);

        // Load data
        ensureSeeded().then(fetchMissions);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
