/**
 * Loads Arena level/XP from GET /me/level and player stats from GET /player/me
 * into the left sidebar profile card (see left_side_navbar.html).
 */
const path = require('path');
const { apiRequest, getUser } = require(path.join(__dirname, '../../../shared/api'));

function fmtNum(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString();
}

function setRankBadge(el, rank) {
    if (!el) return;
    const raw = (rank || 'Unranked').toString();
    const label = raw.length > 12 ? `${raw.slice(0, 11)}…` : raw;
    el.textContent = '◆ ' + label.toUpperCase();
    const r = raw.toLowerCase();
    if (r.includes('unranked') || r.includes('iron')) {
        el.style.background = 'linear-gradient(135deg, #4b5563, #374151)';
        el.style.color = '#e5e7eb';
    } else if (r.includes('gold')) {
        el.style.background = 'linear-gradient(135deg, #ffd700, #ff8c00)';
        el.style.color = '#1a0a00';
    } else if (r.includes('silver')) {
        el.style.background = 'linear-gradient(135deg, #c0c0c0, #9ca3af)';
        el.style.color = '#111827';
    } else if (r.includes('diamond') || r.includes('plat')) {
        el.style.background = 'linear-gradient(135deg, #22d3ee, #6366f1)';
        el.style.color = '#0a0b0f';
    } else {
        el.style.background = 'linear-gradient(135deg, #ffd700, #ff8c00)';
        el.style.color = '#1a0a00';
    }
}

async function refreshSidebarProfile() {
    const user = getUser();
    const nickEl = document.getElementById('sidebar-nickname');
    if (nickEl && user?.nickname) nickEl.textContent = user.nickname;

    const avatarEl = document.getElementById('sidebar-avatar');
    if (avatarEl && user) {
        const name = encodeURIComponent(user.nickname || user.email || 'Player');
        if (user.avatar) {
            avatarEl.src = user.avatar;
        } else {
            avatarEl.src = `https://ui-avatars.com/api/?name=${name}&background=00ff87&color=0a0b0f&bold=true`;
        }
    }

    try {
        const level = await apiRequest('/me/level');
        const lvl = level.level ?? 1;
        const cur = level.currentXP ?? 0;
        const need = level.xpToNextLevel ?? 1;
        const pct = Math.min(100, Math.max(0, level.progressPct ?? (need > 0 ? (cur / need) * 100 : 0)));

        const levelLabel = document.getElementById('sidebar-level-label');
        if (levelLabel) levelLabel.textContent = `LEVEL ${lvl}`;

        const xpText = document.getElementById('sidebar-xp-text');
        if (xpText) xpText.textContent = `${fmtNum(cur)} / ${fmtNum(need)} XP`;

        const bar = document.getElementById('sidebar-xp-bar');
        if (bar) bar.style.width = `${pct}%`;

        const meta = document.getElementById('sidebar-rank-meta');
        if (meta && level.totalXP != null) {
            meta.textContent = `${fmtNum(level.totalXP)} XP total`;
        }
    } catch (e) {
        console.warn('[sidebar] /me/level failed', e.message || e);
    }

    try {
        const profile = await apiRequest('/player/me');
        const rank = profile.rank || 'Unranked';
        setRankBadge(document.getElementById('sidebar-rank-badge'), rank);

        const elo = profile.elo;
        const eloEl = document.getElementById('sidebar-stat-elo');
        if (eloEl) eloEl.textContent = elo != null ? fmtNum(elo) : '—';

        const stats = profile.stats || {};
        const kdEl = document.getElementById('sidebar-stat-kd');
        const winEl = document.getElementById('sidebar-stat-win');
        if (kdEl) {
            const kd = stats.kd ?? stats.kda ?? stats.kdRatio;
            kdEl.textContent = kd != null && kd !== '' ? String(kd) : '—';
        }
        if (winEl) {
            const w = stats.winRate ?? stats.winPct ?? stats.winrate;
            if (w != null && w !== '') {
                winEl.textContent = typeof w === 'number' && w <= 1 ? `${Math.round(w * 100)}%` : String(w);
            } else {
                winEl.textContent = '—';
            }
        }
    } catch (e) {
        console.warn('[sidebar] /player/me failed', e.message || e);
    }
}

function initSidebarProfile() {
    if (!window.__arenaSidebarProfileListeners) {
        window.__arenaSidebarProfileListeners = true;
        window.addEventListener('arenachain-sidebar-profile-sync', () => {
            refreshSidebarProfile();
        });
        window.addEventListener('arenachain-missions-sync', () => {
            refreshSidebarProfile();
        });
    }
    setTimeout(() => refreshSidebarProfile(), 0);
}

module.exports = { initSidebarProfile, refreshSidebarProfile };
