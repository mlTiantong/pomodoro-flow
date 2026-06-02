# 样式系统文档

> **作用域**：`src/styles/*.css` 所有样式文件，含 CSS 变量、主题、玻璃态、组件样式、月视图样式。

---

## 一、文件清单

| 文件 | 行数 | 作用域 |
|------|------|--------|
| `src/styles/main.css` | 1000+ | 主窗口（番茄钟 + Todo + 设置弹窗） |
| `src/styles/month-view.css` | 245 | 月视图窗口 |
| `src/styles/themes.css`（如存在） | — | 5 套主题（warm/sunset/lavender/sakura/ocean） |

⚠️ 实际结构需以 `src/styles/` 目录为准。`themes.css` 可能被合并在 `main.css` 中。

---

## 二、CSS 变量系统

### `:root` 全局变量

```css
:root {
    /* 背景 */
    --bg-color: rgba(255, 245, 238, 0.85);
    --glass-bg: rgba(255, 255, 255, 0.18);
    --glass-border: rgba(255, 255, 255, 0.3);

    /* 文字 */
    --text-primary: #5a4a42;
    --text-secondary: #8a7a72;
    --text-muted: #b0a09a;

    /* 主题色 */
    --primary: #ff7a6b;
    --primary-hover: #ff8a7d;
    --primary-light: rgba(255, 122, 107, 0.12);
    --accent: #ffb84d;

    /* 状态色 */
    --success: #52c41a;
    --warning: #faad14;
    --danger: #ff4d4f;
    --info: #1890ff;

    /* 间距 */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 12px;
    --space-lg: 16px;
    --space-xl: 24px;
    --space-2xl: 32px;

    /* 圆角 */
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 16px;
    --radius-xl: 20px;
    --radius-full: 9999px;

    /* 动画 */
    --transition-fast: 150ms ease;
    --transition-base: 250ms ease;
    --transition-slow: 400ms ease;

    /* 阴影 */
    --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.06);
    --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);
    --shadow-glow: 0 0 24px rgba(255, 122, 107, 0.4);
}
```

### 5 套主题（`THEMES` 在 `src/js/appearance.js`）

```js
const THEMES = {
    tomato: { primary: '#E85D3A', break: '#4A90D9', bg: 'rgba(40,22,28,%s)' },
    ocean:  { primary: '#2E86DE', break: '#E85D3A', bg: 'rgba(16,28,52,%s)' },
    forest: { primary: '#27AE60', break: '#E67E22', bg: 'rgba(18,34,26,%s)' },
    purple: { primary: '#8E44AD', break: '#2ECC71', bg: 'rgba(38,18,48,%s)' },
    dark:   { primary: '#E85D3A', break: '#4A90D9', bg: 'rgba(6,6,10,%s)'  }
};
```

| key | primary | break | bg 模板 |
|-----|---------|-------|---------|
| `tomato` | `#E85D3A` | `#4A90D9` | `rgba(40,22,28, %s)` |
| `ocean`  | `#2E86DE` | `#E85D3A` | `rgba(16,28,52, %s)` |
| `forest` | `#27AE60` | `#E67E22` | `rgba(18,34,26, %s)` |
| `purple` | `#8E44AD` | `#2ECC71` | `rgba(38,18,48, %s)` |
| `dark`   | `#E85D3A` | `#4A90D9` | `rgba(6,6,10, %s)` |

主题切换由 `Appearance.apply()`（`src/js/appearance.js:32`）执行：

