# 模块：`native/desktop-embed.js` — Windows 桌面嵌入引擎

> **职责**：通过 koffi 调用 Win32 API (`user32.dll`)，把 Electron 窗口作为子窗口塞进桌面壁纸所在的 `WorkerW`，实现「在桌面图标下方」显示。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 文件 | `native/desktop-embed.js`（341 行） |
| 进程 | Electron 主进程 |
| 依赖 | `koffi`（FFI 调用 `user32.dll`） |
| 暴露 | CommonJS `module.exports` |
| 平台 | **仅 Windows**（依赖 Progman / WorkerW） |

---

## 二、什么是 WorkerW

Windows 桌面的层次（自下而上）：

```
┌─────────────────────────────────────┐
│ 应用窗口（普通 z-order）            │  ← 你打开的浏览器、IDE
├─────────────────────────────────────┤
│ WorkerW（图标层）                  │  ← 桌面图标在这里
│   └─ SHELLDLL_DefView (图标 view)
├─────────────────────────────────────┤
│ WorkerW（壁纸层）                  │  ← 另一个 WorkerW，壁纸渲染在这里
├─────────────────────────────────────┤
│ Progman（Program Manager 窗口）    │  ← 桌面「总」窗口
└─────────────────────────────────────┘
```

「桌面嵌入」= 把我们的窗口 `SetParent` 到壁纸所在的 WorkerW。这样窗口就在桌面图标**下方**，壁纸**上方**（实际上是壁纸**下面**、图标**更下面**），所以图标和壁纸都能看到，但比所有正常应用窗口都低。

---

## 三、koffi 类型声明

```js
const koffi = require('koffi');

const HWND     = koffi.types.uint64;   // 64-bit 句柄
const BOOL     = koffi.types.int;
const DWORD    = koffi.types.uint;
const UINT     = koffi.types.uint;
const LONG     = koffi.types.long;
const BYTE     = koffi.types.uchar;
const LRESULT  = koffi.types.long;
const WPARAM   = koffi.types.uint64;
const LPARAM   = koffi.types.int64;
```

Win64 上 `HWND` 是 64-bit，用 `uint64`（不是 `pointer`，因为 koffi 2.x 对指针支持有限）。

---

## 四、Win32 函数声明

```js
const user32 = koffi.load('user32.dll');

const FindWindowW             = user32.func('FindWindowW',             HWND,    ['string', 'string']);
const FindWindowExW           = user32.func('FindWindowExW',           HWND,    [HWND, HWND, 'string', 'string']);
const SendMessageTimeoutW     = user32.func('SendMessageTimeoutW',     LRESULT, [HWND, UINT, WPARAM, LPARAM, UINT, UINT, HWND]);
const SetParent               = user32.func('SetParent',               HWND,    [HWND, HWND]);
const SetWindowLongW          = user32.func('SetWindowLongW',          LONG,    [HWND, 'int', LONG]);
const GetWindowLongW          = user32.func('GetWindowLongW',          LONG,    [HWND, 'int']);
const SetWindowPos            = user32.func('SetWindowPos',            BOOL,    [HWND, HWND, 'int', 'int', 'int', 'int', UINT]);
const SetLayeredWindowAttributes = user32.func('SetLayeredWindowAttributes', BOOL, [HWND, 'uint', BYTE, DWORD]);
const GetWindowThreadProcessId = user32.func('GetWindowThreadProcessId', DWORD,   [HWND, HWND]);
```

⚠️ 注释提到 koffi 2.x 的回调支持有限，所以**没有**用 `EnumWindows`（需要回调），改用 `FindWindowExW` 链式遍历。

---

## 五、常量定义

