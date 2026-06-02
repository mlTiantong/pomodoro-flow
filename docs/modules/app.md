# 模块：`src/js/app.js`

> **职责**：纯协调器 — 装配所有模块、注册全局事件、做最小的统计展示。所有业务逻辑都在子模块里。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 暴露符号 | `const App` (object) |
| IIFE 包裹 | 是 |
| 依赖 | 所有其他模块（`Todo` / `Pomodoro` / `Notifications` / `SettingsModal` / `MonthViewModal` / `Appearance` / `Storage`） |
| 被谁依赖 | `src/index.html`（DOMContentLoaded + 隐式全局） |
| 行数 | 153 |

---

## 二、模块结构

```
App (IIFE)
├─ init()                  ← DOMContentLoaded 入口
├─ initCloseHandlers()     ← #btnClose + Esc 优先级
│  └─ closeApp()           ← electronAPI.quitApp() / window.close()
├─ initTabs()              ← 主面板 3 Tab 切换
├─ updateStats()           ← 统计面板数据刷新
└─ 启动：DOMContentLoaded → init()
```

---

## 三、`init()` — 启动顺序

```js
function init() {
    console.log('🍅 Tomato Clock 启动中...');

    // 1. 跨窗口同步订阅
    Todo.listenExternal();

    // 2. 待办
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

    // 3. 番茄钟
    Pomodoro.init({
        onComplete: (type) => {
            updateStats();
            Notifications.show(
                type === 'focus' ? '🍅 专注完成！' : '☕ 休息结束',
                type === 'focus' ? '太棒了！休息一下吧~' : '准备好开始下一轮专注了吗？'
            );
        }
    });

    // 4-9. 视图模块装配
    initTabs();
    Notifications.init();
    SettingsModal.init();
    MonthViewModal.init();
    Appearance.init();
    Appearance.apply(Storage.loadAppearance());

    // 10. 统计
    updateStats();

    // 11. Esc 关闭
    initCloseHandlers();

    if (window.electronAPI) console.log('🔌 Electron API 就绪');
    console.log('✅ Tomato Clock 启动完成');
}
```

> 注意：所有「装配顺序」是子模块互相依赖的拓扑序，而不是历史遗留。例如 `SettingsModal` 依赖 `Appearance` 和 `MonthViewModal`，所以它最后才 `init()`。

---

## 四、关闭处理

```js
function initCloseHandlers() {
    document.getElementById('btnClose').addEventListener('click', closeApp);
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
```

`closeApp()`：

```js
function closeApp() {
    if (window.electronAPI && window.electronAPI.quitApp) {
        window.electronAPI.quitApp();
    } else {
        window.close();
    }
}
```

---

## 五、主面板 Tab 切换

```js
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
```

`data-tab="stats"` 时调 `updateStats()` 刷数字。

---

## 六、统计

```js
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
}
```

被两处调用：
1. 切到 `stats` Tab 时（手动刷新）
2. `onTodosChanged` / `onComplete` 回调里（自动同步）

---

## 七、公开 API — inline onclick facade

```js
return {
    init,
    updateStats,
    closeSettingsModal:    () => SettingsModal.close(),
    refreshDailyTodos:     () => SettingsModal.DailyTodos.refresh(),
    refreshCompletedView:  () => SettingsModal.CompletedView.refresh(),
    renderMonthGrid:       () => MonthViewModal.renderGrid(),
    refreshDayDetail:      (d) => MonthViewModal.refreshDayDetail(d),
    selectDay:             (d) => MonthViewModal.selectDay(d)
};
```

> `app.js` 保留这些 facade 的唯一理由是**兼容 `index.html` 里的 inline `onclick` 属性**（这些是动态拼接出来的 onclick 字符串）。如果不维护 facade，得改所有 `onclick` 文本。
>
> 简单点说：`App.refreshDailyTodos()` 是一个 1 行 delegate，纯粹是 API 兼容层。

---

## 八、事件流速查

| 用户操作 | 触发 | 后续 |
|---------|------|------|
| 点设置齿轮 | `#btnSettings` click | `SettingsModal.open` |
| Esc | `keydown` | 月视图 → 设置弹窗 → 关闭应用 |
| 番茄钟跑完 | `Pomodoro.onTimerComplete` | `updateStats` + `Notifications.show` |
| 完成任务 | `Todo.toggleTodo` | `updateStats` + （如果设置弹窗开着）刷子模块 |
| 跨窗口变更 | BroadcastChannel | `Todo.reload` → `onTodosChanged` → 上面 |

---

## 九、扩展指南

### 加全局快捷键

在 `initCloseHandlers` 的 keydown 监听里加分支。

### 加新的 Tab

1. `src/index.html` 加 `.tab[data-tab="xxx"]` 和 `.panel[id="panelXxx"]`
2. `App.initTabs()` 的 `panels` 字典补 key
3. 业务放新模块

### 不在 App 里写业务

App 只做装配和 facade。任何「点击 → 操作 → 反馈」都应该在子模块里。
