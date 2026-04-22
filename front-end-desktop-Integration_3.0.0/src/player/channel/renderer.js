const { ipcRenderer } = require('electron');
const { requireAuth, getUser } = require('../../../shared/api');
const { getMyChannel, createChannel, updateChannel, buildChannelPayload } = require('../../../shared/creator');

if (!requireAuth()) {
    throw new Error('Not authenticated');
}

const STORAGE_KEY = 'arena_channel_draft';
const user = getUser();

const CATEGORIES = ['Valorant', 'League of Legends', 'Fortnite', 'Call of Duty', 'Minecraft', 'Just Chatting', 'Dota 2', 'Counter-Strike 2'];
const TAGS = ['Ranked', 'Coaching', 'Live', 'Competitive', 'Solo', 'Duo', 'Walkthrough', 'Tutorial'];
const AVATARS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aria',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Musa',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Koa',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo'
];
const DEFAULT_CHAINS = [
    { name: 'Ethereum Mainnet', status: 'connected' },
    { name: 'Arena Chain L2', status: 'connected' },
    { name: 'Polygon PoS', status: 'idle' },
    { name: 'Base Network', status: 'idle' }
];
const CHAINS_KEY = 'arena_active_chains';

function loadChains() {
    try {
        const raw = localStorage.getItem(CHAINS_KEY);
        const custom = raw ? JSON.parse(raw) : [];
        // Merge: custom channel chains first, then defaults (avoiding duplicates)
        const defaultNames = DEFAULT_CHAINS.map(c => c.name);
        const customOnly = custom.filter(c => !defaultNames.includes(c.name));
        return [...customOnly, ...DEFAULT_CHAINS];
    } catch {
        return [...DEFAULT_CHAINS];
    }
}

function saveChains(chains) {
    // Only persist the non-default chains (custom channel entries)
    const defaultNames = DEFAULT_CHAINS.map(c => c.name);
    const custom = chains.filter(c => !defaultNames.includes(c.name));
    localStorage.setItem(CHAINS_KEY, JSON.stringify(custom));
}

function addChannelToChains(channelName, avatarUrl, channelId) {
    if (!channelName) return;
    const current = loadChains();
    const exists = current.find(c => c.name === channelName);
    if (exists) {
        exists.status = 'connected';
        if (avatarUrl) exists.avatarUrl = avatarUrl;
        if (channelId) exists.channelId = channelId;
    } else {
        current.unshift({ name: channelName, status: 'connected', avatarUrl: avatarUrl || null, channelId: channelId || null });
    }
    saveChains(current);
    renderChains(current);
}

function navigateToStudio() {
    try {
        ipcRenderer.send('navigate-to', 'stream-studio');
    } catch { }

    setTimeout(() => {
        window.location.href = '../stream/stream_studio.html';
    }, 80);
}

const elements = {
    form: document.getElementById('channel-form'),
    nickname: document.getElementById('channel-owner'),
    channelName: document.getElementById('channel-name'),
    slug: document.getElementById('channel-slug'),
    title: document.getElementById('stream-title'),
    schedule: document.getElementById('stream-schedule'),
    description: document.getElementById('channel-description'),
    previewName: document.getElementById('preview-channel-name'),
    previewSlug: document.getElementById('preview-channel-slug'),
    previewTitle: document.getElementById('preview-stream-title'),
    previewCategory: document.getElementById('preview-category'),
    previewTags: document.getElementById('preview-tags'),
    streamKey: document.getElementById('stream-key'),
    copyKey: document.getElementById('copy-stream-key'),
    openStudio: document.getElementById('open-studio'),
    saveStatus: document.getElementById('save-status'),
    categoryContainer: document.getElementById('category-checkboxes'),
    tagsContainer: document.getElementById('tags-checkboxes'),
    avatarContainer: document.getElementById('avatar-grid'),
    chainsContainer: document.getElementById('chains-list'),
};

const defaultDraft = {
    channelName: user?.nickname ? `${user.nickname} Live` : 'Arena Creator Hub',
    slug: user?.nickname ? user.nickname.toLowerCase().replace(/\s+/g, '-') : 'arena-creator',
    category: 'Valorant',
    tags: 'Ranked, Live',
    title: 'Road to top rank with the Arena desktop app',
    schedule: '',
    description: 'High-energy ranked sessions, VOD reviews, and community customs.',
    avatar: AVATARS[0]
};

function loadDraft() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? { ...defaultDraft, ...JSON.parse(raw) } : defaultDraft;
    } catch {
        return defaultDraft;
    }
}

function saveDraft(draft) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    elements.saveStatus.textContent = `Saved locally at ${new Date().toLocaleTimeString()}`;
}