```js
function apply(app) {
    const theme = THEMES[app.theme] || THEMES.tomato;
    const opacity = Number(app.backgroundOpacity) || 0.55;
    const bgColor = theme.bg.replace(/%s/g, String(opacity));

    // 1. 设 CSS 变量（影响 .glass-container 上的 var(--glass-bg)）
    document.documentElement.style.setProperty('--primary',       theme.primary);
    document.documentElement.style.setProperty('--primary-dark',  adjustColor(theme.primary, -20));
    document.documentElement.style.setProperty('--primary-light', adjustColor(theme.primary,  30));
    document.documentElement.style.setProperty('--break-color',   theme.break);
    document.documentElement.style.setProperty('--glass-bg',      bgColor);
    document.documentElement.style.setProperty('--glass-blur',    `${app.glassBlur || 24}px`);

    // 2. 直接覆盖内联样式（双层保障，确保背景一定改变）
    const glassEl = document.querySelector('.glass-container');
    if (glassEl) glassEl.style.background = bgColor;
}
```

---

## 三、玻璃态（Glassmorphism）

```css
.glass-container {
    width: 100%;
    height: 100%;
    background: var(--bg-color);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-radius: var(--radius-lg);
    border: 1px solid var(--glass-border);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
```

关键点：
- `backdrop-filter: blur(20px)` 是玻璃效果核心，依赖 `transparent: true` 窗口
- `saturate(180%)` 让透过去的颜色更鲜艳
- `-webkit-backdrop-filter` 是 Safari 支持

---

## 四、Tab 切换

```css
.tab-content { display: none; }
.tab-content.active { display: flex; }

.tab-bar {
    display: flex;
    background: rgba(255, 255, 255, 0.15);
    border-radius: var(--radius-full);
    padding: 4px;
    gap: 4px;
}

.tab-btn {
    flex: 1;
    padding: 8px 12px;
    border-radius: var(--radius-full);
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--transition-base);
}

.tab-btn.active {
    background: var(--primary);
    color: white;
    box-shadow: var(--shadow-sm);
}
```

`tab-btn` 用 `flex: 1` 平分宽度，激活态加 `var(--primary)` 背景。

---

## 五、按钮

```css
.btn {
    padding: 10px 20px;
    border-radius: var(--radius-md);
    border: none;
    cursor: pointer;
    font-weight: 500;
    transition: all var(--transition-base);
    user-select: none;
}

.btn-primary {
    background: var(--primary);
    color: white;
}

.btn-primary:hover {
    background: var(--primary-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
}

.btn-primary:active {
    transform: translateY(0);
}

.btn-secondary {
    background: var(--glass-bg);
    color: var(--text-primary);
    border: 1px solid var(--glass-border);
}

.btn-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--transition-fast);
}

.btn-icon:hover {
    background: var(--primary-light);
}
```

---

## 六、输入框

```css
input[type="text"],
input[type="number"] {
    width: 100%;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 14px;
    transition: border-color var(--transition-base);
}

input:focus {
    outline: none;
    border-color: var(--primary);
    background: rgba(255, 255, 255, 0.6);
}
```

`input[type="number"]` 用 `-moz-appearance: textfield` 和 `::-webkit-outer-spin-button` 去掉上下箭头。

---

## 七、番茄钟面板

```css
.pomodoro-mode-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.pomodoro-mode {
    font-size: 14px;
    color: var(--text-secondary);
    font-weight: 500;
    letter-spacing: 0.5px;
}

.pomo-edit-btn {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--primary-light);
    color: var(--primary);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: all var(--transition-fast);
}

.pomo-edit-btn:hover {
    background: var(--primary);
    color: white;
    transform: scale(1.1);
}

.pomodoro-display {
    font-size: 96px;
    font-weight: 200;
    color: var(--text-primary);
    letter-spacing: -4px;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.pomodoro-progress {
    width: 100%;
    height: 4px;
    background: rgba(0, 0, 0, 0.06);
    border-radius: var(--radius-full);
    overflow: hidden;
}

.pomodoro-progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--primary), var(--accent));
    border-radius: var(--radius-full);
    transition: width 1s linear;
}
```

`pomodoro-display` 用 `font-variant-numeric: tabular-nums` 让数字宽度一致，避免 1 和 0 跳。

---

## 八、Todo 列表

