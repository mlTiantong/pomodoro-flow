/**
 * app.js — 应用主协调器
 *
 * 负责：
 *   1. 装配所有模块（utils → storage → todo/pomodoro → 子模块 → 自身）
 *   2. 应用启动顺序
 *   3. Esc 关闭优先级、统计面板刷新
 *   4. 提供 inline onclick 所需的 App 全局 facade
 *
 * 不再做业务逻辑 — 业务都迁到 SettingsModal / MonthViewModal / Appearance / Notifications。
 */

const App = (() => {
    'use strict';

    function init() {
        console.log('🍅 Tomato Clock 启动中...');

        // 1. 跨窗口同步订阅
        Todo.listenExternal();

        // 1b. AI 助手指令订阅（主窗口唯一接收方）
        listenToAICommands();

        // 2. 待办
        if (window.FocusActivity) {
            FocusActivity.init();
        }

        // 3. 待办
        Todo.init({
            onTodosChanged: () => {
                updateStats();
                const overlay = document.getElementById('settingsOverlay');
                if (overlay && overlay.classList.contains('open')) {
                    SettingsModal.DailyTodos.refresh();
                    SettingsModal.CompletedView.refresh();
                }
            }
        });

        // 4. 番茄钟
        Pomodoro.init({
            onComplete: (type) => {
                updateStats();
                if (type === 'focus') {
                    Notifications.show('🍅 专注完成！', '太棒了！休息一下吧~');
                } else {
                    Notifications.show('☕ 休息结束', '准备好开始下一轮专注了吗？');
                }
            }
        });

        // 5. 主面板 3 Tab
        initTabs();

        // 6. 通知 / 设置弹窗 / 月视图 / 外观
        Notifications.init();
        SettingsModal.init();
        MonthViewModal.init();
        Appearance.init();
        Appearance.apply(Storage.loadAppearance());

        // 7. 统计
        updateStats();

        // 8. Esc 关闭
        initCloseHandlers();

        if (window.electronAPI) console.log('🔌 Electron API 就绪');
        console.log('✅ Tomato Clock 启动完成');
    }

    // ============================================================
    // AI 助手指令（主窗口唯一接收方）
    // ============================================================

    function listenToAICommands() {
        try {
            const bc = new BroadcastChannel('tomato-commands');
            bc.addEventListener('message', (e) => {
                const { type } = e.data || {};
                if (!type) return;
                if (type === 'pomodoro-start') {
                    const status = Pomodoro.getStatus();
                    if (status.state === Pomodoro.State.IDLE || status.state === Pomodoro.State.COMPLETED) {
                        Pomodoro.start();
                    }
                } else if (type === 'pomodoro-stop') {
                    Pomodoro.reset();
                } else if (type === 'settings-updated') {
                    // 设置更新时只在 IDLE 状态自动 reset（IDLE 时长变化会立即生效）
                    const status = Pomodoro.getStatus();
                    if (status.state === Pomodoro.State.IDLE) {
                        Pomodoro.reset();
                    }
                    updateStats();
                }
            });
        } catch (e) {
            console.warn('[App] AI 指令 channel 订阅失败:', e);
        }
    }

    // ============================================================
    // 关闭处理
    // ============================================================

    function initCloseHandlers() {
        document.getElementById('btnClose').addEventListener('click', closeApp);
        const gardenBtn = document.getElementById('btnKeyboardGarden');
        if (gardenBtn) {
            gardenBtn.addEventListener('click', () => {
                if (window.electronAPI?.openKeyboardGarden) {
                    window.electronAPI.openKeyboardGarden();
                } else {
                    window.open('keyboard-garden.html', '_blank', 'width=980,height=720');
                }
            });
        }
        const aiBtn = document.getElementById('btnAIChat');
        if (aiBtn) {
            aiBtn.addEventListener('click', () => {
                const config = Storage.loadAIConfig();
                if (!config.enabled) {
                    if (confirm('AI 助手尚未启用。是否打开设置？')) {
                        document.getElementById('btnSettings')?.click();
                        setTimeout(() => {
                            document.querySelector('[data-mtab="ai"]')?.click();
                        }, 100);
                    }
                    return;
                }
                if (!config.apiKey) {
                    if (confirm('AI 助手尚未配置 API Key。是否打开设置？')) {
                        document.getElementById('btnSettings')?.click();
                        setTimeout(() => {
                            document.querySelector('[data-mtab="ai"]')?.click();
                        }, 100);
                    }
                    return;
                }
                if (window.electronAPI?.openAIChat) {
                    window.electronAPI.openAIChat();
                } else {
                    window.open('ai-chat.html', '_blank', 'width=900,height=720');
                }
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            // 优先级：月视图弹窗 → 设置弹窗 → 关闭应用
            if (document.getElementById('monthViewOverlay').classList.contains('open')) {
                MonthViewModal.close();
                return;
            }
            if (SettingsModal.isOpen()) {
                SettingsModal.close();
                return;
            }
            closeApp();
        });
    }

    function closeApp() {
        console.log('👋 关闭应用...');
        if (window.electronAPI && window.electronAPI.quitApp) {
            window.electronAPI.quitApp();
        } else {
            window.close();
        }
    }

    // ============================================================
    // 主面板 Tab
    // ============================================================

    function initTabs() {
        const tabs = document.querySelectorAll('.tab');
        const panels = {
            pomodoro: document.getElementById('panelPomodoro'),
            todo:     document.getElementById('panelTodo'),
            stats:    document.getElementById('panelStats')
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                Object.values(panels).forEach(p => p?.classList.remove('active'));
                if (panels[target]) panels[target].classList.add('active');
                if (target === 'stats') updateStats();
            });
        });
    }

    // ============================================================
    // 统计
    // ============================================================

    function updateStats() {
        const stats = Storage.loadTodayStats();
        const streak = Storage.calculateStreak();

        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        set('statPomodoros',    stats.totalPomodoros    || 0);
        set('statFocusMinutes', stats.totalFocusMinutes || 0);
        set('statTasksDone',    stats.tasksCompleted    || 0);
        set('statStreak',       streak);

        renderActivityStats(stats, streak);
    }

    function renderActivityStats(stats, streak) {
        const activeMinutes = Math.round((stats.focusActiveSeconds || 0) / 60);
        const score = stats.bestFocusScore || stats.lastSessionScore || 0;
        const caption = getFocusCaption(score, stats.totalPomodoros || 0);

        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        set('statFocusScore', `${score}%`);
        set('statFocusCaption', caption);
        set('statKeystrokes', formatCompactNumber(stats.keystrokes || 0));
        set('statClicks', formatCompactNumber(stats.clicks || 0));
        set('statActiveMinutes', `${activeMinutes}m`);
        set('statLastSessionScore', `${stats.lastSessionScore || 0}%`);
        set('statLastSessionKeys', formatCompactNumber(stats.lastSessionKeystrokes || 0));
        set('statLastSessionClicks', formatCompactNumber(stats.lastSessionClicks || 0));
        set('statLastSessionActive', `${Math.round((stats.lastSessionActiveSeconds || 0) / 60)}m`);
        set('statLastSessionTime', formatRelativeTime(stats.lastSessionEndedAt));
        set('statMomentumBadge', getMomentumLabel(stats, streak));

        renderHeatmap(stats.focusSecondsByHour || []);
        renderAchievements(stats, streak);
    }

    function getFocusCaption(score, pomodoros) {
        if (!pomodoros) return '完成一轮后生成专注画像';
        if (score >= 75) return '高能输入，节奏很稳';
        if (score >= 45) return '保持推进，有清晰活动';
        if (score >= 15) return '轻量专注，适合阅读整理';
        return '低输入专注，可能是在思考或离开';
    }

    function getMomentumLabel(stats, streak) {
        if ((stats.totalPomodoros || 0) >= 8) return '深度工作日';
        if ((stats.keystrokes || 0) >= 3000) return '键盘起飞';
        if (streak >= 7) return '一周连胜';
        if ((stats.totalPomodoros || 0) >= 4) return '节奏在线';
        if ((stats.totalPomodoros || 0) >= 1) return '已经启动';
        return '等待点燃';
    }

    function renderHeatmap(hours) {
        const container = document.getElementById('statsHeatmap');
        if (!container) return;

        const max = Math.max(...hours, 0);
        let peakHour = -1;
        let peakValue = 0;
        let html = '';

        for (let i = 0; i < 24; i++) {
            const value = Number(hours[i]) || 0;
            if (value > peakValue) {
                peakValue = value;
                peakHour = i;
            }
            const level = max ? Math.ceil((value / max) * 4) : 0;
            const label = `${String(i).padStart(2, '0')}:00 ${Math.round(value / 60)}m`;
            html += `<div class="stats-heat-cell level-${level}" title="${label}"><span>${i % 6 === 0 ? i : ''}</span></div>`;
        }

        container.innerHTML = html;
        const peakLabel = peakHour >= 0 ? `${String(peakHour).padStart(2, '0')}:00 · ${Math.round(peakValue / 60)}m` : '--';
        const peakEl = document.getElementById('statPeakHour');
        if (peakEl) peakEl.textContent = `峰值时段 ${peakLabel}`;
    }

    function renderAchievements(stats, streak) {
        const container = document.getElementById('statsAchievements');
        if (!container) return;

        const achievements = [
            { label: '首颗番茄', done: (stats.totalPomodoros || 0) >= 1 },
            { label: '四轮循环', done: (stats.totalPomodoros || 0) >= 4 },
            { label: '千次敲击', done: (stats.keystrokes || 0) >= 1000 },
            { label: '高强专注', done: (stats.bestFocusScore || 0) >= 70 },
            { label: '任务清扫', done: (stats.tasksCompleted || 0) >= 5 },
            { label: '连续三天', done: streak >= 3 }
        ];

        container.innerHTML = achievements.map(item => `
            <span class="stats-achievement ${item.done ? 'unlocked' : ''}">${item.done ? '✓' : '·'} ${item.label}</span>
        `).join('');

        const unlocked = achievements.filter(a => a.done).length;
        const hint = document.getElementById('statAchievementHint');
        if (hint) hint.textContent = `${unlocked}/${achievements.length} 已解锁`;
    }

    function formatCompactNumber(value) {
        const num = Number(value) || 0;
        if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
        return String(num);
    }

    function formatRelativeTime(iso) {
        if (!iso) return '暂无记录';
        const diff = Date.now() - new Date(iso).getTime();
        if (!Number.isFinite(diff) || diff < 0) return '刚刚完成';
        const minutes = Math.round(diff / 60000);
        if (minutes < 1) return '刚刚完成';
        if (minutes < 60) return `${minutes} 分钟前`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours} 小时前`;
        return `${Math.round(hours / 24)} 天前`;
    }

    // ============================================================
    // 启动
    // ============================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 暴露给 inline onclick 的最小 facade
    return {
        init,
        updateStats,
        closeSettingsModal: () => SettingsModal.close(),
        refreshDailyTodos:  () => SettingsModal.DailyTodos.refresh(),
        refreshCompletedView: () => SettingsModal.CompletedView.refresh(),
        renderMonthGrid:    () => MonthViewModal.renderGrid(),
        refreshDayDetail:   (d) => MonthViewModal.refreshDayDetail(d),
        selectDay:          (d) => MonthViewModal.selectDay(d)
    };
})();