```js
const GWL_STYLE   = -16;
const GWL_EXSTYLE = -20;

const WS_EX_LAYERED     = 0x00080000;  // 分层窗口（支持 alpha）
const WS_EX_TRANSPARENT = 0x00000020;  // 鼠标穿透
const WS_EX_TOOLWINDOW  = 0x00000080;
const WS_EX_NOACTIVATE  = 0x08000000;
const WS_CHILD          = 0x40000000;
const WS_POPUP          = 0x80000000;
const WS_VISIBLE        = 0x10000000;

const HWND_BOTTOM       = 1;
const SWP_NOSIZE        = 0x0001;
const SWP_NOMOVE        = 0x0002;
const SWP_NOACTIVATE    = 0x0010;
const SWP_SHOWWINDOW    = 0x0040;
const SWP_NOOWNERZORDER = 0x0200;
const SWP_ASYNCWINDOWPOS= 0x4000;

const SMTO_NORMAL       = 0x0000;
const SMTO_ABORTIFHUNG  = 0x0002;
const WM_SPAWN_WORKERW  = 0x052C;       // 创建 WorkerW 的非公开消息
const TIMEOUT_MS        = 3000;
const LWA_ALPHA         = 0x00000002;
```

`0x052C` 是 Windows 未公开但广为人知的「让 Progman 创建 WorkerW」消息。

---

## 六、核心流程

### 5 步嵌入（`embedInDesktop`）

```js
function embedInDesktop(win) {
    const hwnd = getWindowHandle(win);
    const workerW = findWorkerW();
    if (workerW) {
        // 1. SetParent(我们的窗口, WorkerW)
        SetParent(hwnd, workerW);

        // 2. 改 style 为 WS_CHILD | WS_VISIBLE
        const currentStyle = GetWindowLongW(hwnd, GWL_STYLE);
        SetWindowLongW(hwnd, GWL_STYLE, currentStyle | WS_CHILD | WS_VISIBLE);

        // 3. 加 WS_EX_LAYERED（不加 WS_EX_TRANSPARENT，否则无法点击）
        const currentExStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
        SetWindowLongW(hwnd, GWL_EXSTYLE, currentExStyle | WS_EX_LAYERED);

        // 4. 置底
        SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0,
            SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_ASYNCWINDOWPOS);

        return true;
    } else {
        // 降级
        SetWindowLongW(hwnd, GWL_EXSTYLE, currentExStyle | WS_EX_LAYERED);
        SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, ...);
        return false;
    }
}
```

### `findWorkerW()` — 找壁纸 WorkerW

```js
function findWorkerW() {
    // 1. 找 Progman
    const progman = FindWindowW('Progman', null);
    if (!progman) return null;

    // 2. 发 0x052C 触发创建 WorkerW
    SendMessageTimeoutW(progman, WM_SPAWN_WORKERW, 0, 0, SMTO_NORMAL, TIMEOUT_MS, 0);

    // 3. 找 Progman 的 WorkerW 子窗口
    let workerW = FindWindowExW(progman, 0, 'WorkerW', null);

    // 4. 验证包含 SHELLDLL_DefView（图层 view）
    if (workerW) {
        const shellView = FindWindowExW(workerW, 0, 'SHELLDLL_DefView', null);
        if (shellView) return workerW;     // ← 找到的是「图标层」，不是「壁纸层」！
    }

    // 5. 备用：找顶层 WorkerW
    workerW = FindWindowExW(0, 0, 'WorkerW', null);
    if (workerW) return workerW;

    return null;
}
```

⚠️ **已知简化**：第 3 步找到的其实是「包含图标的 WorkerW」。在多显示器/某些 Windows 版本上可能定位到错误的层。理想做法是用 `EnumChildWindows` 枚举所有 WorkerW 并找**不**含 `SHELLDLL_DefView` 的那个（即壁纸层），但 koffi 2.x 不支持回调。

### `getWindowHandle(win)`

```js
function getWindowHandle(win) {
    const hwndBuffer = win.getNativeWindowHandle();
    if (process.arch === 'x64') {
        const val = hwndBuffer.readBigUInt64LE(0);
        return Number(val);   // 转 Number 兼容 koffi uint64
    }
    return hwndBuffer.readUInt32LE(0);
}
```