```css
.todo-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
}

.todo-item:hover {
    background: var(--primary-light);
}

.todo-checkbox {
    width: 18px;
    height: 18px;
    border-radius: var(--radius-sm);
    border: 2px solid var(--text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
}

.todo-checkbox.checked {
    background: var(--primary);
    border-color: var(--primary);
}

.todo-text {
    flex: 1;
    color: var(--text-primary);
    font-size: 14px;
}

.todo-text.completed {
    text-decoration: line-through;
    color: var(--text-muted);
}

.todo-delete {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0;
    transition: all var(--transition-fast);
}

.todo-item:hover .todo-delete {
    opacity: 1;
}

.todo-delete:hover {
    background: var(--danger);
    color: white;
}
```

删除按钮默认透明，hover 整行才显示。

---

## 九、设置弹窗

```css
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-base);
}

.modal-overlay.active {
    opacity: 1;
    pointer-events: auto;
}

.modal {
    background: rgba(255, 255, 255, 0.95);
    border-radius: var(--radius-lg);
    padding: var(--space-xl);
    width: 90%;
    max-width: 360px;
    max-height: 85%;
    overflow-y: auto;
    box-shadow: var(--shadow-lg);
    transform: scale(0.9);
    transition: transform var(--transition-base);
}

.modal-overlay.active .modal {
    transform: scale(1);
}
```

`opacity: 0` + `transform: scale(0.9)` → `active` 状态变 `1` + `1`，实现「淡入 + 放大」动画。

---

## 十、滚动条

```css
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
    border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.25);
}
```

---

## 十一、月视图样式（`src/styles/month-view.css`）

### 顶部栏

```css
.month-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 28px;
    border-bottom: 1px solid var(--glass-border);
}

.month-title {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
}

.month-nav {
    display: flex;
    gap: 8px;
}

.month-nav-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--glass-bg);
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
}
```

### 日历网格

```css
.month-calendar {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    padding: 20px 28px;
}

.month-day {
    aspect-ratio: 1;
    border-radius: var(--radius-md);
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    padding: 8px;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    transition: all var(--transition-base);
}

.month-day:hover {
    background: var(--primary-light);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
}

.month-day.today {
    border-color: var(--primary);
    background: var(--primary-light);
}

.month-day.other-month {
    opacity: 0.4;
}

.month-day-num {
    font-size: 14px;
    color: var(--text-primary);
    font-weight: 500;
}

.month-day-pomos {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: auto;
}
```

`aspect-ratio: 1` 让每个格子保持正方形。

---

## 十二、动画

### `@keyframes`

```css
@keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
}

@keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
}

@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.05); }
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}
```

### 使用

```css
.tab-content.active {
    animation: fadeIn var(--transition-base);
}

.pomodoro-display.running {
    animation: pulse 2s ease-in-out infinite;
}
```

---

## 十三、响应式

主窗口固定 340×500，月视图 min 800×560。CSS 中**不**使用 `@media`，因为窗口大小固定。

如果未来支持可调整窗口大小，需要加：

```css
@media (max-width: 600px) {
    .month-calendar { gap: 4px; padding: 12px; }
    .month-day { padding: 4px; }
}
```

---

## 十四、可访问性

### 焦点环

```css
button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
}
```

### 屏幕阅读器

```html
<button aria-label="关闭" title="关闭">×</button>
```

⚠️ 当前代码**没有**用 `aria-label`，是已知改进点。

### `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
    * {
        animation: none !important;
        transition: none !important;
    }
}
```

⚠️ 当前代码**没有**实现该媒体查询。

---

## 十五、性能注意

1. **`backdrop-filter: blur`** 占用 GPU 资源，过多元素使用会卡顿
2. **`box-shadow` + `transform`** 触发 GPU 合成层，但滥用会爆显存
3. **避免 `width/height` 动画**，用 `transform: scale` 代替
4. **`will-change`** 谨慎使用：仅在即将动画的元素上加
