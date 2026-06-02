# 模块：月/周视图（`src/month-view.html` + `src/js/month-view.js` + `src/styles/month-view.css`）

> **职责**：在独立窗口（Electron BrowserWindow）中展示 7 天连续任务，与主窗口通过 `localStorage` + `BroadcastChannel` 双向同步。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| HTML | `src/month-view.html`（43 行） |
| JS | `src/js/month-view.js`（226 行） |
| CSS | `src/styles/month-view.css`（245 行） |
| 暴露符号 | `const WeekView` (object) |
| 依赖 | `Storage`、`Todo`、`DateUtils`、`DomUtils` |
| 加载入口 | 独立窗口通过 `ipcMain.on('open-month-view')` 加载此 HTML |

> **注意**：本模块与 `month-view-modal.js`（主窗口内联月历）是**两个独立实现**。详见 [month-view-modal.md](./month-view-modal.md) 对比。
| 依赖 | `Storage`、`Todo` (两个都是 global，因为月视图也加载 `storage.js` + `todo.js`) |

---

## 二、HTML 结构

```html
<div class="mv-glass">                <!-- 玻璃容器 -->
    <header class="mv-titlebar">      <!-- 标题栏（可拖动） -->
        <div class="mv-titlebar-left">
            🍅 番茄钟 · 周视图
        </div>
        <div class="mv-titlebar-right">
            <button id="mvBtnToday">📅 今天</button>
            <button id="mvBtnClose">✕</button>
        </div>
    </header>

    <div class="wv-nav">              <!-- 4 按钮 + 标题 -->
        <button id="wvBtnPrevWeek">⏪</button>
        <button id="wvBtnPrevDay">◀</button>
        <span id="wvNavTitle">5月25日 周一 — 5月31日 周日</span>
        <button id="wvBtnNextDay">▶</button>
        <button id="wvBtnNextWeek">⏩</button>
    </div>

    <div class="wv-grid" id="wvGrid"> <!-- 7 列网格 -->
        <!-- 由 JS 渲染 -->
    </div>
</div>
```

---

## 三、CSS 关键变量

```css
:root {
    --primary: #E85D3A;
    --glass-bg: rgba(18,16,30,0.78);   /* 比主面板深 */
    --glass-blur: 28px;
    /* ... */
}
```

⚠️ 月视图有**独立**的 `:root`，**不**跟主窗口主题同步。修改主窗口主题不会影响月视图。

---

## 四、JS 模块结构

```
WeekView (IIFE)
├─ 状态: weekStart (Date)
├─ isNavigating (动画开关)
├─ init()
│  ├─ 抓 5 个按钮的引用
│  ├─ weekStart = 本周第一天
│  ├─ 绑 4 个导航按钮 + 今天/关闭
│  ├─ BroadcastChannel 监听
│  ├─ window.storage 事件兜底
│  ├─ setInterval(5000) 兜底刷新
│  └─ render()
├─ render()
│  ├─ isInputFocused() → 用户在打字时跳过
│  ├─ Todo.reload()     ← 拉最新内存
│  ├─ 算 7 天的日期数组
│  ├─ 拼每列的 taskHtml
│  ├─ 拼 7 列的 innerHTML
│  ├─ 控制导航动画 class
│  └─ 委托事件绑输入
├─ toggle(id) / del(id) / delAll(id) / focusAdd(dateStr)
├─ 工具: getWeekStart / getTodayStr / fmtDate / esc / isInputFocused
```

---

## 五、初始化 `init()`

