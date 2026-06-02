/**
 * pomodoro.js — 番茄钟模块
 *
 * 实现 25 分钟专注 / 5 分钟休息的番茄钟计时器。
 * 包含精确倒计时、进度条更新、自动切换模式。
 */

const Pomodoro = (() => {
    'use strict';

    // ============================================================
    // 状态
    // ============================================================

    /** 计时器状态 */
    const State = {
        IDLE: 'idle',
        RUNNING: 'running',
        PAUSED: 'paused',
        COMPLETED: 'completed'
    };

    /** 模式 */
    const Mode = {
        FOCUS: 'focus',
        BREAK: 'break'
    };

    // DOM 引用
    let timerEl = null;
    let modeEl = null;
    let progressRing = null;
    let progressText = null;
    let btnStart = null;
    let btnPause = null;
    let btnReset = null;
    let todayPomodorosEl = null;
    let todayFocusTimeEl = null;

    // 计时器状态
    let state = State.IDLE;
    let mode = Mode.FOCUS;
    let timeRemaining = 0;       // 剩余秒数
    let totalTime = 0;          // 总秒数
    let timerInterval = null;
    let currentTaskId = null;
    let currentSessionId = null;

    // 统计缓存
    let todayPomodoroCount = 0;
    let todayFocusMinutes = 0;

    // 回调
    let onComplete = null;

    // ============================================================
    // 初始化
    // ============================================================

    /**
     * 初始化番茄钟模块
     * @param {Object} options
     */
    function init(options = {}) {
        timerEl = document.getElementById('pomodoroTimer');
        modeEl = document.getElementById('pomodoroMode');
        progressRing = document.getElementById('progressRing');
        progressText = document.getElementById('progressText');
        btnStart = document.getElementById('btnStart');
        btnPause = document.getElementById('btnPause');
        btnReset = document.getElementById('btnReset');
        todayPomodorosEl = document.getElementById('todayPomodoros');
        todayFocusTimeEl = document.getElementById('todayFocusTime');
        onComplete = options.onComplete || null;

        // 加载今日统计
        const stats = Storage.loadTodayStats();
        todayPomodoroCount = stats.totalPomodoros || 0;
        todayFocusMinutes = stats.totalFocusMinutes || 0;

        // 初始值
        resetToMode(Mode.FOCUS);

        // 绑定事件
        btnStart.addEventListener('click', start);
        btnPause.addEventListener('click', pause);
        btnReset.addEventListener('click', reset);

        // 任务选择事件
        const taskSelect = document.getElementById('taskSelect');
        if (taskSelect) {
            taskSelect.addEventListener('change', (e) => {
                currentTaskId = e.target.value || null;
            });
        }

        // 更新统计显示
        updateStatsDisplay();
    }

    // ============================================================
    // 核心功能
    // ============================================================

    /**
     * 开始计时
     */
    function start() {
        if (state === State.RUNNING) return;

        if (state === State.IDLE || state === State.COMPLETED) {
            // 新的一轮
            if (mode === Mode.FOCUS) {
                const s = Storage.loadSettings();
                timeRemaining = s.focusDuration * 60;
            } else {
                const s = Storage.loadSettings();
                timeRemaining = s.breakDuration * 60;
            }
            totalTime = timeRemaining;
            if (mode === Mode.FOCUS && window.FocusActivity) {
                currentSessionId = DomUtils.generateId();
                FocusActivity.startSession(currentSessionId);
            }
        } else if (state === State.PAUSED && mode === Mode.FOCUS && window.FocusActivity) {
            FocusActivity.resumeSession();
        }

        state = State.RUNNING;
        updateUI();

        timerInterval = setInterval(() => {
            timeRemaining--;
            if (mode === Mode.FOCUS && window.FocusActivity) {
                FocusActivity.tickActiveSecond();
            }

            if (timeRemaining <= 0) {
                // 计时结束
                clearInterval(timerInterval);
                timerInterval = null;
                state = State.COMPLETED;
                onTimerComplete();
                return;
            }

            updateUI();
        }, 1000);

        btnStart.disabled = true;
        btnPause.disabled = false;
    }

    /**
     * 暂停计时
     */
    function pause() {
        if (state !== State.RUNNING) return;

        clearInterval(timerInterval);
        timerInterval = null;
        if (mode === Mode.FOCUS && window.FocusActivity) {
            FocusActivity.pauseSession();
        }
        state = State.PAUSED;
        updateUI();

        btnStart.disabled = false;
        btnStart.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            继续
        `;
        btnPause.disabled = true;
    }

    /**
     * 重置计时器
     */
    function reset() {
        clearInterval(timerInterval);
        timerInterval = null;
        if (mode === Mode.FOCUS && window.FocusActivity) {
            FocusActivity.stopSession();
        }
        state = State.IDLE;

        resetToMode(mode);

        btnStart.disabled = false;
        btnStart.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            开始
        `;
        btnPause.disabled = true;
    }

    /**
     * 计时完成后的处理
     */
    function onTimerComplete() {
        btnStart.disabled = false;
        btnPause.disabled = true;

        if (mode === Mode.FOCUS) {
            // 专注完成 ✅
            todayPomodoroCount++;
            const sd = Storage.loadSettings();
            todayFocusMinutes += sd.focusDuration;

            // 记录到存储
            const activitySummary = window.FocusActivity
                ? FocusActivity.getSummary(totalTime)
                : getEmptyActivitySummary();
            Storage.addPomodoro({
                type: 'focus',
                startTime: new Date(Date.now() - totalTime * 1000).toISOString(),
                endTime: new Date().toISOString(),
                completed: true,
                taskId: currentTaskId,
                keystrokes: activitySummary.keystrokes,
                clicks: activitySummary.clicks,
                activeSeconds: activitySummary.activeSeconds,
                focusScore: activitySummary.focusScore
            });

            // 更新每日统计
            Storage.updateTodayStats(stats => {
                stats.totalPomodoros = (stats.totalPomodoros || 0) + 1;
                const sd2 = Storage.loadSettings();
                stats.totalFocusMinutes = (stats.totalFocusMinutes || 0) + sd2.focusDuration;
                stats.sessionsCompleted = (stats.sessionsCompleted || 0) + 1;
                stats.keystrokes = (stats.keystrokes || 0) + activitySummary.keystrokes;
                stats.clicks = (stats.clicks || 0) + activitySummary.clicks;
                stats.focusActiveSeconds = (stats.focusActiveSeconds || 0) + activitySummary.activeSeconds;
                stats.bestFocusScore = Math.max(stats.bestFocusScore || 0, activitySummary.focusScore);
                stats.lastSessionScore = activitySummary.focusScore;
                stats.lastSessionKeystrokes = activitySummary.keystrokes;
                stats.lastSessionClicks = activitySummary.clicks;
                stats.lastSessionActiveSeconds = activitySummary.activeSeconds;
                stats.lastSessionEndedAt = new Date().toISOString();
                stats.focusSecondsByHour = mergeHourlyStats(stats.focusSecondsByHour, activitySummary.secondsByHour);
                return stats;
            });
            if (window.FocusActivity) {
                FocusActivity.stopSession();
            }

            // 关联任务的番茄计数
            if (currentTaskId) {
                Todo.incrementPomodoro(currentTaskId);
            }

            // 更新统计显示
            updateStatsDisplay();

            // 触发完成回调
            if (onComplete) onComplete('focus', currentTaskId);

            // 自动切换
            const s3 = Storage.loadSettings();
            if (s3.autoStartBreak) {
                setTimeout(() => switchMode(Mode.BREAK, true), 1500);
            } else {
                setTimeout(() => switchMode(Mode.BREAK, false), 1500);
            }
        } else {
            // 休息完成
            Storage.addPomodoro({
                type: 'break',
                startTime: new Date(Date.now() - totalTime * 1000).toISOString(),
                endTime: new Date().toISOString(),
                completed: true,
                taskId: null
            });

            if (onComplete) onComplete('break', null);

            const s4 = Storage.loadSettings();
            if (s4.autoStartFocus) {
                setTimeout(() => switchMode(Mode.FOCUS, true), 1500);
            } else {
                setTimeout(() => switchMode(Mode.FOCUS, false), 1500);
            }
        }

        updateUI();
    }

    function mergeHourlyStats(current, add) {
        const merged = Array(24).fill(0);
        for (let i = 0; i < 24; i++) {
            merged[i] = (Number(current?.[i]) || 0) + (Number(add?.[i]) || 0);
        }
        return merged;
    }

    function getEmptyActivitySummary() {
        return {
            keystrokes: 0,
            clicks: 0,
            activeSeconds: 0,
            focusScore: 0,
            secondsByHour: Array(24).fill(0)
        };
    }

    // ============================================================
    // 模式切换
    // ============================================================

    /**
     * 切换专注/休息模式
     * @param {string} newMode
     * @param {boolean} autoStart
     */
    function switchMode(newMode, autoStart = false) {
        mode = newMode;
        resetToMode(mode);

        btnStart.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            开始
        `;
        btnStart.disabled = false;
        btnPause.disabled = true;

        if (autoStart) {
            setTimeout(start, 500);
        }
    }

    /**
     * 重置到指定模式的初始状态
     * @param {string} targetMode
     */
    function resetToMode(targetMode) {
        clearInterval(timerInterval);
        timerInterval = null;
        state = State.IDLE;
        mode = targetMode;

        if (mode === Mode.FOCUS) {
            const sr = Storage.loadSettings();
            timeRemaining = sr.focusDuration * 60;
            modeEl.textContent = '🎯 专注时间';
            modeEl.className = 'pomodoro-mode';
            timerEl.style.color = '';
        } else {
            const sr2 = Storage.loadSettings();
            timeRemaining = sr2.breakDuration * 60;
            modeEl.textContent = '☕ 休息时间';
            modeEl.className = 'pomodoro-mode break-mode';
            timerEl.style.color = 'var(--break-color)';
        }

        totalTime = timeRemaining;
        updateUI();
    }

    // ============================================================
    // UI 更新
    // ============================================================

    /**
     * 更新所有 UI 元素
     */
    function updateUI() {
        // 更新时间显示
        const mins = Math.floor(timeRemaining / 60);
        const secs = timeRemaining % 60;
        timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        // 更新进度
        const progress = totalTime > 0 ? (totalTime - timeRemaining) / totalTime : 0;
        const circumference = 2 * Math.PI * 80; // r=80
        const offset = circumference * (1 - progress);
        progressRing.style.strokeDashoffset = offset;

        // 进度百分比
        progressText.textContent = `${Math.round(progress * 100)}%`;

        // 进度条颜色
        if (mode === Mode.BREAK) {
            progressRing.classList.add('break-progress');
        } else {
            progressRing.classList.remove('break-progress');
        }
    }

    /**
     * 更新统计信息显示
     */
    function updateStatsDisplay() {
        if (todayPomodorosEl) {
            todayPomodorosEl.textContent = `今日完成: ${todayPomodoroCount} 🍅`;
        }
        if (todayFocusTimeEl) {
            todayFocusTimeEl.textContent = `专注: ${todayFocusMinutes}m`;
        }
    }

    // ============================================================
    // 获取状态
    // ============================================================

    /**
     * 获取当前计时器状态
     * @returns {Object}
     */
    function getStatus() {
        return {
            state,
            mode,
            timeRemaining,
            totalTime,
            progress: totalTime > 0 ? (totalTime - timeRemaining) / totalTime : 0,
            currentTaskId,
            activity: window.FocusActivity ? FocusActivity.getSummary(totalTime) : getEmptyActivitySummary()
        };
    }

    /**
     * 获取今日统计
     * @returns {Object}
     */
    function getTodayStats() {
        return {
            totalPomodoros: todayPomodoroCount,
            totalFocusMinutes: todayFocusMinutes
        };
    }

    // ============================================================
    // 公开 API
    // ============================================================

    return {
        init,
        start,
        pause,
        reset,
        getStatus,
        getTodayStats,
        Mode,
        State
    };
})();
