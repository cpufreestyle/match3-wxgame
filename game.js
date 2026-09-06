// ============================================================
//  智慧拼图王国 - 微信小游戏版 (滑块拼图)
//  纯 Canvas 2D 渲染
// ============================================================

const GRID = 4;
var canvas, ctx;
var screenWidth, screenHeight;
var boardX, boardY, boardSize, cellSize;
var game = null;
var puzzleImg = null;

class Audio {
    constructor() {
        this.ctx = null;
        try { this.ctx = wx.createWebAudioContext(); } catch(e) {}
    }
    play(type) {
        if (!this.ctx) return;
        var now = this.ctx.currentTime;
        if (type === 'move') { this.tone(440, 660, 0.06, 0.1, now); }
        else if (type === 'win') { this.chord([523, 659, 784, 1047], 0.25, now, 0.12); }
    }
    tone(f1, f2, dur, vol, now) {
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(f1, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(f2,1), now + dur);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.start(now); osc.stop(now + dur);
    }
    chord(freqs, dur, now, vol) {
        var self = this;
        freqs.forEach(function(f, i) {
            var osc = self.ctx.createOscillator();
            var gain = self.ctx.createGain();
            osc.connect(gain); gain.connect(self.ctx.destination);
            osc.frequency.setValueAtTime(f, now + i * 0.12);
            gain.gain.setValueAtTime(vol, now + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + dur);
            osc.start(now + i * 0.12); osc.stop(now + i * 0.12 + dur);
        });
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        var angle = Math.random() * Math.PI * 2;
        var speed = 100 + Math.random() * 200;
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
    draw(c) {
        var alpha = this.life / this.maxLife;
        c.save(); c.globalAlpha = alpha;
        c.fillStyle = this.color;
        c.beginPath(); c.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2); c.fill();
        c.restore();
    }
}

var State = { START: 0, PLAYING: 1, ANIMATING: 2, END: 3 };

function PuzzleGame() {
    this.audio = new Audio();
    this.pieces = [];
    this.grid = [];
    this.emptyI = GRID - 1;
    this.emptyJ = GRID - 1;
    this.state = State.START;
    this.moveCount = 0;
    this.startTime = 0;
    this.timerRunning = false;
    this.animPiece = null;
    this.animTargetI = 0;
    this.animTargetJ = 0;
    this.screen = 'start';
    this.winParticles = [];
    this.statusText = '';

    this.calcLayout();
    this.initBoard();
    this.statusText = '点击屏幕开始！';
}

PuzzleGame.prototype.calcLayout = function() {
    var padding = 20;
    boardSize = Math.min(screenWidth - padding * 2, screenHeight - 200 - padding * 2);
    boardX = (screenWidth - boardSize) / 2;
    boardY = 170;
    cellSize = boardSize / GRID;
};

PuzzleGame.prototype.initBoard = function() {
    this.pieces = [];
    this.grid = [];
    for (var i = 0; i < GRID; i++) {
        this.grid[i] = [];
        for (var j = 0; j < GRID; j++) {
            if (i === GRID - 1 && j === GRID - 1) {
                this.grid[i][j] = -1;
                this.emptyI = i; this.emptyJ = j;
            } else {
                var idx = i * GRID + j;
                var sw = 1024 / GRID;
                var sh = 1024 / GRID;
                var sx = j * sw;
                var sy = i * sh;
                var piece = {
                    originalIdx: idx,
                    currentIdx: idx,
                    sx: sx, sy: sy, sw: sw, sh: sh,
                    x: 0, y: 0
                };
                this.pieces.push(piece);
                this.grid[i][j] = idx;
                this.setPiecePos(piece, i, j);
            }
        }
    }
};

PuzzleGame.prototype.setPiecePos = function(piece, i, j) {
    piece.x = boardX + j * cellSize;
    piece.y = boardY + i * cellSize;
};

PuzzleGame.prototype.shuffle = function() {
    for (var n = 0; n < 500; n++) {
        var dirs = [];
        if (this.emptyI > 0) dirs.push([-1, 0]);
        if (this.emptyI < GRID - 1) dirs.push([1, 0]);
        if (this.emptyJ > 0) dirs.push([0, -1]);
        if (this.emptyJ < GRID - 1) dirs.push([0, 1]);
        var d = dirs[Math.floor(Math.random() * dirs.length)];
        var ni = this.emptyI + d[0];
        var nj = this.emptyJ + d[1];
        var pieceIdx = this.grid[ni][nj];
        this.grid[this.emptyI][this.emptyJ] = pieceIdx;
        this.grid[ni][nj] = -1;
        for (var k = 0; k < this.pieces.length; k++) {
            if (this.pieces[k].currentIdx === ni * GRID + nj) {
                this.pieces[k].currentIdx = this.emptyI * GRID + this.emptyJ;
                break;
            }
        }
        this.emptyI = ni; this.emptyJ = nj;
    }
    for (var k2 = 0; k2 < this.pieces.length; k2++) {
        var p = this.pieces[k2];
        var ci = Math.floor(p.currentIdx / GRID);
        var cj = p.currentIdx % GRID;
        this.setPiecePos(p, ci, cj);
    }
    this.audio.play('shuffle');
};

