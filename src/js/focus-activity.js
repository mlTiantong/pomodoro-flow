/**
 * focus-activity.js — 跨窗口输入记录 + 键盘花园
 *
 * 所有窗口都加载本模块。键盘花园独立于番茄钟：
 *   - 应用启动后主进程常驻全局键盘监听（GetAsyncKeyState 轮询）
 *   - 渲染端按"先到先得"选举一个 key receiver 真正处理按键
 *   - 非 receiver 窗口通过 localStorage `storage` 事件 + BroadcastChannel 被动更新
 * 这样无论哪个窗口是否激活，键盘花园都能持续记录按键。
 */

const FocusActivity = (() => {
    'use strict';

    // 专用 channel：与 todos 模块隔离，避免 BroadcastChannel 跨实例分发
    // 触发不必要的 reload（如按键触发主窗口 todoList 刷新）
    const CHANNEL = 'tomato-activity';
    const HARVEST_AT = 100;
    // 每次按键的成长值：8 → 3（37.5%）
    // 降低后首次收成需要 ~33 次按键（早期）→ ~20 次（多收成后奖励提升），
    // 各阶段持续时间显著延长，"果"阶段从 1-3 次按键延长到 3-5 次按键
    const GROWTH_PER_KEY = 3;
    const COINS_PER_HARVEST = 5;
    const IGNORED_KEYS = new Set([
        'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
    ]);

    let initialized = false;
    let lastSecondStamp = 0;
    let isKeyReceiver = false;

    async function init() {
        if (initialized) return;
        initialized = true;

        // 点击始终在窗口内监听（不需要全局）
        document.addEventListener('pointerdown', recordClick, true);

        // 键盘：优先全局（主进程选举 key receiver），失败回退窗口内
        let usingGlobal = false;
        try {
            if (window.electronAPI?.isGlobalKeyboardTrackingAvailable
                && window.electronAPI?.onGlobalKeyPress
                && window.electronAPI?.claimKeyReceiver) {

                const available = await window.electronAPI.isGlobalKeyboardTrackingAvailable();
                if (available) {
                    usingGlobal = true;

                    // 总是订阅 onGlobalKeyPress：主进程只会把事件发给当前 receiver，
                    // 但所有窗口都注册回调能保证 receiver 切换时无缝接管
                    window.electronAPI.onGlobalKeyPress(recordGlobalKey);

                    // 订阅 receiver 状态变更推送（如当前 receiver 关闭后被其他窗口接管）
                    window.electronAPI.onKeyReceiverChanged?.((data) => {
                        isKeyReceiver = !!data?.isReceiver;
                    });

                    // 选举：先到先得
                    const claimed = await window.electronAPI.claimKeyReceiver();
                    isKeyReceiver = !!claimed;

                    // 窗口关闭时主动释放（主进程也会兜底）
                    window.addEventListener('beforeunload', () => {
                        try { window.electronAPI?.releaseKeyReceiver?.(); } catch (e) {}
                    });
                }
            }
        } catch (err) {
            console.warn('[FocusActivity] 全局按键能力检查失败，回退到窗口内监听:', err);
        }

        if (!usingGlobal) {
            // 降级路径：仅窗口内监听（窗口未激活时无法记录，这是已知的限制）
            document.addEventListener('keydown', recordKeydown, true);
        }
    }

    function startSession(sessionId) {
        const activity = Storage.resetFocusActivity(sessionId || DomUtils.generateId());
        setKeyboardTracking(true);
        return activity;
    }

    function stopSession() {
        setKeyboardTracking(false);
        return Storage.stopFocusActivity();
    }

    function pauseSession() {
        setKeyboardTracking(false);
        return Storage.saveFocusActivity({ ...Storage.loadFocusActivity(), active: false });
    }

    function resumeSession() {
        const activity = Storage.loadFocusActivity();
        if (!activity.sessionId) return activity;
        activity.active = true;
        setKeyboardTracking(true);
        return Storage.saveFocusActivity(activity);
    }

    function getSession() {
        return Storage.loadFocusActivity();
    }

    function tickActiveSecond() {
        const activity = Storage.loadFocusActivity();
        if (!activity.active || !activity.lastInputAt) return activity;

        const now = Date.now();
        if (now - activity.lastInputAt > 10000) return activity;
        const secondStamp = Math.floor(now / 1000);
        if (secondStamp === lastSecondStamp) return activity;

        lastSecondStamp = secondStamp;
        const hour = new Date().getHours();
        activity.activeSeconds++;
        activity.secondsByHour[hour] = (activity.secondsByHour[hour] || 0) + 1;
        return Storage.saveFocusActivity(activity);
    }

    function getSummary(totalTime) {
        const activity = Storage.loadFocusActivity();
        const focusScore = Math.min(100, Math.round((activity.activeSeconds / Math.max(1, totalTime)) * 100));
        return {
            keystrokes: activity.keystrokes,
            clicks: activity.clicks,
            activeSeconds: activity.activeSeconds,
            secondsByHour: activity.secondsByHour,
            focusScore
        };
    }

    function recordKeydown(e) {
        // 此函数仅在降级路径（无全局键盘）下注册，避免与全局监听重复计数
        if (!shouldCountKey(e)) return;
        const key = normalizeKey(e.key);
        recordKeyboardInput(key);
    }

    function recordGlobalKey(key) {
        if (!isKeyReceiver) return;
        if (!key || IGNORED_KEYS.has(key)) return;
        // 不再检查 focus session：键盘花园独立于番茄钟
        recordKeyboardInput(normalizeKey(key));
    }

    function recordKeyboardInput(key) {
        if (!key) return;
        recordInput({ key, isKeyboard: true });
        growKey(key);
    }

    function recordClick(e) {
        if (isChromeControl(e.target)) return;
        recordInput({ isClick: true });
    }

    function recordInput({ key = null, isKeyboard = false, isClick = false }) {
        const activity = Storage.loadFocusActivity();
        if (activity.active) {
            if (isKeyboard) activity.keystrokes++;
            if (isClick) activity.clicks++;
            activity.lastInputAt = Date.now();
            Storage.saveFocusActivity(activity);
        }

        broadcast({
            type: 'activity-input',
            key,
            isKeyboard,
            isClick
        });
    }

    function growKey(key) {
        if (!key) return;
        const garden = Storage.loadKeyboardGarden();
        const plant = {
            growth: 0,
            harvests: 0,
            presses: 0,
            stage: 0,
            lastPressedAt: null,
            ...(garden.keys[key] || {})
        };

        plant.presses++;
        plant.growth += GROWTH_PER_KEY + Math.min(6, Math.floor(plant.harvests / 3));
        plant.lastPressedAt = new Date().toISOString();

        let harvested = false;
        while (plant.growth >= HARVEST_AT) {
            plant.growth -= HARVEST_AT;
            plant.harvests++;
            garden.coins += COINS_PER_HARVEST + Math.min(10, plant.harvests);
            garden.totalHarvests++;
            garden.lastHarvestAt = new Date().toISOString();
            harvested = true;
        }

        plant.stage = calculateStage(plant.growth, plant.harvests);
        garden.totalKeystrokes++;
        garden.keys[key] = plant;
        Storage.saveKeyboardGarden(garden);

        broadcast({
            type: harvested ? 'garden-harvest' : 'garden-grow',
            key,
            plant,
            coins: garden.coins,
            totalHarvests: garden.totalHarvests
        });
    }

    function calculateStage(growth, harvests) {
        if (harvests > 0 && growth > 80) return 4;
        if (growth >= 75) return 3;
        if (growth >= 45) return 2;
        if (growth >= 15) return 1;
        return 0;
    }

    function shouldCountKey(e) {
        if (!e.key || IGNORED_KEYS.has(e.key)) return false;
        if (e.repeat) return true;
        if (isChromeControl(e.target)) return false;
        return true;
    }

    function isChromeControl(target) {
        if (!target) return false;
        return !!target.closest?.('.app-header, .tabs, .pomodoro-controls, .modal-overlay, .mv-titlebar, .garden-titlebar');
    }

    function normalizeKey(key) {
        if (key === ' ') return 'Space';
        if (key.length === 1) return key.toUpperCase();
        return key;
    }

    function setKeyboardTracking(_enabled) {
        // 已废弃：全局键盘监听是常驻的，不再受番茄钟会话开关控制
        // 保留此函数仅为向后兼容（startSession/pauseSession/resumeSession/stopSession 仍可能调用）
    }

    function broadcast(message) {
        try {
            const bc = new BroadcastChannel(CHANNEL);
            bc.postMessage(message);
            bc.close();
        } catch(e) {}
    }

    return {
        init,
        startSession,
        stopSession,
        pauseSession,
        resumeSession,
        getSession,
        getSummary,
        tickActiveSecond,
        growKey,
        recordGlobalKey,
        // 暴露为单一真理之源：写入（growKey 内）和显示（keyboard-garden 渲染）共用
        calculateStage,
        // 阶段阈值常量（供其他模块调整或文档引用）
        STAGE: { SEED: 0, SPROUT: 1, LEAVES: 2, FLOWER: 3, FRUIT: 4 },
        GROWTH_PER_KEY,
        HARVEST_AT
    };
})();

window.FocusActivity = FocusActivity;
