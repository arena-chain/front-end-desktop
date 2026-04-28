const { ipcRenderer } = require('electron');

const result = JSON.parse(localStorage.getItem('last_training_result'));

if (result) {
    document.getElementById('final-score').textContent = result.score.toLocaleString();
    document.getElementById('stat-accuracy').textContent = `${Math.floor(result.accuracy)}%`;
    document.getElementById('stat-combo').textContent = result.maxCombo;
    document.getElementById('stat-hits').textContent = result.hits;
    document.getElementById('stat-streak').textContent = result.maxCombo;
    
    // Precision breakdown
    document.getElementById('stat-perfect').textContent = result.perfectHits || 0;
    document.getElementById('stat-good').textContent = result.goodHits || 0;
    document.getElementById('stat-bad').textContent = result.badHits || 0;

    // Grade Calculation
    const { grade, label } = calculateGrade(result.accuracy, result.score, result.difficulty);
    document.getElementById('grade').textContent = grade;
    document.getElementById('grade-label').textContent = label;

    // Performance Feedback
    displayFeedback(result);
}

function displayFeedback(result) {
    const feedback = generateFeedback(result);
    const container = document.getElementById('feedback-container');
    
    container.innerHTML = feedback.map((msg, index) => {
        const highlighted = highlightKeywords(msg);
        return `
            <div class="glass-panel bg-white/[0.03] border-white/5 p-4 rounded-2xl pop-in" style="animation-delay: ${index * 150}ms">
                <div class="flex items-start gap-3">
                    <span class="mt-0.5 text-[#22d3ee]">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                    </span>
                    <p class="text-xs leading-relaxed text-gray-300 font-medium">${highlighted}</p>
                </div>
            </div>
        `;
    }).join('');
}

function highlightKeywords(text) {
    const keywords = {
        'accuracy': 'text-[#00ff87] font-black',
        'precision': 'text-[#00ff87] font-black',
        'speed': 'text-[#22d3ee] font-black',
        'reactions': 'text-[#22d3ee] font-black',
        'combo': 'text-white font-black',
        'consistency': 'text-white font-black',
        'misses': 'text-red-400 font-black'
    };

    let highlighted = text;
    Object.entries(keywords).forEach(([word, classes]) => {
        const regex = new RegExp(`(${word})`, 'gi');
        highlighted = highlighted.replace(regex, `<span class="${classes}">$1</span>`);
    });
    return highlighted;
}

function generateFeedback(res) {
    const messages = [];

    // 1. Accuracy Feedback
    if (res.accuracy < 70) messages.push("Your accuracy is low — focus on precision over speed.");
    else if (res.accuracy >= 90) messages.push("Excellent accuracy — very precise shooting.");
    else messages.push("Decent accuracy, but there’s room for improvement.");

    // 2. Reaction Time Feedback
    if (res.avgResponseTime > 500) messages.push("Your reaction time is slow — try reflex training.");
    else if (res.avgResponseTime < 300) messages.push("Lightning-fast reactions — great job.");
    else messages.push("Good reaction speed, keep pushing it further.");

    // 3. Combo Feedback
    if (res.maxCombo < 10) messages.push("You struggle to maintain combos — focus on consistency.");
    else if (res.maxCombo >= 30) messages.push("Excellent combo mastery — very consistent.");
    else messages.push("Good combo control, but you can push higher.");

    // 4. Misses Feedback (Threshold: > 30% of total shots)
    const missRate = res.totalShots > 0 ? (res.misses / res.totalShots) * 100 : 0;
    if (missRate > 30) {
        messages.unshift("Too many misses — slow down and aim carefully.");
    }

    // 5. Balanced Feedback (Overrides/Additions)
    if (res.accuracy >= 85 && res.avgResponseTime < 350) {
        messages.unshift("Great balance between speed and precision.");
    } else if (res.avgResponseTime < 350 && res.accuracy < 75) {
        messages.unshift("You're fast but inaccurate — control your shots.");
    } else if (res.accuracy >= 90 && res.avgResponseTime > 450) {
        messages.unshift("You're precise but slow — try to increase speed.");
    }

    // Prioritize and return top 3
    return messages.slice(0, 3);
}

function calculateGrade(accuracy, score, difficulty) {
    // Base thresholds adjusted for difficulty
    let thresholds = { S: 90, A: 75, B: 60, C: 45 };
    if (difficulty === 'HARD') thresholds = { S: 85, A: 70, B: 55, C: 40 };
    if (difficulty === 'EASY') thresholds = { S: 95, A: 85, B: 75, C: 65 };

    if (accuracy >= thresholds.S) return { grade: 'S', label: 'EXTERMINATOR' };
    if (accuracy >= thresholds.A) return { grade: 'A', label: 'SHARPSHOOTER' };
    if (accuracy >= thresholds.B) return { grade: 'B', label: 'RANGER' };
    if (accuracy >= thresholds.C) return { grade: 'C', label: 'TRAINEE' };
    return { grade: 'D', label: 'RECRUIT' };
}

document.getElementById('retry-btn').addEventListener('click', () => {
    ipcRenderer.send('navigate-to', 'training-game');
});

document.getElementById('dashboard-btn').addEventListener('click', () => {
    ipcRenderer.send('navigate-to', 'training-dashboard');
});
