# 模块：`main.js` — Electron 主进程

> **职责**：创建透明无边框主窗口、独立月视图窗口；管理系统托盘；处理 IPC；调用 `desktop-embed` 把窗口嵌入桌面壁纸层。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 文件 | `main.js`（305 行） |
| 进程 | Electron 主进程（Node.js） |
| 依赖 | `electron`、 `./native/desktop-embed`（失败降级） |
| 入口 | `package.json` 的 `"main": "main.js"` |
| 启动 | `npm start` → `electron .` |

---

## 二、加载依赖

```js
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');

let desktopEmbed = null;
try {
    desktopEmbed = require('./native/desktop-embed');
    console.log('[Main] 桌面嵌入模块加载成功');
} catch (err) {
    console.warn('[Main] 桌面嵌入模块加载失败，将使用降级模式:', err.message);
}
```

`desktop-embed` 加载失败不致命——`main.js` 内会检查 `if (desktopEmbed)`，用降级方案（窗口置底）。

典型失败原因：koffi 与 Electron ABI 不匹配，需要 `npm run rebuild`（脚本：`electron-rebuild -f -w koffi`）。

---

## 三、全局状态

```js
let mainWindow = null;
let monthViewWindow = null;
let keyboardGardenWindow = null;
let tray = null;
const isDev = process.argv.includes('--dev');

// 全局键盘监听（常驻）
let globalKeyboardActive = false;
let keyReceiverWindow = null;  // 当前接收按键的窗口
```

`isDev` 通过 `npm run dev`（`electron . --dev`）开启，会自动开 DevTools。

---

## 四、`createWindow()` — 主窗口

### 窗口参数

```js
new BrowserWindow({
    width: 340,
    height: 500,
    x: screenWidth - 340 - 30,    // 默认右下角
    y: screenHeight - 500 - 60,
    frame: false,                  // 无边框
    transparent: true,             // 透明背景
    resizable: false,              // 固定大小
    skipTaskbar: true,             // 不显示在任务栏
    alwaysOnTop: false,            // 不强制置顶（要嵌入壁纸层）
    acceptFirstMouse: true,        // 不激活也可点
    show: false,                   // 手动 show
    backgroundColor: '#00000000',  // 完全透明
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false             // 关掉 sandbox 才能在主进程用 koffi
    }
});
```

### 关键参数解释

| 参数 | 为什么这样设 |
|------|-------------|
| `frame: false` | 自绘标题栏、关闭按钮、Tab |
| `transparent: true` | 玻璃效果需要 |
| `resizable: false` | 桌面小组件不需要调大小 |
| `skipTaskbar: true` | 小组件不应出现在 Alt+Tab |
| `acceptFirstMouse: true` | 不抢焦点，第一次点击直接响应 |
| `nodeIntegration: false` | 安全 |
| `contextIsolation: true` | 安全 |
| `sandbox: false` | koffi 需要 native 能力 |

### 加载 HTML

```js
mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
```

### ready-to-show 钩子

```js
mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setTimeout(() => {
        try {
            if (desktopEmbed) {
                const embedded = desktopEmbed.embedInDesktop(mainWindow);
                if (!embedded) {
                    desktopEmbed.moveToBottom(mainWindow);
                }
                desktopEmbed.setWindowAlpha(mainWindow, 240);
            }
        } catch (err) {
            console.error('桌面嵌入失败:', err);
        }
    }, 500);
});
```

延迟 500ms 再嵌入，是因为 `embedInDesktop` 需要窗口已显示、句柄已稳定。

### blur 钩子

```js
mainWindow.on('blur', () => {
    if (desktopEmbed) {
        try { desktopEmbed.moveToBottom(mainWindow); } catch (e) {}
    }
});
```

每次失焦都置底，防止被其他窗口覆盖到壁纸层之上。

### DevTools

```js
if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
}
```

### closed 钩子

```js
mainWindow.on('closed', () => {
    mainWindow = null;
});
```

⚠️ **关闭主窗口不会退出 app**（`window-all-closed` 才退出），用户要靠托盘「退出」菜单。

---

## 五、`createTray()` — 系统托盘

### 图标

```js
const iconDataUrl = 'data:image/png;base64,...';
const trayIcon = nativeImage.createFromDataURL(iconDataUrl);
tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
```

16x16 红色圆点的 base64 PNG（内联在 main.js 中）。

### 右键菜单

```js
const contextMenu = Menu.buildFromTemplate([
    { label: '显示/隐藏', click: () => { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); ... } },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
]);
tray.setContextMenu(contextMenu);
```

### 双击

```js
tray.on('double-click', () => {
    if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
});
```

---

## 六、IPC 处理器

13 个 R→M 通道 + 2 个 M→R 事件，详见 [electron/ipc.md](./ipc.md)。这里只列签名：

