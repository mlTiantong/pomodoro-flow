# 模块：`src/js/todo.js`

> **职责**：待办事项的完整 CRUD、周期任务、UI 渲染、跨窗口广播。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 暴露符号 | `const Todo` (object) |
| IIFE 包裹 | 是 |
| 依赖 | `Storage`、`DateUtils`、`DomUtils` (global) |
| 被谁依赖 | `App`、`Pomodoro`、`SettingsModal`、`MonthViewModal`、`month-view.js` |
| 行数 | 769 |

---

## 二、模块结构

```
Todo (IIFE)
├─ 状态: todos[], todoListEl, todoInputEl, todoCountEl, taskSelectEl
├─ 事件: onTodosChanged (回调)
├─ 初始化: init(options)
├─ 核心操作:
│  ├─ addTodo(text, options)         ← 添加（含周期预生成）
│  ├─ toggleTodo(id)                 ← 切换完成
│  ├─ deleteTodo(id, silent)         ← 删除单条
│  ├─ deleteRecurringAll(id)         ← 删全部周期实例
│  ├─ editTodo(id, newText)          ← 改文本
│  ├─ startEdit(id)                  ← 双击进入内联编辑
│  ├─ clearCompleted()               ← 清已完成（仅 todo 列表）
│  ├─ clearAllCompleted()            ← 清已完成（带统计扣减）
│  └─ incrementPomodoro(taskId)      ← 番茄数 +1
├─ 查询:
│  ├─ getActiveTodos() / getAllTodos()
│  ├─ getActiveCount()
│  ├─ getTodosByDate(date)
│  ├─ getTodosByMonth(year, month)
│  ├─ getCompletedGrouped()
│  ├─ getAllDates()
│  └─ getRecurringShortLabel(recurring)  ← 暴露给视图模块
├─ 周期任务:
│  ├─ generateRecurringInstances(template, days)
│  ├─ scheduleNextRecurring(completedTodo)
│  ├─ hydrateRecurringTasks()        ← 启动时补全
│  └─ shouldHaveTaskOnDate(recurring, date, firstWeekday)
├─ 渲染:
│  ├─ render()                       ← 主列表
│  ├─ updateTaskSelect()             ← #taskSelect 下拉
│  └─ saveAndRender()                ← save + render + updateTaskSelect + broadcast
├─ 跨窗口:
│  ├─ broadcastChange()              ← 发 BroadcastChannel
│  ├─ listenExternal()               ← 订阅 BroadcastChannel
│  └─ reload()                       ← 收到通知后从 localStorage 拉一遍
└─ 工具别名: escapeHtml/generateId/getTodayString/formatDate → utils/（见 [utils.md](./utils.md)）
```

---

## 三、初始化

```js
Todo.init({
    onTodosChanged: (todos) => { ... }   // 任何变更后回调
});
```

执行流程：
1. 抓 4 个 DOM 引用：`#todoList / #todoInput / #todoCount / #taskSelect`
2. `Storage.loadTodos()` 载入内存
3. `hydrateRecurringTasks()` 补全未来 14 天周期任务
4. 绑事件：Enter 键、添加按钮、清除按钮
5. `render()` + `updateTaskSelect()`

---

## 四、添加任务

```js
Todo.addTodo(text?, options?)
```

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `text` | string | `#todoInput.value` | 任务文本 |
| `options.date` | `YYYY-MM-DD` | 今天 | 计划日期 |
| `options.recurring` | enum | `'none'` | 重复规则 |

### 行为

1. 文本 trim；空则直接返回
2. 用 `unshift()` 插到 `todos[0]`
3. **如果是周期任务** → `generateRecurringInstances(newTodo, 30)` 预生成未来 30 天
4. `saveAndRender()` 持久化 + 重渲染 + 跨窗口广播
5. 清空输入框并 focus
6. 触发 `onTodosChanged(todos)` 回调

### 新任务对象

```js
{
    id: generateId(),         // 'lx1234abcd'
    text: '写周报',
    completed: false,
    date: '2026-05-30',
    recurring: 'none',
    createdAt: '2026-05-30T08:00:00.000Z',
    completedAt: null,
    completedDate: null,
    pomodoroCount: 0,
    order: todos.length
}
```

---

## 五、周期任务

### 类型

```js
recurring: 'none' | 'daily' | 'weekly' | 'weekdays'
```

