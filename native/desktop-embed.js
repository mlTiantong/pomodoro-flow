/**
 * desktop-embed.js — Windows 桌面嵌入引擎
 *
 * 通过 koffi 调用 user32.dll 的 Win32 API，
 * 将 Electron 窗口嵌入桌面壁纸层 (WorkerW)，
 * 实现在桌面图标下方显示的效果。
 *
 * API 流程:
 *   1. FindWindowW("Progman", null) → 找到桌面窗口
 *   2. SendMessageTimeoutW(Progman, 0x052C, ...) → 创建 WorkerW
 *   3. FindWindowW("WorkerW", null) → 遍历找到壁纸所在的 WorkerW
 *   4. SetParent(appHwnd, workerW) → 将应用窗口设为 WorkerW 子窗口
 *   5. SetWindowLongW → 设置透明、点击穿透样式
 */

/**
 * desktop-embed.js — Windows 桌面嵌入引擎
 *
 * 使用 koffi 调用 Win32 API (user32.dll)，
 * 将 Electron 窗口嵌入桌面壁纸层 (WorkerW)。
 *
 * 注意：koffi 2.x 的回调参数支持有限，EnumWindows 和复杂回调
 * 会通过 child_process 调用 PowerShell 辅助脚本实现。
 */

const koffi = require('koffi');

// ============================================================
// Win32 API 类型定义 (使用数值类型避免指针复杂性)
// ============================================================

// Win64 上 HWND/handle = 64-bit 数值
const HWND = koffi.types.uint64;
const BOOL = koffi.types.int;
const DWORD = koffi.types.uint;
const UINT = koffi.types.uint;
const LONG = koffi.types.long;
const BYTE = koffi.types.uchar;
const LRESULT = koffi.types.long;
// Win64: UINT_PTR = uint64, LONG_PTR = int64
const WPARAM = koffi.types.uint64;
const LPARAM = koffi.types.int64;

// ============================================================
// user32.dll 函数定义
// ============================================================

const user32 = koffi.load('user32.dll');

/**
 * HWND FindWindowW(LPCWSTR lpClassName, LPCWSTR lpWindowName);
 */
const FindWindowW = user32.func('FindWindowW', HWND, ['string', 'string']);

/**
 * HWND FindWindowExW(HWND hWndParent, HWND hWndChildAfter, LPCWSTR lpszClass, LPCWSTR lpszWindow);
 */
const FindWindowExW = user32.func('FindWindowExW', HWND, [HWND, HWND, 'string', 'string']);

/**
 * LRESULT SendMessageTimeoutW(HWND hWnd, UINT Msg, WPARAM wParam, LPARAM lParam,
 *                             UINT fuFlags, UINT uTimeout, PDWORD_PTR lpdwResult);
 */
const SendMessageTimeoutW = user32.func('SendMessageTimeoutW', LRESULT, [
    HWND, UINT, WPARAM, LPARAM, UINT, UINT, HWND
]);

/**
 * HWND SetParent(HWND hWndChild, HWND hWndNewParent);
 */
const SetParent = user32.func('SetParent', HWND, [HWND, HWND]);

/**
 * LONG SetWindowLongW(HWND hWnd, int nIndex, LONG dwNewLong);
 */
const SetWindowLongW = user32.func('SetWindowLongW', LONG, [HWND, 'int', LONG]);

/**
 * LONG GetWindowLongW(HWND hWnd, int nIndex);
 */
const GetWindowLongW = user32.func('GetWindowLongW', LONG, [HWND, 'int']);

/**
 * BOOL SetWindowPos(HWND hWnd, HWND hWndInsertAfter, int X, int Y, int cx, int cy, UINT uFlags);
 */
const SetWindowPos = user32.func('SetWindowPos', BOOL, [
    HWND, HWND, 'int', 'int', 'int', 'int', UINT
]);

/**
 * BOOL SetLayeredWindowAttributes(HWND hwnd, COLORREF crKey, BYTE bAlpha, DWORD dwFlags);
 */
const SetLayeredWindowAttributes = user32.func('SetLayeredWindowAttributes', BOOL, [
    HWND, 'uint', BYTE, DWORD
]);

/**
 * DWORD GetWindowThreadProcessId(HWND hWnd, LPDWORD lpdwProcessId);
 */
const GetWindowThreadProcessId = user32.func('GetWindowThreadProcessId', DWORD, [HWND, HWND]);