```js
function init() {
    weekStart = getWeekStart(new Date());

    // 5 个按钮
    document.getElementById('wvBtnPrevWeek').addEventListener('click', () => {
        weekStart.setDate(weekStart.getDate() - 7);
        isNavigating = true; render();
    });
    // ... 4 个 nav + today + close

    // 跨窗口同步: BroadcastChannel
    try {
        const bc = new BroadcastChannel('tomato-clock');
        bc.addEventListener('message', () => {
            if (!isInputFocused()) requestAnimationFrame(() => render());
        });
    } catch(e) {}

    // 跨窗口同步: localStorage storage 事件（不同 app 实例间）
    window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('tomato_clock_')) {
            if (!isInputFocused()) requestAnimationFrame(() => render());
        }
    });

    // 兜底: 定时刷新
    setInterval(() => {
        if (!isInputFocused()) requestAnimationFrame(() => render());
    }, 5000);

    render();
}
```

### 三层同步

| 机制 | 用途 | 触发 |
|------|------|------|
| `BroadcastChannel` | 同源同进程最快 | 主窗口 `Todo.broadcastChange()` |
| `window.addEventListener('storage')` | 跨 BrowserWindow 实例 | 任何 localStorage 写 |
| `setInterval(5000)` | 兜底 | 每 5 秒 |

⚠️ **`storage` 事件仅在「其他」窗口写时触发**，不写自己的窗口。所以本窗口的写入不会触发自己的 storage 监听。

---

## 六、`render()`

### 渲染前检查

```js
function render() {
    if (isInputFocused()) return;   // 用户在打字，不刷
    // ...
}
```

避免吞掉用户输入。

### 计算 7 天

```js
const days = [];
for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
}
```

`weekStart` 本身是 `Date` 对象，循环里 `new Date(weekStart)` 复制一份避免被 `setDate` 改到。

### 标题

```js
const wds = ['周日','周一','周二','周三','周四','周五','周六'];
title.textContent = `${start.month+1}月${start.date}日 ${wds[start.day]} — ${end.month+1}月${end.date}日 ${wds[end.day]}`;
```

形如 `5月25日 周一 — 5月31日 周日`。

### 单列模板

```html
<div class="wv-col {isToday?'wv-today':''}">
    <div class="wv-col-header">
        <span class="wv-col-day">{wd}</span>
        <span class="wv-col-date {isToday?'wv-col-date-today':''}">{d}</span>
    </div>

    <div class="wv-col-tasks" data-date="{dateStr}">
        <!-- 未完成任务 -->
        {active.map(t => `
            <div class="wv-task">
                <button class="wv-task-cb" onclick="WeekView.toggle('{id}')"></button>
                <span class="wv-task-text">{text}</span>
                {recurring && <span class="wv-task-badge">↻</span>}
                {recurring && <button class="wv-task-delall">🗑️</button>}
                <button class="wv-task-del">✕</button>
            </div>
        `)}
        <!-- 已完成任务 -->
        {done.map(t => `
            <div class="wv-task wv-task-done">
                <button class="wv-task-cb checked"></button>
                <span class="wv-task-text">{text}</span>
            </div>
        `)}
        <!-- 添加入口 -->
        <div class="wv-task-add" onclick="WeekView.focusAdd('{dateStr}')">
            <span class="wv-add-icon">＋</span>
            <span class="wv-add-text">添加任务</span>
        </div>
    </div>

    <div class="wv-col-input" style="display:none;" data-date="{dateStr}">
        <input class="wv-inline-input" maxlength="200" placeholder="输入任务...">
        <button class="wv-inline-add">➕</button>
    </div>
</div>
```

---

## 七、内联编辑

### 显示输入框 `focusAdd(dateStr)`

```js
function focusAdd(dateStr) {
    document.querySelectorAll('.wv-col-input').forEach(el => el.style.display = 'none');
    const row = document.querySelector(`.wv-col-input[data-date="${dateStr}"]`);
    if (row) {
        row.style.display = 'flex';
        const inp = row.querySelector('.wv-inline-input');
        inp.value = '';
        inp.focus();
    }
}
```

单选：先全关，再开选中的。

### 提交（事件委托）

