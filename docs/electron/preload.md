# 模块：`preload.js` — Electron 预加载脚本

> **职责**：在安全的隔离环境中，把 8 个白名单方法挂到 `window.electronAPI`，让渲染进程能调主进程能力。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 文件 | `preload.js`（46 行） |
| 进程 | 渲染进程（在主窗口和月视图窗口各跑一份） |
| 依赖 | `electron`（仅 `contextBridge` + `ipcRenderer`） |
| 暴露符号 | `window.electronAPI` |

---

## 二、完整代码解析

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // 窗口控制
    toggleClickThrough: (enabled) => ipcRenderer.send('toggle-click-through', enabled),
    reEmbed:             ()       => ipcRenderer.send('re-embed'),
    getWindowInfo:       ()       => ipcRenderer.invoke('get-window-info'),

    // 窗口位置/大小/置顶
    setWindowPosition:   (x, y)   => ipcRenderer.send('set-window-pos', x, y),
    setWindowSize:       (w, h)   => ipcRenderer.send('set-window-size', w, h),
    setAlwaysOnTop:      (enabled)=> ipcRenderer.send('set-always-on-top', enabled),

    // 月视图
    openMonthView:       ()       => ipcRenderer.send('open-month-view'),
    closeMonthView:      ()       => ipcRenderer.send('close-month-view'),

    // 退出
    quitApp:             ()       => ipcRenderer.send('quit-app')
});
```

---

## 三、API 总览

| 方法 | IPC 通道 | 通信方向 | 返回 |
|------|---------|---------|------|
| `toggleClickThrough(enabled)` | `toggle-click-through` | renderer → main | void |
| `reEmbed()` | `re-embed` | renderer → main | void |
| `getWindowInfo()` | `get-window-info` | renderer → main | `{ isVisible, bounds }` |
| `setWindowPosition(x, y)` | `set-window-pos` | renderer → main | void |
| `setWindowSize(w, h)` | `set-window-size` | renderer → main | void |
| `setAlwaysOnTop(enabled)` | `set-always-on-top` | renderer → main | void |
| `openMonthView()` | `open-month-view` | renderer → main | void |
| `closeMonthView()` | `close-month-view` | renderer → main | void |
| `quitApp()` | `quit-app` | renderer → main | void |

### `send` vs `invoke`

- **`ipcRenderer.send(channel, ...args)`** — fire-and-forget，无返回值
- **`ipcRenderer.invoke(channel, ...args)`** — 返回 `Promise`，对应主进程 `ipcMain.handle`

本项目中只有 `getWindowInfo` 用 `invoke`（需要拿窗口信息），其余都是单向通知。

---

## 四、安全边界

### 最小权限

`preload.js` **只**暴露 9 个方法到 `window.electronAPI`。渲染进程不能：
- `require()` 任何模块
- 直接访问 `ipcRenderer`
- 改 `contextBridge` 的内容

### 隔离

```js
webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: false   // ← 注意：关掉了
}
```

`sandbox: false` 是因为 `koffi` 加载需要 native 能力，渲染进程的 `preload` 仍然能在隔离世界里跑 Node API。

### 不能转发原始对象

`contextBridge` 只能传可序列化的数据。函数会丢失闭包，但**显式定义的箭头函数**可以。

---

## 五、调用方

### 主窗口（`src/index.html` + 各模块）

```js
// src/js/appearance.js:76   — 保存位置按钮
window.electronAPI.setWindowPosition(x, y);

// src/js/month-view-modal.js:69   — 打开月视图
if (window.electronAPI) window.electronAPI.openMonthView();

// src/js/appearance.js:174  — 鼠标穿透开关
if (window.electronAPI) window.electronAPI.toggleClickThrough(enabled);

// src/js/app.js:90   — 关闭按钮
if (window.electronAPI && window.electronAPI.quitApp) {
    window.electronAPI.quitApp();
}
```

### 月视图窗口（`src/js/month-view.js`）

```js
if (window.electronAPI) window.electronAPI.closeMonthView();
else window.close();
```

---

## 六、缺失能力

当前 `window.electronAPI` 只能调主进程，**不能**主动收主进程消息。如果需要「主进程主动通知渲染进程」（比如系统主题变化、外部事件），需要：

1. 主进程：`webContents.send('xxx', data)`
2. preload：暴露一个 `onXxx(cb)` 方法，内部用 `ipcRenderer.on('xxx', (_, data) => cb(data))`

本项目目前**没有**这种反向通信需求。

---

## 七、扩展指南

### 新增方法

1. `main.js` 加 `ipcMain.on('your-channel', (event, ...args) => { ... })`
2. `preload.js` 加 `yourMethod: (...args) => ipcRenderer.send('your-channel', ...args)`
3. 渲染进程调 `window.electronAPI.yourMethod(...)`

### 双向调用

```js
// preload.js
yourAsyncMethod: async (data) => {
    return await ipcRenderer.invoke('your-channel', data);
}

// main.js
ipcMain.handle('your-channel', (event, data) => {
    return { ok: true, value: 42 };
});
```

### 监听主进程推送

```js
// preload.js
onTrayDoubleClick: (cb) => {
    ipcRenderer.on('tray-double-clicked', (_, data) => cb(data));
}
```

⚠️ **不要**直接传 `ipcRenderer.on` 的引用——`contextBridge` 不允许。必须包成新的函数。
