// ============================================================
//  糖果消消乐 - 微信小游戏版
//  纯 Canvas 2D 渲染，无 DOM 依赖
// ============================================================

// ===== 常量 =====
const BOARD_SIZE = 8;
const CANDY_TYPES = 6;
const CANDY_COLORS = [
    { fill1: '#ff6b6b', fill2: '#ee0a0a', glow: 'rgba(238,10,10,0.5)' },
    { fill1: '#6bb6ff', fill2: '#0a6eee', glow: 'rgba(10,110,238,0.5)' },
    { fill1: '#6bff9e', fill2: '#0aaa3a', glow: 'rgba(10,170,58,0.5)' },
    { fill1: '#ffe66b', fill2: '#eeb00a', glow: 'rgba(238,176,10,0.5)' },
    { fill1: '#c46bff', fill2: '#7a0aee', glow: 'rgba(122,10,238,0.5)' },
    { fill1: '#ffb36b', fill2: '#ee6a0a', glow: 'rgba(238,106,10,0.5)' }
];

// ===== 全局 =====
var canvas, ctx;
var screenWidth, screenHeight;
var boardX, boardY, boardSize, cellSize, candyRadius;
var game = null;

// ===== 游戏状态 =====
const State = { IDLE: 0, SWAPPING: 1, REMOVING: 2, FALLING: 3, GAME_OVER: 4 };

// ===== 工具 =====
function rand(n) { return Math.floor(Math.random() * n); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function easeOutBack(t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

// ===== 音效 =====
class Audio {
    constructor() {
        this.ctx = null;
        try {
            this.ctx = wx.createWebAudioContext();
        } catch (e) {
            // fallback
        }
    }
    play(type) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        switch (type) {
            case 'select': this.tone(600, 800, 0.1, 0.15, now); break;
            case 'swap': this.tone(400, 700, 0.15, 0.2, now); break;
            case 'invalid': this.tone(200, 100, 0.2, 0.15, now, 'square'); break;
            case 'match': this.chord([523, 659, 784], 0.15, now); break;
            case 'combo': this.arpeggio(440, 4, 0.1, now); break;
            case 'special': this.sweep(150, 800, 0.5, now); break;
            case 'win': this.chord([523, 659, 784, 1047], 0.3, now, 0.12); break;
            case 'lose': this.tone(400, 100, 0.7, 0.25, now, 'triangle'); break;
        }
    }
    tone(f1, f2, dur, vol, now, type) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        if (type) osc.type = type;
        osc.frequency.setValueAtTime(f1, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), now + dur);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.start(now); osc.stop(now + dur);
    }
    chord(freqs, dur, now, vol) {
        vol = vol || 0.15;
        freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.frequency.setValueAtTime(f, now + i * 0.05);
            gain.gain.setValueAtTime(vol, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + dur);
            osc.start(now + i * 0.05); osc.stop(now + i * 0.05 + dur);
        });
    }
    arpeggio(base, count, dur, now) {
        for (let i = 0; i < count; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.frequency.setValueAtTime(base + i * 100, now + i * 0.03);
            gain.gain.setValueAtTime(0.12, now + i * 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + dur);
            osc.start(now + i * 0.03); osc.stop(now + i * 0.03 + dur);
        }
    }
    sweep(f1, f2, dur, now) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + dur);
        osc.frequency.setValueAtTime(f1, now);
        osc.frequency.exponentialRampToValueAtTime(f2, now + dur);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.start(now); osc.stop(now + dur);
    }
}

