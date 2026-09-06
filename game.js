// ============================================================
//  智慧拼图王国 - 微信小游戏版 (滑块拼图)
//  纯 Canvas 2D 渲染，无 DOM 依赖
//  移植自 PuzzleGameUnity (Unity) 滑块拼图
// ============================================================

const GRID = 4; // 4x4 = 15块 + 1空格
const TOTAL = GRID * GRID;

var canvas, ctx;
var screenWidth, screenHeight;
var boardX, boardY, boardSize, cellSize;
var game = null;
var puzzleImg = null;

// ===== 状态 =====
const State = { START: 0, PLAYING: 1, ANIMATING: 2, END: 3 };

// ===== 音效 =====
class Audio {
    constructor() {
        this.ctx = null;
        try { this.ctx = wx.createWebAudioContext(); } catch(e) {}
    }
    play(type) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        switch (type) {
            case 'move': this.tone(440, 660, 0.06, 0.1, now); break;
            case 'win': this.chord([523, 659, 784, 1047, 1319], 0.25, now, 0.12); break;
            case 'shuffle': this.tone(300, 800, 0.3, 0.15, now); break;
        }
    }
    tone(f1, f2, dur, vol, now) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(f1, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(f2,1), now + dur);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.start(now); osc.stop(now + dur);
    }
    chord(freqs, dur, now, vol) {
        freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.frequency.setValueAtTime(f, now + i * 0.12);
            gain.gain.setValueAtTime(vol || 0.12, now + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + dur);
            osc.start(now + i * 0.12); osc.stop(now + i * 0.12 + dur);
        });
    }
}

// ===== 拼图块 =====
class PuzzlePiece {
    constructor(originalIdx, currentIdx, spriteRect) {
        this.originalIdx = originalIdx; // 正确位置
        this.currentIdx = currentIdx;   // 当前位置
        this.spriteRect = spriteRect;   // 在原图中的裁剪区域 {sx, sy, sw, sh}
        this.x = 0; this.y = 0;         // 当前像素坐标
        this.targetX = 0; this.targetY = 0;
        this.animating = false;
    }
}

// ===== 主游戏 =====
class PuzzleGame {
    constructor() {
        this.audio = new Audio();
        this.pieces = [];       // PuzzlePiece 数组 (不含空格)
        this.grid = [];         // grid[i][j] = piece index or -1 (空格)
        this.emptyI = GRID-1;
        this.emptyJ = GRID-1;
        this.state = State.START;
        this.moveCount = 0;
        this.startTime = 0;
        this.timerRunning = false;
        this.animPiece = null;
        this.animTarget = {i:0, j:0};
        this.screen = 'start';
        this.winParticles = [];

        this.calcLayout();
        this.createPieces();
        this.updateStatus('点击屏幕开始！');
    }

    calcLayout() {
        const padding = 20;
        boardSize = Math.min(screenWidth - padding*2, screenHeight - 180 - padding*2);
        boardX = (screenWidth - boardSize) / 2;
        boardY = 160;
        cellSize = boardSize / GRID;
    }

    createPieces() {
        this.pieces = [];
        this.grid = [];
        for (let i = 0; i < GRID; i++) {
            this.grid[i] = [];
            for (let j = 0; j < GRID; j++) {
                if (i === GRID-1 && j === GRID-1) {
                    this.grid[i][j] = -1;
                    this.emptyI = i; this.emptyJ = j;
                } else {
                    const idx = i * GRID + j;
                    // 裁剪原图 1/GRID 区域
                    const sw = puzzleImg.width / GRID;
                    const sh = puzzleImg.height / GRID;
                    const sx = j * sw;
                    const sy = i * sh;
                    const piece = new PuzzlePiece(idx, idx, {sx, sy, sw, sh});
                    this.pieces.push(piece);
                    this.grid[i][j] = idx;
                    this.updatePiecePos(piece, i, j);
                }
            }
        }
    }

    updatePiecePos(piece, i, j) {
        piece.x = boardX + j * cellSize;
        piece.y = boardY + i * cellSize;
        piece.targetX = piece.x;
        piece.targetY = piece.y;
    }

    shuffle() {
        // 随机移动空格500次保证可解
        for (let n = 0; n < 500; n++) {
            const dirs = [];
            if (this.emptyI > 0) dirs.push([-1, 0]);
            if (this.emptyI < GRID-1) dirs.push([1, 0]);
            if (this.emptyJ > 0) dirs.push([0, -1]);
            if (this.emptyJ < GRID-1) dirs.push([0, 1]);
            const [di, dj] = dirs[Math.floor(Math.random() * dirs.length)];
            const ni = this.emptyI + di, nj = this.emptyJ + dj;
            // 交换
            const pieceIdx = this.grid[ni][nj];
            this.grid[this.emptyI][this.emptyJ] = pieceIdx;
            this.grid[ni][nj] = -1;
            // 更新 piece 的 currentIdx
            const piece = this.pieces.find(p => p.currentIdx === ni * GRID + nj);
            if (piece) piece.currentIdx = this.emptyI * GRID + this.emptyJ;
            this.emptyI = ni; this.emptyJ = nj;
        }
        // 更新所有位置
        for (const p of this.pieces) {
            const ci = Math.floor(p.currentIdx / GRID);
            const cj = p.currentIdx % GRID;
            this.updatePiecePos(p, ci, cj);
        }
        this.audio.play('shuffle');
    }