```js
// 窗口控制
ipcMain.on('toggle-click-through', (event, enabled) => { ... });
ipcMain.on('re-embed',             () => { ... });
ipcMain.on('quit-app',             () => { app.quit(); });
ipcMain.on('set-window-pos',       (event, x, y) => { mainWindow.setPosition(...); });
ipcMain.on('set-window-size',      (event, w, h) => { mainWindow.setSize(...); });
ipcMain.on('set-always-on-top',    (event, enabled) => { mainWindow.setAlwaysOnTop(...); });
ipcMain.handle('get-window-info',  () => ({ isVisible, bounds }));

// 月视图
ipcMain.on('open-month-view',      () => { ... });
ipcMain.on('close-month-view',     () => { monthViewWindow.close(); monthViewWindow = null; });

// 全局键盘（键盘花园）
ipcMain.on('set-focus-keyboard-tracking', (event, enabled) => { /* 已变为 no-op */ });
ipcMain.handle('is-global-keyboard-tracking-available', () => Boolean(globalKeyMonitor));
ipcMain.handle('claim-key-receiver', (event) => tryClaimKeyReceiver(BrowserWindow.fromWebContents(event.sender)));
ipcMain.on('release-key-receiver', (event) => releaseKeyReceiver(BrowserWindow.fromWebContents(event.sender)));

// M→R 事件（主进程主动推送）
mainWindow.webContents.send('global-key-press', { key });
mainWindow.webContents.send('key-receiver-changed', { isReceiver: true });
```

⚠️ `set-window-pos/size/always-on-top` 用 `Math.round()`，因为 IPC 传浮点会丢精度。

---

## 七、`open-month-view` 处理器

```js
ipcMain.on('open-month-view', () => {
    if (monthViewWindow && !monthViewWindow.isDestroyed()) {
        monthViewWindow.focus();
        return;
    }

    monthViewWindow = new BrowserWindow({
        width: 960,
        height: 680,
        minWidth: 800,
        minHeight: 560,
        frame: false,
        transparent: true,
        resizable: true,
        title: '🌙 月视图 - 番茄钟',
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });

    monthViewWindow.loadFile(path.join(__dirname, 'src', 'month-view.html'));

    monthViewWindow.on('closed', () => {
        monthViewWindow = null;
    });
});
```

如果已存在则 `focus()` 而不重建。

---

## 八、应用生命周期

```js
app.whenReady().then(() => {
    // 全局键盘监听常驻：键盘花园不依赖番茄钟专注会话
    startGlobalKeyboardTracking();

    createWindow();
    createTray();
    app.on('activate', () => {
        if (mainWindow === null) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopGlobalKeyboardTracking();
    if (tray) { tray.destroy(); tray = null; }
});
```

| 事件 | 处理 |
|------|------|
| `whenReady` | 启动全局键盘监听 → 建主窗口 + 托盘 |
| `activate` (macOS) | 主窗口 null 时重建 |
| `window-all-closed` | 非 macOS 退出 |
| `before-quit` | 停止全局键盘监听 + 销毁托盘图标 |

---

## 九、安全考虑

1. `nodeIntegration: false` — 渲染进程不能 `require`
2. `contextIsolation: true` — preload 与渲染进程隔离
3. **白名单 IPC**：只 8 个通道，preload 暴露的 8 个方法一一对应
4. `transparent: true` + 自定义 CSS — 没有任何远程资源加载，无 CSP 旁路风险
5. HTML 内 `Content-Security-Policy` 进一步限制：`default-src 'self'`

---

## 十、常见问题

### 嵌入失败
- **症状**：窗口显示但不嵌入壁纸
- **原因**：koffi 与 Electron ABI 不匹配
- **修法**：`npm run rebuild`

### 关闭主窗口后 app 不退出
- **预期行为**：托盘还在，需要右键 → 退出
- **改法**：把 `window-all-closed` 改成直接 `app.quit()`，但会失去 macOS 习惯

### 月视图窗口被嵌入桌面
- 当前**不会**——`createWindow` 只把 `mainWindow` 嵌入。月视图是普通窗口
- 如果想嵌入，需要在 `open-month-view` 处理器里也调 `desktopEmbed.embedInDesktop(monthViewWindow)`

---

## 十一、扩展指南

### 新增 IPC 通道

1. `main.js` 加 `ipcMain.on('xxx', ...)`
2. `preload.js` 加对应方法
3. 渲染进程通过 `window.electronAPI.xxx()` 调用

### 嵌入月视图

```js
monthViewWindow.once('ready-to-show', () => {
    setTimeout(() => {
        if (desktopEmbed) desktopEmbed.embedInDesktop(monthViewWindow);
    }, 500);
});
```

### 改窗口大小

```js
const windowWidth = 400;   // ← 改这里
const windowHeight = 600;
```

`src/index.html` 里的 `.glass-container` 用 `width:100%; height:100%`，会自适应。

### 加启动参数

```bash
electron . --dev      // 打开 DevTools
electron . --no-embed // 禁用桌面嵌入（仅做调试用）
```

需要在 `main.js` 加 `process.argv.includes('--no-embed')` 判断。
