# IPC 协议文档

> **作用域**：主进程 `main.js` ↔ 渲染进程（`src/index.html`、`src/month-view.html`）之间所有 IPC 通道。

---

## 一、通信架构

```
┌────────────────────┐                   ┌────────────────────┐
│ 主窗口             │                   │ 主进程             │
│ (src/index.html)   │                   │ (main.js)          │
│                    │  ipcRenderer.send │                    │
│ window.electronAPI │ ─────────────────►│ ipcMain.on         │
│   .foo()           │                   │  .on('foo', ...)   │
│                    │                   │                    │
│                    │  ipcRenderer.     │                    │
│                    │  invoke           │                    │
│                    │ ─────────────────►│ ipcMain.handle     │
│                    │ ◄─────────────────│  .handle('foo',...)│
└────────────────────┘                   └────────────────────┘

┌────────────────────┐
│ 月视图窗口         │
│ (src/month-view.   │
│  html)             │  (同上)
│                    │
└────────────────────┘
```

- **单向**（fire-and-forget）：用 `ipcRenderer.send` + `ipcMain.on`
- **双向**（带返回值）：用 `ipcRenderer.invoke` + `ipcMain.handle`

本项目 **13 个 R→M 通道中 3 个用 invoke**（`get-window-info` / `is-global-keyboard-tracking-available` / `claim-key-receiver`），其余 10 个是 send。

---

## 二、通道清单

| 通道 | 方向 | 类型 | Payload | 返回 | 触发方 |
|------|------|------|---------|------|--------|
| `toggle-click-through` | R → M | send | `boolean` | — | 渲染 |
| `re-embed` | R → M | send | — | — | 渲染 |
| `get-window-info` | R → M | invoke | — | `WindowInfo` | 渲染 |
| `set-window-pos` | R → M | send | `(x: number, y: number)` | — | 渲染 |
| `set-window-size` | R → M | send | `(w: number, h: number)` | — | 渲染 |
| `set-always-on-top` | R → M | send | `boolean` | — | 渲染 |
| `open-month-view` | R → M | send | — | — | 渲染 |
| `close-month-view` | R → M | send | — | — | 渲染 |
| `quit-app` | R → M | send | — | — | 渲染 |
| `set-focus-keyboard-tracking` | R → M | send | `boolean` | — | 渲染（兼容旧） |
| `is-global-keyboard-tracking-available` | R → M | invoke | — | `boolean` | 渲染 |
| `claim-key-receiver` | R → M | invoke | — | `boolean` | 渲染 |
| `release-key-receiver` | R → M | send | — | — | 渲染 |
| `global-key-press` | M → R | event | `{ key: string }` | — | 主进程推送 |
| `key-receiver-changed` | M → R | event | `{ isReceiver: boolean }` | — | 主进程推送 |

`R → M` = renderer → main。`M → R` = main → renderer（主进程主动推送，渲染端通过 `onGlobalKeyPress` / `onKeyReceiverChanged` 订阅）。

> **键盘花园（bug 修复）**：全局键盘监听是**常驻**功能（应用启动后立即启用），不再依赖番茄钟专注会话。`claim-key-receiver` / `release-key-receiver` 用于**多窗口去重**：同一时刻只有一个 BrowserWindow 是 receiver，由它处理按键事件并写入 localStorage；其他窗口通过 `localStorage` 的 `storage` 事件 + `BroadcastChannel` 被动同步。详见 [架构文档 §五](../architecture.md)。

---

## 三、详细定义

### 1. `toggle-click-through`

让主窗口鼠标穿透 / 取消穿透。

**Payload**: `boolean`
- `true`  = 开启穿透（鼠标事件透过窗口）
- `false` = 关闭穿透

**处理逻辑**:
```js
ipcMain.on('toggle-click-through', (event, enabled) => {
    if (desktopEmbed) {
        desktopEmbed.setClickThrough(mainWindow, enabled);
    }
});
```

**调用方**: `src/js/appearance.js:174`（设置 → 外观 Tab → 「鼠标穿透」开关）

**副作用**: 通过 `SetWindowLongW(hwnd, GWL_EXSTYLE, ... | WS_EX_TRANSPARENT)` 切换样式。

---

### 2. `re-embed`

重新执行桌面嵌入。用于嵌入失败后手动重试。

**Payload**: 无

**处理逻辑**:
```js
ipcMain.on('re-embed', () => {
    if (desktopEmbed && mainWindow) {
        const ok = desktopEmbed.embedInDesktop(mainWindow);
        if (!ok) desktopEmbed.moveToBottom(mainWindow);
    }
});
```

**调用方**: 当前**未在 UI 暴露**。可在 DevTools console 调 `window.electronAPI.reEmbed()` 手动触发。

---

### 3. `get-window-info`

获取主窗口当前状态（用于 UI 同步）。

**Payload**: 无

**返回类型**:
```ts
interface WindowInfo {
    isVisible: boolean;
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
```

