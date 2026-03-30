(function () {
    'use strict';
    const { apiRequest } = require('../../../shared/api');
    const DD = 'https://ddragon.leagueoflegends.com/cdn/14.1.1/img';
    const DDRAGON_ICON = DD + '/profileicon/';

    const GAME_NAMES = { valorant: 'Valorant', lol: 'League of Legends' };
    const GAME_API  = { valorant: 'VALORANT', lol: 'LOL' };
    const GAME_ACCENT = { valorant: '#ff4654', lol: '#0bc6e3' };
    const GAME_SUBTITLES = { valorant: 'Competitive 5v5 Tactical Shooter', lol: '5v5 MOBA - Strategic Team Combat' };
    const GAME_MAPS = { valorant: '—', lol: "Summoner's Rift" };

    const RIOT_REGION_TO_SERVER = {
        euw1:'EUW', na1:'NA', eun1:'EUNE', kr:'KR', br1:'BR',
        tr1:'TR', ru:'RU', la1:'LAN', la2:'LAS', jp1:'JP', oc1:'OCE',
        EUW1:'EUW', NA1:'NA', EUN1:'EUNE', KR:'KR', BR1:'BR',
    };
    const REGION_LABELS = {
        euw1:'EUW', eun1:'EUNE', na1:'NA', kr:'KR', br1:'BR',
        tr1:'TR', ru:'RU', la1:'LAN', la2:'LAS', jp1:'JP', oc1:'OCE',
    };

    function riotRegionToServer(r) { return RIOT_REGION_TO_SERVER[r] || (r ? r.toUpperCase() : 'EUW'); }

    const state = {
        nowGame: null,
        schedGame: null,
        schedStep: 0,
        linkInfo: null,
        mode: 'CUSTOM_1V1',
        ticketId: null,
        gameId: null,
        game: null,
        responded: false,
        pollInterval: null,
        timerInterval: null,
        timerSeconds: 0,
        countdownInterval: null,
        countdownLeft: 15,
        scheduledWatchInterval: null,
    };

    function $(id) { return document.getElementById(id); }

    // ═══════════════════════════════════════════════════════
    // POPUP / ALERT HELPERS
    // ═══════════════════════════════════════════════════════

    function showArenaPopup({ title, message, kind, confirmText, cancelText }) {
        return new Promise(resolve => {
            const modal = $('mm-app-popup-modal');
            const titleEl = $('mm-app-popup-title');
            const messageEl = $('mm-app-popup-message');
            const iconWrap = $('mm-app-popup-icon-wrap');
            const confirmBtn = $('mm-app-popup-confirm-btn');
            const cancelBtn = $('mm-app-popup-cancel-btn');
            if (!modal) { resolve(false); return; }

            titleEl.textContent = title || 'Notice';
            messageEl.textContent = message || '';
            confirmBtn.textContent = confirmText || 'OK';
            cancelBtn.textContent = cancelText || 'Cancel';
            cancelBtn.classList.toggle('hidden', !cancelText);

            if (kind === 'error') {
                iconWrap.className = 'w-11 h-11 rounded-xl bg-[#ff4654]/20 border border-[#ff4654]/35 flex items-center justify-center flex-shrink-0';
                iconWrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-[#ff4654]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" /></svg>';
                confirmBtn.className = 'px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#ff9800] to-[#ff4654] text-white font-bold text-sm hover:opacity-90 transition-all';
            } else {
                iconWrap.className = 'w-11 h-11 rounded-xl bg-[#00ff87]/20 border border-[#00ff87]/35 flex items-center justify-center flex-shrink-0';
                iconWrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-[#00ff87]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';
                confirmBtn.className = 'px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00ff87] to-[#22d3ee] text-[#0a0b0f] font-bold text-sm hover:opacity-90 transition-all';
            }

            modal.classList.remove('hidden');
            const close = (result) => { modal.classList.add('hidden'); confirmBtn.removeEventListener('click', onConfirm); cancelBtn.removeEventListener('click', onCancel); resolve(result); };
            const onConfirm = () => close(true);
            const onCancel = () => close(false);
            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
        });
    }

    window.showArenaAlert = (title, message, kind) =>
        showArenaPopup({ title, message, kind: kind || 'info', confirmText: 'OK' });
    window.showArenaConfirm = (title, message, confirmText, cancelText) =>
        showArenaPopup({ title, message, kind: 'error', confirmText: confirmText || 'Confirm', cancelText: cancelText || 'Cancel' });

    // ═══════════════════════════════════════════════════════
    // WIZARD NAVIGATION
    // ═══════════════════════════════════════════════════════

    function showSection(id) {
        document.querySelectorAll('.mm-section').forEach(s => s.classList.toggle('is-visible', s.id === id));
    }

    function setRootView() {
        state.nowGame = null;
        state.schedGame = null;
        state.schedStep = 0;
        showSection('mm-root');
        resetNowPanes();
        resetSchedPanes();
        updateNowDots(0);
        updateSchedDots(0);
    }

    function resetNowPanes() {
        document.querySelectorAll('.mm-now-pane').forEach((p, i) => p.classList.toggle('hidden', i !== 0));
    }
    function resetSchedPanes() {
        document.querySelectorAll('.mm-sched-pane').forEach((p, i) => p.classList.toggle('hidden', i !== 0));
    }

    function openNowFlow() {
        state.nowGame = null;
        showSection('mm-now-flow');
        resetNowPanes();
        updateNowDots(0);
    }

    function openSchedFlow() {
        state.schedGame = null;
        state.schedStep = 0;
        showSection('mm-schedule-flow');
        resetSchedPanes();
        updateSchedDots(0);
    }

    function showNowStep(n) {
        document.querySelectorAll('.mm-now-pane').forEach((p, i) => p.classList.toggle('hidden', i !== n));
        updateNowDots(n);
    }

    function showSchedStep(n) {
        state.schedStep = n;
        document.querySelectorAll('.mm-sched-pane').forEach((p, i) => p.classList.toggle('hidden', i !== n));
        updateSchedDots(n);
    }

    function updateNowDots(active) {
        document.querySelectorAll('[data-now-dot]').forEach(d => {
            const i = parseInt(d.getAttribute('data-now-dot'), 10);
            d.classList.remove('is-active', 'is-done');
            if (i < active) d.classList.add('is-done');
            if (i === active) d.classList.add('is-active');
        });
    }

    function updateSchedDots(active) {
        document.querySelectorAll('[data-sched-dot]').forEach(d => {
            const i = parseInt(d.getAttribute('data-sched-dot'), 10);
            d.classList.remove('is-active', 'is-done');
            if (i < active) d.classList.add('is-done');
            if (i === active) d.classList.add('is-active');
        });
    }

    // ═══════════════════════════════════════════════════════
    // RIOT ACCOUNT LINKING
    // ═══════════════════════════════════════════════════════

    function showRiotPanel(panelState) {
        ['unlinked', 'pending', 'verified'].forEach(s => {
            const el = $(`mm-riot-${s}`);
            if (el) el.classList.toggle('hidden', s !== panelState);
        });
        const queuePanel = $('mm-queue-panel');
        if (queuePanel) queuePanel.classList.toggle('hidden', panelState !== 'verified');
    }

    function setButtonLoading(btn, loading, text) {
        if (!btn) return;
        btn.disabled = loading;
        if (loading) {
            btn.dataset.origText = btn.innerHTML;
            btn.innerHTML = `<svg class="animate-spin h-4 w-4 mr-2 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> ${text || 'Loading...'}`;
        } else {
            btn.innerHTML = btn.dataset.origText || text || '';
        }
    }

    function updateGameHeader() {
        const g = state.nowGame;
        if (!g) return;
        const header = $('mm-game-header');
        const icon = $('mm-game-icon');
        const iconText = $('mm-game-icon-text');
        const title = $('mm-game-title');
        const subtitle = $('mm-game-subtitle');

        header.classList.remove('hidden');
        icon.style.background = GAME_ACCENT[g];
        iconText.textContent = g === 'lol' ? 'LoL' : 'V';
        title.textContent = GAME_NAMES[g];
        subtitle.textContent = GAME_SUBTITLES[g];

        const mapEl = $('mm-queue-map');
        if (mapEl) mapEl.textContent = GAME_MAPS[g];

        const gradient = $('mm-queue-gradient');
        if (gradient) gradient.style.background = `linear-gradient(to bottom right, ${GAME_ACCENT[g]}20, transparent)`;

        const qTitle = $('mm-queue-title');
        if (qTitle) qTitle.textContent = g === 'lol' ? 'RANKED QUEUE' : 'QUICK MATCH';
        const qSub = $('mm-queue-subtitle');
        if (qSub) qSub.textContent = g === 'lol' ? "Compete in Summoner's Rift" : 'Jump into competitive matchmaking';

        updateModeButtonColors();
    }

    function updateModeButtonColors() {
        const accent = GAME_ACCENT[state.nowGame] || '#00ff87';
        document.querySelectorAll('.mm-mode-btn').forEach(btn => {
            if (btn.classList.contains('is-active')) {
                btn.style.backgroundColor = accent;
                btn.classList.add('text-white');
                btn.classList.remove('text-gray-400');
            } else {
                btn.style.backgroundColor = '';
                btn.classList.remove('text-white');
                btn.classList.add('text-gray-400');
            }
        });
    }

    async function checkRiotLink() {
        const loading = $('mm-now-loading');
        const header = $('mm-game-header');
        loading.classList.remove('hidden');
        header.classList.add('hidden');
        showRiotPanel('__none__');

        try {
            state.linkInfo = await apiRequest('/riot-api/link-status');
        } catch {
            state.linkInfo = { status: 'unlinked' };
        }

        loading.classList.add('hidden');
        updateGameHeader();

        if (state.linkInfo.status === 'verified') {
            showRiotPanel('verified');
            const summ = $('mm-riot-summoner');
            if (summ) summ.textContent = `${state.linkInfo.riotGameName || ''}#${state.linkInfo.riotTagLine || ''}`;
            const serverSel = $('mm-queue-server');
            if (serverSel) {
                const mapped = riotRegionToServer(state.linkInfo.riotRegion);
                for (let i = 0; i < serverSel.options.length; i++) {
                    if (serverSel.options[i].value === mapped) { serverSel.selectedIndex = i; break; }
                }
            }
            fetchScheduledTickets();
            startScheduledWatch();
        } else if (state.linkInfo.status === 'pending_verification') {
            showRiotPanel('pending');
            if (state.linkInfo.originalIconId != null) {
                const iconImg = $('mm-riot-original-icon');
                if (iconImg) iconImg.src = `${DDRAGON_ICON}${state.linkInfo.originalIconId}.png`;
            }
        } else {
            showRiotPanel('unlinked');
        }
    }

    async function linkRiotAccount() {
        const gameName = $('mm-riot-gamename')?.value.trim();
        const tagLine = $('mm-riot-tagline')?.value.trim();
        const region = $('mm-riot-region')?.value;
        const errEl = $('mm-riot-link-error');
        if (errEl) errEl.classList.add('hidden');

        if (!gameName || !tagLine || !region) {
            if (errEl) { errEl.textContent = 'Please fill in all fields.'; errEl.classList.remove('hidden'); }
            return;
        }

        const btn = $('mm-riot-link-btn');
        setButtonLoading(btn, true, 'Linking...');

        try {
            const data = await apiRequest('/riot-api/link-account', {
                method: 'POST',
                body: JSON.stringify({ gameName, tagLine, region }),
            });
            showRiotPanel('pending');
            if (data.originalIconId != null) {
                const iconImg = $('mm-riot-original-icon');
                if (iconImg) iconImg.src = `${DDRAGON_ICON}${data.originalIconId}.png`;
            }
        } catch (err) {
            let msg = err.body?.message || err.message || 'Failed to link account.';
            if (Array.isArray(msg)) msg = msg.join('. ');
            if (msg === 'Failed to fetch Riot account') msg = 'Could not reach the Riot API. The API key may be expired.';
            else if (err.status === 404) msg = `Riot account "${gameName}#${tagLine}" not found on ${region.toUpperCase()}.`;
            else if (err.status === 429) msg = 'Rate limit exceeded. Please wait and try again.';
            if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
        } finally {
            setButtonLoading(btn, false);
        }
    }

    async function verifyRiotAccount() {
        const btn = $('mm-riot-verify-btn');
        const msgEl = $('mm-riot-verify-msg');
        if (msgEl) msgEl.classList.add('hidden');
        setButtonLoading(btn, true, 'Verifying...');

        try {
            const data = await apiRequest('/riot-api/verify-account', { method: 'POST' });
            if (data.verified) {
                if (msgEl) { msgEl.textContent = 'Account verified!'; msgEl.className = 'text-xs font-semibold mt-3 text-[#00ff87]'; msgEl.classList.remove('hidden'); }
                setTimeout(() => checkRiotLink(), 800);
            } else {
                if (msgEl) { msgEl.textContent = data.message || 'Icon has not changed yet.'; msgEl.className = 'text-xs font-semibold mt-3 text-amber-400'; msgEl.classList.remove('hidden'); }
            }
        } catch (err) {
            if (msgEl) { msgEl.textContent = err.body?.message || err.message || 'Verification failed.'; msgEl.className = 'text-xs font-semibold mt-3 text-amber-400'; msgEl.classList.remove('hidden'); }
        } finally {
            setButtonLoading(btn, false);
        }
    }

    async function disconnectRiotAccount() {
        const confirmed = await window.showArenaConfirm('Disconnect Riot Account', 'Are you sure you want to disconnect your Riot account?', 'Disconnect', 'Keep Linked');
        if (!confirmed) return;
        try {
            await apiRequest('/riot-api/disconnect-account', { method: 'POST' });
            state.linkInfo = { status: 'unlinked' };
            showRiotPanel('unlinked');
        } catch (err) {
            await window.showArenaAlert('Disconnect Failed', err.body?.message || err.message || 'Failed to disconnect.', 'error');
        }
    }

    // ═══════════════════════════════════════════════════════
    // TIMER
    // ═══════════════════════════════════════════════════════

    function startTimer() {
        state.timerSeconds = 0;
        const timerEl = $('mm-queue-timer');
        state.timerInterval = setInterval(() => {
            state.timerSeconds++;
            const m = Math.floor(state.timerSeconds / 60);
            const s = state.timerSeconds % 60;
            if (timerEl) timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        }, 1000);
    }

    function stopTimer() {
        if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
    }

    // ═══════════════════════════════════════════════════════
    // QUEUE UI
    // ═══════════════════════════════════════════════════════

    function showQueueState(queueState) {
        const idle = $('mm-queue-idle');
        const searching = $('mm-queue-searching');
        if (idle) idle.classList.toggle('hidden', queueState === 'searching');
        if (searching) searching.classList.toggle('hidden', queueState !== 'searching');
    }

    function formatMode(mode) {
        if (mode === 'CUSTOM_1V1') return '1v1';
        if (mode === 'CUSTOM_2V2') return '2v2';
        if (mode === 'CUSTOM_5V5') return '5v5';
        return mode || '—';
    }

    // ═══════════════════════════════════════════════════════
    // SCHEDULED TICKETS
    // ═══════════════════════════════════════════════════════

    async function fetchScheduledTickets() {
        const listWrap = $('mm-scheduled-list-wrap');
        const listEl = $('mm-scheduled-list');
        if (!listWrap || !listEl) return;

        try {
            const res = await apiRequest('/matchmaking/my-scheduled-tickets');
            const allTickets = Array.isArray(res?.tickets) ? res.tickets : [];
            const gameType = GAME_API[state.nowGame];
            const tickets = gameType
                ? allTickets.filter(t => t && t.game === gameType).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
                : allTickets.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

            if (!tickets.length) { listEl.innerHTML = ''; listWrap.classList.add('hidden'); return; }

            listEl.innerHTML = tickets.map(t => {
                const dt = t.scheduledAt ? new Date(t.scheduledAt) : null;
                const when = dt && !Number.isNaN(dt.getTime())
                    ? `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : '—';
                return `<div class="flex items-center justify-between gap-2 p-2 rounded-xl border border-white/10 bg-white/5">
                    <div class="min-w-0"><p class="text-xs font-semibold text-white">${when}</p><p class="text-[11px] text-gray-400">${formatMode(t.mode)} · ${t.server || '—'} · ${t.region || '—'}</p></div>
                    <button class="mm-cancel-scheduled-btn px-2 py-1 text-[10px] font-bold rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 uppercase tracking-wide" data-ticket-id="${t.id}">Cancel</button>
                </div>`;
            }).join('');

            listWrap.classList.remove('hidden');
            listEl.querySelectorAll('.mm-cancel-scheduled-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        await apiRequest(`/matchmaking/queue/${btn.dataset.ticketId}`, { method: 'DELETE' });
                        await fetchScheduledTickets();
                    } catch (err) {
                        await window.showArenaAlert('Cancel Failed', err.message || 'Failed to cancel.', 'error');
                    }
                });
            });
        } catch {
            listEl.innerHTML = '';
            listWrap.classList.add('hidden');
        }
    }

    // ═══════════════════════════════════════════════════════
    // CONFLICT CHECK
    // ═══════════════════════════════════════════════════════

    function openScheduleConflictModal(whenText) {
        return new Promise(resolve => {
            const modal = $('mm-schedule-conflict-modal');
            const textEl = $('mm-schedule-conflict-text');
            const waitBtn = $('mm-schedule-wait-btn');
            const cancelPlayBtn = $('mm-schedule-cancel-play-btn');
            if (!modal) { resolve(false); return; }

            textEl.textContent = `You already have a scheduled game at ${whenText}.`;
            modal.classList.remove('hidden');

            const close = (result) => { modal.classList.add('hidden'); waitBtn.removeEventListener('click', onWait); cancelPlayBtn.removeEventListener('click', onCancelAndPlay); resolve(result); };
            const onWait = () => close(false);
            const onCancelAndPlay = () => close(true);
            waitBtn.addEventListener('click', onWait);
            cancelPlayBtn.addEventListener('click', onCancelAndPlay);
        });
    }

    async function checkConflictBeforeQueue() {
        const gameType = GAME_API[state.nowGame];
        try {
            const res = await apiRequest('/matchmaking/my-scheduled-tickets');
            const allTickets = Array.isArray(res?.tickets) ? res.tickets : [];
            const now = new Date();
            const thirtyMin = new Date(now.getTime() + 30 * 60 * 1000);
            let conflict = null;
            for (const t of allTickets) {
                if (!t || t.game !== gameType || !t.scheduledAt) continue;
                const dt = new Date(t.scheduledAt);
                if (!Number.isNaN(dt.getTime()) && dt > now && dt < thirtyMin) { conflict = t; break; }
            }
            if (!conflict) return true;

            const dt = new Date(conflict.scheduledAt);
            const when = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            const proceed = await openScheduleConflictModal(when);
            if (!proceed) return false;
            await apiRequest(`/matchmaking/queue/${conflict.id}`, { method: 'DELETE' });
            await fetchScheduledTickets();
            return true;
        } catch (err) {
            await window.showArenaAlert('Conflict Check Failed', err.message || 'Failed to check conflicts.', 'error');
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════
    // OVERLAY HELPERS
    // ═══════════════════════════════════════════════════════

    function showOverlay() {
        const overlay = $('mm-overlay');
        const content = $('mm-overlay-content');
        overlay.classList.remove('hidden');
        requestAnimationFrame(() => { content.classList.remove('scale-95', 'opacity-0'); content.classList.add('scale-100', 'opacity-100'); });
    }
    function hideOverlay() {
        const overlay = $('mm-overlay');
        const content = $('mm-overlay-content');
        content.classList.add('scale-95', 'opacity-0');
        content.classList.remove('scale-100', 'opacity-100');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
    function showOverlayView(view) {
        ['mm-match-found', 'mm-cancelled'].forEach(id => {
            const el = $(id);
            if (el) el.classList.toggle('hidden', id !== view);
        });
    }

    // ═══════════════════════════════════════════════════════
    // COUNTDOWN
    // ═══════════════════════════════════════════════════════

    function startCountdown() {
        state.countdownLeft = 15;
        const circle = $('mm-countdown-circle');
        const num = $('mm-countdown-num');
        const circumference = 2 * Math.PI * 35;
        function update() {
            if (num) num.textContent = state.countdownLeft;
            const offset = circumference * (1 - state.countdownLeft / 15);
            if (circle) circle.setAttribute('stroke-dashoffset', offset);
            const color = state.countdownLeft > 8 ? '#00ff87' : state.countdownLeft > 4 ? '#ffc107' : '#ff4654';
            if (circle) circle.setAttribute('stroke', color);
        }
        update();
        state.countdownInterval = setInterval(() => {
            state.countdownLeft--;
            if (state.countdownLeft <= 0) { clearInterval(state.countdownInterval); state.countdownInterval = null; }
            update();
        }, 1000);
    }
    function stopCountdown() { if (state.countdownInterval) { clearInterval(state.countdownInterval); state.countdownInterval = null; } }

    // ═══════════════════════════════════════════════════════
    // POLLING
    // ═══════════════════════════════════════════════════════

    function startPolling() { stopPolling(); state.pollInterval = setInterval(pollMatchState, 3000); }
    function stopPolling() { if (state.pollInterval) { clearInterval(state.pollInterval); state.pollInterval = null; } }

    async function pollMatchState() {
        try {
            const ticketRes = await apiRequest('/matchmaking/my-active-ticket');
            const gameRes = await apiRequest('/matchmaking/my-active-game');

            if (gameRes.game) {
                const game = gameRes.game;
                state.gameId = game._id;

                if (game.status === 'PENDING_ACCEPTANCE') {
                    stopTimer();
                    showQueueState('idle');
                    showMatchFound(game);
                    return;
                }
                if (game.status === 'ACCEPTED' && game.roomInfo) {
                    stopPolling(); stopCountdown(); hideOverlay();
                    navigateToGameRoom(game);
                    return;
                }
                if (game.status === 'CANCELLED' || game.status === 'EXPIRED') {
                    stopPolling(); stopCountdown(); stopTimer();
                    showQueueState('idle');
                    showOverlayView('mm-cancelled');
                    showOverlay();
                    resetMatchState();
                    return;
                }
            }

            if (!ticketRes.ticket) {
                stopPolling(); stopTimer();
                showQueueState('idle');
                resetMatchState();
            }
        } catch (err) { console.error('Polling error:', err); }
    }

    // ═══════════════════════════════════════════════════════
    // MATCH FOUND
    // ═══════════════════════════════════════════════════════

    function renderPlayerRow(p, currentUserId) {
        const ri = p.riotAccountInfo || {};
        const name = ri.riotGameName ? `${ri.riotGameName}#${ri.riotTagLine || ''}` : 'Unknown';
        const iconId = ri.originalIconId || 1;
        const isMe = p.userId === currentUserId;
        const statusIcon = p.accepted === true ? '✓' : p.accepted === false ? '✗' : '⏳';
        const statusColor = p.accepted === true ? 'text-[#00ff87]' : p.accepted === false ? 'text-[#ff4654]' : 'text-amber-400';
        const highlight = isMe ? 'bg-white/10 border border-white/20' : 'bg-white/5';
        return `<div class="flex items-center gap-3 p-2.5 rounded-xl ${highlight}">
            <div class="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                <img src="${DD}/profileicon/${iconId}.png" class="w-full h-full object-cover" onerror="this.style.display='none'" />
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate">${name}${isMe ? ' <span class="text-[10px] text-[#00ff87]">(You)</span>' : ''}</p>
                <p class="text-[10px] text-gray-500">${p.elo || 1000} ELO</p>
            </div>
            <span class="${statusColor} text-lg font-bold">${statusIcon}</span>
        </div>`;
    }

    function showMatchFound(game) {
        const modeLabel = { CUSTOM_1V1: '1 vs 1', CUSTOM_2V2: '2 vs 2', CUSTOM_5V5: '5 vs 5' };
        const badge = $('mm-mode-badge');
        if (badge) badge.textContent = modeLabel[game.mode] || game.mode;

        const user = JSON.parse(localStorage.getItem('arena_user') || '{}');
        const blue = (game.participants || []).filter(p => p.team === 'BLUE');
        const red = (game.participants || []).filter(p => p.team === 'RED');
        const blueEl = $('mm-blue-team');
        const redEl = $('mm-red-team');
        if (blueEl) blueEl.innerHTML = blue.map(p => renderPlayerRow(p, user.id)).join('');
        if (redEl) redEl.innerHTML = red.map(p => renderPlayerRow(p, user.id)).join('');

        const me = (game.participants || []).find(p => p.userId === user.id);
        const accepted = me && me.accepted === true;
        state.responded = accepted;

        $('mm-accept-btn').classList.toggle('hidden', accepted);
        $('mm-decline-btn').classList.toggle('hidden', accepted);
        $('mm-accepted-msg').classList.toggle('hidden', !accepted);

        showOverlayView('mm-match-found');
        showOverlay();
        if (!state.countdownInterval) startCountdown();
    }

    // ═══════════════════════════════════════════════════════
    // GAME ROOM
    // ═══════════════════════════════════════════════════════

    function renderGRPlayerCard(p, teamColor, currentUserId) {
        const ri = p.riotAccountInfo || {};
        const name = ri.riotGameName ? `${ri.riotGameName}#${ri.riotTagLine || ''}` : 'Player';
        const iconId = ri.originalIconId || 0;
        const isMe = p.userId === currentUserId;
        const regionLabel = REGION_LABELS[ri.riotRegion] || ri.riotRegion || '—';
        const elo = p.elo || 1000;
        const isBlue = teamColor === '#4488FF';
        const eloBg = isBlue ? 'rgba(68,136,255,0.08)' : 'rgba(255,68,68,0.08)';
        const meBorder = isMe ? (isBlue ? 'border-[#4488FF]/30' : 'border-[#FF4444]/30') : '';
        const meBg = isMe ? 'background: rgba(255,255,255,0.02);' : '';
        const iconHtml = iconId > 0
            ? `<img src="${DD}/profileicon/${iconId}.png" class="w-full h-full object-cover" onerror="this.style.display='none'" />`
            : `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" style="color:${teamColor}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>`;

        return `<div class="gr-team-card flex items-center gap-3.5 p-3.5 rounded-xl ${meBorder}" style="border:1px solid ${isBlue ? 'rgba(68,136,255,0.12)' : 'rgba(255,68,68,0.12)'}; ${meBg}">
            <div class="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style="border:2px solid ${iconId > 0 ? '#C89B3C' : 'rgba(255,255,255,0.06)'}; background:#0A0E1A;">${iconHtml}</div>
            <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold text-white truncate">${name}${isMe ? ' <span class="text-[10px] font-bold text-[#00ff87] ml-1 px-1.5 py-0.5 rounded bg-[#00ff87]/10">YOU</span>' : ''}</p>
                <p class="text-[11px] text-[#7A86AC] mt-0.5">${regionLabel} · ${elo} ELO</p>
            </div>
            <div class="px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide" style="background:${eloBg}; color:${teamColor};">${elo}</div>
        </div>`;
    }

    function navigateToGameRoom(game) {
        if (!game || !game.roomInfo) {
            $('gr-error-fallback').classList.remove('hidden');
            $('game-room-screen').classList.remove('hidden');
            return;
        }
        state.game = game;
        state.gameId = game._id;
        localStorage.setItem('arena_active_game_id', game._id);

        const ri = game.roomInfo;
        const modeLabels = { CUSTOM_1V1: '1v1', CUSTOM_2V2: '2v2', CUSTOM_5V5: '5v5' };
        $('gr-room-id').textContent = ri.roomId || '—';
        $('gr-mode').textContent = modeLabels[game.mode] || game.mode;
        $('gr-players').textContent = game.number_of_participant || game.participants?.length || '—';
        $('gr-server').textContent = (game.server || '—').toUpperCase();
        $('gr-region').textContent = game.region || '—';
        $('gr-map').textContent = ri.map || "Summoner's Rift";

        if (game.isScheduled && game.scheduled_at) {
            $('gr-scheduled-bar').classList.remove('hidden');
            const dt = new Date(game.scheduled_at);
            $('gr-scheduled-text').textContent = `Scheduled Match · ${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            $('gr-scheduled-bar').classList.add('hidden');
        }

        const user = JSON.parse(localStorage.getItem('arena_user') || '{}');
        const blue = (game.participants || []).filter(p => p.team === 'BLUE');
        const red = (game.participants || []).filter(p => p.team === 'RED');
        $('gr-blue-team').innerHTML = blue.map(p => renderGRPlayerCard(p, '#4488FF', user.id)).join('');
        $('gr-red-team').innerHTML = red.map(p => renderGRPlayerCard(p, '#FF4444', user.id)).join('');

        $('gr-error-fallback').classList.add('hidden');
        $('game-room-screen').classList.remove('hidden');
    }

    function leaveGameRoom() {
        $('game-room-screen').classList.add('hidden');
        localStorage.removeItem('arena_active_game_id');
        resetMatchState();
        showQueueState('idle');
    }

    // ═══════════════════════════════════════════════════════
    // STATE MANAGEMENT
    // ═══════════════════════════════════════════════════════

    function resetMatchState() {
        state.ticketId = null;
        state.gameId = null;
        state.game = null;
        state.responded = false;
    }

    // ═══════════════════════════════════════════════════════
    // JOIN / CANCEL QUEUE
    // ═══════════════════════════════════════════════════════

    async function joinQueue(scheduledAt) {
        if (!state.linkInfo || state.linkInfo.status !== 'verified') {
            await window.showArenaAlert('Account Required', 'Please link and verify your Riot account first.', 'error');
            return;
        }

        const gameType = GAME_API[state.nowGame];
        const serverEl = $('mm-queue-server');
        const regionEl = $('mm-queue-region');
        const selectedServer = serverEl ? serverEl.value : riotRegionToServer(state.linkInfo?.riotRegion);
        const selectedRegion = regionEl ? regionEl.value : 'ALL';

        if (!scheduledAt) {
            const canProceed = await checkConflictBeforeQueue();
            if (!canProceed) return;
            showQueueState('searching');
            startTimer();
        }

        try {
            const ticket = await apiRequest('/matchmaking/queue', {
                method: 'POST',
                body: JSON.stringify({
                    game: gameType,
                    mode: state.mode,
                    server: selectedServer,
                    region: selectedRegion,
                    ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
                    riotAccountInfo: {
                        originalIconId: state.linkInfo.originalIconId || 1,
                        riotGameName: state.linkInfo.riotGameName,
                        riotLinkStatus: 'verified',
                        riotPuuid: state.linkInfo.riotPuuid,
                        riotRegion: state.linkInfo.riotRegion,
                        riotTagLine: state.linkInfo.riotTagLine,
                    },
                }),
            });
            if (scheduledAt) {
                const input = $('mm-scheduled-at');
                if (input) input.value = '';
                await fetchScheduledTickets();
                startScheduledWatch();
                await window.showArenaAlert('Scheduled', 'Game scheduled successfully.');
            } else {
                state.ticketId = ticket.id;
                startPolling();
                stopScheduledWatch();
            }
        } catch (err) {
            showQueueState('idle');
            stopTimer();
            await window.showArenaAlert('Matchmaking Failed', err.message || 'Failed to join queue.', 'error');
        }
    }

    async function cancelQueue() {
        stopPolling(); stopTimer();
        showQueueState('idle');
        if (state.ticketId) {
            try { await apiRequest(`/matchmaking/queue/${state.ticketId}`, { method: 'DELETE' }); } catch {}
        }
        resetMatchState();
        startScheduledWatch();
    }

    async function respondToMatch(accept) {
        if (!state.gameId || state.responded) return;
        state.responded = true;
        try {
            await apiRequest(`/matchmaking/games/${state.gameId}/response`, {
                method: 'POST',
                body: JSON.stringify({ accept }),
            });
            if (accept) {
                $('mm-accept-btn').classList.add('hidden');
                $('mm-decline-btn').classList.add('hidden');
                $('mm-accepted-msg').classList.remove('hidden');
            } else {
                stopPolling(); stopCountdown(); hideOverlay();
                showQueueState('idle');
                resetMatchState();
            }
        } catch (err) {
            state.responded = false;
            await window.showArenaAlert('Response Failed', err.message || 'Failed to respond.', 'error');
        }
    }

    // ═══════════════════════════════════════════════════════
    // SCHEDULED WATCH (for auto-activating scheduled games)
    // ═══════════════════════════════════════════════════════

    async function scheduledWatchTick() {
        if (!state.linkInfo || state.linkInfo.status !== 'verified') return;
        if (state.ticketId || state.gameId || state.pollInterval) return;

        try {
            const gameRes = await apiRequest('/matchmaking/my-active-game');
            if (gameRes.game) {
                state.gameId = gameRes.game._id;
                await fetchScheduledTickets();
                if (gameRes.game.status === 'PENDING_ACCEPTANCE') {
                    showQueueState('idle');
                    stopTimer();
                    showMatchFound(gameRes.game);
                    startPolling();
                    stopScheduledWatch();
                    return;
                }
                if (gameRes.game.status === 'ACCEPTED' && gameRes.game.roomInfo) {
                    navigateToGameRoom(gameRes.game);
                    stopScheduledWatch();
                    return;
                }
            }
            const ticketRes = await apiRequest('/matchmaking/my-active-ticket');
            if (ticketRes.ticket && ticketRes.ticket.status === 'SEARCHING') {
                state.ticketId = ticketRes.ticket.id;
                await fetchScheduledTickets();
                showQueueState('searching');
                startTimer();
                startPolling();
                stopScheduledWatch();
            }
        } catch (err) { console.error('Scheduled watch error:', err); }
    }

    function startScheduledWatch() {
        if (state.scheduledWatchInterval) return;
        state.scheduledWatchInterval = setInterval(scheduledWatchTick, 10000);
        scheduledWatchTick();
    }
    function stopScheduledWatch() {
        if (state.scheduledWatchInterval) { clearInterval(state.scheduledWatchInterval); state.scheduledWatchInterval = null; }
    }

    // ═══════════════════════════════════════════════════════
    // RESTORE STATE ON LOAD
    // ═══════════════════════════════════════════════════════

    async function restoreMatchmakingState() {
        if ($('game-room-screen') && !$('game-room-screen').classList.contains('hidden')) return;

        try {
            state.linkInfo = await apiRequest('/riot-api/link-status');
        } catch { return; }

        if (state.linkInfo.status !== 'verified') return;

        try {
            const gameRes = await apiRequest('/matchmaking/my-active-game');
            if (gameRes.game) {
                state.gameId = gameRes.game._id;
                const gameKey = gameRes.game.game === 'VALORANT' ? 'valorant' : 'lol';
                state.nowGame = gameKey;

                showSection('mm-now-flow');
                showNowStep(1);
                updateGameHeader();
                showRiotPanel('verified');
                const summ = $('mm-riot-summoner');
                if (summ) summ.textContent = `${state.linkInfo.riotGameName || ''}#${state.linkInfo.riotTagLine || ''}`;
                await fetchScheduledTickets();

                if (gameRes.game.status === 'PENDING_ACCEPTANCE') {
                    showMatchFound(gameRes.game);
                    startPolling();
                    return;
                }
                if (gameRes.game.status === 'ACCEPTED' && gameRes.game.roomInfo) {
                    navigateToGameRoom(gameRes.game);
                    return;
                }
            }
            const ticketRes = await apiRequest('/matchmaking/my-active-ticket');
            if (ticketRes.ticket && ticketRes.ticket.status === 'SEARCHING') {
                state.ticketId = ticketRes.ticket.id;
                const gameKey = ticketRes.ticket.game === 'VALORANT' ? 'valorant' : 'lol';
                state.nowGame = gameKey;

                showSection('mm-now-flow');
                showNowStep(1);
                updateGameHeader();
                showRiotPanel('verified');
                const summ = $('mm-riot-summoner');
                if (summ) summ.textContent = `${state.linkInfo.riotGameName || ''}#${state.linkInfo.riotTagLine || ''}`;
                await fetchScheduledTickets();

                showQueueState('searching');
                startTimer();
                startPolling();
                return;
            }
        } catch {}
    }

    // ═══════════════════════════════════════════════════════
    // SCHEDULE FLOW (wizard steps with real API)
    // ═══════════════════════════════════════════════════════

    function fillScheduleReview() {
        const sizeSel = $('mm-sched-size');
        const serverSel = $('mm-sched-server');
        const regionSel = $('mm-sched-region');
        const whenEl = $('mm-sched-when');
        const notes = $('mm-sched-notes').value.trim();

        $('mm-review-game').textContent = GAME_NAMES[state.schedGame] || '—';
        $('mm-review-format').textContent = formatMode(sizeSel.value);
        $('mm-review-server').textContent = `${serverSel.value} / ${regionSel.value}`;
        const whenStr = whenEl.value
            ? new Date(whenEl.value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : 'Not set';
        $('mm-review-when').textContent = whenStr;
        $('mm-review-notes').textContent = notes || '—';
    }

    async function confirmSchedule() {
        if (!state.linkInfo || state.linkInfo.status !== 'verified') {
            await window.showArenaAlert('Account Required', 'Please link and verify your Riot account first via Play Now.', 'error');
            return;
        }

        const gameType = GAME_API[state.schedGame];
        const mode = $('mm-sched-size').value;
        const server = $('mm-sched-server').value;
        const region = $('mm-sched-region').value;
        const whenVal = $('mm-sched-when').value;
        const notes = $('mm-sched-notes').value.trim();

        if (!whenVal) {
            await window.showArenaAlert('Missing Date', 'Please select a date and time.', 'error');
            return;
        }

        const scheduledAt = new Date(whenVal);
        if (Number.isNaN(scheduledAt.getTime())) {
            await window.showArenaAlert('Invalid Date', 'Please select a valid date and time.', 'error');
            return;
        }
        if (scheduledAt <= new Date()) {
            await window.showArenaAlert('Invalid Date', 'Please choose a future time.', 'error');
            return;
        }

        try {
            await apiRequest('/matchmaking/queue', {
                method: 'POST',
                body: JSON.stringify({
                    game: gameType,
                    mode: mode,
                    server: server,
                    region: region,
                    scheduledAt: scheduledAt.toISOString(),
                    riotAccountInfo: {
                        originalIconId: state.linkInfo.originalIconId || 1,
                        riotGameName: state.linkInfo.riotGameName,
                        riotLinkStatus: 'verified',
                        riotPuuid: state.linkInfo.riotPuuid,
                        riotRegion: state.linkInfo.riotRegion,
                        riotTagLine: state.linkInfo.riotTagLine,
                    },
                }),
            });
            $('mm-sched-success-msg').textContent = `You're set for ${$('mm-review-when').textContent}. Reminders will appear in-app.`;
            showSchedStep(4);
        } catch (err) {
            await window.showArenaAlert('Schedule Failed', err.message || 'Failed to schedule match.', 'error');
        }
    }

    // ═══════════════════════════════════════════════════════
    // EVENT WIRING
    // ═══════════════════════════════════════════════════════

    function init() {
        // Root buttons
        $('mm-choose-now').addEventListener('click', openNowFlow);
        $('mm-choose-schedule').addEventListener('click', openSchedFlow);

        // Back to root
        document.querySelectorAll('.mm-back-root').forEach(btn => btn.addEventListener('click', setRootView));

        // Play Now: game selection
        document.querySelectorAll('.mm-pick-game-now').forEach(btn => {
            btn.addEventListener('click', () => {
                state.nowGame = btn.dataset.game;
                showNowStep(1);
                checkRiotLink();
            });
        });

        // Play Now: back to game selection
        $('mm-now-back-1').addEventListener('click', () => {
            state.nowGame = null;
            showNowStep(0);
        });

        // Riot linking form validation
        ['mm-riot-gamename', 'mm-riot-tagline', 'mm-riot-region'].forEach(id => {
            const inp = $(id);
            if (inp) {
                const check = () => {
                    const filled = $('mm-riot-gamename').value.trim() && $('mm-riot-tagline').value.trim() && $('mm-riot-region').value;
                    $('mm-riot-link-btn').disabled = !filled;
                };
                inp.addEventListener('input', check);
                inp.addEventListener('change', check);
            }
        });

        // Riot linking buttons
        $('mm-riot-link-btn').addEventListener('click', linkRiotAccount);
        $('mm-riot-verify-btn').addEventListener('click', verifyRiotAccount);
        $('mm-riot-cancel-btn').addEventListener('click', disconnectRiotAccount);
        $('mm-riot-disconnect-btn').addEventListener('click', disconnectRiotAccount);

        // Mode selector toggle
        document.querySelectorAll('.mm-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mm-mode-btn').forEach(b => {
                    b.classList.remove('is-active');
                    b.style.backgroundColor = '';
                    b.classList.add('text-gray-400');
                    b.classList.remove('text-white');
                });
                btn.classList.add('is-active');
                state.mode = btn.dataset.mode;
                updateModeButtonColors();
            });
        });

        // Queue buttons
        $('mm-find-match-btn').addEventListener('click', () => joinQueue(null));
        $('mm-cancel-queue-btn').addEventListener('click', cancelQueue);
        $('mm-schedule-match-btn').addEventListener('click', () => {
            const input = $('mm-scheduled-at');
            if (!input || !input.value) {
                window.showArenaAlert('Missing Date', 'Please select a date and time first.', 'error');
                return;
            }
            const dt = new Date(input.value);
            if (Number.isNaN(dt.getTime())) { window.showArenaAlert('Invalid Date', 'Invalid date/time.', 'error'); return; }
            if (dt <= new Date()) { window.showArenaAlert('Invalid Date', 'Please choose a future time.', 'error'); return; }
            joinQueue(dt);
        });

        // Match found overlay
        $('mm-accept-btn').addEventListener('click', () => respondToMatch(true));
        $('mm-decline-btn').addEventListener('click', () => respondToMatch(false));
        $('mm-cancelled-close-btn').addEventListener('click', hideOverlay);

        // Game room
        $('gr-copy-btn').addEventListener('click', () => {
            const roomId = $('gr-room-id').textContent;
            navigator.clipboard.writeText(roomId).then(() => {
                const toast = $('gr-toast');
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2000);
            });
        });
        $('gr-done-btn').addEventListener('click', async () => {
            if (state.gameId) {
                try { await apiRequest(`/matchmaking/games/${state.gameId}/acknowledge`, { method: 'POST' }); } catch {}
            }
            leaveGameRoom();
        });
        $('gr-error-back-btn').addEventListener('click', leaveGameRoom);

        // Schedule flow: game selection
        document.querySelectorAll('.mm-pick-game-sched').forEach(btn => {
            btn.addEventListener('click', async () => {
                state.schedGame = btn.dataset.game;
                try {
                    state.linkInfo = await apiRequest('/riot-api/link-status');
                } catch {
                    state.linkInfo = { status: 'unlinked' };
                }
                if (state.linkInfo.status !== 'verified') {
                    await window.showArenaAlert('Account Required', 'Please link and verify your Riot account first via the Play Now flow.', 'error');
                    return;
                }
                showSchedStep(1);
            });
        });

        // Schedule flow: nav buttons
        document.querySelectorAll('.mm-sched-next').forEach(btn => {
            btn.addEventListener('click', () => {
                const to = parseInt(btn.dataset.to, 10);
                if (to === 3) fillScheduleReview();
                showSchedStep(to);
            });
        });
        document.querySelectorAll('.mm-sched-back').forEach(btn => {
            btn.addEventListener('click', () => showSchedStep(parseInt(btn.dataset.to, 10)));
        });
        $('mm-sched-confirm').addEventListener('click', confirmSchedule);
        $('mm-sched-another').addEventListener('click', () => {
            state.schedGame = null;
            showSchedStep(0);
        });

        // Sidebar active
        setTimeout(() => {
            document.querySelectorAll('.sidebar-menu-btn.nav-menu-btn').forEach(b => b.classList.remove('active'));
            const mm = $('nav-matchmaking');
            if (mm) mm.classList.add('active');
        }, 0);

        // Logout
        function bindLogout() {
            const lb = $('logoutBtn');
            if (!lb) return false;
            lb.addEventListener('click', () => {
                try { const api = require('../../../shared/api'); if (api.logout) api.logout(); } catch {}
            });
            return true;
        }
        if (!bindLogout()) setTimeout(bindLogout, 100);

        // Restore state on load
        restoreMatchmakingState();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
