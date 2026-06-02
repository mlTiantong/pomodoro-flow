/**
 * main.js — Electron 主进程
 *
 * 负责创建透明无边框窗口、集成桌面嵌入、系统托盘等。
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, dialog } = require('electron');
const path = require('path');

// 桌面嵌入模块 — 加载失败时降级（koffi 兼容性问题）
let desktopEmbed = null;
try {
    desktopEmbed = require('./native/desktop-embed');
    console.log('[Main] 桌面嵌入模块加载成功');
} catch (err) {
    console.warn('[Main] 桌面嵌入模块加载失败，将使用降级模式:', err.message);
}

let globalKeyMonitor = null;
try {
    globalKeyMonitor = require('./native/global-key-monitor');
    console.log('[Main] 全局按键监听模块加载成功');
} catch (err) {
    console.warn('[Main] 全局按键监听模块加载失败，将只记录窗口内按键:', err.message);
}

// ============================================================
// 全局状态
// ============================================================

let mainWindow = null;
let monthViewWindow = null;
let keyboardGardenWindow = null;
let aiWindow = null;
let tray = null;
const isDev = process.argv.includes('--dev');

// 全局键盘监听：应用启动后即常驻，键盘花园不再依赖番茄钟专注会话
let globalKeyboardActive = false;
// 当前接收按键事件的窗口（避免多窗口重复计数）
let keyReceiverWindow = null;

function wireWindowDiagnostics(win, name) {
    if (!isDev || !win) return;
    win.webContents.on('did-finish-load', () => {
        console.log(`[${name}] did-finish-load`);
    });
    win.webContents.on('did-fail-load', (_, code, desc, url) => {
        console.error(`[${name}] did-fail-load`, code, desc, url);
    });
    win.webContents.on('console-message', (_, level, message, line, sourceId) => {
        console.log(`[${name}] console:${level} ${sourceId}:${line} ${message}`);
    });
    win.webContents.on('render-process-gone', (_, details) => {
        console.error(`[${name}] render-process-gone`, details);
    });
    win.webContents.on('preload-error', (_, pathValue, error) => {
        console.error(`[${name}] preload-error`, pathValue, error);
    });
}

/**
 * 为窗口绑定通用生命周期：开发期诊断 + 关闭时清理 receiver
 * （receiver 失效后，下次全局按键会通过 pickNextKeyReceiver 兜底接管）
 */
function wireWindow(win, name) {
    if (!win) return;
    wireWindowDiagnostics(win, name);
    win.on('closed', () => {
        if (keyReceiverWindow === win) {
            keyReceiverWindow = null;
            if (isDev) console.log(`[Main] ${name} 关闭，已释放 key receiver`);
        }
    });
}

/**
 * 挑选一个存活窗口接管 key receiver（无 receiver 时的兜底）
 * @returns {Electron.BrowserWindow|null}
 */
function pickNextKeyReceiver() {
    const candidates = BrowserWindow.getAllWindows().filter(w =>
        !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()
    );
    if (candidates.length === 0) return null;
    const next = candidates[0];
    keyReceiverWindow = next;
    // 推送状态变更，渲染端会更新 isKeyReceiver
    try {
        next.webContents.send('key-receiver-changed', { isReceiver: true });
    } catch (e) {}
    if (isDev) console.log(`[Main] 自动接管 key receiver (从 ${candidates.length} 个候选中选取)`);
    return next;
}

/**
 * 启动全局键盘监听（常驻，键盘花园独立于番茄钟）
 */
function startGlobalKeyboardTracking() {
    if (!globalKeyMonitor) return false;
    if (globalKeyboardActive) return true;

    const ok = globalKeyMonitor.start((key) => {
        if (!globalKeyboardActive) return;
        // 优先发给当前 receiver
        if (keyReceiverWindow && !keyReceiverWindow.isDestroyed()) {
            try {
                keyReceiverWindow.webContents.send('global-key-press', { key });
            } catch (e) {
                // receiver 不可用，降级到兜底
                pickNextKeyReceiver();
            }
            return;
        }
        // 兜底：没有 receiver 时（receiver 刚关闭、启动早期等），自动选一个存活窗口接管
        const next = pickNextKeyReceiver();
        if (next) {
            try { next.webContents.send('global-key-press', { key }); } catch (e) {}
        }
    });
    globalKeyboardActive = !!ok;
    if (globalKeyboardActive) {
        console.log('[Main] 全局按键监听已启动（常驻）');
    } else {
        console.warn('[Main] 全局按键监听启动失败');
    }
    return globalKeyboardActive;
}

