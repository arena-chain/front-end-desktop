const { ipcRenderer } = require('electron');

const API_URL = 'http://localhost:3000';
const leaguesListing = document.getElementById('leaguesListing');
const standingsModal = document.getElementById('standingsModal');
const standingsBody = document.getElementById('standingsBody');
const modalLeagueName = document.getElementById('modalLeagueName');

let currentStandings = [];
let allLeagues = [];
let currentContinentFilter = 'GLOBAL';

const CONTINENTS_DATA = {
    GLOBAL: { label: 'GLOBAL' },
    EUROPE: { label: 'EUROPE' },
    AFRICA: { label: 'AFRIQUE' },
    ASIA: { label: 'ASIE' },
    AMERICAS: { label: 'AMÉRIQUES' },
    OCEANIA: { label: 'OCÉANIE' }
};

// Initial load
document.addEventListener('DOMContentLoaded', fetchLeagues);

async function fetchLeagues() {
    try {
        const response = await fetch(`${API_URL}/leagues`);
        allLeagues = await response.json();
        applyFilters();

        // Filter listeners
        document.getElementById('leagueSearch').addEventListener('input', applyFilters);
        document.getElementById('tierFilter').addEventListener('change', applyFilters);
        document.getElementById('statusFilter').addEventListener('change', applyFilters);

    } catch (err) {
        console.error('Error fetching leagues:', err);
    }
}

