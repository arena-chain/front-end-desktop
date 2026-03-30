const { ipcRenderer } = require('electron');

const result = JSON.parse(localStorage.getItem('last_training_result'));

if (result) {
    document.getElementById('final-score').textContent = result.score.toLocaleString();
    document.getElementById('stat-accuracy').textContent = `${Math.floor(result.accuracy)}%`;
    document.getElementById('stat-combo').textContent = result.maxCombo;
    document.getElementById('stat-hits').textContent = result.hits;
    document.getElementById('stat-streak').textContent = result.maxCombo; // Best streak is max combo

    // Grade Calculation
    const { grade, label } = calculateGrade(result.accuracy, result.score, result.difficulty);
    document.getElementById('grade').textContent = grade;
    document.getElementById('grade-label').textContent = label;
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