function stopGlobalKeyboardTracking() {
    if (!globalKeyMonitor || !globalKeyboardActive) return;
    globalKeyMonitor.stop();
    globalKeyboardActive = false;
    keyReceiverWindow = null;
    console.log('[Main] 全局按键监听已停止');
}

/**
 * 尝试成为按键 receiver。已存在 receiver 则失败。
 * @returns {boolean}
 */
function tryClaimKeyReceiver(win) {
    if (!win || win.isDestroyed()) return false;
    if (keyReceiverWindow && !keyReceiverWindow.isDestroyed()) return false;
    keyReceiverWindow = win;
    if (isDev) console.log('[Main] 已分配 key receiver');
    return true;
}

function releaseKeyReceiver(win) {
    if (keyReceiverWindow === win) {
        keyReceiverWindow = null;
        if (isDev) console.log('[Main] 已释放 key receiver');
    }
}

// ============================================================
// 窗口创建
// ============================================================

/**
 * 创建主窗口
 */
function createWindow() {
    // 获取主显示器尺寸
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // 窗口尺寸 — 320x480 的小组件尺寸
    const windowWidth = 340;
    const windowHeight = 500;

    // 窗口位置 — 默认右下角
    const x = screenWidth - windowWidth - 30;
    const y = screenHeight - windowHeight - 60;

    mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x: x,
        y: y,
        frame: false,              // 无边框
        transparent: true,         // 透明背景
        resizable: false,          // 固定大小
        skipTaskbar: true,         // 不显示在任务栏
        alwaysOnTop: false,        // 不置顶（我们需要置底）
        acceptFirstMouse: true,    // 不激活窗口也可点击
        show: false,               // 手动显示
        backgroundColor: '#00000000', // 完全透明
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });
    wireWindow(mainWindow, 'main');

    // 加载主界面
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    // 窗口准备好后显示
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();

        // 延迟执行桌面嵌入（等待窗口完全初始化）
        setTimeout(() => {
            try {
                if (desktopEmbed) {
                    // 尝试嵌入桌面
                    const embedded = desktopEmbed.embedInDesktop(mainWindow);
                    if (!embedded) {
                        // 降级方案：置底
                        desktopEmbed.moveToBottom(mainWindow);
                    }
                    // 设置窗口透明度 (Electron 自身透明 + Windows API 辅助)
                    desktopEmbed.setWindowAlpha(mainWindow, 240);
                } else {
                    console.log('[Main] 桌面嵌入模块未加载，跳过嵌入');
                }
            } catch (err) {
                console.error('桌面嵌入失败:', err);
            }
        }, 500);
    });

    // 失去焦点时重新置底（防止被其他窗口覆盖到桌面层之上）
    mainWindow.on('blur', () => {
        if (desktopEmbed) {
            try {
                desktopEmbed.moveToBottom(mainWindow);
            } catch (e) {
                // 忽略
            }
        }
    });

    // 开发模式下打开 DevTools
    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // 窗口关闭事件
    mainWindow.on('closed', () => {
        // 全局键盘监听是常驻的，不再因主窗口关闭而停止
        // receiver 清理由 wireWindow() 统一处理
        mainWindow = null;
    });
}

// ============================================================
// 系统托盘
// ============================================================

/**
 * 创建系统托盘图标
 */
function createTray() {
    // 生成一个简单的 16x16 番茄图标 (red dot)
    // 使用最小 PNG: 16x16 红色圆形
    const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA'
        + 'WElEQVQ4y2Ng+M9AAWBigAL4TwnDhgE5YJgBQw1gGGoAw1ADGIYaQDsD'
        + 'BASEBIR/xP7/hxvAMNQAQqpn+E8cYBhqAMNQAxiGGsAw1ACG4QYwDDUA'
        + 'AGfGEA2OGf1RAAAAAElFTkSuQmCC';

    const trayIcon = nativeImage.createFromDataURL(iconDataUrl);
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '键盘花园',
            click: () => {
                openKeyboardGardenWindow();
            }
        },
        {
            label: '显示/隐藏',
            click: () => {
                if (mainWindow) {
                    if (mainWindow.isVisible()) {
                        mainWindow.hide();
                    } else {
                        mainWindow.show();
                        // 重新嵌入桌面
                        setTimeout(() => {
                            try {
                                desktopEmbed.embedInDesktop(mainWindow);
                            } catch (e) {}
                        }, 200);
                    }
                }
            }
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Tomato Clock - 待办清单 + 番茄钟');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
            }
        }
    });
}