**处理逻辑**:
```js
ipcMain.handle('get-window-info', () => {
    if (!mainWindow) return { isVisible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } };
    const b = mainWindow.getBounds();
    return {
        isVisible: mainWindow.isVisible(),
        bounds: { x: b.x, y: b.y, width: b.width, height: b.height }
    };
});
```

**调用方**: 当前**未在生产代码使用**，保留供「窗口位置记忆」等未来功能。

---

### 4. `set-window-pos`

设置主窗口位置。

**Payload**: `(x: number, y: number)`

**处理逻辑**:
```js
ipcMain.on('set-window-pos', (event, x, y) => {
    if (mainWindow) {
        mainWindow.setPosition(Math.round(x), Math.round(y));
    }
});
```

`Math.round` 避免浮点丢精度。

**调用方**: 当前**未在生产代码使用**。保留供「自定义拖到任意位置后记住」功能。

---

### 5. `set-window-size`

调整主窗口大小。

**Payload**: `(w: number, h: number)`

**处理逻辑**:
```js
ipcMain.on('set-window-size', (event, w, h) => {
    if (mainWindow) {
        mainWindow.setSize(Math.round(w), Math.round(h));
    }
});
```

⚠️ `mainWindow` 初始化时 `resizable: false`，要先 `setResizable(true)` 才能 resize。

---

### 6. `set-always-on-top`

强制主窗口置顶（**会破坏桌面嵌入**——把窗口从壁纸层拉回普通 z-order）。

**Payload**: `boolean`

**处理逻辑**:
```js
ipcMain.on('set-always-on-top', (event, enabled) => {
    if (mainWindow) {
        mainWindow.setAlwaysOnTop(enabled, 'normal');
    }
});
```

**调用方**: 当前**未在生产代码使用**。

---

### 7. `open-month-view`

打开月视图窗口。如果已打开则 `focus()`。

**Payload**: 无