| 值 | 含义 | 计算公式 |
|----|------|---------|
| `none` | 不重复 | — |
| `daily` | 每天 | next = date + 1 day |
| `weekly` | 每周同一天 | next = date + 7 days |
| `weekdays` | 工作日 | next = date + 1 day，跳过周六日 |

### `shouldHaveTaskOnDate(recurring, dateStr, firstWeekday)`

判断某个日期是否应该有任务：

```js
switch (recurring) {
    case 'daily':    return true;
    case 'weekdays': return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekly':   return dayOfWeek === firstWeekday;
}
```

`firstWeekday` 是首次出现的星期几（0=周日），用于 `weekly` 锁住同一天。

### 三处会插入/补全

| 触发 | 函数 | 范围 |
|------|------|------|
| 添加时 | `generateRecurringInstances(template, 30)` | 未来 30 天 |
| 启动时 | `hydrateRecurringTasks()` | 未来 14 天 |
| 完成时 | `scheduleNextRecurring(completedTodo)` | 下一周期 |

### 去重逻辑

每次插入前用 `todos.some(t => t.text === ... && t.recurring === ... && t.date === ...)` 检查，避免重复。

### 删除周期任务

- `deleteTodo(id, true)`：删单条
- `deleteRecurringAll(id)`：删**所有未完成**的同 text+recurring 任务

UI 上对周期任务会渲染两个删除按钮：
- 普通 `×` 按钮 → `deleteTodo(id, true)`
- 额外的 `🗑` 按钮 → `deleteRecurringAll(id)`

---

## 六、切换完成

```js
Todo.toggleTodo(id)
```

### 行为

1. 找到任务对象
2. `completed` 取反
3. **勾选** 时：
   - 设 `completedAt` / `completedDate`
   - `Storage.updateTodayStats(s => s.tasksCompleted++)`
   - 若有 `recurring`，调 `scheduleNextRecurring(todo)` 推算并插入下一周期
4. **取消勾选** 时：
   - 清空 `completedAt` / `completedDate`
   - `Storage.updateTodayStats(s => s.tasksCompleted--)`
5. `saveAndRender()` + 回调

---

## 七、删除

### `deleteTodo(id, silent = false)`

1. 找到任务
2. 若已完成，从今日统计扣 1（`tasksCompleted--`，下限 0）
3. `todos = todos.filter(t => t.id !== id)`
4. `saveAndRender()` + 回调
5. 返 `boolean`

`silent` 参数实际未使用（保留扩展位）。

### `deleteRecurringAll(id)`

1. 拿到 `text` + `recurring`
2. 找所有 `!completed && text === ... && recurring === ...` 的 id
3. 批量删，返删除条数

### `clearCompleted()`

仅清空 `todos` 中的已完成项，**不**动统计。

### `clearAllCompleted()`

清空 + 同时从今日统计扣 `completedCount`。

---

## 八、内联编辑

### `startEdit(id)`

双击 `.todo-text` 触发：

1. 找到任务和 DOM 元素
2. 用 `<input class="todo-input">` 替换 `<span class="todo-text">`
3. 选中全文
4. 绑事件：
   - `blur` → `finishEdit()`，trim 后保存或恢复
   - `Enter` → `input.blur()` 触发 `finishEdit`
   - `Escape` → 恢复原文 + blur

只对 `!completed` 的任务启用（`if (todo.completed) return`）。

---

## 九、查询 API

| 方法 | 返回 | 用途 |
|------|------|------|
| `getActiveTodos()` | `TodoItem[]` | `taskSelect` 下拉 |
| `getAllTodos()` | `TodoItem[]` (新数组) | 月视图 |
| `getActiveCount()` | number | 仅今天 + 过期 |
| `getTodosByDate(date)` | `TodoItem[]` | 月视图单日 |
| `getTodosByMonth(y, m)` | `{date: TodoItem[]}` | 月视图整月 |
| `getCompletedGrouped()` | `{date: TodoItem[]}` | 设置弹窗的「已完成」 |
| `getAllDates()` | `string[]` | 排序后的日期列表 |

### `getTodosByMonth` 排序

只按 `t.date.startsWith(prefix)` 过滤，**不**排序（调用方自己处理）。

---

## 十、渲染 `render()`

### 显示策略

主面板只显示：
1. **过期未完成**：`!completed && date < today`，按 `date` 升序
2. **今天未完成**：`!completed && date === today`，按 `order` 降序
3. **今天已完成**：`completed && completedDate === today`

之前的已完成**不**显示（避免列表过长）。