// ============================================================
// IPC 通信
// ============================================================

// 切换点击穿透模式
ipcMain.on('toggle-click-through', (event, enabled) => {
    if (mainWindow && desktopEmbed) {
        desktopEmbed.setClickThrough(mainWindow, enabled);
    }
});

// 重新嵌入桌面
ipcMain.on('re-embed', () => {
    if (mainWindow && desktopEmbed) {
        desktopEmbed.embedInDesktop(mainWindow);
    }
});

// 退出应用
ipcMain.on('quit-app', () => {
    app.quit();
});

// 窗口位置
ipcMain.on('set-window-pos', (event, x, y) => {
    if (mainWindow) {
        mainWindow.setPosition(Math.round(x), Math.round(y));
    }
});

// 窗口大小
ipcMain.on('set-window-size', (event, w, h) => {
    if (mainWindow) {
        mainWindow.setSize(Math.round(w), Math.round(h));
        mainWindow.setContentSize(Math.round(w), Math.round(h));
    }
});

// 窗口置顶
ipcMain.on('set-always-on-top', (event, enabled) => {
    if (mainWindow) {
        mainWindow.setAlwaysOnTop(enabled, 'normal');
    }
});

ipcMain.on('set-focus-keyboard-tracking', (event, enabled) => {
    // 向后兼容：保留 IPC 通道，但全局键盘监听已改为常驻
    // 调用方语义变化：传 true 只是确保监听已启动（无副作用），传 false 不再停止监听
    if (enabled) startGlobalKeyboardTracking();
});

// 全局键盘能力探测：返回 true 时渲染端可以订阅 onGlobalKeyPress
ipcMain.handle('is-global-keyboard-tracking-available', () => {
    if (!globalKeyMonitor) return false;
    // 顺便启动监听（幂等）
    startGlobalKeyboardTracking();
    return true;
});

// 渲染端尝试成为按键 receiver（先到先得，避免多窗口重复计数）
ipcMain.handle('claim-key-receiver', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return tryClaimKeyReceiver(win);
});

// 渲染端主动释放 receiver（如 beforeunload）
ipcMain.on('release-key-receiver', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    releaseKeyReceiver(win);
});

function openMonthViewWindow() {
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
        show: false,
        title: '🌙 月视图 - 番茄钟',
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });
    wireWindow(monthViewWindow, 'week-view');

    monthViewWindow.loadFile(path.join(__dirname, 'src', 'month-view.html'));
    monthViewWindow.once('ready-to-show', () => {
        if (monthViewWindow && !monthViewWindow.isDestroyed()) {
            monthViewWindow.show();
            monthViewWindow.focus();
        }
    });

    monthViewWindow.on('closed', () => {
        monthViewWindow = null;
    });
}

// 打开月视图窗口
ipcMain.on('open-month-view', () => {
    openMonthViewWindow();
});

function openKeyboardGardenWindow() {
    if (keyboardGardenWindow && !keyboardGardenWindow.isDestroyed()) {
        keyboardGardenWindow.focus();
        return;
    }

    keyboardGardenWindow = new BrowserWindow({
        width: 780,
        height: 520,
        minWidth: 700,
        minHeight: 460,
        frame: false,
        transparent: true,
        resizable: true,
        show: false,
        skipTaskbar: true,
        title: '键盘花园 - 番茄钟',
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });
    wireWindow(keyboardGardenWindow, 'keyboard-garden');

    keyboardGardenWindow.loadFile(path.join(__dirname, 'src', 'keyboard-garden.html'));
    keyboardGardenWindow.once('ready-to-show', () => {
        if (keyboardGardenWindow && !keyboardGardenWindow.isDestroyed()) {
            keyboardGardenWindow.show();
            keyboardGardenWindow.focus();
            setTimeout(() => {
                try {
                    if (desktopEmbed) {
                        const embedded = desktopEmbed.embedInDesktop(keyboardGardenWindow);
                        if (!embedded) {
                            desktopEmbed.moveToBottom(keyboardGardenWindow);
                        }
                        desktopEmbed.setWindowAlpha(keyboardGardenWindow, 235);
                    }
                } catch (err) {
                    console.error('[KeyboardGarden] 桌面嵌入失败:', err);
                }
            }, 500);
        }
    });

    keyboardGardenWindow.on('blur', () => {
        if (desktopEmbed) {
            try {
                desktopEmbed.moveToBottom(keyboardGardenWindow);
            } catch (e) {}
        }
    });

    keyboardGardenWindow.on('closed', () => {
        keyboardGardenWindow = null;
    });
}

