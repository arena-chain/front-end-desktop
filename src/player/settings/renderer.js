const path = require('path');
const { pathToFileURL } = require('url');
const { requireAuth, getUser, updateProfile } = require(path.join(__dirname, '..', '..', '..', 'shared', 'api'));

if (!requireAuth()) throw new Error('Not authenticated');

const DICEBEAR_STYLES = ['avataaars', 'bottts', 'pixel-art', 'lorelei', 'adventurer'];

function generateRandomDicebearAvatarUrl() {
    const style = DICEBEAR_STYLES[Math.floor(Math.random() * DICEBEAR_STYLES.length)];
    const seed = String(Math.floor(Math.random() * 100000));
    return `https://api.dicebear.com/7.x/${style}/png?seed=${seed}`;
}

function fallbackAvatarUrl(nickname) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nickname || 'U')}&background=00ff87&color=0a0b0f&bold=true&size=128`;
}

let draftNickname = '';
let draftAvatar = '';

function readUser() {
    return getUser() || {};
}

function syncFormFromUser() {
    const u = readUser();
    draftNickname = (u.nickname && String(u.nickname).trim()) || 'Player';
    draftAvatar = (u.avatar && String(u.avatar).trim()) || '';
    const nickEl = document.getElementById('input-nickname');
    const imgEl = document.getElementById('settings-avatar-preview');
    if (nickEl) nickEl.value = draftNickname;
    if (imgEl) {
        imgEl.src = draftAvatar || fallbackAvatarUrl(draftNickname);
    }
}

function setStatus(msg, isError) {
    const el = document.getElementById('profile-save-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = `text-sm font-semibold min-h-[1.25rem] ${isError ? 'text-[#ff4654]' : 'text-[#00ff87]'}`;
}

function wireProfileLink() {
    const u = readUser();
    const id = u.id != null ? u.id : u._id;
    const a = document.getElementById('link-public-profile');
    if (a && id) {
        const profilePath = path.join(__dirname, '..', 'profile', 'profile.html');
        a.href = `${pathToFileURL(profilePath).href}?userId=${encodeURIComponent(String(id))}`;
    }
}

document.getElementById('btn-shuffle-avatar')?.addEventListener('click', () => {
    draftAvatar = generateRandomDicebearAvatarUrl();
    const img = document.getElementById('settings-avatar-preview');
    if (img) img.src = draftAvatar;
    setStatus('New avatar — click Save profile to sync.', false);
});

document.getElementById('btn-reset-profile')?.addEventListener('click', () => {
    syncFormFromUser();
    setStatus('', false);
});

document.getElementById('input-nickname')?.addEventListener('input', (e) => {
    draftNickname = e.target.value;
});

document.getElementById('btn-save-profile')?.addEventListener('click', async () => {
    const nick = (document.getElementById('input-nickname')?.value || '').trim();
    if (!nick) {
        setStatus('Display name is required.', true);
        return;
    }
    const btn = document.getElementById('btn-save-profile');
    if (btn) btn.disabled = true;
    setStatus('Saving…', false);
    try {
        const patch = { nickname: nick };
        if (draftAvatar && String(draftAvatar).trim()) patch.avatar = draftAvatar.trim();
        await updateProfile(patch);
        syncFormFromUser();
        try {
            window.dispatchEvent(new CustomEvent('arenachain-sidebar-profile-sync'));
        } catch (_) {
            /* ignore */
        }
        setStatus('Profile saved. Sidebar and friends lists will pick this up on refresh.', false);
    } catch (err) {
        setStatus(err.message || 'Save failed', true);
    } finally {
        if (btn) btn.disabled = false;
    }
});

syncFormFromUser();
wireProfileLink();