function applyFilters() {
    const searchQuery = document.getElementById('leagueSearch').value.toLowerCase();
    const tierFilter = document.getElementById('tierFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;

    const filtered = allLeagues.filter(league => {
        const matchesSearch = league.name.toLowerCase().includes(searchQuery);
        const matchesTier = tierFilter === 'all' || league.tier === tierFilter;
        const matchesStatus = statusFilter === 'all' || league.status === statusFilter;
        return matchesSearch && matchesTier && matchesStatus;
    });

    if (filtered.length === 0) {
        leaguesListing.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 gap-6 grayscale opacity-30">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-20 h-20">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <h3 class="text-xl font-black uppercase tracking-tighter">No leagues matching your criteria</h3>
            </div>
        `;
        return;
    }

    leaguesListing.innerHTML = filtered.map(league => createLeagueCard(league)).join('');

    // Add listeners
    document.querySelectorAll('.view-standings').forEach(btn => {
        btn.onclick = (e) => {
            const id = e.target.closest('[data-id]').dataset.id;
            const name = e.target.closest('[data-id]').dataset.name;
            showStandings(id, name);
        };
    });

    document.querySelectorAll('.join-league').forEach(btn => {
        btn.onclick = (e) => {
            const id = e.target.closest('[data-id]').dataset.id;
            joinLeague(id);
        };
    });
}

function createLeagueCard(league) {
    const isOngoing = league.status === 'ONGOING';
    const isUpcoming = league.status === 'UPCOMING';
    const statusColor = isOngoing ? 'text-green-500' : isUpcoming ? 'text-blue-500' : 'text-gray-500';

    return `
        <div class="league-card relative bg-[#0f0f0f] border border-white/5 rounded-2xl overflow-hidden group transition-all duration-500 hover:border-green-500/50 flex flex-col" data-id="${league._id}" data-name="${league.name}">
            <div class="p-6 flex-1">
                <div class="flex items-center justify-between mb-6">
                    <span class="text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 bg-green-500/20 text-green-500 rounded-md border border-green-500/30">${league.tier}</span>
                    <span class="text-[9px] font-black uppercase tracking-[0.2em] ${statusColor}">${league.status}</span>
                </div>
                
                <h3 class="text-2xl font-black uppercase tracking-tighter text-white group-hover:text-green-400 transition-colors mb-6 leading-none">${league.name}</h3>
                
                <div class="flex flex-col gap-4 mb-8">
                    <div class="flex items-center gap-3 text-xs text-gray-500 font-bold tracking-tight">
                        <svg class="w-4 h-4 text-green-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2.25 2.25 0 012.447-2.242 2.25 2.25 0 002.503-2.132V4.553a2.25 2.25 0 00-1.648-2.155A12.015 12.015 0 0012 2a12.015 12.015 0 00-8.945 2.01H3.055z"/></svg>
                        <span class="uppercase">${league.regionFilter}: ${league.regionValue || 'Global'}</span>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-gray-500 font-bold tracking-tight">
                        <svg class="w-4 h-4 text-blue-400/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                        <span class="uppercase">${league.mode}</span>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-gray-500 font-bold tracking-tight">
                        <svg class="w-4 h-4 text-orange-400/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        <span>${new Date(league.startDate).toLocaleDateString()} - ${new Date(league.endDate).toLocaleDateString()}</span>
                    </div>
                    ${league.minElo > 0 ? `
                    <div class="flex items-center gap-3 text-[10px] text-orange-500 font-black tracking-widest uppercase">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2z"/></svg>
                        MIN ELO: ${league.minElo}
                    </div>` : ''}
                </div>
                
                <div class="flex gap-3 mt-auto">
                    <button class="join-league flex-[2] bg-green-500 text-black py-4 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-green-400 transition-all shadow-[0_0_20px_rgba(0,255,0,0.2)] active:scale-95">Register Now</button>
                    <button class="view-standings flex-1 bg-transparent border border-green-500/50 text-green-500 py-4 rounded-xl flex items-center justify-center hover:bg-green-500/10 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function showStandings(leagueId, leagueName) {
    if (modalLeagueName) modalLeagueName.textContent = leagueName;
    const modalHeaderLeagueName = document.getElementById('modalHeaderLeagueName');
    if (modalHeaderLeagueName) modalHeaderLeagueName.textContent = leagueName;
    standingsBody.innerHTML = '<tr><td colspan="4" class="py-20 text-center opacity-30 text-xs uppercase font-black tracking-widest">Loading...</td></tr>';
    standingsModal.classList.remove('hidden');

    currentContinentFilter = 'GLOBAL';
    updateFilterUI();

    try {
        const response = await fetch(`${API_URL}/leagues/${leagueId}/standings`);
        currentStandings = await response.json();
        renderStandings();
    } catch (err) {
        console.error('Error fetching standings:', err);
    }
}



function renderStandings() {
    if (currentStandings.length === 0) {
        standingsBody.innerHTML = '<tr><td colspan="4" class="py-20 text-center opacity-30 text-xs uppercase font-black tracking-widest">Aucun participant trouvé</td></tr>';
        return;
    }

    const filtered = currentStandings.filter(s => {
        const region = (s.playerId || {}).region;
        if (currentContinentFilter === 'GLOBAL') return true;
        return region === currentContinentFilter;
    });

    standingsBody.innerHTML = filtered.map((s, i) => {
        const isTop3 = i < 3;
        const rankClass = isTop3 ? "bg-orange-500 text-black shadow-[0_0_10px_rgba(255,165,0,0.3)]" : "bg-white/10 text-white";
        const avatar = s.playerId?.avatar ? `<img src="${s.playerId.avatar}" class="w-full h-full object-cover">` : `<svg class="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>`;

        return `
            <tr class="group hover:bg-white/[0.02] transition-colors border-b border-white/[0.03]">
                <td class="py-6 pr-4">
                    <span class="text-white font-black text-sm pl-4">${i + 1}</span>
                </td>
                <td class="py-6">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center overflow-hidden ring-1 ring-white/5 bg-surface relative">
                            ${avatar}
                        </div>
                        <span class="text-sm font-bold text-white group-hover:text-green-500 transition-colors">${s.playerId?.nickname || 'Player'}</span>
                    </div>
                </td>
                <td class="py-6 text-center">
                    <div class="inline-flex items-center gap-2 bg-[#121212] border border-white/10 pl-1 pr-3 py-1 rounded-full ring-1 ring-white/5">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${rankClass}">#${i + 1}</div>
                        <div class="w-4 h-4 bg-orange-500/20 rounded-full flex items-center justify-center">
                            <div class="w-1.5 h-1.5 bg-orange-500 rounded-full"></div>
                        </div>
                    </div>
                </td>
                <td class="py-6 text-right">
                    <span class="text-lg font-black text-white tracking-tighter">${s.rankPoints}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// Event Listeners for Continents
document.querySelectorAll('.continent-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const continent = e.target.closest('.continent-btn').dataset.continent;
        currentContinentFilter = continent;
        updateFilterUI();
        renderStandings();
    });
});

function updateFilterUI() {
    // Update Continent Buttons
    document.querySelectorAll('.continent-btn').forEach(btn => {
        const continent = btn.dataset.continent;
        if (continent === currentContinentFilter) {
            btn.className = "continent-btn active bg-primary text-black border border-primary px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all";
        } else {
            btn.className = "continent-btn bg-[#1a1a1a] border border-white/10 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-white cursor-pointer transition-all";
        }
    });


}



async function joinLeague(leagueId) {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    if (!token) {
        alert('Please login first');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/leagues/${leagueId}/register`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (response.ok) {
            alert('Congratulations! You are now registered for this official league.');
            fetchLeagues();
        } else {
            alert('Registration Failed: ' + data.message);
        }
    } catch (err) {
        console.error('Error registering:', err);
        alert('An error occurred during registration.');
    }
}

// Modal closing
document.getElementById('closeModal').addEventListener('click', () => {
    standingsModal.classList.add('hidden');
});

// Sidebar links
document.getElementById('dashboardLink').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('login-success', { role: 'player' });
});

document.getElementById('profileLink').addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('navigate-to', 'player-profile');
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    ipcRenderer.send('navigate-to', 'login');
});

document.getElementById('homeBtn').addEventListener('click', () => {
    ipcRenderer.send('login-success', { role: 'player' });
});