```js
grid.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.wv-inline-add');
    if (addBtn) {
        const row = addBtn.closest('.wv-col-input');
        const inp = row.querySelector('.wv-inline-input');
        const date = row.dataset.date;
        const text = inp.value.trim();
        if (!text) return;
        Todo.addTodo(text, { date });
        inp.value = '';
        requestAnimationFrame(() => render());
    }
});

grid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const inp = e.target.closest('.wv-inline-input');
        if (inp) {
            const addBtn = inp.closest('.wv-col-input').querySelector('.wv-inline-add');
            if (addBtn) addBtn.click();
        }
    }
});
```

`Todo.addTodo` 会触发跨窗口广播，本窗口会再 `render()` 一次。

---

## 八、任务操作

```js
function toggle(id) { Todo.toggleTodo(id); render(); }
function del(id)    { Todo.deleteTodo(id, true); render(); }
function delAll(id) { Todo.deleteRecurringAll(id); render(); }
```

⚠️ 这里没走 `Todo.saveAndRender` 的 `saveAndRender`（因为不是 `Todo` 自己改的），而是显式 `Todo.xxx + render()`。`Todo.xxx` 内部已 `saveAndRender` 一次，所以 `render()` 这次会读到最新内存。

---

## 九、工具

### `getWeekStart(date)`

```js
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();          // 0=Sun, 1=Mon...
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);   // 回到周一
    d.setHours(0, 0, 0, 0);
    return d;
}
```

返回**周一**的 `Date` 对象，时间归 0。

### `isInputFocused()`

```js
function isInputFocused() {
    const el = document.activeElement;
    return el && (el.classList.contains('wv-inline-input') || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}
```

判断用户是否在输入框里打字。整个 render() 都会被这个检查兜住。

---

## 十、与主窗口的差异

| 项 | 主窗口内联月视图（`month-view-modal.js`） | 独立窗口月视图（`month-view.js`） |
|----|------------------------|--------------------------------|
| HTML 容器 | `#monthViewOverlay` 模态 | `mv-glass` 全屏 |
| 任务显示 | 每格前 2+1 个，文字截 8 字 | 全部显示 |
| 添加 | 底部 input | 每列底部 input |
| 切换月 | 上/下月 + 今天 | 上一周/下一周 + 前后天 |
| 关闭 | 点 X | IPC 通知主进程 |
| 跨窗口同步 | 通过 `app.js` 转发 `Todo.listenExternal` | 三层（BC + storage + 定时） |

两套实现**不共享代码**。如果想统一，需要抽公共函数。

---

## 十一、关闭

```js
document.getElementById('mvBtnClose').addEventListener('click', () => {
    if (window.electronAPI) window.electronAPI.closeMonthView();
    else window.close();
});
```

走 IPC 让主进程关窗口。降级（非 Electron 环境）直接 `window.close()`。

---

## 十二、性能

- 7 天 × 全部 todos：典型 < 1ms
- 重绘频率：导航按钮 → 一次；BroadcastChannel → 一次（被广播频繁触发时）；定时器 → 5s 一次（兜底）

⚠️ 大量任务（> 200）会卡 innerHTML 重写，需要时改成事件委托 + 增量更新。

---

## 十三、扩展指南

### 加月份切换

把 4 个按钮改成 6 个：上/下月 + 上一周/下一周 + 前后天。

### 与主窗口主题同步

月视图 HTML 加载主窗口的 `index.html` 副本（去掉设置弹窗），主题自动跟着走。或者从主窗口 `localStorage` 读 `appearance` 写月视图 `:root`。

### 改用事件委托优化

把 `onclick="WeekView.toggle('{id}')"` 全部改为事件委托：

```js
grid.addEventListener('click', e => {
    const cb = e.target.closest('.wv-task-cb');
    if (cb) {
        const id = cb.closest('.wv-task').dataset.id;
        Todo.toggleTodo(id);
        render();
    }
});
```

需要给每个 `.wv-task` 加 `data-id`，innerHTML 改一下。