PuzzleGame.prototype.tryMove = function(i, j) {
    var di = Math.abs(i - this.emptyI);
    var dj = Math.abs(j - this.emptyJ);
    if ((di === 1 && dj === 0) || (di === 0 && dj === 1)) {
        var idx = i * GRID + j;
        var piece = null;
        for (var k = 0; k < this.pieces.length; k++) {
            if (this.pieces[k].currentIdx === idx) { piece = this.pieces[k]; break; }
        }
        if (!piece) return;

        this.animPiece = piece;
        this.animTargetI = this.emptyI;
        this.animTargetJ = this.emptyJ;
        this.state = State.ANIMATING;
        this.audio.play('move');

        piece.currentIdx = this.emptyI * GRID + this.emptyJ;
        this.grid[this.emptyI][this.emptyJ] = idx;
        this.grid[i][j] = -1;
        this.emptyI = i; this.emptyJ = j;
        this.moveCount++;
    }
};

PuzzleGame.prototype.checkWin = function() {
    for (var i = 0; i < this.pieces.length; i++) {
        if (this.pieces[i].currentIdx !== this.pieces[i].originalIdx) return false;
    }
    return true;
};

PuzzleGame.prototype.handleTap = function(x, y) {
    if (this.screen !== 'playing') return;
    var col = Math.floor((x - boardX) / cellSize);
    var row = Math.floor((y - boardY) / cellSize);
    if (row >= 0 && row < GRID && col >= 0 && col < GRID) {
        this.tryMove(row, col);
    }
};

PuzzleGame.prototype.update = function(dt) {
    if (this.state === State.ANIMATING && this.animPiece) {
        var tx = boardX + this.animTargetJ * cellSize;
        var ty = boardY + this.animTargetI * cellSize;
        var speed = 14 * dt;
        var dx = tx - this.animPiece.x;
        var dy = ty - this.animPiece.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < speed) {
            this.animPiece.x = tx;
            this.animPiece.y = ty;
            this.state = State.PLAYING;
            if (this.checkWin()) {
                this.state = State.END;
                this.timerRunning = false;
                this.audio.play('win');
                this.statusText = '恭喜通关！';
                this.spawnWinEffect();
            }
        } else {
            this.animPiece.x += (dx / dist) * speed;
            this.animPiece.y += (dy / dist) * speed;
        }
    }
    this.winParticles = this.winParticles.filter(function(p) { return p.update(dt); });
};

PuzzleGame.prototype.spawnWinEffect = function() {
    var cx = boardX + boardSize / 2;
    var cy = boardY + boardSize / 2;
    var colors = ['#ffd700', '#00d2ff', '#ff6b6b'];
    for (var i = 0; i < 80; i++) {
        this.winParticles.push(new Particle(cx, cy, colors[i % 3]));
    }
};

PuzzleGame.prototype.render = function() {
    ctx.clearRect(0, 0, screenWidth, screenHeight);
    this.drawBg();
    if (this.screen === 'start') { this.drawStart(); return; }
    this.drawHUD();
    this.drawBoard();
    for (var i = 0; i < this.winParticles.length; i++) this.winParticles[i].draw(ctx);
    if (this.screen === 'end') this.drawEnd();
};

PuzzleGame.prototype.drawBg = function() {
    var g = ctx.createLinearGradient(0, 0, screenWidth, screenHeight);
    g.addColorStop(0, '#1a0a2e'); g.addColorStop(0.5, '#16213e'); g.addColorStop(1, '#0f3460');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
};

