const { ipcRenderer } = require('electron');
const { apiRequest, getUser } = require('../../../shared/api');
const duelSocket = require('../../../shared/duel-socket');

class DuelAimGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        const configStr = localStorage.getItem('duel_config');
        if (!configStr) {
            window.location.href = 'dashboard.html';
            return;
        }
        this.duelConfig = JSON.parse(configStr);
        this.lobbyCode = this.duelConfig.lobbyCode;
        
        this.diffConfigs = {
            'EASY': { minRadius: 30, maxRadius: 50, lifetime: 1500, spawnInterval: 800, penaltyChance: 0.00, comboTimeout: 3000 },
            'MEDIUM': { minRadius: 20, maxRadius: 40, lifetime: 1000, spawnInterval: 600, penaltyChance: 0.20, comboTimeout: 1800 },
            'HARD': { minRadius: 16, maxRadius: 30, lifetime: 600, spawnInterval: 400, penaltyChance: 0.35, comboTimeout: 1000 }
        };

        this.currentConfig = this.diffConfigs[this.duelConfig.difficulty];
        this.user = getUser();
        this.currentUserId = this.user.id || this.user._id;

        // Game State
        this.isRunning = false;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.hits = 0;
        this.totalShots = 0;
        this.misses = 0;
        this.startTime = 0;
        this.timeLeft = this.duelConfig.duration;
        this.targets = [];
        this.lastSpawnTime = 0;
        this.lastHitTime = 0;
        
        // Response stats (fixing bug)
        this.totalReactionTime = 0;
        this.perfectHits = 0;
        this.goodHits = 0;
        this.badHits = 0;
        
        // Opponent State
        this.opponentScore = 0;
        this.opponentAccuracy = 100;

        this.elements = {
            score: document.getElementById('hud-score'),
            accuracy: document.getElementById('hud-accuracy'),
            timer: document.getElementById('hud-timer'),
            combo: document.getElementById('hud-combo'),
            multiplier: document.getElementById('hud-multiplier'),
            opponentScore: document.getElementById('opponent-score'),
            opponentName: document.getElementById('opponent-name'),
            overlay: document.getElementById('game-overlay'),
            countdown: document.getElementById('countdown-timer'),
            startScreen: document.getElementById('start-screen')
        };

        this.socket = duelSocket.getSocket();
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        document.getElementById('info-difficulty').textContent = this.duelConfig.difficulty;
        document.getElementById('info-duration').textContent = `${this.duelConfig.duration}S`;

        this.setupSocket();
        this.canvas.addEventListener('mousedown', (e) => this.handleClick(e));
        document.getElementById('exit-btn').addEventListener('click', () => {
             this.socket.emit('duel:leave', { lobbyCode: this.lobbyCode, userId: this.currentUserId });
             ipcRenderer.send('navigate-to', 'duel-dashboard');
        });

        this.startCountdown();
    }

    setupSocket() {
        console.log('[DuelGame] Synchronizing socket room...');
        
        const joinRoom = () => {
            console.log('[DuelGame] Emitting room join synchronization...');
            this.socket.emit('duel:join', { 
                lobbyCode: this.lobbyCode, 
                userId: this.currentUserId, 
                username: this.user.nickname || this.user.username 
            });
        };

        if (this.socket.connected) {
            joinRoom();
        } else {
            this.socket.once('connect', joinRoom);
        }

        this.socket.on('duel:opponent_score', ({ userId, score, accuracy }) => {
            this.opponentScore = score;
            this.opponentAccuracy = accuracy;
            this.elements.opponentScore.textContent = score.toLocaleString();
        });

        this.socket.on('duel:opponent_left', () => {
            document.getElementById('disconnect-screen').classList.remove('hidden');
            this.isRunning = false;
        });

        this.socket.on('duel:result', (session) => {
             localStorage.setItem('last_duel_result', JSON.stringify(session));
             ipcRenderer.send('navigate-to', 'duel-result');
        });
    }

    startCountdown() {
        const interval = setInterval(() => {
            const now = Date.now();
            const diff = this.duelConfig.startTimestamp - now;

            if (diff <= 0) {
                clearInterval(interval);
                this.elements.startScreen.classList.add('opacity-0');
                setTimeout(() => this.elements.startScreen.classList.add('hidden'), 500);
                this.start();
            } else {
                this.elements.countdown.textContent = Math.ceil(diff / 1000);
                this.elements.countdown.style.transform = `scale(${1 + (diff % 1000) / 1000 * 0.2})`;
            }
        }, 50);
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
        this.timeLeft = Math.max(0, this.duelConfig.duration - Math.floor(delta / 1000));

        this.updateHUD();

        if (this.timeLeft <= 0) {
            this.endGame();
            return;
        }

        if (now - this.lastSpawnTime > this.currentConfig.spawnInterval) {
            this.spawnTarget();
            this.lastSpawnTime = now;
        }

        if (this.combo > 0 && now - this.lastHitTime > this.currentConfig.comboTimeout) {
            this.breakCombo('TIMEOUT');
        }

        this.targets = this.targets.filter(t => {
            const age = now - t.spawnTime;
            if (age > this.currentConfig.lifetime) {
                if (t.type === 'GREEN') {
                    this.missedTarget();
                    this.breakCombo('EXPIRED');
                    this.triggerShake();
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
        const margin = radius + 50;
        const x = margin + Math.random() * (this.canvas.width - margin * 2);
        const y = margin + Math.random() * (this.canvas.height - margin * 2);
        const type = Math.random() < this.currentConfig.penaltyChance ? 'RED' : 'GREEN';

        this.targets.push({ x, y, radius, type, spawnTime: Date.now() });
    }

    handleClick(e) {
        if (!this.isRunning) return;

        this.totalShots++;
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let hitAny = false;
        for (let i = this.targets.length - 1; i >= 0; i--) {
            const t = this.targets[i];
            const dist = Math.sqrt((mouseX - t.x) ** 2 + (mouseY - t.y) ** 2);

            if (dist < t.radius) {
                this.handleHit(t, dist);
                this.targets.splice(i, 1);
                hitAny = true;
                break;
            }
        }

        if (!hitAny) this.handleMiss();
        this.broadcastScore();
        this.updateHUD();
    }

    handleHit(target, distance) {
        const reactionTime = Date.now() - target.spawnTime;
        this.totalReactionTime += reactionTime;

        if (target.type === 'RED') {
            this.score = Math.max(0, this.score - (this.duelConfig.difficulty === 'HARD' ? 20 : 10));
            this.breakCombo('PENALTY');
            this.misses++;
            this.triggerShake();
            this.vibrateOverlay('RED');
        } else {
            this.hits++;
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.lastHitTime = Date.now();

            const ratio = distance / target.radius;
            let quality = 'BAD';
            let qualityMultiplier = 1.0;

            if (ratio <= 0.3) { quality = 'PERFECT'; qualityMultiplier = 1.5; this.perfectHits++; }
            else if (ratio <= 0.7) { quality = 'GOOD'; qualityMultiplier = 1.2; this.goodHits++; }
            else { this.badHits++; }

            const multiplier = this.getMultiplier();
            const baseScore = this.calculateHitScore(reactionTime, target.radius, this.currentConfig.maxRadius, multiplier);
            const finalHitScore = Math.floor(baseScore * qualityMultiplier);
            
            this.score += finalHitScore;
            this.showBonus(target.x, target.y, `+${finalHitScore}`, multiplier > 1 ? `x${multiplier}` : null, quality);
        }
    }

    handleMiss() {
        this.misses++;
        this.breakCombo('MISS_CLICK');
        this.vibrateOverlay('RED');
    }

    missedTarget() { this.misses++; }

    breakCombo(reason) {
        if (this.combo > 0) {
            this.combo = 0;
            this.vibrateOverlay('SHAKE');
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
        const speedBonus = Math.floor(Math.max(0, 1000 - reactionMs) / 10);
        const sizeBonus = Math.floor(((maxRadius - radius) / maxRadius) * 50);
        return Math.floor((10 + speedBonus + sizeBonus) * multiplier);
    }

    broadcastScore() {
        const acc = this.totalShots === 0 ? 100 : (this.hits / this.totalShots) * 100;
        this.socket.emit('duel:score_update', {
            lobbyCode: this.lobbyCode,
            userId: this.currentUserId,
            score: this.score,
            accuracy: acc
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
        this.elements.combo.style.color = this.combo >= 10 ? '#00ff87' : '#fff';
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const now = Date.now();

        this.targets.forEach(t => {
            const age = now - t.spawnTime;
            const progress = 1 - (age / this.currentConfig.lifetime);

            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
            
            const grad = this.ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.radius);
            if (t.type === 'GREEN') {
                grad.addColorStop(0, '#00ff87'); grad.addColorStop(1, '#00cc6a');
            } else {
                grad.addColorStop(0, '#ff4654'); grad.addColorStop(1, '#dc2626');
            }

            this.ctx.fillStyle = grad;
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = t.type === 'GREEN' ? 'rgba(0, 255, 135, 0.4)' : 'rgba(255, 70, 84, 0.4)';
            this.ctx.fill();
            this.ctx.closePath();

            // Progress Ring
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius + 4, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * progress));
            this.ctx.strokeStyle = t.type === 'GREEN' ? '#00ff87' : '#ff4654';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.closePath();
            this.ctx.shadowBlur = 0;
        });
    }

    showBonus(x, y, text, multiplierText, quality) {
        const div = document.createElement('div');
        div.className = 'bonus-popup text-[#00ff87]';
        div.style.left = `${x}px`; div.style.top = `${y}px`;
        div.innerHTML = `<div>${text}</div>${multiplierText ? `<div class="text-[10px] text-white/50">${multiplierText}</div>` : ''}`;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 600);

        if (quality) {
            const q = document.createElement('div');
            q.className = `hit-quality text-${quality.toLowerCase()}`;
            q.style.left = `${x}px`; q.style.top = `${y - 25}px`;
            q.textContent = quality;
            document.body.appendChild(q);
            setTimeout(() => q.remove(), 800);
        }
    }

    triggerShake() {
        document.body.classList.remove('screen-shake');
        void document.body.offsetWidth;
        document.body.classList.add('screen-shake');
    }

    vibrateOverlay(type) {
        if (type === 'RED') {
            this.elements.overlay.classList.add('flash-red');
            setTimeout(() => this.elements.overlay.classList.remove('flash-red'), 200);
        }
    }

    endGame() {
        this.isRunning = false;
        const avgResponseTime = this.hits === 0 ? 0 : Math.floor(this.totalReactionTime / this.hits);
        
        const finalStats = {
            score: this.score,
            accuracy: this.totalShots === 0 ? 0 : (this.hits / this.totalShots) * 100,
            avgResponseTime,
            maxCombo: this.maxCombo,
            perfectHits: this.perfectHits,
            goodHits: this.goodHits,
            badHits: this.badHits
        };

        this.socket.emit('duel:finish', {
            lobbyCode: this.lobbyCode,
            userId: this.currentUserId,
            finalStats
        });
        
        // Navigation is handled by socket duel:result listener
    }
}

new DuelAimGame();