### 空状态

`displayTodos.length === 0` 时插入空提示：

```html
<div class="todo-empty">
    <div class="todo-empty-icon">📝</div>
    <div class="todo-empty-text">今天还没有任务，添加一个吧</div>
</div>
```

### 单条模板

```html
<div class="todo-item {completed?'completed':''}" data-id="{id}">
    <button class="todo-checkbox {checked?'checked':''}"
            onclick="Todo.toggleTodo('{id}')"></button>
    <span class="todo-text" ondblclick="Todo.startEdit('{id}')">{text}</span>
    {isOverdue && <span class="todo-overdue-badge">延期</span>}
    {isRecurring && <span class="todo-recurring-badge">↻{label}</span>}
    {pomodoroCount>0 && <span class="todo-pomodoro-badge">{N}🍅</span>}
    {isRecurring && !completed &&
        <button class="todo-delete-all-btn"
                onclick="Todo.deleteRecurringAll('{id}')" title="删除全部周期任务">🗑</button>}
    <button class="todo-delete-btn"
            onclick="Todo.deleteTodo('{id}', true)" title="删除此任务">×</button>
</div>
```

### 安全

- `text` 经过 `escapeHtml()` 防 XSS
- `id` 拼到 `onclick` 属性里，假设 ID 是 36 进制（不含单引号），无需转义

### 计数

```js
const displayedCount = displayTodos.filter(t => !t.completed).length;
todoCountEl.textContent = `${displayedCount} 项待办`;
```

只数未完成的。

---

## 十一、跨窗口同步

### `broadcastChange()`

```js
function broadcastChange() {
    try {
        const bc = new BroadcastChannel('tomato-clock');
        bc.postMessage('todos-changed');
        bc.close();
    } catch(e) {}
}
```

仅发 `'todos-changed'` 字符串，不传数据（接收方自己 `Storage.loadTodos()` 拉一遍，避免序列化大对象）。

### `listenExternal()` — 由 `app.js` 启动时调用

```js
function listenExternal() {
    try {
        const bc = new BroadcastChannel('tomato-clock');
        bc.addEventListener('message', () => {
            Todo.reload();
        });
    } catch(e) {}
}
```

月视图（`month-view.js`）有自己的一套同步（用 `requestAnimationFrame` + `isInputFocused` 防抖），不调本函数。

### `reload()`

```js
function reload() {
    todos = Storage.loadTodos();
    render();
    updateTaskSelect();
}
```

不触发 `onTodosChanged`（避免循环），不广播（避免回声）。

---

## 十二、与 `Pomodoro` 的协作

`Pomodoro.onTimerComplete()` 会调 `Todo.incrementPomodoro(currentTaskId)`：

```js
function incrementPomodoro(taskId) {
    const todo = todos.find(t => t.id === taskId);
    if (todo) {
        todo.pomodoroCount = (todo.pomodoroCount || 0) + 1;
        saveAndRender();   // ← 会触发 onTodosChanged → app.js 收到
    }
}
```

这是 `Todo` 模块**唯一**被 `Pomodoro` 反向调用的地方。

---

## 十三、回调 `onTodosChanged`

`app.js` 初始化时传入：

```js
Todo.init({
    onTodosChanged: (todos) => {
        updateStats();                      // 刷统计
        updateTaskSelectInPomodoro();       // 刷 #taskSelect
        if (settingsOverlay open) {
            refreshDailyTodos();
            refreshCompletedView();
        }
    }
});
```

每次 `saveAndRender()` 都会触发，**包括** `incrementPomodoro`。

---

## 十四、扩展指南

### 新增状态字段

1. `TodoItem` 接口（`docs/data-model.md`）补字段
2. 改 `addTodo()` 构造默认值的代码
3. 改 `render()` 的模板（如需显示）

### 新增周期类型

1. 在 `shouldHaveTaskOnDate` 的 switch 加 case
2. 在 `scheduleNextRecurring` 加分支
3. 在 `getRecurringShortLabel` 加中文短标签
4. 在设置弹窗的 `<select id="quickaddRecurring">` 加 `<option>`

### 改去重策略

`generateRecurringInstances` / `hydrateRecurringTasks` 中的 `todos.some(...)` 是去重关键，改动会影响已有数据。

### 性能

`render()` 是 O(任务数)，每次都全量重写 `innerHTML`。任务 < 100 时无感，> 100 时考虑虚拟列表或事件委托。