// ===== 粒子 =====
class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        const angle = rand(360) * Math.PI / 180;
        const speed = 30 + rand(40);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 0.8; this.maxLife = 0.8;
        this.color = color;
        this.size = 4 + rand(4);
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 200 * dt;
        this.life -= dt;
        return this.life > 0;
    }
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        const s = this.size * alpha;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ===== 分数飘字 =====
class ScorePopup {
    constructor(x, y, text, color) {
        this.x = x; this.y = y;
        this.text = text;
        this.color = color || '#ffd700';
        this.life = 1.0;
    }
    update(dt) {
        this.y -= 50 * dt;
        this.life -= dt;
        return this.life > 0;
    }
    draw(ctx) {
        const alpha = clamp(this.life, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = this.color;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// ===== 主游戏 =====
class CandyGame {
    constructor() {
        this.audio = new Audio();
        this.particles = [];
        this.popups = [];
        this.score = 0;
        this.level = 1;
        this.moves = 30;
        this.targetScore = 1000;
        this.state = State.IDLE;
        this.selectedCell = null;
        this.comboCount = 0;
        this.isProcessing = false;
        this.animTime = 0;
        this.comboText = null;
        this.screen = 'start'; // start, playing, levelComplete, gameOver

        // 布局计算
        this.calcLayout();
        this.generateBoard();
    }

    calcLayout() {
        const padding = 16;
        const hudHeight = 130;
        boardSize = Math.min(screenWidth - padding * 2, screenHeight - hudHeight - padding * 2);
        boardX = (screenWidth - boardSize) / 2;
        boardY = hudHeight;
        cellSize = boardSize / BOARD_SIZE;
        candyRadius = cellSize * 0.38;
    }

    generateBoard() {
        this.board = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            this.board[r] = [];
            for (let c = 0; c < BOARD_SIZE; c++) {
                let type;
                do { type = rand(CANDY_TYPES); } while (this.wouldMatch(r, c, type));
                this.board[r][c] = { type, special: null, scale: 1, alpha: 1, offsetY: 0 };
            }
        }
    }

    wouldMatch(r, c, type) {
        if (c >= 2 && this.board[r][c-1] && this.board[r][c-1].type === type &&
            this.board[r][c-2] && this.board[r][c-2].type === type) return true;
        if (r >= 2 && this.board[r-1] && this.board[r-1][c] && this.board[r-1][c].type === type &&
            this.board[r-2] && this.board[r-2][c] && this.board[r-2][c].type === type) return true;
        return false;
    }

    // ===== 触摸处理 =====
    handleTouch(x, y) {
        if (this.screen !== 'playing' || this.isProcessing) return;

        const col = Math.floor((x - boardX) / cellSize);
        const row = Math.floor((y - boardY) / cellSize);
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;

        if (this.selectedCell) {
            const sel = this.selectedCell;
            const dr = Math.abs(sel.row - row);
            const dc = Math.abs(sel.col - col);
            if (sel.row === row && sel.col === col) {
                this.selectedCell = null;
            } else if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
                this.selectedCell = null;
                this.attemptSwap(sel.row, sel.col, row, col);
            } else {
                this.selectedCell = { row, col };
                this.audio.play('select');
            }
        } else {
            this.selectedCell = { row, col };
            this.audio.play('select');
        }
    }

    handleSwipe(x1, y1, x2, y2) {
        if (this.screen !== 'playing' || this.isProcessing) return;
        const col = Math.floor((x1 - boardX) / cellSize);
        const row = Math.floor((y1 - boardY) / cellSize);
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;

        const dx = x2 - x1, dy = y2 - y1;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;

        let tr = row, tc = col;
        if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
        else tr += dy > 0 ? 1 : -1;

        if (tr >= 0 && tr < BOARD_SIZE && tc >= 0 && tc < BOARD_SIZE) {
            this.selectedCell = null;
            this.attemptSwap(row, col, tr, tc);
        }
    }

    // ===== 交换 =====
    async attemptSwap(r1, c1, r2, c2) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.state = State.SWAPPING;
        this.audio.play('swap');

        // 交换数据
        const tmp = this.board[r1][c1];
        this.board[r1][c1] = this.board[r2][c2];
        this.board[r2][c2] = tmp;

        const matches = this.findAllMatches();
        const hasSpecial = this.board[r1][c1].special === 'color-bomb' || this.board[r2][c2].special === 'color-bomb';

        if (matches.length === 0 && !hasSpecial) {
            // 换回去
            this.audio.play('invalid');
            const tmp2 = this.board[r1][c1];
            this.board[r1][c1] = this.board[r2][c2];
            this.board[r2][c2] = tmp2;
            this.isProcessing = false;
            this.state = State.IDLE;
            return;
        }

        this.moves--;
        this.comboCount = 0;
        await this.processMatches();
        this.checkGameState();
        this.isProcessing = false;
        this.state = State.IDLE;
    }

