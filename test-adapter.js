// ===== 本地测试适配器 =====
// 在浏览器中模拟微信小游戏API
// 用法: 先引入此文件,再引入game.js

// 模拟 wx API
const wx = {
    _canvas: null,
    _raf: null,
    _touchStart: null,
    _touchEnd: null,

    createCanvas() {
        this._canvas = document.createElement('canvas');
        return this._canvas;
    },
    createWebAudioContext() {
        return new (window.AudioContext || window.webkitAudioContext)();
    },
    getSystemInfoSync() {
        return {
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            pixelRatio: window.devicePixelRatio || 1
        };
    },
    onTouchStart(cb) { this._touchStart = cb; },
    onTouchEnd(cb) { this._touchEnd = cb; }
};

// 让 canvas 接入 requestAnimationFrame
HTMLCanvasElement.prototype.requestAnimationFrame = function(cb) {
    return window.requestAnimationFrame(cb);
};

// 启动游戏
window.addEventListener('load', () => {
    // 把canvas挂到body
    const c = wx._canvas;
    c.style.display = 'block';
    c.style.touchAction = 'none';
    document.body.appendChild(c);
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#000';

    // 触摸映射
    let startX, startY, startTime;
    c.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY; startTime = Date.now();
        if (wx._touchStart) wx._touchStart({ touches: [{ clientX: t.clientX, clientY: t.clientY }] });
    });
    c.addEventListener('touchend', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        if (wx._touchEnd) wx._touchEnd({ changedTouches: [{ clientX: t.clientX, clientY: t.clientY }] });
    });
    // 鼠标映射
    c.addEventListener('mousedown', (e) => {
        startX = e.clientX; startY = e.clientY; startTime = Date.now();
        if (wx._touchStart) wx._touchStart({ touches: [{ clientX: e.clientX, clientY: e.clientY }] });
    });
    c.addEventListener('mouseup', (e) => {
        if (wx._touchEnd) wx._touchEnd({ changedTouches: [{ clientX: e.clientX, clientY: e.clientY }] });
    });
});