    tryMove(i, j) {
        // 检查是否与空格相邻
        const di = Math.abs(i - this.emptyI);
        const dj = Math.abs(j - this.emptyJ);
        if ((di === 1 && dj === 0) || (di === 0 && dj === 1)) {
            // 找到该位置的 piece
            const idx = i * GRID + j;
            const piece = this.pieces.find(p => p.currentIdx === idx);
            if (!piece) return;

            // 动画移动到空格
            this.animPiece = piece;
            this.animTarget = {i: this.emptyI, j: this.emptyJ};
            this.state = State.ANIMATING;
            this.audio.play('move');

            // 更新数据
            piece.currentIdx = this.emptyI * GRID + this.emptyJ;
            this.grid[this.emptyI][this.emptyJ] = idx;
            this.grid[i][j] = -1;
            this.emptyI = i; this.emptyJ = j;
            this.moveCount++;
        }
    }

    checkWin() {
        for (const p of this.pieces) {
            if (p.currentIdx !== p.originalIdx) return false;
        }
        return true;
    }

    handleTap(x, y) {
        if (this.screen !== 'playing') return;
        const col = Math.floor((x - boardX) / cellSize);
        const row = Math.floor((y - boardY) / cellSize);
        if (row >= 0 && row < GRID && col >= 0 && col < GRID) {
            this.tryMove(row, col);
        }
    }

    updateStatus(msg) { this.statusText = msg; }

    update(dt) {
        // 动画
        if (this.state === State.ANIMATING && this.animPiece) {
            const targetX = boardX + this.animTarget.j * cellSize;
            const targetY = boardY + this.animTarget.i * cellSize;
            const speed = 14 * dt;
            let dx = targetX - this.animPiece.x;
            let dy = targetY - this.animPiece.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < speed) {
                this.animPiece.x = targetX;
                this.animPiece.y = targetY;
                this.state = State.PLAYING;
                if (this.checkWin()) {
                    this.state = State.END;
                    this.timerRunning = false;
                    this.audio.play('win');
                    this.updateStatus('恭喜通关！');
                    this.spawnWinEffect();
                }
            } else {
                this.animPiece.x += (dx/dist) * speed;
                this.animPiece.y += (dy/dist) * speed;
            }
        }

