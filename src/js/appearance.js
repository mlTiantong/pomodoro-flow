/**
 * appearance.js — 主题/外观模块
 *
 * 负责 5 套主题、不透明度、毛玻璃模糊、窗口位置、置顶、点击穿透。
 * 把 CSS 变量、.glass-container 内联样式、Electron 窗口操作统一封装。
 *
 * 依赖：Storage
 */

const Appearance = (() => {
    'use strict';

    /**
     * 5 套主题表：主色、休息色、背景色模板（%s 会被 opacity 替换）
     */
    const THEMES = {
        tomato: { primary: '#E85D3A', break: '#4A90D9', bg: 'rgba(40,22,28,%s)' },
        ocean:  { primary: '#2E86DE', break: '#E85D3A', bg: 'rgba(16,28,52,%s)' },
        forest: { primary: '#27AE60', break: '#E67E22', bg: 'rgba(18,34,26,%s)' },
        purple: { primary: '#8E44AD', break: '#2ECC71', bg: 'rgba(38,18,48,%s)' },
        dark:   { primary: '#E85D3A', break: '#4A90D9', bg: 'rgba(6,6,10,%s)'  }
    };

    function init() {
        bindControls();
    }

    /**
     * 把外观设置应用到 DOM + Electron 窗口
     * @param {Object} app
     */
    function apply(app) {
        if (!app) return;

        const theme = THEMES[app.theme] || THEMES.tomato;
        setThemeVariables(theme);
        setBackground(app);
        applyWindowGeometry(app);
        syncUI(app);
    }

    function setThemeVariables(theme) {
        const root = document.documentElement.style;
        root.setProperty('--primary', theme.primary);
        root.setProperty('--primary-dark', DomUtils.adjustColor(theme.primary, -20));
        root.setProperty('--primary-light', DomUtils.adjustColor(theme.primary, 30));
        root.setProperty('--primary-glow', `${theme.primary}4D`);
        root.setProperty('--break-color', theme.break);
        root.setProperty('--break-light', DomUtils.adjustColor(theme.break, 30));
        root.setProperty('--break-glow', `${theme.break}4D`);
    }

    function setBackground(app) {
        const theme = THEMES[app.theme] || THEMES.tomato;
        const opacity = Number(app.backgroundOpacity) || 0.55;
        const bgColor = theme.bg.replace(/%s/g, String(opacity));
        document.documentElement.style.setProperty('--glass-bg', bgColor);
        const glassEl = document.querySelector('.glass-container');
        if (glassEl) glassEl.style.background = bgColor;
        document.documentElement.style.setProperty('--glass-blur', `${app.glassBlur || 24}px`);
    }

    function applyWindowGeometry(app) {
        if (!window.electronAPI) return;
        const screenW = window.screen?.width || 1920;
        const screenH = window.screen?.height || 1080;
        const w = app.windowWidth || 340;
        const h = app.windowHeight || 500;
        let x, y;
        switch (app.positionPreset) {
            case 'top-left':     x = 20;          y = 20;          break;
            case 'top-right':    x = screenW - w - 20; y = 20;     break;
            case 'bottom-left':  x = 20;          y = screenH - h - 40; break;
            case 'bottom-right': default: x = screenW - w - 30; y = screenH - h - 60; break;
        }
        window.electronAPI.setWindowPosition(x, y);
        if (app.alwaysOnTop !== undefined) {
            window.electronAPI.setAlwaysOnTop(!!app.alwaysOnTop);
        }
    }

    /**
     * 把当前外观设置同步到设置弹窗的 UI 控件
     * @param {Object} app
     */
    function syncUI(app) {
        document.querySelectorAll('.theme-card').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === app.theme);
        });
        const opacitySlider = document.getElementById('opacitySlider');
        if (opacitySlider) {
            const val = Math.round((app.backgroundOpacity || 0.55) * 100);
            opacitySlider.value = val;
            document.getElementById('opacityValue').textContent = val + '%';
        }
        const blurSlider = document.getElementById('blurSlider');
        if (blurSlider) {
            blurSlider.value = app.glassBlur || 24;
            document.getElementById('blurValue').textContent = (app.glassBlur || 24) + 'px';
        }
        document.querySelectorAll('.pos-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.pos === (app.positionPreset || 'bottom-right'));
        });
        document.getElementById('chkEmbedDesktop').checked = app.embedDesktop !== false;
        document.getElementById('chkAlwaysOnTop').checked = !!app.alwaysOnTop;
        document.getElementById('chkClickThrough').checked = !!app.clickThrough;
    }

    /**
     * 绑定设置弹窗里的所有外观控件
     */
    function bindControls() {
        // 番茄钟时长
        document.getElementById('focusDuration').addEventListener('change', saveTimerDurations);
        document.getElementById('breakDuration').addEventListener('change', saveTimerDurations);

        // 主题
        document.querySelectorAll('.theme-card').forEach(btn => {
            btn.addEventListener('click', () => {
                const app = Storage.loadAppearance();
                app.theme = btn.dataset.theme;
                Storage.saveAppearance(app);
                Appearance.apply(app);
            });
        });

        // 透明度
        document.getElementById('opacitySlider').addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            document.getElementById('opacityValue').textContent = val + '%';
            const app = Storage.loadAppearance();
            app.backgroundOpacity = val / 100;
            Storage.saveAppearance(app);
            Appearance.apply(app);
        });

        // 模糊
        document.getElementById('blurSlider').addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            document.getElementById('blurValue').textContent = val + 'px';
            const app = Storage.loadAppearance();
            app.glassBlur = val;
            Storage.saveAppearance(app);
            Appearance.apply(app);
        });

        // 窗口位置
        document.querySelectorAll('.pos-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const app = Storage.loadAppearance();
                app.positionPreset = btn.dataset.pos;
                Storage.saveAppearance(app);
                Appearance.apply(app);
            });
        });

        // 复选框
        document.getElementById('chkEmbedDesktop').addEventListener('change', (e) => {
            const app = Storage.loadAppearance();
            app.embedDesktop = e.target.checked;
            Storage.saveAppearance(app);
            if (e.target.checked && window.electronAPI) window.electronAPI.reEmbed();
        });
        document.getElementById('chkAlwaysOnTop').addEventListener('change', (e) => {
            const app = Storage.loadAppearance();
            app.alwaysOnTop = e.target.checked;
            Storage.saveAppearance(app);
            Appearance.apply(app);
        });
        document.getElementById('chkClickThrough').addEventListener('change', (e) => {
            const app = Storage.loadAppearance();
            app.clickThrough = e.target.checked;
            Storage.saveAppearance(app);
            if (window.electronAPI) window.electronAPI.toggleClickThrough(e.target.checked);
        });
    }

    /**
     * 保存番茄钟专注/休息时长，IDLE 时立即重置计时器
     */
    function saveTimerDurations() {
        const focusVal = parseInt(document.getElementById('focusDuration').value) || 25;
        const breakVal = parseInt(document.getElementById('breakDuration').value) || 5;
        const settings = Storage.loadSettings();
        settings.focusDuration = Math.max(1, Math.min(120, focusVal));
        settings.breakDuration = Math.max(1, Math.min(60, breakVal));
        Storage.saveSettings(settings);

        if (Pomodoro.getStatus().state === Pomodoro.State.IDLE) {
            Pomodoro.reset();
        }
    }

    /**
     * 切换到「外观」Tab — 给外部按钮（番茄钟面板的铅笔、月视图设置按钮）调用
     */
    function switchToAppearanceTab() {
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.modal-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-mtab="appearance"]').classList.add('active');
        document.getElementById('mtabAppearance').classList.add('active');
    }

    return {
        init,
        apply,
        syncUI,
        saveTimerDurations,
        switchToAppearanceTab
    };
})();