`getNativeWindowHandle()` 返回 `Buffer`，需要按位读 64-bit（x64）或 32-bit（ia32）。

---

## 七、其他公开方法

### `setWindowAlpha(win, alpha)`

```js
function setWindowAlpha(win, alpha) {
    const hwnd = getWindowHandle(win);
    const currentExStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
    if (!(currentExStyle & WS_EX_LAYERED)) {
        SetWindowLongW(hwnd, GWL_EXSTYLE, currentExStyle | WS_EX_LAYERED);
    }
    SetLayeredWindowAttributes(hwnd, 0, Math.round(alpha), LWA_ALPHA);
}
```

`alpha` 0~255。`main.js` 调用时传 `240`（94% 不透明）。

### `setClickThrough(win, enabled)`

```js
function setClickThrough(win, enabled) {
    const hwnd = getWindowHandle(win);
    const currentExStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
    if (enabled) {
        SetWindowLongW(hwnd, GWL_EXSTYLE, currentExStyle | WS_EX_TRANSPARENT);
    } else {
        SetWindowLongW(hwnd, GWL_EXSTYLE, currentExStyle & ~WS_EX_TRANSPARENT);
    }
}
```

切 `WS_EX_TRANSPARENT` 标志。开启时鼠标事件穿透窗口。

### `moveToBottom(win)`

```js
function moveToBottom(win) {
    const hwnd = getWindowHandle(win);
    SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0,
        SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
}
```

`main.js` 在 `mainWindow.on('blur')` 时调用，防止被其他窗口覆盖。

---

## 八、调用方

```js
// main.js
if (desktopEmbed) {
    const embedded = desktopEmbed.embedInDesktop(mainWindow);
    if (!embedded) desktopEmbed.moveToBottom(mainWindow);
    desktopEmbed.setWindowAlpha(mainWindow, 240);
}
```

---

## 九、兼容性

| Windows 版本 | 状态 |
|------------|------|
| Win 10 | ✅ 正常 |
| Win 11 | ✅ 正常（验证） |
| 多显示器 | ⚠️ 只能嵌入主显示器 |
| 缩放 > 100% | ⚠️ 窗口位置需要 DPI 换算（当前未处理） |
| 远程桌面 | ❌ 嵌入会失效 |
| macOS / Linux | ❌ 模块加载失败，降级为置底 |

---

## 十、调试

开启 DevTools（`npm run dev`）+ 在 `main.js` 加 `console.log`，koffi 错误会冒泡到主进程 stdout。

如果 `koffi` 报错 ABI 不匹配：

```bash
npm run rebuild    # electron-rebuild -f -w koffi
```

---

## 十一、扩展指南

### 嵌入到壁纸层（更精确）

不靠 `FindWindowExW(progman, ...)`，而是用 PowerShell 调用 `EnumWindows` 找到所有 `WorkerW`：

```js
// 思路：用 child_process.spawn 调 powershell
const { execSync } = require('child_process');
const psScript = `
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class W {
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    }
"@
    [W]::EnumWindows({ param($h, $l)
        $sb = New-Object System.Text.StringBuilder 256
        [W]::GetClassName($h, $sb, 256) | Out-Null
        if ($sb.ToString() -eq 'WorkerW') { Write-Output $h.ToInt64() }
    }, [IntPtr]::Zero)
`;
const out = execSync(`powershell -Command "${psScript}"`, { encoding: 'utf-8' });
const handles = out.trim().split('\n').map(s => BigInt(s.trim()));
```

然后遍历 `handles`，找**不**含 `SHELLDLL_DefView` 的那个。

### 让窗口可拖动

当前窗口的标题栏 `-webkit-app-region: drag` 仅在主窗口工作，嵌入到 WorkerW 后可能失效。可在主进程监听 `WM_NCLBUTTONDOWN` 手动触发 `DragWindow`。

### 多 WorkerW 场景

Win10 1903+ 有「多个 WorkerW」的设计，需要枚举所有 WorkerW 并挑合适的。
