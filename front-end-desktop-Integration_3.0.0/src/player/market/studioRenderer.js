'use strict';

const nftService = require('./nftService');

const state = {
    gender: 'MALE',
    view: 'front',
    layers: {
        base: null,
        outfit: null,
        hair: null
    },
    stats: {
        power: 84,
        agility: 76,
        focus: 88
    },
    name: '',
    saving: false
};

const RARITY_LEVELS = [
    { min: 90, label: 'MYTHIC', color: 'text-red-400', border: 'border-red-500/20', bg: 'bg-red-500/10' },
    { min: 80, label: 'LEGENDARY', color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/10' },
    { min: 68, label: 'EPIC', color: 'text-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-500/10' },
    { min: 56, label: 'RARE', color: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/10' },
    { min: 0, label: 'COMMON', color: 'text-zinc-400', border: 'border-zinc-500/20', bg: 'bg-zinc-500/10' }
];

function updateStat(stat, val) {
    state.stats[stat] = Number(val);
    document.getElementById(`val-${stat}`).textContent = val;
    calculateRarity();
}

function calculateRarity() {
    const score = Math.round((state.stats.power + state.stats.agility + state.stats.focus) / 3);
    const rarity = RARITY_LEVELS.find(r => score >= r.min);
    
    const badge = document.getElementById('rarity-badge');
    badge.className = `${rarity.bg} ${rarity.border} ${rarity.color} px-6 py-3 rounded-2xl flex items-center gap-3 backdrop-blur-xl`;
    badge.querySelector('span').textContent = `${rarity.label} ASSET (${score})`;
}

function previewLayer(key, input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        state.layers[key] = file;
        const img = document.getElementById(`preview-${key}`);
        img.src = e.target.result;
        img.classList.remove('opacity-0');
        img.classList.add('opacity-100');
        
        document.getElementById(`check-${key}`).classList.remove('hidden');
        document.getElementById('canvas-empty').classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

function clearLayer(key) {
    state.layers[key] = null;
    const img = document.getElementById(`preview-${key}`);
    img.src = '';
    img.classList.add('opacity-0');
    img.classList.remove('opacity-100');
    
    document.getElementById(`check-${key}`).classList.add('hidden');
    document.getElementById(`input-${key}`).value = '';
    
    // Show empty state if all layers cleared
    if (!Object.values(state.layers).some(l => l !== null)) {
        document.getElementById('canvas-empty').classList.remove('hidden');
    }
}

async function saveDraft() {
    if (state.saving) return;
    
    const nameInput = document.getElementById('nft-name-input');
    const finalName = nameInput.value.trim() || 'New Avatar';
    
    const score = Math.round((state.stats.power + state.stats.agility + state.stats.focus) / 3);
    const rarity = RARITY_LEVELS.find(r => score >= r.min).label;

    try {
        state.saving = true;
        document.getElementById('mint-btn').textContent = 'Processing...';
        document.getElementById('mint-btn').classList.add('opacity-50');

        // Note: Real NFT creation uses FormData
        const formData = new FormData();
        formData.append('name', finalName);
        formData.append('category', 'AVATAR'); // Mandatory field for backend
        formData.append('rarity', rarity);
        formData.append('description', `${state.gender} avatar created in Arena Studio.`);
        formData.append('isEquippable', 'true');
        formData.append('isTradeable', 'true');
        
        // Pick the first available layer file as the main image
        const primaryFile = state.layers.base || state.layers.outfit || state.layers.hair;
        if (primaryFile) {
            formData.append('file', primaryFile);
        } else {
            // If no file uploaded, backend might reject. Let's alert.
            throw new Error('Please upload at least a Base Model before deploying.');
        }

        await nftService.createDraft(formData);

        alert('SUCCESS: Your NFT draft has been deployed to the verification node.');
        window.location.href = './market.html';
    } catch (err) {
        console.error('Submission failed:', err);
        alert('DEPLOYMENT FAILED: ' + err.message);
    } finally {
        state.saving = false;
        document.getElementById('mint-btn').textContent = 'Deploy Draft';
        document.getElementById('mint-btn').classList.remove('opacity-50');
    }
}

function init() {
    // Event Listeners
    document.getElementById('gender-male').onclick = () => setGender('MALE');
    document.getElementById('gender-female').onclick = () => setGender('FEMALE');
    document.getElementById('mint-btn').onclick = saveDraft;

    window.updateStat = updateStat;
    window.previewLayer = previewLayer;
    window.clearLayer = clearLayer;

    calculateRarity();
    lucide.createIcons();
}

function setGender(g) {
    state.gender = g;
    document.querySelectorAll('.gender-btn').forEach(btn => {
        const active = btn.id === `gender-${g.toLowerCase()}`;
        btn.className = `gender-btn h-11 rounded-xl text-[10px] font-black uppercase transition-all ${
            active ? 'bg-[#00ff87] text-black' : 'bg-white/5 border border-white/10 text-white'
        }`;
    });
}

document.addEventListener('DOMContentLoaded', init);