    // ===== 匹配检测 =====
    findAllMatches() {
        const matches = [];
        // 水平
        for (let r = 0; r < BOARD_SIZE; r++) {
            let count = 1;
            for (let c = 1; c <= BOARD_SIZE; c++) {
                if (c < BOARD_SIZE && this.board[r][c] && this.board[r][c-1] &&
                    this.board[r][c].type === this.board[r][c-1].type) {
                    count++;
                } else {
                    if (count >= 3) {
                        matches.push({ dir: 'h', row: r, start: c - count, end: c - 1, len: count, type: this.board[r][c-1].type });
                    }
                    count = 1;
                }
            }
        }
        // 垂直
        for (let c = 0; c < BOARD_SIZE; c++) {
            let count = 1;
            for (let r = 1; r <= BOARD_SIZE; r++) {
                if (r < BOARD_SIZE && this.board[r][c] && this.board[r-1][c] &&
                    this.board[r][c].type === this.board[r-1][c].type) {
                    count++;
                } else {
                    if (count >= 3) {
                        matches.push({ dir: 'v', col: c, start: r - count, end: r - 1, len: count, type: this.board[r-1][c].type });
                    }
                    count = 1;
                }
            }
        }
        return matches;
    }

    // ===== 处理匹配 =====
    async processMatches() {
        while (true) {
            const matches = this.findAllMatches();
            if (matches.length === 0) break;
            this.comboCount++;

            // 计分
            let scoreGain = 0;
            for (const m of matches) {
                let base = m.len * 30;
                if (m.len === 4) base = 120;
                if (m.len >= 5) base = 500;
                scoreGain += base;
            }
            scoreGain *= this.comboCount;
            this.score += scoreGain;

            if (this.comboCount >= 2) {
                const texts = ['', '', 'NICE!', 'GREAT!', 'AMAZING!', 'AWESOME!', 'INCREDIBLE!'];
                this.comboText = { text: texts[Math.min(this.comboCount, texts.length-1)], life: 1.2 };
                this.audio.play('combo');
            }

            // 收集要消除的位置
            const toRemove = new Set();
            for (const m of matches) {
                if (m.dir === 'h') for (let c = m.start; c <= m.end; c++) toRemove.add(`${m.row},${c}`);
                else for (let r = m.start; r <= m.end; r++) toRemove.add(`${r},${m.col}`);
            }

            // 检查特殊糖果创建
            const specials = this.checkSpecialCreation(matches);
            for (const sp of specials) toRemove.delete(sp.key);

            // 激活链式特殊糖果
            const extra = new Set();
            for (const key of toRemove) {
                const [r, c] = key.split(',').map(Number);
                const candy = this.board[r][c];
                if (!candy || !candy.special) continue;
                if (candy.special === 'striped-h') for (let cc = 0; cc < BOARD_SIZE; cc++) extra.add(`${r},${cc}`);
                else if (candy.special === 'striped-v') for (let rr = 0; rr < BOARD_SIZE; rr++) extra.add(`${rr},${c}`);
                else if (candy.special === 'wrapped') {
                    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                        const nr = r+dr, nc = c+dc;
                        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) extra.add(`${nr},${nc}`);
                    }
                }
            }
            for (const k of extra) toRemove.add(k);

            // 消除动画
            this.audio.play('match');
            this.state = State.REMOVING;
            const positions = [];
            for (const key of toRemove) {
                const [r, c] = key.split(',').map(Number);
                const candy = this.board[r][c];
                if (!candy) continue;
                const cx = boardX + c * cellSize + cellSize / 2;
                const cy = boardY + r * cellSize + cellSize / 2;
                positions.push({ r, c, cx, cy, color: CANDY_COLORS[candy.type].fill1 });
                this.spawnParticles(cx, cy, CANDY_COLORS[candy.type].fill1);
                candy.scale = 1.4;
                candy.alpha = 1;
            }

