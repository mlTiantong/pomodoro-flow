/**
 * global-key-monitor.js — Windows 全局按键计数
 *
 * 使用 GetAsyncKeyState 轮询按键按下边沿，不读取文本内容。
 * 只输出标准化 key label，用于计数和键盘花园成长。
 */

const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const GetAsyncKeyState = user32.func('GetAsyncKeyState', 'short', ['int']);

const POLL_MS = 24;

const VK_MAP = new Map([
    [0x08, 'Backspace'],
    [0x09, 'Tab'],
    [0x0D, 'Enter'],
    [0x20, 'Space'],
    [0xBA, ';'],
    [0xBB, '='],
    [0xBC, ','],
    [0xBD, '-'],
    [0xBE, '.'],
    [0xBF, '/'],
    [0xC0, '`'],
    [0xDB, '['],
    [0xDC, '\\'],
    [0xDD, ']'],
    [0xDE, "'"]
]);

for (let code = 0x30; code <= 0x39; code++) {
    VK_MAP.set(code, String.fromCharCode(code));
}

for (let code = 0x41; code <= 0x5A; code++) {
    VK_MAP.set(code, String.fromCharCode(code));
}

for (let code = 0x60; code <= 0x69; code++) {
    VK_MAP.set(code, String(code - 0x60));
}

let interval = null;
let pressed = new Set();

function start(onKeyPress) {
    if (interval) return true;
    if (typeof onKeyPress !== 'function') return false;

    pressed = getPressedKeys();

    interval = setInterval(() => {
        for (const [vk, key] of VK_MAP) {
            const isDown = (GetAsyncKeyState(vk) & 0x8000) !== 0;
            if (isDown && !pressed.has(vk)) {
                pressed.add(vk);
                try {
                    onKeyPress(key);
                } catch (err) {
                    console.warn('[GlobalKeyMonitor] 按键事件处理失败:', err.message);
                }
            } else if (!isDown && pressed.has(vk)) {
                pressed.delete(vk);
            }
        }
    }, POLL_MS);

    interval.unref?.();
    return true;
}

function stop() {
    if (!interval) return;
    clearInterval(interval);
    interval = null;
    pressed = new Set();
}

function getPressedKeys() {
    const keys = new Set();
    for (const vk of VK_MAP.keys()) {
        if ((GetAsyncKeyState(vk) & 0x8000) !== 0) {
            keys.add(vk);
        }
    }
    return keys;
}

module.exports = {
    start,
    stop
};