PuzzleGame.prototype.drawHUD = function() {
    var elapsed = this.timerRunning ? (Date.now() - this.startTime) / 1000 : 0;
    var mm = Math.floor(elapsed / 60);
    var ss = Math.floor(elapsed % 60);
    var timeStr = this.timerRunning ? (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss : '00:00';

    var itemW = (screenWidth - 48) / 3;
    var items = [
        { label: '步数', value: '' + this.moveCount },
        { label: '时间', value: timeStr },
        { label: '难度', value: GRID + '×' + GRID }
    ];
    for (var i = 0; i < items.length; i++) {
        var x = 16 + i * (itemW + 8);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        this.rr(x, 20, itemW, 56, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
        this.rr(x, 20, itemW, 56, 12); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '12px Arial'; ctx.textAlign = 'center';
        ctx.fillText(items[i].label, x + itemW / 2, 40);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 24px Arial';
        ctx.fillText(items[i].value, x + itemW / 2, 66);
    }

    if (this.statusText) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '14px Arial'; ctx.textAlign = 'center';
        ctx.fillText(this.statusText, screenWidth / 2, 100);
    }
};

PuzzleGame.prototype.drawBoard = function() {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.rr(boardX - 4, boardY - 4, boardSize + 8, boardSize + 8, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2;
    this.rr(boardX - 4, boardY - 4, boardSize + 8, boardSize + 8, 12); ctx.stroke();

    for (var i = 0; i < this.pieces.length; i++) {
        var p = this.pieces[i];
        var ci = Math.floor(p.currentIdx / GRID);
        var cj = p.currentIdx % GRID;
        var dx = boardX + cj * cellSize;
        var dy = boardY + ci * cellSize;

        if (puzzleImg && puzzleImg.width > 0) {
            ctx.drawImage(puzzleImg, p.sx, p.sy, p.sw, p.sh, p.x, p.y, cellSize, cellSize);
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, cellSize - 1, cellSize - 1);

        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = 'bold ' + Math.floor(cellSize * 0.18) + 'px Arial';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText('' + (p.originalIdx + 1), p.x + 4, p.y + 4);
        ctx.textBaseline = 'alphabetic';
    }

    var ex = boardX + this.emptyJ * cellSize;
    var ey = boardY + this.emptyI * cellSize;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(ex, ey, cellSize, cellSize);
};

PuzzleGame.prototype.drawStart = function() {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    var cx = screenWidth / 2, cy = screenHeight / 2;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255,255,255,0.3)'; ctx.shadowBlur = 15;
    ctx.fillText('🧩 智慧拼图王国', cx, cy - 100);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '14px Arial';
    var tips = ['滑块拼图：将打乱的拼图块恢复原位', '难度: ' + GRID + '×' + GRID, '点击与空格相邻的拼图块进行移动'];
    for (var i = 0; i < tips.length; i++) {
        ctx.fillText(tips[i], cx, cy - 40 + i * 28);
    }
    var btnY = cy + 80;
    ctx.fillStyle = '#4CAF50';
    this.rr(cx - 100, btnY, 200, 48, 24); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial';
    ctx.fillText('开始游戏', cx, btnY + 30);
};

PuzzleGame.prototype.drawEnd = function() {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    var cx = screenWidth / 2, cy = screenHeight / 2;
    var elapsed = (Date.now() - this.startTime) / 1000;
    var mm = Math.floor(elapsed / 60), ss = Math.floor(elapsed % 60);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 32px Arial'; ctx.textAlign = 'center';
    ctx.fillText('🎉 拼图完成！', cx, cy - 60);
    ctx.font = '18px Arial';
    ctx.fillText('步数: ' + this.moveCount, cx, cy - 10);
    ctx.fillText('时间: ' + mm + '分' + ss + '秒', cx, cy + 20);
    ctx.fillStyle = '#ffd700'; ctx.font = '14px Arial';
    ctx.fillText('点击屏幕重新开始', cx, cy + 60);
    for (var i = 0; i < this.winParticles.length; i++) this.winParticles[i].draw(ctx);
};

PuzzleGame.prototype.rr = function(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
};

PuzzleGame.prototype.hitBtn = function(x, y) {
    var cx = screenWidth / 2, cy = screenHeight / 2;
    if (this.screen === 'start') {
        var btnY = cy + 80;
        if (x >= cx - 100 && x <= cx + 100 && y >= btnY && y <= btnY + 48) return 'start';
    } else if (this.screen === 'end') {
        return 'restart';
    }
    return null;
};

// ===== 入口 =====
var canvas, ctx, screenWidth, screenHeight, boardX, boardY, boardSize, cellSize;
var game = null, puzzleImg = null;

function init() {
    canvas = wx.createCanvas();
    ctx = canvas.getContext('2d');
    var info = wx.getSystemInfoSync();
    screenWidth = info.windowWidth;
    screenHeight = info.windowHeight;
    var pr = info.pixelRatio || 1;
    canvas.width = screenWidth * pr;
    canvas.height = screenHeight * pr;
    ctx.scale(pr, pr);

    puzzleImg = wx.createImage();
    puzzleImg.onload = function() {
        game = new PuzzleGame();
        startLoop();
    };
    puzzleImg.onerror = function() {
        game = new PuzzleGame();
        startLoop();
    };
    puzzleImg.src = 'images/puzzle.jpg';
}

function startLoop() {
    wx.onTouchEnd(function(e) {
        var t = e.changedTouches[0];
        var btn = game.hitBtn(t.clientX, t.clientY);
        if (btn === 'start') {
            game.screen = 'playing';
            game.startTime = Date.now();
            game.timerRunning = true;
            game.shuffle();
            game.statusText = '';
        } else if (btn === 'restart') {
            game.screen = 'start';
            game.moveCount = 0;
            game.state = State.START;
        } else if (game.screen === 'playing') {
            game.handleTap(t.clientX, t.clientY);
        }
    });

    var lastTime = Date.now();
    function loop() {
        var now = Date.now();
        var dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        game.update(dt);
        game.render();
        requestAnimationFrame(loop);
    }
    loop();
}

init();