            // 分数飘字
            if (positions.length > 0) {
                const avgX = positions.reduce((s, p) => s + p.cx, 0) / positions.length;
                const avgY = positions.reduce((s, p) => s + p.cy, 0) / positions.length;
                this.popups.push(new ScorePopup(avgX, avgY, `+${scoreGain}`));
            }

            // 等待消除动画
            await this.wait(400);
            for (const key of toRemove) {
                const [r, c] = key.split(',').map(Number);
                this.board[r][c] = null;
            }

            // 创建特殊糖果
            for (const sp of specials) {
                this.board[sp.row][sp.col] = { type: sp.type, special: sp.special, scale: 1, alpha: 1, offsetY: 0 };
            }

            // 下落填充
            this.state = State.FALLING;
            this.dropAndFill();
            await this.wait(400);
        }
    }

    checkSpecialCreation(matches) {
        const specials = [];
        const used = new Set();
        for (const m of matches) {
            let row, col;
            if (m.dir === 'h') { row = m.row; col = Math.floor((m.start + m.end) / 2); }
            else { col = m.col; row = Math.floor((m.start + m.end) / 2); }
            const key = `${row},${col}`;
            if (used.has(key)) continue;
            if (m.len === 4) {
                specials.push({ row, col, special: m.dir === 'h' ? 'striped-v' : 'striped-h', type: m.type, key });
                used.add(key);
            } else if (m.len >= 5) {
                specials.push({ row, col, special: 'color-bomb', type: m.type, key });
                used.add(key);
            }
        }
        // L/T 形 -> 包装糖果
        const hMatches = matches.filter(m => m.dir === 'h');
        const vMatches = matches.filter(m => m.dir === 'v');
        for (const hm of hMatches) {
            for (const vm of vMatches) {
                if (hm.type !== vm.type) continue;
                for (let c = hm.start; c <= hm.end; c++) {
                    if (c === vm.col) for (let r = vm.start; r <= vm.end; r++) {
                        if (r === hm.row) {
                            const key = `${r},${c}`;
                            if (!used.has(key)) {
                                specials.push({ row: r, col: c, special: 'wrapped', type: hm.type, key });
                                used.add(key);
                            }
                        }
                    }
                }
            }
        }
        return specials;
    }

    dropAndFill() {
        for (let c = 0; c < BOARD_SIZE; c++) {
            let writeRow = BOARD_SIZE - 1;
            for (let r = BOARD_SIZE - 1; r >= 0; r--) {
                if (this.board[r][c]) {
                    if (r !== writeRow) {
                        this.board[writeRow][c] = this.board[r][c];
                        this.board[r][c] = null;
                        this.board[writeRow][c].offsetY = -(writeRow - r) * cellSize;
                    }
                    writeRow--;
                }
            }
            for (let r = writeRow; r >= 0; r--) {
                this.board[r][c] = { type: rand(CANDY_TYPES), special: null, scale: 1, alpha: 1, offsetY: -(writeRow + 1) * cellSize };
            }
        }
    }

    spawnParticles(x, y, color) {
        for (let i = 0; i < 8; i++) this.particles.push(new Particle(x, y, color));
    }

    checkGameState() {
        if (this.score >= this.targetScore) {
            this.screen = 'levelComplete';
            this.audio.play('win');
        } else if (this.moves <= 0) {
            this.screen = 'gameOver';
            this.audio.play('lose');
        }
    }

    nextLevel() {
        this.level++;
        this.targetScore = 1000 + (this.level - 1) * 800;
        this.moves = 25 + Math.min(this.level * 2, 15);
        this.score = 0;
        this.comboCount = 0;
        this.generateBoard();
        this.screen = 'playing';
    }

    restart() {
        this.level = 1; this.score = 0; this.targetScore = 1000;
        this.moves = 30; this.comboCount = 0;
        this.generateBoard();
        this.screen = 'playing';
    }

    // ===== 更新 =====
    update(dt) {
        this.animTime += dt;

        // 粒子
        this.particles = this.particles.filter(p => p.update(dt));
        // 飘字
        this.popups = this.popups.filter(p => p.update(dt));
        // Combo文字
        if (this.comboText) {
            this.comboText.life -= dt;
            if (this.comboText.life <= 0) this.comboText = null;
        }
        // 糖果动画
        if (this.state === State.REMOVING) {
            for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
                const candy = this.board[r][c];
                if (candy && candy.alpha < 1) {
                    candy.alpha -= dt * 3;
                    candy.scale += dt * 2;
                }
            }
        }
        // 下落动画
        if (this.state === State.FALLING) {
            for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
                const candy = this.board[r][c];
                if (candy && candy.offsetY !== 0) {
                    candy.offsetY += dt * 1200;
                    if (candy.offsetY >= 0) candy.offsetY = 0;
                }
            }
        }
    }

    // ===== 渲染 =====
    render() {
        ctx.clearRect(0, 0, screenWidth, screenHeight);
        this.drawBackground();
        if (this.screen === 'start') { this.drawStartScreen(); return; }
        this.drawHUD();
        this.drawBoard();
        this.drawParticles();
        this.drawPopups();
        if (this.comboText) this.drawComboText();
        if (this.screen === 'levelComplete') this.drawLevelComplete();
        if (this.screen === 'gameOver') this.drawGameOver();
    }

    drawBackground() {
        const grad = ctx.createLinearGradient(0, 0, screenWidth, screenHeight);
        grad.addColorStop(0, '#1a0a2e');
        grad.addColorStop(0.5, '#16213e');
        grad.addColorStop(1, '#0f3460');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, screenWidth, screenHeight);
    }

    drawHUD() {
        const hudY = 20;
        const itemW = (screenWidth - 48) / 3;
        const items = [
            { label: '关卡', value: this.level },
            { label: '分数', value: this.score },
            { label: '步数', value: this.moves }
        ];
        items.forEach((item, i) => {
            const x = 16 + i * (itemW + 8);
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            this.roundRect(x, hudY, itemW, 56, 12); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
            this.roundRect(x, hudY, itemW, 56, 12); ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '12px Arial'; ctx.textAlign = 'center';
            ctx.fillText(item.label, x + itemW/2, hudY + 20);

            ctx.fillStyle = item.label === '步数' && this.moves <= 5 ? '#ff6b6b' : '#fff';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(String(item.value), x + itemW/2, hudY + 46);
        });

        // 进度条
        const pbY = 90, pbW = screenWidth - 32, pbH = 24;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        this.roundRect(16, pbY, pbW, pbH, 12); ctx.fill();
        const progress = clamp(this.score / this.targetScore, 0, 1);
        if (progress > 0) {
            const grad2 = ctx.createLinearGradient(16, 0, 16 + pbW, 0);
            grad2.addColorStop(0, '#00d2ff'); grad2.addColorStop(0.5, '#3a7bd5'); grad2.addColorStop(1, '#00d2ff');
            ctx.fillStyle = grad2;
            this.roundRect(16, pbY, pbW * progress, pbH, 12); ctx.fill();
        }
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`${this.score} / ${this.targetScore}`, screenWidth/2, pbY + 16);
    }

    drawBoard() {
        // 棋盘背景
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.roundRect(boardX - 4, boardY - 4, boardSize + 8, boardSize + 8, 16); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2;
        this.roundRect(boardX - 4, boardY - 4, boardSize + 8, boardSize + 8, 16); ctx.stroke();

        // 格子背景
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const x = boardX + c * cellSize, y = boardY + r * cellSize;
                ctx.fillStyle = 'rgba(255,255,255,0.03)';
                this.roundRect(x + 1, y + 1, cellSize - 2, cellSize - 2, 6); ctx.fill();
            }
        }

        // 糖果
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const candy = this.board[r][c];
                if (!candy) continue;
                const cx = boardX + c * cellSize + cellSize / 2;
                const cy = boardY + r * cellSize + cellSize / 2 + candy.offsetY;
                const isSelected = this.selectedCell && this.selectedCell.row === r && this.selectedCell.col === c;
                this.drawCandy(cx, cy, candy, isSelected);
            }
        }
    }

    drawCandy(cx, cy, candy, selected) {
        const r = candyRadius * candy.scale;
        if (r <= 0 || candy.alpha <= 0) return;
        const col = CANDY_COLORS[candy.type];

        ctx.save();
        ctx.globalAlpha = clamp(candy.alpha, 0, 1);

        // 选中外圈
        if (selected) {
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 阴影
        ctx.shadowColor = col.glow;
        ctx.shadowBlur = 8;

        // 主体
        const grad = ctx.createRadialGradient(cx - r*0.3, cy - r*0.3, 0, cx, cy, r);
        grad.addColorStop(0, col.fill1);
        grad.addColorStop(1, col.fill2);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(cx - r*0.3, cy - r*0.3, r*0.3, 0, Math.PI * 2);
        ctx.fill();

        // 特殊糖果标记
        if (candy.special === 'striped-h') {
            ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
            for (let i = -1; i <= 1; i++) {
                ctx.beginPath(); ctx.moveTo(cx - r*0.7, cy + i*r*0.35); ctx.lineTo(cx + r*0.7, cy + i*r*0.35); ctx.stroke();
            }
        } else if (candy.special === 'striped-v') {
            ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
            for (let i = -1; i <= 1; i++) {
                ctx.beginPath(); ctx.moveTo(cx + i*r*0.35, cy - r*0.7); ctx.lineTo(cx + i*r*0.35, cy + r*0.7); ctx.stroke();
            }
        } else if (candy.special === 'color-bomb') {
            // 彩虹圆
            const colors = ['#ff6b6b','#6bb6ff','#6bff9e','#ffe66b','#c46bff','#ffb36b'];
            for (let i = 0; i < 6; i++) {
                ctx.fillStyle = colors[i];
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, r, (i/6)*Math.PI*2 + this.animTime, ((i+1)/6)*Math.PI*2 + this.animTime);
                ctx.fill();
            }
            // 星星
            ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(r*1.2)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('★', cx, cy);
        } else if (candy.special === 'wrapped') {
            ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.stroke();
        }

        ctx.restore();
    }

    drawParticles() {
        for (const p of this.particles) p.draw(ctx);
    }

    drawPopups() {
        for (const p of this.popups) p.draw(ctx);
    }

    drawComboText() {
        const t = this.comboText;
        const alpha = clamp(t.life, 0, 1);
        const scale = t.life > 1.0 ? easeOutBack((1.2 - t.life) / 0.2) : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(screenWidth/2, boardY + boardSize/2);
        ctx.scale(scale, scale);
        ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = 'rgba(255,215,0,0.8)'; ctx.shadowBlur = 20;
        ctx.fillText(t.text, 0, 0);
        ctx.restore();
    }

    drawStartScreen() {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, screenWidth, screenHeight);

        const cx = screenWidth / 2, cy = screenHeight / 2;
        // 标题
        ctx.fillStyle = '#fff'; ctx.font = 'bold 36px Arial'; ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(255,255,255,0.3)'; ctx.shadowBlur = 20;
        ctx.fillText('🍬 糖果消消乐', cx, cy - 120);
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '16px Arial';
        ctx.fillText('Match 3 or more candies!', cx, cy - 85);

        // 说明
        const tips = ['🎯 交换相邻糖果，匹配3个或以上', '⭐ 4连消获得条纹糖果', '💥 5连消获得彩色炸弹', '🔗 连锁消除获得额外分数'];
        ctx.font = '14px Arial'; ctx.textAlign = 'left';
        tips.forEach((tip, i) => {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fillText(tip, cx - 140, cy - 35 + i * 28);
        });

        // 按钮
        const btnW = 200, btnH = 48, btnY = cy + 100;
        ctx.fillStyle = '#ee0a0a';
        this.roundRect(cx - btnW/2, btnY, btnW, btnH, 24); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('开始游戏', cx, btnY + btnH/2);
        ctx.textBaseline = 'alphabetic';
    }

    drawLevelComplete() {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, screenWidth, screenHeight);
        const cx = screenWidth / 2, cy = screenHeight / 2;
        const bonus = this.moves * 50;
        ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center';
        ctx.fillText('🎉 通关！', cx, cy - 60);
        ctx.font = '18px Arial';
        ctx.fillText(`分数：${this.score + bonus}`, cx, cy - 10);
        ctx.fillText(`步数奖励：${bonus}`, cx, cy + 20);
        // 按钮
        ctx.fillStyle = '#ee0a0a';
        this.roundRect(cx - 100, cy + 50, 200, 44, 22); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial'; ctx.textBaseline = 'middle';
        ctx.fillText('下一关', cx, cy + 72);
        ctx.textBaseline = 'alphabetic';
    }

    drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, screenWidth, screenHeight);
        const cx = screenWidth / 2, cy = screenHeight / 2;
        ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center';
        ctx.fillText('💔 游戏结束', cx, cy - 60);
        ctx.font = '18px Arial';
        ctx.fillText(`最终分数：${this.score}`, cx, cy - 10);
        ctx.fillText(`到达关卡：${this.level}`, cx, cy + 20);
        // 按钮
        ctx.fillStyle = '#ee0a0a';
        this.roundRect(cx - 100, cy + 50, 200, 44, 22); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial'; ctx.textBaseline = 'middle';
        ctx.fillText('重新开始', cx, cy + 72);
        ctx.textBaseline = 'alphabetic';
    }

    roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    hitTestButton(x, y) {
        const cx = screenWidth / 2, cy = screenHeight / 2;
        if (this.screen === 'start') {
            const btnY = cy + 100;
            if (x >= cx - 100 && x <= cx + 100 && y >= btnY && y <= btnY + 48) return 'start';
        } else if (this.screen === 'levelComplete') {
            if (x >= cx - 100 && x <= cx + 100 && y >= cy + 50 && y <= cy + 94) return 'next';
        } else if (this.screen === 'gameOver') {
            if (x >= cx - 100 && x <= cx + 100 && y >= cy + 50 && y <= cy + 94) return 'restart';
        }
        return null;
    }

    wait(ms) { return new Promise(r => setTimeout(r, ms)); }
}