async function syncChannel(draft) {
    try {
        const existing = await getMyChannel();
        const payload = buildChannelPayload(draft);
        const channel = existing
            ? await updateChannel(existing._id, payload)
            : await createChannel(payload);
        localStorage.setItem('arena_channel_record', JSON.stringify(channel));
        elements.saveStatus.textContent = `Channel synced at ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        elements.saveStatus.textContent = error.message || 'Channel sync failed';
    }
}

function generateStreamKey(slug) {
    const normalized = (slug || 'arena').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    return `ac_live_${normalized}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSelectedCheckboxes(containerId) {
    const container = document.getElementById(containerId);
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value)
        .join(', ');
}

function getDraftFromForm() {
    const selectedAvatar = document.querySelector('.avatar-option.selected')?.dataset.url || AVATARS[0];
    return {
        channelName: elements.channelName.value.trim(),
        slug: elements.slug.value.trim(),
        category: getSelectedCheckboxes('category-checkboxes'),
        tags: getSelectedCheckboxes('tags-checkboxes'),
        title: elements.title.value.trim(),
        schedule: elements.schedule.value,
        description: elements.description.value.trim(),
        streamKey: elements.streamKey.value.trim(),
        avatar: selectedAvatar
    };
}

function renderPreview(draft) {
    elements.previewName.textContent = draft.channelName || 'Unnamed Channel';
    elements.previewSlug.textContent = `arena.gg/${draft.slug || 'channel'}`;
    elements.previewTitle.textContent = draft.title || 'No stream title yet';
    elements.previewCategory.textContent = draft.category || 'General';
    elements.previewTags.textContent = draft.tags || 'No tags';

    // Update preview image if possible (using avatar as a placeholder for now since we don't have a banner upload yet)
    const previewImg = document.querySelector('img[alt="Channel preview"]');
    if (previewImg && draft.avatar) {
        // Maybe we don't want to replace the banner with the avatar, but we could add the avatar to the preview
    }
}

function initCheckboxes() {
    elements.categoryContainer.innerHTML = CATEGORIES.map(cat => `
        <label class="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 cursor-pointer transition-all">
            <input type="checkbox" value="${cat}" class="w-4 h-4 rounded border-gray-600 text-[#00ff87] focus:ring-[#00ff87] focus:ring-offset-0 bg-transparent">
            <span class="text-xs font-semibold text-gray-300">${cat}</span>
        </label>
    `).join('');

    elements.tagsContainer.innerHTML = TAGS.map(tag => `
        <label class="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 cursor-pointer transition-all">
            <input type="checkbox" value="${tag}" class="w-4 h-4 rounded border-gray-600 text-[#00ff87] focus:ring-[#00ff87] focus:ring-offset-0 bg-transparent">
            <span class="text-xs font-semibold text-gray-300">${tag}</span>
        </label>
    `).join('');

    // Pre-select values if needed (done in hydrateForm)
}

function initAvatars() {
    elements.avatarContainer.innerHTML = AVATARS.map(url => `
        <div class="avatar-option group relative cursor-pointer" data-url="${url}">
            <div class="aspect-square rounded-2xl overflow-hidden border-2 border-transparent group-hover:border-white/20 transition-all">
                <img src="${url}" class="w-full h-full object-cover" />
            </div>
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-[.selected]:opacity-100 transition-opacity">
                <div class="bg-[#00ff87] rounded-full p-1 shadow-lg">
                    <svg class="w-4 h-4 text-[#0a0b0f]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                </div>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.avatar-option').forEach(o => {
                o.classList.remove('selected');
                o.querySelector('div').style.borderColor = 'transparent';
            });
            opt.classList.add('selected');
            opt.querySelector('div').style.borderColor = '#00ff87';
            renderPreview(getDraftFromForm());
        });
    });
}

function renderChains(chains) {
    const container = elements.chainsContainer;
    if (!container) return;

    // Update count badge
    const countEl = document.getElementById('chains-count');
    if (countEl) countEl.textContent = `${chains.length} chain${chains.length !== 1 ? 's' : ''}`;

    // Default chain icons (SVG placeholder)
    const defaultIcons = {
        'Ethereum Mainnet': 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=025',
        'Arena Chain L2': 'https://api.dicebear.com/7.x/identicon/svg?seed=ArenaChain',
        'Polygon PoS': 'https://cryptologos.cc/logos/polygon-matic-logo.svg?v=025',
        'Base Network': 'https://api.dicebear.com/7.x/identicon/svg?seed=BaseNetwork',
    };

    container.innerHTML = chains.map(chain => {
        const isConnected = chain.status === 'connected';
        const avatarSrc = chain.avatarUrl || defaultIcons[chain.name] || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(chain.name)}`;
        const statusColor = isConnected ? '#00ff87' : '#6b7280';
        const statusLabel = isConnected ? 'CONNECTED' : 'IDLE';
        const cardClass = isConnected ? 'chain-card connected' : 'chain-card';

        // Build onclick: for custom channels → stream_dashboard search, for defaults → no-op or blockchain explorer
        let onclick = '';
        if (chain.channelId) {
            onclick = `onclick="window.location.href='../stream/stream.html?channelId=${chain.channelId}'"`;
        } else if (!defaultIcons[chain.name]) {
            // Custom channel without saved channelId → search by name
            onclick = `onclick="window.location.href='../stream/stream_dashboard.html?category=${encodeURIComponent(chain.name)}'"`;
        }

        return `
        <div class="${cardClass}" ${onclick} title="View ${chain.name}">
            <div class="relative">
                <img src="${avatarSrc}" class="chain-avatar"
                    onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(chain.name)}'" />
                <span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#0a0b0f]"
                    style="background:${statusColor}"></span>
            </div>
            <div style="width:100%">
                <p class="text-xs font-bold text-white truncate">${chain.name}</p>
                <p class="text-[10px] font-black uppercase tracking-wider mt-1"
                    style="color:${statusColor}">${statusLabel}</p>
            </div>
            ${onclick ? `<span class="text-[9px] font-black uppercase tracking-widest text-gray-600 hover:text-[#00ff87] transition-colors">View →</span>` : ''}
        </div>`;
    }).join('');
}