        // 粒子
        this.winParticles = this.winParticles.filter(p => p.update(dt));
    }

    spawnWinEffect() {
        const cx = boardX + boardSize/2;
        const cy = boardY + boardSize/2;
        for (let i = 0; i < 80; i++) {
            this.winParticles.push(new Particle(cx, cy, ['#ffd700', '#00d2ff', '#ff6b6b'][i%3]));
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
        if (this.screen === 'end') this.drawEndScreen();
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
        const elapsed = this.timerRunning ? (Date.now() - this.startTime) / 1000 : 0;
        const min = Math.floor(elapsed / 60);
        const sec = Math.floor(elapsed % 60);
        const timeStr = this.timerRunning ? `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : '00:00';

        const itemW = (screenWidth - 48) / 3;
        const items = [
            { label: '步数', value: String(this.moveCount) },
            { label: '时间', value: timeStr },
            { label: '难度', value: `${GRID}×${GRID}` }
        ];
        items.forEach((item, i) => {
            const x = 16 + i * (itemW + 8);
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            this.roundRect(x, 20, itemW, 56, 12); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
            this.roundRect(x, 20, itemW, 56, 12); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '12px Arial'; ctx.textAlign = 'center';
            ctx.fillText(item.label, x + itemW/2, 40);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 24px Arial';
            ctx.fillText(item.value, x + itemW/2, 66);
        });

        // 状态文字
        if (this.statusText) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '14px Arial'; ctx.textAlign = 'center';
            ctx.fillText(this.statusText, screenWidth/2, 100);
        }
    }

    drawBoard() {
        // 背景
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.roundRect(boardX-4, boardY-4, boardSize+8, boardSize+8, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2;
        this.roundRect(boardX-4, boardY-4, boardSize+8, boardSize+8, 12); ctx.stroke();

        // 绘制每个拼图块
        for (const piece of this.pieces) {
            const ci = Math.floor(piece.currentIdx / GRID);
            const cj = piece.currentIdx % GRID;
            const dx = boardX + cj * cellSize;
            const dy = boardY + ci * cellSize;

            // 绘制裁剪的图像
            if (puzzleImg && piece.spriteRect) {
                ctx.drawImage(
                    puzzleImg,
                    piece.spriteRect.sx, piece.spriteRect.sy,
                    piece.spriteRect.sw, piece.spriteRect.sh,
                    piece.x, piece.y, cellSize, cellSize
                );
            }

            // 边框
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.strokeRect(piece.x + 0.5, piece.y + 0.5, cellSize - 1, cellSize - 1);

            // 编号
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = `bold ${Math.floor(cellSize * 0.18)}px Arial`;
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText(String(piece.originalIdx + 1), piece.x + 4, piece.y + 4);
            ctx.textBaseline = 'alphabetic';
        }

        // 空格高亮
        const ex = boardX + this.emptyJ * cellSize;
        const ey = boardY + this.emptyI * cellSize;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(ex, ey, cellSize, cellSize);
    }

    drawParticles() {
        for (const p of this.winParticles) p.draw(ctx);
    }

    drawStartScreen() {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, screenWidth, screenHeight);
        const cx = screenWidth / 2, cy = screenHeight / 2;

        ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(255,255,255,0.3)'; ctx.shadowBlur = 15;
        ctx.fillText('🧩 智慧拼图王国', cx, cy - 100);
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '14px Arial';
        const tips = ['滑块拼图：将打乱的拼图块恢复原位', `难度: ${GRID}×${GRID}`, '点击与空格相邻的拼图块进行移动'];
        tips.forEach((tip, i) => {
            ctx.fillText(tip, cx, cy - 40 + i * 28);
        });

        // 按钮
        const btnY = cy + 80;
        ctx.fillStyle = '#4CAF50';
        this.roundRect(cx - 100, btnY, 200, 48, 24); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial';
        ctx.fillText('开始游戏', cx, btnY + 30);
    }

    drawEndScreen() {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, screenWidth, screenHeight);
        const cx = screenWidth / 2, cy = screenHeight / 2;
        const elapsed = (Date.now() - this.startTime) / 1000;
        const min = Math.floor(elapsed / 60), sec = Math.floor(elapsed % 60);

        ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center';
        ctx.fillText('🎉 拼图完成！', cx, cy - 60);
        ctx.font = '18px Arial';
        ctx.fillText(`步数: ${this.moveCount}`, cx, cy - 10);
        ctx.fillText(`时间: ${min}分${sec}秒`, cx, cy + 20);
        ctx.fillStyle = '#ffd700'; ctx.font = '14px Arial';
        ctx.fillText('点击屏幕重新开始', cx, cy + 60);

        // 粒子
        for (const p of this.winParticles) p.draw(ctx);
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
            const btnY = cy + 80;
            if (x >= cx - 100 && x <= cx + 100 && y >= btnY && y <= btnY + 48) return 'start';
        } else if (this.screen === 'end') {
            return 'restart'; // 整屏点击重开
        }
        return null;
    }
}

// ===== 粒子 =====
class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = 100 + Math.random() * 200;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.5; this.maxLife = 1.5;
        this.color = color;
        this.size = 3 + Math.random() * 4;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 300 * dt;
        this.life -= dt;
        return this.life > 0;
    }
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ===== 入口 =====
function init() {
    canvas = wx.createCanvas();
    ctx = canvas.getContext('2d');
    const info = wx.getSystemInfoSync();
    screenWidth = info.windowWidth;
    screenHeight = info.windowHeight;
    const pr = info.pixelRatio || 1;
    canvas.width = screenWidth * pr;
    canvas.height = screenHeight * pr;
    ctx.scale(pr, pr);

    // 加载拼图图片 (需要打包进小游戏)
    puzzleImg = wx.createImage();
    puzzleImg.onload = function() {
        game = new PuzzleGame();
        game.updateStatus('');
        startLoop();
    };
    puzzleImg.onerror = function() {
        // 图片加载失败，用纯色拼图
        game = new PuzzleGame();
        startLoop();
    };
    puzzleImg.src = 'images/puzzle.jpg';

    function startLoop() {
        // 触摸
        wx.onTouchEnd((e) => {
            const t = e.changedTouches[0];
            const btn = game.hitTestButton(t.clientX, t.clientY);
            if (btn === 'start') {
                game.screen = 'playing';
                game.startTime = Date.now();
                game.timerRunning = true;
                game.shuffle();
                game.updateStatus('');
            } else if (btn === 'restart') {
                game.screen = 'start';
                game.moveCount = 0;
                game.shuffle();
                game.startTime = Date.now();
                game.timerRunning = true;
                game.state = State.PLAYING;
            } else if (game.screen === 'playing') {
                game.handleTap(t.clientX, t.clientY);
            }
        });

        // 游戏循环 (全局 requestAnimationFrame, lib 3.x)
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
}

init();