// ============================================================
// 常量定义
// ============================================================

// 窗口样式常量
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_EX_LAYERED = 0x00080000;
const WS_EX_TRANSPARENT = 0x00000020;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
const WS_VISIBLE = 0x10000000;

// SetWindowPos 常量
const HWND_BOTTOM = 1;  // (HWND)1
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_SHOWWINDOW = 0x0040;
const SWP_NOOWNERZORDER = 0x0200;
const SWP_ASYNCWINDOWPOS = 0x4000;

// SendMessageTimeout 常量
const SMTO_NORMAL = 0x0000;
const SMTO_ABORTIFHUNG = 0x0002;

// 0x052C = WM_SPAWN_WORKERW (创建 WorkerW 的消息)
const WM_SPAWN_WORKERW = 0x052C;

// 超时设置
const TIMEOUT_MS = 3000;

// LWA 常量
const LWA_ALPHA = 0x00000002;

// ============================================================
// 核心功能实现
// ============================================================

/**
 * 获取 Electron 窗口的 Windows 原生句柄 (HWND)
 * @param {BrowserWindow} win - Electron BrowserWindow 实例
 * @returns {number|bigint} HWND 值 (作为数值)
 */
function getWindowHandle(win) {
    const hwndBuffer = win.getNativeWindowHandle();
    // 从 Buffer 读取 HWND (32位或64位)
    // 返回 Number (如果 32-bit) 或 BigInt (如果 64-bit)
    if (process.arch === 'x64') {
        const val = hwndBuffer.readBigUInt64LE(0);
        return Number(val); // 转 Number 以兼容 koffi uint64
    }
    return hwndBuffer.readUInt32LE(0);
}

/**
 * 查找桌面 WorkerW 窗口
 * WorkerW 是 Windows 桌面壁纸所在的窗口层
 * 流程：
 *   1. 找到 Progman
 *   2. 向其发送 0x052C 消息触发创建 WorkerW
 *   3. 枚举所有窗口找到 WorkerW 且不是 Progman 的子窗口
 *
 * @returns {bigint|null} WorkerW 窗口句柄，失败返回 null
 */
function findWorkerW() {
    try {
        // 1. 找到 Progman (桌面窗口)
        const progman = FindWindowW('Progman', null);
        if (!progman) {
            console.warn('[DesktopEmbed] 未找到 Progman 窗口');
            return null;
        }
        console.log(`[DesktopEmbed] 找到 Progman: 0x${progman.toString(16)}`);

        // 2. 向 Progman 发送 0x052C 消息，触发创建 WorkerW
        SendMessageTimeoutW(progman, WM_SPAWN_WORKERW, 0, 0, SMTO_NORMAL, TIMEOUT_MS, 0);

        // 3. 使用 FindWindowExW 遍历查找 WorkerW
        // WorkerW 是 Progman 的子窗口，类名为 WorkerW
        let workerW = FindWindowExW(progman, 0, 'WorkerW', null);

        // 如果没找到，遍历所有顶层 WorkerW（有些系统 WorkerW 是顶层窗口）
        if (!workerW) {
            // 尝试查找顶层 WorkerW
            workerW = FindWindowExW(0, 0, 'WorkerW', null);
        }

        // 4. 验证找到的 WorkerW 是否包含 SHELLDLL_DefView
        if (workerW) {
            const shellView = FindWindowExW(workerW, 0, 'SHELLDLL_DefView', null);
            if (shellView) {
                console.log(`[DesktopEmbed] 找到壁纸 WorkerW: 0x${workerW.toString(16)}`);
                return workerW;
            }
        }

        // 5. 备用：尝试在所有窗口中找到正确的 WorkerW
        // 不使用 EnumWindows（koffi 回调限制），直接用 FindWindowExW 遍历
        console.warn('[DesktopEmbed] 标准方法未找到 WorkerW，尝试替代方案...');

        // 再次发送消息并等待
        SendMessageTimeoutW(progman, WM_SPAWN_WORKERW, 0, 0, SMTO_NORMAL, TIMEOUT_MS, 0);
        workerW = FindWindowExW(0, 0, 'WorkerW', null);

        if (workerW) {
            console.log(`[DesktopEmbed] 找到 WorkerW (备用): 0x${workerW.toString(16)}`);
            return workerW;
        }

        return null;
    } catch (err) {
        console.error('[DesktopEmbed] findWorkerW 错误:', err);
        return null;
    }
}