**处理逻辑**: 详见 [main.md](./main.md#七open-month-view-处理器)。

**调用方**: `src/js/month-view-modal.js:69`（月视图按钮 / 统计 Tab）
```js
if (window.electronAPI) window.electronAPI.openMonthView();
```

---

### 8. `close-month-view`

从月视图窗口**自身**调用，请求主进程关闭自己。

**Payload**: 无

**处理逻辑**:
```js
ipcMain.on('close-month-view', () => {
    if (monthViewWindow && !monthViewWindow.isDestroyed()) {
        monthViewWindow.close();
        monthViewWindow = null;
    }
});
```

**调用方**: `src/js/month-view.js`（月视图的关闭按钮）
```js
if (window.electronAPI) window.electronAPI.closeMonthView();
else window.close();   // 浏览器模式降级
```

---

### 9. `quit-app`

从渲染进程请求退出整个 app。

**Payload**: 无

**处理逻辑**:
```js
ipcMain.on('quit-app', () => {
    app.quit();
});
```

**调用方**: 当前**未在 UI 暴露**。保留供「Ctrl+Q 退出」等全局快捷键。

---

### 10. `set-focus-keyboard-tracking`

> **行为变更**（v1.1+）：全局键盘监听改为**常驻**（应用启动后即启用），不再受番茄钟专注会话开关控制。

**Payload**: `boolean`
- `true` = 确保监听已启动（幂等操作）
- `false` = **不再停止监听**（保留此参数仅为向后兼容）

**处理逻辑**:
```js
ipcMain.on('set-focus-keyboard-tracking', (event, enabled) => {
    if (enabled) startGlobalKeyboardTracking();  // 幂等
});
```

**调用方**: `pomodoro.js` 通过 `FocusActivity.startSession/pauseSession/resumeSession` 间接调用，**已无实际效果**（保留是为不破坏调用链路）。

---

### 11. `is-global-keyboard-tracking-available`

探测全局键盘能力。

**Payload**: 无

**返回类型**: `boolean` — 表示 `global-key-monitor` 模块是否加载成功。

**处理逻辑**:
```js
ipcMain.handle('is-global-keyboard-tracking-available', () => {
    if (!globalKeyMonitor) return false;
    startGlobalKeyboardTracking();  // 幂等启动
    return true;
});
```

**调用方**: `src/js/focus-activity.js:41` — 渲染端在 `init()` 时探测，全局不可用则降级到窗口内 `keydown` 监听。

---

### 12. `claim-key-receiver`

**多窗口去重的关键**：渲染端尝试成为"按键 receiver"，**先到先得**。

**Payload**: 无

**返回类型**: `boolean`
- `true`  = 成功，本窗口是 receiver
- `false` = 已有其他窗口是 receiver

**处理逻辑**:
```js
ipcMain.handle('claim-key-receiver', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return tryClaimKeyReceiver(win);
});
```

**调用方**: `src/js/focus-activity.js:46` — 渲染端 `init()` 时尝试 claim。

**配套事件**: `key-receiver-changed`（M→R）— 主进程在 receiver 切换时（如当前 receiver 关闭）推送给新 receiver。

---

### 13. `release-key-receiver`

渲染端主动释放 receiver 角色。

**Payload**: 无

**处理逻辑**:
```js
ipcMain.on('release-key-receiver', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    releaseKeyReceiver(win);
});
```

**调用方**: `src/js/focus-activity.js:51` — 窗口 `beforeunload` 时调用。**主进程也会在 `closed` 事件兜底清理**（`main.js:67`）。

---

### 14. `global-key-press`（M→R 主进程推送）

主进程把全局按键事件推给当前 key receiver。

**Payload**: `{ key: string }` — 标准化的 key label（参考 `native/global-key-monitor.js:15` 的 `VK_MAP`）

**处理逻辑**: 由 `native/global-key-monitor.js` 触发 `start()` 回调，主进程再 `webContents.send`。

**订阅 API**: `window.electronAPI.onGlobalKeyPress(callback)`，返回 unlistener 闭包。

**调用方**: `src/js/focus-activity.js:48` — 渲染端 `init()` 时订阅，回调中**先检查 `isKeyReceiver` 状态**再处理（避免主进程 fallback 广播时重复处理）。

---

### 15. `key-receiver-changed`（M→R 主进程推送）

主进程在 key receiver 切换时通知新 receiver。

**Payload**: `{ isReceiver: boolean }` — 固定传 `true`（只在"成为 receiver"时推送）

**触发场景**:
1. `pickNextKeyReceiver()`（`main.js:80`）— 当前 receiver 关闭后，下次按键时主进程挑选一个存活窗口接管。

**订阅 API**: `window.electronAPI.onKeyReceiverChanged(callback)`。

**调用方**: `src/js/focus-activity.js:50` — 渲染端订阅，收到后 `isKeyReceiver = true`，后续 `global-key-press` 会被本窗口处理。

---

## 四、安全规则

1. **白名单**：主进程只接受上述 13 个 R→M 通道；M→R 只有 2 个事件（`global-key-press` / `key-receiver-changed`），由主进程主动推送。
2. **单向输入校验**：`set-window-pos/size` 的数值会 `Math.round`；`boolean` 参数 Electron 内部会序列化。
3. **不传 DOM 节点**：所有 payload 是基本类型（`number`/`boolean`/`string`/`void`）。
4. **preload 隔离**：渲染进程**不能**直接 `require('electron').ipcRenderer`，必须通过 `window.electronAPI.xxx()`。

---

## 五、错误处理

主进程 IPC handler **不抛错**（用 `ipcMain.on`），如果 handler 内部异常会冒泡到主进程 stdout 但不影响其他通道。

`ipcMain.handle` 抛错时，对应的 `ipcRenderer.invoke` 返回的 Promise 会 reject。

---

## 六、添加新通道的步骤

1. **main.js** 加 handler：
   ```js
   ipcMain.on('my-channel', (event, payload) => {
       // ...
   });
   // 或
   ipcMain.handle('my-channel', async (event, payload) => {
       return { ok: true, value: 42 };
   });
   ```

2. **preload.js** 暴露：
   ```js
   contextBridge.exposeInMainWorld('electronAPI', {
       // ...已有
       myMethod: (payload) => ipcRenderer.send('my-channel', payload),
       myAsyncMethod: async (payload) => await ipcRenderer.invoke('my-channel', payload)
   });
   ```

3. **渲染进程**调：
   ```js
   window.electronAPI.myMethod('hello');
   const result = await window.electronAPI.myAsyncMethod(42);
   ```

4. **更新本表**（保持文档同步）。

---

## 七、调试

### 看 IPC 流量

主进程的 `console.log` 会输出到 stdout。`npm run dev` 在终端能看到所有 `console.log`。

### 模拟渲染端

DevTools console 里：
```js
window.electronAPI.openMonthView();
```

### 模拟主进程

DevTools console 里**不能**调 `ipcMain`（在主进程），但可以在主进程 `main.js` 加 `console.log` 看收到的消息。

---

## 八、未来扩展

### 全局快捷键

```js
// main.js
const { globalShortcut } = require('electron');
app.whenReady().then(() => {
    globalShortcut.register('CommandOrControl+Shift+P', () => {
        if (mainWindow) {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
    });
});
```

### 主进程推送渲染进程

目前只有 renderer → main 方向，未来可加：
```js
// main.js
ipcMain.on('subscribe', () => {
    mainWindow.webContents.send('theme-changed', 'dark');
});

// preload.js
onThemeChanged: (cb) => {
    ipcRenderer.on('theme-changed', (_, theme) => cb(theme));
}
```

### 双向 invoke

```js
// main.js
ipcMain.handle('compute-fib', (event, n) => {
    function fib(x) { return x < 2 ? x : fib(x - 1) + fib(x - 2); }
    return fib(n);
});
```
