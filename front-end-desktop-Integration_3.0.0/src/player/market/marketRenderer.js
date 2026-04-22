'use strict';

const { requireAuth, getUser } = require('../../../shared/api');
const nftService = require('./nftService');

if (!requireAuth()) {
    console.warn('User not authenticated');
}

const state = {
    tab: 'marketplace',
    marketplaceItems: [],
    myNfts: [],
    history: [],
    loading: true,
    search: '',
    filterRarity: 'ALL',
};

const RARITY_CONFIG = {
    COMMON: { bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', text: 'text-zinc-400', badge: 'bg-zinc-500/20 text-zinc-400', gradient: 'from-zinc-600/20 to-zinc-800/20', icon: 'star' },
    RARE: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400', gradient: 'from-blue-600/20 to-blue-900/20', icon: 'sparkles', glow: 'rarity-glow-RARE' },
    EPIC: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-400', badge: 'bg-violet-500/20 text-violet-400', gradient: 'from-violet-600/20 to-violet-900/20', icon: 'crown', glow: 'rarity-glow-EPIC' },
    LEGENDARY: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-400', gradient: 'from-amber-500/20 to-orange-900/20', icon: 'diamond', glow: 'rarity-glow-LEGENDARY' },
    MYTHIC: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400', gradient: 'from-red-600/20 to-red-900/20', icon: 'sparkles', glow: 'rarity-glow-MYTHIC' },
};

// Expose globally immediately
window.switchTab = function(tabId) {
    state.tab = tabId;
    
    document.querySelectorAll('[id^="tab-"]').forEach(btn => {
        const active = btn.id === `tab-${tabId}`;
        btn.classList.toggle('bg-white/10', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('text-gray-500', !active);
    });

    const grid = document.getElementById('grid-container');
    const creator = document.getElementById('creator-section');
    const hero = document.getElementById('hero-section');
    const history = document.getElementById('history-section');

    if (tabId === 'creator') {
        grid.classList.add('hidden');
        creator.classList.remove('hidden');
        hero.classList.add('hidden');
        history.classList.add('hidden');
    } else {
        grid.classList.remove('hidden');
        creator.classList.add('hidden');
        hero.classList.remove('hidden');
        history.classList.remove('hidden');
        renderGrid();
    }
};

async function loadData() {
    state.loading = true;
    try {
        const [mkt, my, hist] = await Promise.all([
            nftService.getMarketplace().catch(() => []),
            nftService.getMyNfts().catch(() => []),
            nftService.getHistory(10).catch(() => []),
        ]);
        state.marketplaceItems = mkt;
        state.myNfts = my;
        state.history = hist;
        
        const user = getUser();
        if (user) {
            document.getElementById('wallet-address').textContent = user.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : '0x71C...4e21';
            document.getElementById('wallet-balance').textContent = `${(user.balance || 2500).toLocaleString()} AC`;
        }
    } catch (err) {
        console.error('Data load failed:', err);
    } finally {
        state.loading = false;
        renderGrid();
        renderHistory();
    }
}

function renderGrid() {
    const host = document.getElementById('nft-grid');
    const empty = document.getElementById('empty-state');
    if (!host) return;

    const items = state.tab === 'marketplace' ? state.marketplaceItems : state.myNfts;
    const filtered = items.filter(item => {
        if (state.filterRarity !== 'ALL' && item.rarity !== state.filterRarity) return false;
        if (state.search && !item.name.toLowerCase().includes(state.search.toLowerCase())) return false;
        return true;
    });

    host.innerHTML = '';
    if (filtered.length === 0) {
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        filtered.forEach(item => host.appendChild(buildNftCard(item)));
    }
    lucide.createIcons();
}

function buildNftCard(item) {
    const conf = RARITY_CONFIG[item.rarity] || RARITY_CONFIG.COMMON;
    const isMyNft = state.tab === 'my-nfts';
    const card = document.createElement('div');
    card.className = `group relative border rounded-[2rem] overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 ${conf.border} bg-[#111214] ${conf.glow || ''} animate-fade-in`;
    
    card.innerHTML = `
        <div class="relative aspect-square bg-gradient-to-br ${conf.gradient} p-8 flex items-center justify-center cursor-pointer" onclick="window.location.href='./nft_details.html?id=${item._id}'">
            <img src="${item.image}" class="w-full h-full object-contain drop-shadow-2xl group-hover:scale-110 transition-transform duration-500">
            <span class="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest backdrop-blur-md ${conf.badge}">
                <i data-lucide="${conf.icon}" class="w-2.5 h-2.5"></i> ${item.rarity}
            </span>
        </div>
        <div class="p-6 space-y-4">
            <div class="cursor-pointer" onclick="window.location.href='./nft_details.html?id=${item._id}'">
                <h3 class="text-white font-black text-base tracking-tight uppercase">${item.name}</h3>
                <p class="text-gray-500 text-[11px] mt-1 line-clamp-1">${item.description || 'Arena digital collectible'}</p>
            </div>
            <div class="flex items-center justify-between border-t border-white/5 pt-4">
                <div>
                    <p class="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">Value</p>
                    <div class="flex items-center gap-1.5">
                        <i data-lucide="gem" class="w-3.5 h-3.5 text-[#00ff87]"></i>
                        <span class="text-[#00ff87] font-black text-base">${(item.listPrice || item.price).toLocaleString()} AC</span>
                    </div>
                </div>
                ${isMyNft && item.listed ? `<span class="bg-blue-500/10 text-blue-400 text-[8px] font-black px-2.5 py-1 rounded-full uppercase border border-blue-500/20">Listed</span>` : ''}
            </div>
            <button class="action-btn w-full py-3.5 rounded-2xl ${isMyNft ? 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10' : 'bg-[#00ff87]/10 border border-[#00ff87]/20 text-[#00ff87] hover:bg-[#00ff87]/20'} text-[10px] font-black uppercase tracking-[0.2em] transition-all">
                ${isMyNft ? 'Manage Asset' : 'Buy Now'}
            </button>
        </div>
    `;

    card.querySelector('.action-btn').onclick = (e) => {
        e.stopPropagation();
        if (isMyNft) showManageModal(item);
        else showBuyModal(item);
    };

    return card;
}

function renderHistory() {
    const host = document.getElementById('history-list');
    if (!host) return;
    host.innerHTML = '';

    if (state.history.length === 0) {
        host.innerHTML = '<p class="text-gray-600 text-xs italic p-4">No recent activity detected on chain.</p>';
        return;
    }

    state.history.forEach(tx => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-4 p-4 rounded-2xl bg-[#12141c] border border-white/5 hover:border-white/10 transition-all group animate-fade-in';
        div.innerHTML = `
            <div class="w-12 h-12 rounded-xl bg-black/40 border border-white/5 p-2 shrink-0">
                <img src="${tx.nftItemId?.nftId?.imageUrl}" class="w-full h-full object-contain" onerror="this.src='https://api.dicebear.com/7.x/bottts-neutral/svg?seed=tx'">
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <span class="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-white/5 text-gray-400">${tx.type}</span>
                    <span class="text-gray-600 text-[9px]">${new Date(tx.createdAt).toLocaleDateString()}</span>
                </div>
                <p class="text-white text-xs font-bold truncate mt-1">
                    <span class="text-[#00ff87]">@${tx.fromUserId?.username || 'System'}</span>
                    ${tx.type === 'SALE' ? 'sold to' : tx.type === 'LIST' ? 'listed' : 'transferred to'}
                    <span class="text-[#00ff87]">@${tx.toUserId?.username || 'Collector'}</span>
                </p>
            </div>
            <div class="text-right">
                <div class="flex items-center gap-1 justify-end text-[#00ff87]">
                    <i data-lucide="gem" class="w-3 h-3"></i>
                    <span class="font-black text-sm">${tx.price || 0}</span>
                </div>
            </div>
        `;
        host.appendChild(div);
    });
    lucide.createIcons();
}

// Modal functions (Buy/Manage)
function showBuyModal(item) {
    const modal = document.getElementById('modal-root');
    const content = document.getElementById('modal-content');
    modal.classList.remove('hidden');
    content.innerHTML = `
        <div class="p-8 space-y-6">
            <div class="flex items-center justify-between"><h2 class="text-xl font-black uppercase italic tracking-tight">Confirm Purchase</h2><button id="close-modal" class="text-gray-500 hover:text-white"><i data-lucide="x"></i></button></div>
            <div class="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl"><img src="${item.image}" class="w-16 h-16 object-contain bg-black/20 rounded-xl p-2"><div><p class="text-white font-black uppercase">${item.name}</p><p class="text-[9px] font-black text-[#00ff87] uppercase tracking-widest">${item.rarity}</p></div></div>
            <div class="flex items-center justify-between p-5 bg-[#00ff87]/5 border border-[#00ff87]/20 rounded-2xl"><span class="text-gray-400 text-[10px] font-black uppercase">Total Price</span><div class="flex items-center gap-2"><i data-lucide="gem" class="text-[#00ff87]"></i><span class="text-2xl font-black text-[#00ff87]">${(item.listPrice || item.price).toLocaleString()} AC</span></div></div>
            <button id="confirm-buy" class="w-full py-4 rounded-2xl bg-[#00ff87] text-black text-xs font-black uppercase tracking-[0.3em] shadow-lg hover:scale-105 transition-all">Authorize Transaction</button>
        </div>
    `;
    document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
    document.getElementById('confirm-buy').onclick = async () => {
        try { await nftService.buy(item._id); alert('SUCCESS: Asset acquired.'); modal.classList.add('hidden'); loadData(); } catch (err) { alert('FAILED: ' + err.message); }
    };
    lucide.createIcons();
}

function showManageModal(item) {
    const modal = document.getElementById('modal-root');
    const content = document.getElementById('modal-content');
    modal.classList.remove('hidden');
    const isListed = item.listed;
    content.innerHTML = `
        <div class="p-8 space-y-6">
            <div class="flex items-center justify-between"><h2 class="text-xl font-black uppercase italic tracking-tight">Manage Asset</h2><button id="close-modal" class="text-gray-500 hover:text-white"><i data-lucide="x"></i></button></div>
            <div class="p-4 bg-white/5 border border-white/5 rounded-2xl flex justify-between"><span>Status</span><span class="font-black ${isListed ? 'text-blue-400' : 'text-gray-500'} uppercase">${isListed ? 'Listed' : 'Private'}</span></div>
            ${!isListed ? `<input id="list-price" type="number" value="${item.price}" class="w-full bg-[#0d0d0d] border border-white/10 rounded-xl px-4 py-3 text-white">` : ''}
            <button id="action-btn" class="w-full py-4 rounded-2xl ${isListed ? 'bg-red-500' : 'bg-blue-500'} text-white font-black uppercase">${isListed ? 'Unlist' : 'List for Sale'}</button>
        </div>
    `;
    document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
    document.getElementById('action-btn').onclick = async () => {
        try { if (isListed) await nftService.unlist(item._id); else await nftService.list(item._id, Number(document.getElementById('list-price').value)); modal.classList.add('hidden'); loadData(); } catch (err) { alert('Error: ' + err.message); }
    };
    lucide.createIcons();
}

function init() {
    document.getElementById('search-input').oninput = (e) => { state.search = e.target.value; renderGrid(); };
    document.getElementById('filter-rarity').onchange = (e) => { state.filterRarity = e.target.value; renderGrid(); };
    loadData();
    lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', init);