ipcMain.on('open-keyboard-garden', () => {
    openKeyboardGardenWindow();
});

ipcMain.on('close-keyboard-garden', () => {
    if (keyboardGardenWindow && !keyboardGardenWindow.isDestroyed()) {
        keyboardGardenWindow.close();
        keyboardGardenWindow = null;
    }
});

function openAIWindow() {
    if (aiWindow && !aiWindow.isDestroyed()) {
        aiWindow.focus();
        return;
    }

    aiWindow = new BrowserWindow({
        width: 780,
        height: 600,
        minWidth: 600,
        minHeight: 460,
        frame: false,
        transparent: true,
        resizable: true,
        show: false,
        skipTaskbar: true,
        title: 'AI 助手 - 番茄钟',
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });
    wireWindow(aiWindow, 'ai-chat');

    aiWindow.loadFile(path.join(__dirname, 'src', 'ai-chat.html'));
    aiWindow.once('ready-to-show', () => {
        if (aiWindow && !aiWindow.isDestroyed()) {
            aiWindow.show();
            aiWindow.focus();
        }
    });

    aiWindow.on('closed', () => {
        aiWindow = null;
    });
}

ipcMain.on('open-ai-chat', () => {
    openAIWindow();
});

ipcMain.on('close-ai-chat', () => {
    if (aiWindow && !aiWindow.isDestroyed()) {
        aiWindow.close();
        aiWindow = null;
    }
});

// AI 助手写操作确认对话框
// 渲染端通过 invoke 同步等待用户选择，返回 boolean
// 默认按钮 = 拒绝（防误点）
ipcMain.handle('confirm-ai-action', async (event, { title, message, detail, dangerous }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    const result = await dialog.showMessageBox(win, {
        type: dangerous ? 'warning' : 'question',
        buttons: dangerous ? ['允许（危险）', '拒绝'] : ['允许', '拒绝'],
        defaultId: 1,
        cancelId: 1,
        title: title || 'AI 操作确认',
        message: message || 'AI 想要执行操作',
        detail: detail || '',
        noLink: true
    });
    return result.response === 0;
});

// 关闭月视图窗口
ipcMain.on('close-month-view', () => {
    if (monthViewWindow && !monthViewWindow.isDestroyed()) {
        monthViewWindow.close();
        monthViewWindow = null;
    }
});

// 获取窗口状态
ipcMain.handle('get-window-info', () => {
    if (mainWindow) {
        const bounds = mainWindow.getBounds();
        return {
            isVisible: mainWindow.isVisible(),
            bounds: bounds
        };
    }
    return null;
});

// ============================================================
// 应用生命周期
// ============================================================

app.whenReady().then(() => {
    // 全局键盘监听常驻：键盘花园不依赖番茄钟专注会话
    startGlobalKeyboardTracking();

    createWindow();
    createTray();

    if (process.argv.includes('--smoke-windows')) {
        mainWindow.webContents.once('did-finish-load', () => {
            setTimeout(() => {
                openMonthViewWindow();
                openKeyboardGardenWindow();
            }, 800);
        });
    }

    // macOS 下保持激活（但我们只支持 Windows，保留兼容）
    app.on('activate', () => {
        if (mainWindow === null) {
            createWindow();
        }
    });
});

// 所有窗口关闭时退出
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 退出前清理
app.on('before-quit', () => {
    stopGlobalKeyboardTracking();
    if (tray) {
        tray.destroy();
        tray = null;
    }
});