// ===== 入口 =====
function init() {
    canvas = wx.createCanvas();
    ctx = canvas.getContext('2d');
    const info = wx.getSystemInfoSync();
    screenWidth = info.windowWidth;
    screenHeight = info.windowHeight;
    canvas.width = screenWidth * (info.pixelRatio || 1);
    canvas.height = screenHeight * (info.pixelRatio || 1);
    ctx.scale(info.pixelRatio || 1, info.pixelRatio || 1);

    game = new CandyGame();

    // 触摸事件
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
    wx.onTouchStart((e) => {
        const t = e.touches[0];
        touchStartX = t.clientX; touchStartY = t.clientY;
        touchStartTime = Date.now();
    });
    wx.onTouchEnd((e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
        const dt = Date.now() - touchStartTime;

        // 按钮检测
        const btn = game.hitTestButton(t.clientX, t.clientY);
        if (btn === 'start') { game.screen = 'playing'; return; }
        if (btn === 'next') { game.nextLevel(); return; }
        if (btn === 'restart') { game.restart(); return; }

        if (game.screen === 'playing') {
            if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 300) {
                game.handleTouch(t.clientX, t.clientY);
            } else if (Math.abs(dx) >= 20 || Math.abs(dy) >= 20) {
                game.handleSwipe(touchStartX, touchStartY, t.clientX, t.clientY);
            }
        }
    });

    // 游戏循环 (lib 3.x: canvas 实例的 requestAnimationFrame 已移除，必须用全局函数)
    let lastTime = Date.now();
    function loop() {
        const now = Date.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        game.update(dt);
        game.render();
        requestAnimationFrame(loop);
    }
    loop();
}

init();