function initChains() {
    renderChains(loadChains());
}

function hydrateForm(draft) {
    elements.nickname.textContent = user?.nickname || 'Creator';
    elements.channelName.value = draft.channelName || '';
    elements.slug.value = draft.slug || '';
    elements.title.value = draft.title || '';
    elements.schedule.value = draft.schedule || '';
    elements.description.value = draft.description || '';
    elements.streamKey.value = draft.streamKey || generateStreamKey(draft.slug);

    // Set checkboxes
    const catValues = (draft.category || '').split(', ').filter(Boolean);
    elements.categoryContainer.querySelectorAll('input').forEach(cb => {
        cb.checked = catValues.includes(cb.value);
    });

    const tagValues = (draft.tags || '').split(', ').filter(Boolean);
    elements.tagsContainer.querySelectorAll('input').forEach(cb => {
        cb.checked = tagValues.includes(cb.value);
    });

    // Set avatar
    const avatarOpt = document.querySelector(`.avatar-option[data-url="${draft.avatar}"]`);
    if (avatarOpt) {
        avatarOpt.classList.add('selected');
        avatarOpt.querySelector('div').style.borderColor = '#00ff87';
    }

    renderPreview({ ...draft, streamKey: elements.streamKey.value });
}

function autoSlugify() {
    const value = elements.channelName.value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

    if (value) {
        elements.slug.value = value;
        elements.streamKey.value = generateStreamKey(value);
    }
}

// Initialization
initCheckboxes();
initAvatars();
initChains();

const initialDraft = loadDraft();
hydrateForm(initialDraft);

// Event Listeners
elements.channelName.addEventListener('input', () => {
    autoSlugify();
    renderPreview(getDraftFromForm());
});

['channel-slug', 'stream-title', 'stream-schedule', 'channel-description'].forEach((id) => {
    const field = document.getElementById(id);
    if (field) {
        field.addEventListener('input', () => {
            renderPreview(getDraftFromForm());
        });
    }
});

// Checkbox change listeners
[elements.categoryContainer, elements.tagsContainer].forEach(container => {
    container.addEventListener('change', () => {
        renderPreview(getDraftFromForm());
    });
});

elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = getDraftFromForm();
    saveDraft(draft);
    void syncChannel(draft);
    // Add channel name to Active Chains on every Save Draft
    if (draft.channelName) {
        // Try to get channelId from the stored channel record
        let channelId = null;
        try {
            const rec = JSON.parse(localStorage.getItem('arena_channel_record') || '{}');
            if (rec.name === draft.channelName) channelId = rec._id || rec.id || null;
        } catch { }
        addChannelToChains(draft.channelName, draft.avatar || null, channelId);
    }
});

elements.copyKey.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(elements.streamKey.value);
        elements.saveStatus.textContent = 'Stream key copied to clipboard.';
    } catch {
        elements.saveStatus.textContent = 'Copy failed. You can still copy it manually.';
    }
});

elements.openStudio.addEventListener('click', () => {
    const draft = getDraftFromForm();
    saveDraft(draft);
    void syncChannel(draft);
    localStorage.setItem('arena_stream_session', JSON.stringify({
        title: draft.title,
        category: draft.category,
        tags: draft.tags,
        channelName: draft.channelName,
        schedule: draft.schedule, // Added schedule
        startedAt: Date.now(),
    }));
    navigateToStudio();
});

