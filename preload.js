/**
 * preload.js — Electron 预加载脚本
 *
 * 在安全的隔离环境中，向渲染进程暴露有限的 API。
 * 遵循最小权限原则，只暴露必需的功能。
 */

const { contextBridge, ipcRenderer } = require('electron');

// ============================================================
// 通过 contextBridge 暴露给渲染进程的 API
// ============================================================

contextBridge.exposeInMainWorld('electronAPI', {
    // --- 窗口控制 ---
    toggleClickThrough: (enabled) => {
        ipcRenderer.send('toggle-click-through', enabled);
    },
    reEmbed: () => {
        ipcRenderer.send('re-embed');
    },
    getWindowInfo: () => {
        return ipcRenderer.invoke('get-window-info');
    },
    // --- 窗口位置/大小/置顶 ---
    setWindowPosition: (x, y) => {
        ipcRenderer.send('set-window-pos', x, y);
    },
    setWindowSize: (w, h) => {
        ipcRenderer.send('set-window-size', w, h);
    },
    setAlwaysOnTop: (enabled) => {
        ipcRenderer.send('set-always-on-top', enabled);
    },
    // --- 月视图 ---
    openMonthView: () => {
        ipcRenderer.send('open-month-view');
    },
    closeMonthView: () => {
        ipcRenderer.send('close-month-view');
    },
    openKeyboardGarden: () => {
        ipcRenderer.send('open-keyboard-garden');
    },
    closeKeyboardGarden: () => {
        ipcRenderer.send('close-keyboard-garden');
    },
    // --- AI 助手 ---
    openAIChat: () => {
        ipcRenderer.send('open-ai-chat');
    },
    closeAIChat: () => {
        ipcRenderer.send('close-ai-chat');
    },
    /**
     * 弹原生对话框请求用户确认 AI 写操作
     * @param {Object} params
     * @param {string} params.title - 对话框标题
     * @param {string} params.message - 简短描述
     * @param {string} [params.detail] - 详细参数预览
     * @param {boolean} [params.dangerous] - 是否高危操作（按钮文案不同）
     * @returns {Promise<boolean>} true=允许 false=拒绝
     */
    confirmAIAction: (params) => {
        return ipcRenderer.invoke('confirm-ai-action', params || {});
    },
    // --- 全局键盘监听（常驻，键盘花园独立于番茄钟） ---
    setFocusKeyboardTracking: (enabled) => {
        // 向后兼容：传 true 确保监听已启动，传 false 不再停止（监听常驻）
        ipcRenderer.send('set-focus-keyboard-tracking', !!enabled);
    },
    isGlobalKeyboardTrackingAvailable: () => {
        return ipcRenderer.invoke('is-global-keyboard-tracking-available');
    },
    onGlobalKeyPress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => {
            callback(payload?.key || null);
        };
        ipcRenderer.on('global-key-press', handler);
        return () => ipcRenderer.removeListener('global-key-press', handler);
    },
    // 尝试成为按键 receiver（先到先得，避免多窗口重复计数）
    // 返回 true 表示成功，false 表示已有其他窗口是 receiver
    claimKeyReceiver: () => {
        return ipcRenderer.invoke('claim-key-receiver');
    },
    // 主动释放 receiver（窗口关闭前调用，主进程也会在 closed 事件兜底）
    releaseKeyReceiver: () => {
        ipcRenderer.send('release-key-receiver');
    },
    // 监听主进程的 receiver 状态变更推送（如 receiver 窗口被关闭后被其他窗口接管）
    onKeyReceiverChanged: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => {
            callback(payload || { isReceiver: false });
        };
        ipcRenderer.on('key-receiver-changed', handler);
        return () => ipcRenderer.removeListener('key-receiver-changed', handler);
    },
    // --- 退出应用 ---
    quitApp: () => {
        ipcRenderer.send('quit-app');
    }
});
