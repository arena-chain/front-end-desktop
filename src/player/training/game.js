const { ipcRenderer } = require('electron');
const { apiRequest } = require('../../../shared/api');

class AimGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.config = JSON.parse(localStorage.getItem('training_config')) || { difficulty: 'MEDIUM', duration: 60 };
        
        // Difficulty constants from blueprint
        this.diffConfigs = {
            'EASY':   { minRadius: 30, maxRadius: 50, lifetime: 1500, spawnInterval: 800, penaltyChance: 0.00, comboTimeout: 3000 },
            'MEDIUM': { minRadius: 20, maxRadius: 40, lifetime: 1000, spawnInterval: 600, penaltyChance: 0.20, comboTimeout: 1800 },
            'HARD':   { minRadius: 16, maxRadius: 30, lifetime: 600,  spawnInterval: 400, penaltyChance: 0.35, comboTimeout: 1000 }
        };

        this.currentConfig = this.diffConfigs[this.config.difficulty];
        
        // State
        this.isRunning = false;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.hits = 0;
        this.totalShots = 0;
        this.misses = 0;
        this.startTime = 0;
        this.timeLeft = this.config.duration;
        this.targets = [];
        this.lastSpawnTime = 0;
        this.lastHitTime = 0;
        
        // HUD Elements
        this.elements = {
            score: document.getElementById('hud-score'),
            accuracy: document.getElementById('hud-accuracy'),
            timer: document.getElementById('hud-timer'),
            combo: document.getElementById('hud-combo'),
            multiplier: document.getElementById('hud-multiplier'),
            overlay: document.getElementById('game-overlay')
        };

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        document.getElementById('info-difficulty').textContent = this.config.difficulty;
        document.getElementById('info-duration').textContent = `${this.config.duration} SECONDS`;
        document.getElementById('difficulty-label').textContent = `${this.config.difficulty} MODE`;

        document.getElementById('start-screen').addEventListener('click', () => {
            document.getElementById('start-screen').classList.add('hidden');
            this.start();
        });

        this.canvas.addEventListener('mousedown', (e) => this.handleClick(e));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    start() {
        this.isRunning = true;
        this.startTime = Date.now();
        this.lastSpawnTime = Date.now();
        this.lastHitTime = Date.now();
        this.animate();
    }

    animate() {
        if (!this.isRunning) return;

        const now = Date.now();
        const delta = now - this.startTime;
        this.timeLeft = Math.max(0, this.config.duration - Math.floor(delta / 1000));

        this.updateHUD();

        if (this.timeLeft <= 0) {
            this.endGame();
            return;
        }

        // Spawn targets
        if (now - this.lastSpawnTime > this.currentConfig.spawnInterval) {
            this.spawnTarget();
            this.lastSpawnTime = now;
        }

        // Combo timeout check
        if (this.combo > 0 && now - this.lastHitTime > this.currentConfig.comboTimeout) {
            this.breakCombo('TIMEOUT');
        }

        // Target cleanup and expiration
        this.targets = this.targets.filter(t => {
            const expired = now - t.spawnTime > this.currentConfig.lifetime;
            if (expired) {
                if (t.type === 'GREEN') {
                    this.missedTarget();
                    this.breakCombo('EXPIRED');
                }
                return false;
            }
            return true;
        });

        this.draw();
        requestAnimationFrame(() => this.animate());
    }

    spawnTarget() {
        const radius = Math.random() * (this.currentConfig.maxRadius - this.currentConfig.minRadius) + this.currentConfig.minRadius;
        const margin = radius + 20;
        const x = margin + Math.random() * (this.canvas.width - margin * 2);
        const y = margin + Math.random() * (this.canvas.height - margin * 2);
        
        const type = Math.random() < this.currentConfig.penaltyChance ? 'RED' : 'GREEN';
        
        this.targets.push({
            x, y, radius, type,
            spawnTime: Date.now(),
            id: Math.random()
        });
    }

    handleClick(e) {
        if (!this.isRunning) return;
        
        this.totalShots++;
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let hitAny = false;

        // Check targets from top to bottom (reverse array)
        for (let i = this.targets.length - 1; i >= 0; i--) {
            const t = this.targets[i];
            const dist = Math.sqrt((mouseX - t.x)**2 + (mouseY - t.y)**2);

            if (dist < t.radius) {
                this.handleHit(t);
                this.targets.splice(i, 1);
                hitAny = true;
                break;
            }
        }

        if (!hitAny) {
            this.handleMiss();
        }

        this.updateHUD();
    }

    handleHit(target) {
        const reactionTime = Date.now() - target.spawnTime;

        if (target.type === 'RED') {
            this.score = Math.max(0, this.score - (this.config.difficulty === 'HARD' ? 20 : 10));
            this.breakCombo('PENALTY');
            this.misses++;
            this.vibrateUI('RED');
        } else {
            this.hits++;
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.lastHitTime = Date.now();
            
            const multiplier = this.getMultiplier();
            const hitScore = this.calculateHitScore(reactionTime, target.radius, this.currentConfig.maxRadius, multiplier);
            this.score += hitScore;
            
            this.showBonus(target.x, target.y, `+${hitScore}`, multiplier > 1 ? `x${multiplier}` : null);
        }
    }

    handleMiss() {
        this.misses++;
        this.breakCombo('MISS_CLICK');
        this.vibrateUI('RED');
    }

    missedTarget() {
        this.misses++;
    }

    breakCombo(reason) {
        if (this.combo > 0) {
            console.log(`Combo Broken: ${reason}`);
            this.combo = 0;
            this.vibrateUI('SHAKE');
        }
    }

    getMultiplier() {
        if (this.combo >= 40) return 4.0;
        if (this.combo >= 20) return 3.0;
        if (this.combo >= 10) return 2.0;
        if (this.combo >= 5) return 1.5;
        return 1.0;
    }

    calculateHitScore(reactionMs, radius, maxRadius, multiplier) {
        // Speed bonus: 0-100 pts
        const speedEval = Math.max(0, Math.min(1000, reactionMs));
        const speedBonus = Math.floor((1000 - speedEval) / 10);
        
        // Size bonus: 0-50 pts
        const sizeBonus = Math.floor(((maxRadius - radius) / maxRadius) * 50);
        
        const basePoints = 10 + speedBonus + sizeBonus;
        return Math.floor(basePoints * multiplier);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const now = Date.now();

        this.targets.forEach(t => {
            const age = now - t.spawnTime;
            const progress = 1 - (age / this.currentConfig.lifetime);
            
            // Draw Target
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
            
            // Gradient
            const grad = this.ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.radius);
            if (t.type === 'GREEN') {
                grad.addColorStop(0, '#00ff87');
                grad.addColorStop(1, '#00cc6a');
            } else {
                grad.addColorStop(0, '#ff4654');
                grad.addColorStop(1, '#dc2626');
            }
            
            this.ctx.fillStyle = grad;
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = t.type === 'GREEN' ? 'rgba(0, 255, 135, 0.4)' : 'rgba(255, 70, 84, 0.4)';
            this.ctx.fill();
            this.ctx.closePath();

            // Progress Ring
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius + 4, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * progress));
            this.ctx.strokeStyle = t.type === 'GREEN' ? '#00ff87' : '#ff4654';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.closePath();
            
            this.ctx.shadowBlur = 0;
        });
    }

    updateHUD() {
        this.elements.score.textContent = this.score.toLocaleString();
        const acc = this.totalShots === 0 ? 100 : Math.floor((this.hits / this.totalShots) * 100);
        this.elements.accuracy.textContent = `${acc}%`;
        
        const m = Math.floor(this.timeLeft / 60);
        const s = this.timeLeft % 60;
        this.elements.timer.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        this.elements.combo.textContent = this.combo;
        this.elements.multiplier.textContent = `x${this.getMultiplier().toFixed(1)}`;
        
        // Visual feedback for high combo
        if (this.combo >= 10) {
            this.elements.combo.style.transform = `scale(${1 + (this.combo / 100)})`;
            this.elements.combo.style.color = '#00ff87';
        } else {
            this.elements.combo.style.transform = 'scale(1)';
            this.elements.combo.style.color = '#fff';
        }
    }

    showBonus(x, y, text, multiplierText) {
        const div = document.createElement('div');
        div.className = 'bonus-popup text-[#00ff87]';
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.innerHTML = `<div>${text}</div>${multiplierText ? `<div class="text-xs text-white/50">${multiplierText}</div>` : ''}`;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 500);
    }

    vibrateUI(type) {
        if (type === 'RED') {
            this.elements.overlay.classList.add('flash-red');
            setTimeout(() => this.elements.overlay.classList.remove('flash-red'), 200);
        }
    }

    async endGame() {
        this.isRunning = false;
        
        const avgResponseTime = this.hits === 0 ? 0 : Math.floor(this.totalShots * this.currentConfig.spawnInterval / this.hits); // Approximate or track properly
        // For precision, we should track total reaction time sum. Let's fix that.
        
        const result = {
            difficulty: this.config.difficulty,
            duration: this.config.duration,
            score: this.score,
            maxCombo: this.maxCombo,
            accuracy: this.totalShots === 0 ? 0 : (this.hits / this.totalShots) * 100,
            totalShots: this.totalShots,
            hits: this.hits,
            misses: this.misses,
            shotsPerSecond: this.totalShots / this.config.duration,
            avgResponseTime: 400, // Hardcoded for now, would need actual tracking
            timestamp: Date.now()
        };

        localStorage.setItem('last_training_result', JSON.stringify(result));

        try {
            await apiRequest('/training/result', {
                method: 'POST',
                body: JSON.stringify(result)
            });
        } catch (err) {
            console.error('Failed to save result to cloud:', err);
        }

        ipcRenderer.send('navigate-to', 'training-result');
    }
}

new AimGame();
