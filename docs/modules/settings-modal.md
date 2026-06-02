# 模块：`src/js/settings-modal.js`

> **职责**：设置弹窗整体（4 个 Tab：每日待办、已完成、快速添加、外观）。外观 Tab 实际由 `Appearance` 模块处理。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 暴露符号 | `const SettingsModal` (object) |
| IIFE 包裹 | 是 |
| 依赖 | `Storage`、`Todo`、`Appearance`、`MonthViewModal` |
| 被谁依赖 | `app.js` |
| 行数 | 256 |

---

## 二、模块结构

```
SettingsModal (IIFE)
├─ 状态: dailySelectedDate
├─ init()                          ← 绑定开关 + 4 Tab
├─ open()                          ← 显示弹窗 + 刷数据 + 同步 UI
├─ close() / isOpen()              ← 关 / 判开
├─ 4 个 Modal Tab 切换: initModalTabs()
│
├─ 子模块: SettingsModal.DailyTodos
│  ├─ init()      绑定日期选择、前后按钮、今天、添加
│  ├─ refresh()   渲染该日期的待办 + 当天已完成
│  └─ (private) renderTodoItem(t, isCompleted)
│
├─ 子模块: SettingsModal.CompletedView
│  ├─ init()      绑定「清除全部」按钮
│  └─ refresh()   渲染按日期分组的已完成列表
│
└─ 子模块: SettingsModal.QuickAdd
   └─ init()      绑定快速添加按钮
```

---

## 三、4 个 Tab

| data-mtab | 子模块 | 说明 |
|-----------|--------|------|
| `daily`      | `DailyTodos`    | 日期选择 + 任务列表 + 内联添加 |
| `completed`  | `CompletedView` | 按日期分组的已完成 |
| `quickadd`   | `QuickAdd`      | 一键添加（日期 + 周期） |
| `appearance` | `Appearance`    | 主题/不透明度/模糊/位置/复选框（实际在 `appearance.js`） |

---

## 四、API

### `init()`

绑定：
- `#btnSettings` 点击 → `open()`
- `#btnModalClose` 点击 → `close()`
- `#settingsOverlay` 点击外部 → `close()`
- `#btnEditDuration`（铅笔）→ `open()` + `Appearance.switchToAppearanceTab()`
- `#btnMonthSettings`（月视图弹窗）→ `MonthViewModal.close()` + `open()` + `Appearance.switchToAppearanceTab()`
- `initModalTabs()` / `initDailyTodos()` / `initCompletedView()` / `initQuickAdd()`

### `open()`

```js
function open() {
    document.getElementById('settingsOverlay').classList.add('open');
    DailyTodos.refresh();
    CompletedView.refresh();
    Appearance.syncUI(Storage.loadAppearance());

    const s = Storage.loadSettings();
    document.getElementById('focusDuration').value = s.focusDuration;
    document.getElementById('breakDuration').value = s.breakDuration;

    dailySelectedDate = DateUtils.getTodayString();
    const picker = document.getElementById('dailyDatePicker');
    if (picker) picker.value = dailySelectedDate;
}
```

### `close()`

`#settingsOverlay` 移除 `open` class。

### `isOpen()`

`#settingsOverlay.classList.contains('open')`。`app.js` 的 Esc 处理会用到。

---

## 五、`DailyTodos` 子模块

### `init()`

绑定：
- `#dailyDatePicker` change → 重读日期
- `#btnDatePrev/Next` 点击 → `DateUtils.shiftDate` ±1 天
- `#btnTodayDate` 点击 → 今天
- `#dailyTodoInput` Enter / `#btnDailyAdd` 点击 → `Todo.addTodo(text, { date })`

### `refresh()`

```js
function refresh() {
    const todos = Todo.getTodosByDate(dailySelectedDate);
    const allTodos = Storage.loadTodos();
    const completedToday = allTodos.filter(t =>
        t.completed && t.completedDate === dailySelectedDate
    );

    list.innerHTML = [
        ...todos.map(t => renderTodoItem(t, false)),
        ...completedToday.map(t => renderTodoItem(t, true))
    ].join('');
}
```

每个任务项的 onclick（由 innerHTML 拼接）：
- 勾选 → `Todo.toggleTodo(id); SettingsModal.DailyTodos.refresh(); Todo.render();`
- 周期任务删除全部 → `Todo.deleteRecurringAll(id); SettingsModal.DailyTodos.refresh(); Todo.render();`
- 单个删除 → `Todo.deleteTodo(id, true); SettingsModal.DailyTodos.refresh(); Todo.render();`

---

## 六、`CompletedView` 子模块

### `init()`

绑定 `#btnClearAllCompleted` → `confirm()` → `Todo.clearAllCompleted()` + 刷新。

### `refresh()`

```js
const grouped = Todo.getCompletedGrouped();
const dates = Object.keys(grouped);
// 每组 <div class="completed-date-group"> 下挂 1+ 个任务
```

`getCompletedGrouped()` 内部已按日期降序排好。

---

## 七、`QuickAdd` 子模块

```js
const doAdd = () => {
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    Todo.addTodo(text, {
        date: datePicker.value || DateUtils.getTodayString(),
        recurring: recurring.value
    });
    input.value = '';
    input.focus();
    btnAdd.textContent = '✅ 已添加！';
    setTimeout(() => { btnAdd.textContent = '➕ 添加任务'; }, 1200);
    Todo.render();
};
```

加完 1.2s 内按钮文案变「✅ 已添加！」做反馈。

---

## 八、与 app.js 的协作

`app.js` 的 `Todo.init({ onTodosChanged })` 回调里：

```js
if (SettingsModal.isOpen()) {
    SettingsModal.DailyTodos.refresh();
    SettingsModal.CompletedView.refresh();
}
```

—— 任何 todo 变更后自动同步设置弹窗的视图。

---

## 九、扩展指南

### 新增 Modal Tab

1. `src/index.html` 加 `.modal-tab` 和 `.modal-panel`
2. `SettingsModal.initModalTabs()` 的 `panels` 字典补 key
3. 写一个 `initXxx()` 子模块，在 `SettingsModal.init()` 末尾调用
4. 暴露到 `return { ... }`

### 改 dailySelectedDate 默认值

`init()` 和 `open()` 都有 `dailySelectedDate = DateUtils.getTodayString()`，改一处即可。
