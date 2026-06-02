/**
 * notifications.js — 通知模块
 *
 * 负责「番茄完成/休息结束」等系统通知 + 窗口边缘闪烁提示。
 * 不依赖任何业务模块，可以独立 init。
 */

const Notifications = (() => {
    'use strict';

    let appEl = null;

    /**
     * 初始化（绑定到 .glass-container 元素）
     */
    function init() {
        appEl = document.getElementById('app');
    }

    /**
     * 显示一条通知：系统通知（如已授权）+ 窗口闪烁
     * @param {string} title
     * @param {string} body
     */
    function show(title, body) {
        showSystemNotification(title, body);
        flashWindow(title);
    }

    function showSystemNotification(title, body) {
        if (!('Notification' in window)) return;

        if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: '🍅' });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification(title, { body, icon: '🍅' });
                }
            });
        }
    }

    function flashWindow(title) {
        if (!appEl) return;
        const isFocus = title.includes('专注');
        const glowColor = isFocus ? 'rgba(232,93,58,0.4)' : 'rgba(74,144,217,0.4)';
        appEl.style.transition = 'box-shadow 0.3s ease';
        const originalShadow = appEl.style.boxShadow;
        appEl.style.boxShadow = `0 0 30px ${glowColor}, 0 8px 32px rgba(0,0,0,0.25)`;
        setTimeout(() => {
            appEl.style.boxShadow = originalShadow || '0 8px 32px rgba(0,0,0,0.25)';
        }, 1500);
    }

    return { init, show };
})();
