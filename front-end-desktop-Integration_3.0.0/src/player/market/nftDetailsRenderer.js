'use strict';

const api = require('../../../shared/api');
const nftService = require('./nftService');

const state = {
    id: new URLSearchParams(window.location.search).get('id'),
    nft: null,
};

const RARITY_CONFIG = {
    COMMON: { bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', text: 'text-zinc-400', gradient: 'from-zinc-900 to-zinc-800', icon: 'star' },
    RARE: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', gradient: 'from-blue-900 to-blue-800', icon: 'sparkles', glow: 'rarity-glow-RARE' },
    EPIC: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-400', gradient: 'from-violet-900 to-violet-800', icon: 'crown', glow: 'rarity-glow-EPIC' },
    LEGENDARY: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', gradient: 'from-amber-900 to-orange-950', icon: 'diamond', glow: 'rarity-glow-LEGENDARY' },
    MYTHIC: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', gradient: 'from-red-900 to-black', icon: 'sparkles', glow: 'rarity-glow-MYTHIC' },
};

async function init() {
    if (!state.id) return (window.location.href = './market.html');

    try {
        // We might need a getById endpoint, but for now we filter from marketplace or use the service if it had one
        // Let's assume the API supports GET /nft/:id/marketplace-item or similar.
        // If not, we'll fetch my nfts + marketplace and find it.
        const [mkt, my] = await Promise.all([
            nftService.getMarketplace(),
            nftService.getMyNfts()
        ]);
        
        state.nft = [...mkt, ...my].find(n => n._id === state.id);
        if (!state.nft) throw new Error('Asset not found');

        renderDetails();
    } catch (err) {
        console.error('Failed to load NFT details:', err);
        alert('Asset synchronization failed.');
        window.location.href = './market.html';
    }
}

function renderDetails() {
    const n = state.nft;
    const conf = RARITY_CONFIG[n.rarity] || RARITY_CONFIG.COMMON;

    document.getElementById('nft-image').src = n.image;
    document.getElementById('nft-name').textContent = n.name;
    document.getElementById('nft-desc').textContent = n.description || 'This unique digital asset is secured on the Arena Chain blockchain.';
    document.getElementById('nft-price').textContent = `${(n.listPrice || n.price).toLocaleString()} AC`;
    document.getElementById('nft-owner').textContent = `@${typeof n.ownerId === 'object' ? n.ownerId.username : 'System'}`;
    
    const badge = document.getElementById('nft-rarity-badge');
    badge.className = `absolute top-8 left-8 flex items-center gap-2 px-4 py-2 rounded-2xl backdrop-blur-xl border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] ${conf.text} ${conf.bg}`;
    badge.innerHTML = `<i data-lucide="${conf.icon}" class="w-3.5 h-3.5"></i> ${n.rarity}`;

    const preview = document.getElementById('nft-preview-container');
    preview.classList.add(conf.glow || '');
    document.getElementById('rarity-gradient').className = `absolute inset-0 opacity-40 bg-gradient-to-br ${conf.gradient}`;

    // Attributes (Simulated or from metadata if exists)
    const attrs = n.metadata?.attributes || [
        { trait_type: 'Generation', value: 'Gen 1' },
        { trait_type: 'Type', value: 'Avatar' },
        { trait_type: 'Blockchain', value: 'Arena Chain' },
        { trait_type: 'Minted', value: new Date(n.createdAt).toLocaleDateString() },
    ];

    const attrGrid = document.getElementById('attributes-grid');
    attrGrid.innerHTML = attrs.map(a => `
        <div class="bg-white/5 border border-white/5 rounded-2xl p-4 text-center">
            <p class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">${a.trait_type || a.traitType}</p>
            <p class="text-sm font-black text-white uppercase">${a.value}</p>
        </div>
    `).join('');

    // Provenance (Simulated since we don't have a per-NFT history endpoint yet)
    const provList = document.getElementById('provenance-list');
    provList.innerHTML = `
        <div class="flex items-center gap-6 p-6 rounded-3xl bg-[#12141c] border border-white/5">
            <div class="w-12 h-12 rounded-2xl bg-[#00ff87]/10 flex items-center justify-center text-[#00ff87]">
                <i data-lucide="plus"></i>
            </div>
            <div class="flex-1">
                <p class="text-white font-black text-sm uppercase">Asset Minted</p>
                <p class="text-gray-500 text-[10px] uppercase tracking-widest">Genesis Block • ${new Date(n.createdAt).toLocaleString()}</p>
            </div>
            <div class="text-right">
                <p class="text-gray-500 text-[10px] font-bold uppercase">To</p>
                <p class="text-[#00ff87] font-black text-xs">@ArenaDeployer</p>
            </div>
        </div>
    `;

    lucide.createIcons();
}

init();