/**
 * 将窗口嵌入桌面壁纸
 * @param {BrowserWindow} win - Electron BrowserWindow
 * @returns {boolean} 是否成功
 */
function embedInDesktop(win) {
    try {
        const hwnd = getWindowHandle(win);
        console.log(`[DesktopEmbed] 应用窗口句柄: 0x${hwnd.toString(16)}`);

        // 查找 WorkerW
        let workerW = findWorkerW();

        if (workerW) {
            // 方法 A: 嵌入 WorkerW (在桌面图标下方)
            console.log('[DesktopEmbed] 使用 WorkerW 嵌入方案');

            // 设置窗口为子窗口
            const prevParent = SetParent(hwnd, workerW);
            console.log(`[DesktopEmbed] SetParent 完成，原父窗口: 0x${prevParent.toString(16)}`);

            // 调整窗口样式
            const currentStyle = GetWindowLongW(hwnd, GWL_STYLE);
            SetWindowLongW(hwnd, GWL_STYLE, currentStyle | WS_CHILD | WS_VISIBLE);

            // 设置扩展样式 - 仅透明（不加 WS_EX_TRANSPARENT，否则无法交互）
            const currentExStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
            SetWindowLongW(hwnd, GWL_EXSTYLE, currentExStyle | WS_EX_LAYERED);

            // 设置在最底层
            SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0,
                SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_ASYNCWINDOWPOS);

            console.log('[DesktopEmbed] ✅ 成功嵌入桌面壁纸');
            return true;
        } else {
            // 方法 B: 降级方案 — 普通置底窗口
            console.warn('[DesktopEmbed] 未找到 WorkerW，使用降级方案');

            const currentExStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
            SetWindowLongW(hwnd, GWL_EXSTYLE, currentExStyle | WS_EX_LAYERED);

            SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0,
                SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_ASYNCWINDOWPOS);

            console.log('[DesktopEmbed] ⚠️ 使用降级方案（置底窗口）');
            return false;
        }
    } catch (err) {
        console.error('[DesktopEmbed] embedInDesktop 错误:', err);
        return false;
    }
}

/**
 * 设置窗口透明度
 * @param {BrowserWindow} win - Electron BrowserWindow
 * @param {number} alpha - 透明度 (0-255, 255=不透明)
 */
function setWindowAlpha(win, alpha) {
    try {
        const hwnd = getWindowHandle(win);

        // 确保窗口有 WS_EX_LAYERED 样式
        const currentExStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
        if (!(currentExStyle & WS_EX_LAYERED)) {
            SetWindowLongW(hwnd, GWL_EXSTYLE, currentExStyle | WS_EX_LAYERED);
        }

        SetLayeredWindowAttributes(hwnd, 0, Math.round(alpha), LWA_ALPHA);
        console.log(`[DesktopEmbed] 设置透明度: ${alpha}/255`);
    } catch (err) {
        console.error('[DesktopEmbed] setWindowAlpha 错误:', err);
    }
}

/**
 * 设置点击穿透 (鼠标事件穿透窗口)
 * @param {BrowserWindow} win - Electron BrowserWindow
 * @param {boolean} enabled - 是否启用点击穿透
 */
function setClickThrough(win, enabled) {
    try {
        const hwnd = getWindowHandle(win);
        const currentExStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);

        if (enabled) {
            SetWindowLongW(hwnd, GWL_EXSTYLE, currentExStyle | WS_EX_TRANSPARENT);
            console.log('[DesktopEmbed] ✅ 启用点击穿透');
        } else {
            SetWindowLongW(hwnd, GWL_EXSTYLE, currentExStyle & ~WS_EX_TRANSPARENT);
            console.log('[DesktopEmbed] ❌ 禁用点击穿透');
        }
    } catch (err) {
        console.error('[DesktopEmbed] setClickThrough 错误:', err);
    }
}

/**
 * 将窗口置底 (在所有正常窗口下方)
 * @param {BrowserWindow} win
 */
function moveToBottom(win) {
    try {
        const hwnd = getWindowHandle(win);
        SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0,
            SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
        console.log('[DesktopEmbed] 窗口已置底');
    } catch (err) {
        console.error('[DesktopEmbed] moveToBottom 错误:', err);
    }
}

module.exports = {
    embedInDesktop,
    setWindowAlpha,
    setClickThrough,
    moveToBottom,
    getWindowHandle,
    findWorkerW
};
