# 模块：`src/js/appearance.js`

> **职责**：5 套主题、不透明度、毛玻璃模糊、窗口位置、置顶、点击穿透的统一管理。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 暴露符号 | `const Appearance` (object) |
| IIFE 包裹 | 是 |
| 依赖 | `Storage`、`Pomodoro`（仅 `saveTimerDurations`） |
| 被谁依赖 | `app.js`、`SettingsModal` |
| 行数 | 211 |

---

## 二、模块结构

```
Appearance (IIFE)
├─ 主题表 THEMES（5 套）
├─ init()                        ← 绑定所有设置弹窗里的外观控件
├─ apply(app)                    ← 把外观设置应用到 DOM + Electron 窗口
├─ 内部:
│  ├─ setThemeVariables(theme)   ← --primary / --primary-dark / --primary-light...
│  ├─ setBackground(app)         ← --glass-bg + .glass-container 内联样式
│  ├─ applyWindowGeometry(app)   ← 走 IPC 改窗口位置 + 置顶
│  └─ syncUI(app)                ← 把设置同步到 UI 控件（控件状态回显）
├─ bindControls()                ← 主题/滑块/位置/复选框 事件绑定
├─ saveTimerDurations()          ← 专注/休息时长
└─ switchToAppearanceTab()       ← 给外部按钮（铅笔、月视图设置）调用
```

---

## 三、主题表 `THEMES`

```js
const THEMES = {
    tomato: { primary: '#E85D3A', break: '#4A90D9', bg: 'rgba(40,22,28,%s)' },
    ocean:  { primary: '#2E86DE', break: '#E85D3A', bg: 'rgba(16,28,52,%s)' },
    forest: { primary: '#27AE60', break: '#E67E22', bg: 'rgba(18,34,26,%s)' },
    purple: { primary: '#8E44AD', break: '#2ECC71', bg: 'rgba(38,18,48,%s)' },
    dark:   { primary: '#E85D3A', break: '#4A90D9', bg: 'rgba(6,6,10,%s)'  }
};
```

- `primary` / `break` — 主色 / 休息色
- `bg` — 背景色模板，`%s` 在 `setBackground` 中被 `String(opacity)` 替换

衍生色（`--primary-dark` / `--primary-light` / `--primary-glow`）由 `DomUtils.adjustColor` 计算。

---

## 四、`apply(app)` — 应用外观

```js
function apply(app) {
    if (!app) return;
    const theme = THEMES[app.theme] || THEMES.tomato;
    setThemeVariables(theme);     // 7 个 CSS 变量
    setBackground(app);           // --glass-bg + .glass-container 内联样式
    applyWindowGeometry(app);     // 走 IPC
    syncUI(app);                  // 控件状态回显
}
```

### 主题切换一定改背景色的两层保障

1. **CSS 变量**：`--glass-bg` 写到 `documentElement`，CSS `var(--glass-bg)` 引用
2. **内联样式**：`glassEl.style.background = bgColor` 直接覆盖，绕过级联

### 窗口位置

```js
switch (app.positionPreset) {
    case 'top-left':     x = 20;          y = 20;          break;
    case 'top-right':    x = screenW - w - 20; y = 20;     break;
    case 'bottom-left':  x = 20;          y = screenH - h - 40; break;
    case 'bottom-right': default: x = screenW - w - 30; y = screenH - h - 60; break;
}
window.electronAPI.setWindowPosition(x, y);
```

`screenW` / `screenH` 从 `window.screen` 取；Electron 环境不存在时 `applyWindowGeometry` 直接返回。

---

## 五、`bindControls()`

`init()` 一次性绑定所有设置弹窗里的外观控件：

| 控件 | 事件 | 行为 |
|------|------|------|
| `#focusDuration` | change | `saveTimerDurations` |
| `#breakDuration` | change | `saveTimerDurations` |
| `.theme-card` | click | 改 `app.theme` → `apply` |
| `#opacitySlider` | input | 改 `app.backgroundOpacity` → `apply` |
| `#blurSlider` | input | 改 `app.glassBlur` → `apply` |
| `.pos-btn` | click | 改 `app.positionPreset` → `apply` |
| `#chkEmbedDesktop` | change | 改 `app.embedDesktop` → IPC `reEmbed` |
| `#chkAlwaysOnTop` | change | 改 `app.alwaysOnTop` → `apply` |
| `#chkClickThrough` | change | 改 `app.clickThrough` → IPC `toggleClickThrough` |

---

## 六、`saveTimerDurations()`

```js
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
```

- 范围限制：专注 1-120 分钟，休息 1-60 分钟
- IDLE 状态时立即重置计时器（运行时改时长下一轮才生效）

---

## 七、`switchToAppearanceTab()`

给两个外部按钮调用：
- 番茄钟面板的 `#btnEditDuration`（铅笔图标）
- 月视图弹窗的 `#btnMonthSettings`

实现就是切到 `data-mtab="appearance"` 的 Tab。

---

## 八、扩展指南

### 新增主题

1. `THEMES` 补一项
2. `src/index.html` 的 `.theme-grid` 补一个 `.theme-card`
3. 配套 `--primary-light` 等 CSS 变量由 `adjustColor` 自动算

### 新增位置预设

`applyWindowGeometry()` 的 `switch` 加 case，`bindControls()` 不需要改（事件已委托给 `.pos-btn`）。

### 主题跟随系统

```js
function apply(app) {
    if (app.theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        app = { ...app, theme: prefersDark ? 'dark' : 'tomato' };
    }
    // ...
}
```
