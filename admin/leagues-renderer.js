const { ipcRenderer } = require('electron');

const API_URL = 'http://localhost:3000';
const leaguesListing = document.getElementById('leaguesListing');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const leagueModal = document.getElementById('leagueModal');
const leagueForm = document.getElementById('leagueForm');
const modalTitle = document.getElementById('modalTitle');

// Initial load
document.addEventListener('DOMContentLoaded', fetchLeagues);

async function fetchLeagues() {
    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    leaguesListing.innerHTML = '';

    try {
        const response = await fetch(`${API_URL}/leagues`);
        const leagues = await response.json();

        loadingState.classList.add('hidden');

        if (!leagues || leagues.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        leaguesListing.innerHTML = leagues.map(league => {
            const isOngoing = league.status === 'ONGOING';
            const isUpcoming = league.status === 'UPCOMING';
            const statusColor = isOngoing ? 'text-green-500' : isUpcoming ? 'text-blue-500' : 'text-gray-500';

            return `
                <div class="league-card relative bg-[#0f0f0f] border border-white/5 rounded-2xl overflow-hidden group transition-all duration-500 hover:border-green-500/50 flex flex-col">
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
                        </div>
                        
                        <div class="grid grid-cols-2 gap-2 mt-auto">
                            <button onclick="editLeague('${league._id}')" class="px-4 py-2 bg-white/5 hover:bg-[#00ff00]/10 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest text-white transition-all">Edit League</button>
                            <button onclick="deleteLeague('${league._id}')" class="px-4 py-2 bg-red-500/5 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest text-red-500 transition-all">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error fetching leagues:', err);
    }
}

function getStatusStyle(status) {
    switch (status) {
        case 'UPCOMING': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
        case 'ONGOING': return 'bg-green-500/10 text-green-400 border border-green-500/20';
        case 'FINISHED': return 'bg-gray-500/10 text-gray-400 border border-gray-500/20';
        default: return 'bg-gray-500/10 text-gray-400';
    }
}

// Modal handling
document.getElementById('addLeagueBtn').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Reset errors
    document.querySelectorAll('[id^="error-"]').forEach(el => {
        el.classList.add('hidden');
        el.textContent = '';
    });
    leagueForm.reset();
    document.getElementById('leagueId').value = '';

    // Set dates
    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');
    startInput.min = today;
    startInput.value = today;
    endInput.min = today;
    endInput.value = nextMonth;

    modalTitle.textContent = 'Create New League';
    leagueModal.classList.remove('hidden');
});

document.getElementById('closeModal').addEventListener('click', () => leagueModal.classList.add('hidden'));
document.getElementById('cancelBtn').addEventListener('click', () => leagueModal.classList.add('hidden'));

leagueForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset errors
    document.querySelectorAll('[id^="error-"]').forEach(el => {
        el.classList.add('hidden');
        el.textContent = '';
    });

    const token = localStorage.getItem('token');
    const leagueId = document.getElementById('leagueId').value;
    const formData = {
        name: document.getElementById('leagueName').value,
        gameId: document.getElementById('gameId').value,
        tier: document.getElementById('leagueTier').value,
        mode: document.getElementById('leagueMode').value,
        regionFilter: document.getElementById('regionFilter').value,
        minElo: parseInt(document.getElementById('minElo').value) || 0,
        maxParticipants: parseInt(document.getElementById('maxParticipants').value) || 2,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
    };

    const method = leagueId ? 'PATCH' : 'POST';
    const url = leagueId ? `${API_URL}/leagues/${leagueId}` : `${API_URL}/leagues`;

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            leagueModal.classList.add('hidden');
            fetchLeagues();
        } else {
            const data = await response.json();

            // Handle NestJS ValidationPipe errors
            if (data.message && Array.isArray(data.message)) {
                data.message.forEach(msg => {
                    // Find the field name in the message (heuristic)
                    const fields = ['name', 'gameId', 'tier', 'mode', 'regionFilter', 'minElo', 'maxParticipants', 'startDate', 'endDate'];
                    const field = fields.find(f => msg.toLowerCase().includes(f.toLowerCase()));
                    if (field) {
                        const errEl = document.getElementById(`error-${field}`);
                        if (errEl) {
                            errEl.textContent = msg;
                            errEl.classList.remove('hidden');
                        }
                    }
                });
            } else if (data.message) {
                alert('Erreur: ' + data.message);
            }
        }
    } catch (err) {
        console.error('Error saving league:', err);
        alert('Une erreur est survenue lors de l\'enregistrement.');
    }
});

window.editLeague = async (id) => {
    // Reset errors
    document.querySelectorAll('[id^="error-"]').forEach(el => {
        el.classList.add('hidden');
        el.textContent = '';
    });
    try {
        const response = await fetch(`${API_URL}/leagues/${id}`);
        const league = await response.json();

        document.getElementById('leagueId').value = league._id;
        document.getElementById('leagueName').value = league.name;
        document.getElementById('gameId').value = league.gameId;
        document.getElementById('leagueTier').value = league.tier;
        document.getElementById('leagueMode').value = league.mode;
        document.getElementById('regionFilter').value = league.regionFilter;
        document.getElementById('minElo').value = league.minElo;
        document.getElementById('maxParticipants').value = league.maxParticipants;

        // Format dates for input[type="date"]
        document.getElementById('startDate').value = new Date(league.startDate).toISOString().split('T')[0];
        document.getElementById('endDate').value = new Date(league.endDate).toISOString().split('T')[0];

        modalTitle.textContent = 'Edit League';
        leagueModal.classList.remove('hidden');
    } catch (err) {
        console.error('Error fetching league details:', err);
    }
};

window.deleteLeague = async (id) => {
    if (!confirm('Are you sure you want to delete this league? This action cannot be undone.')) return;

    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`${API_URL}/leagues/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            fetchLeagues();
        } else {
            alert('Failed to delete league');
        }
    } catch (err) {
        console.error('Error deleting league:', err);
    }
};
