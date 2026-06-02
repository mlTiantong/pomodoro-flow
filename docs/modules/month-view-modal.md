# 模块：`src/js/month-view-modal.js`

> **职责**：主窗口内的「月视图」弹窗。展示完整月历 + 选中日期的任务详情，与 `month-view.js` 的 7 天列视图是**两个独立实现**。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 暴露符号 | `const MonthViewModal` (object) |
| IIFE 包裹 | 是 |
| 依赖 | `Storage`、`Todo` |
| 被谁依赖 | `app.js`、`SettingsModal` |
| 行数 | 232 |

---

## 二、模块结构

```
MonthViewModal (IIFE)
├─ 状态: viewYear, viewMonth, selectedDayDate
├─ init()                     ← 绑定所有按钮
├─ open()                     ← 优先 IPC 走独立窗口，降级用内联弹窗
├─ close()
├─ selectDay(dateStr)         ← 选中某天
├─ renderGrid()               ← 渲染月历网格
├─ refreshDayDetail(dateStr)  ← 渲染选中日期的任务
└─ 内部: addDayTask()         ← 详情面板的添加任务
```

### 与 `month-view.js` 的区别

| | 本模块 (月历视图) | `month-view.js` (独立窗口) |
|---|---|---|
| 显示 | 完整月历网格 | 7 天列视图 |
| 入口 | 主窗口「📅」按钮 | Electron 独立窗口 |
| 导航 | ◀/▶ 按月、跳今天 | ⏪/◀/▶/⏩ 按天/周 |
| 跨窗口 | 是 | 是 |
| 文件 | `month-view-modal.js` | `month-view.js` + `month-view.html` |

> 设计上这是历史遗留：主窗口「📅」原本是月历，按钮在月视图弹窗里。Electron 化后用独立窗口实现 7 天列视图（功能更聚焦），但主窗口入口还保留了月历。

---

## 三、`open()` — 双路径

```js
function open() {
    if (window.electronAPI) {
        window.electronAPI.openMonthView();   // 走 IPC，打开独立窗口
        return;
    }
    document.getElementById('monthViewOverlay').classList.add('open');
    renderGrid();
}
```

- **Electron 环境**：调 IPC 让主进程开新窗口（`src/month-view.html`）
- **降级（无 Electron）**：在主窗口内显示月历弹窗

---

## 四、`renderGrid()` — 月历渲染

### 算法

1. 标题：`${year}年${month}月`
2. 星期头：`['一','二','三','四','五','六','日']`（`DateUtils.WEEKDAY_LABELS_SHORT`）
3. 计算该月第一天是周几（`startOffset`），前面补空白格
4. 循环 `d=1..daysInMonth`，每格：

```js
const classes = [
    'month-grid-cell',
    isToday ? 'today' : '',
    isSelected ? 'selected' : ''
].filter(Boolean).join(' ');
```

5. 每格内容：日 + 前 2 个未完成任务 + 1 个已完成 + `+N项`
6. 末尾补齐最后一行空白

### 任务预览

```js
const activeTasks    = tasks.filter(t => !t.completed).slice(0, 2);
const completedTasks = tasks.filter(t =>  t.completed).slice(0, 1);
const remaining      = Math.max(0, tasks.filter(t => !t.completed).length - 2);
```

- 文本截前 8 字（未完成）/ 前 6 字（已完成）
- 超过 2 个未完成 + 1 个已完成的，显示「+N项」

### `onclick`

```html
<div class="${classes}" data-date="${dateStr}"
     onclick="MonthViewModal.selectDay('${dateStr}')">
```

---

## 五、`selectDay(dateStr)` 与 `refreshDayDetail()`

### `selectDay(dateStr)`

```js
function selectDay(dateStr) {
    selectedDayDate = dateStr;
    renderGrid();           // 刷新高亮
    refreshDayDetail(dateStr);
}
```

### `refreshDayDetail(dateStr)`

渲染选中日期的所有任务 + 内联输入框：

```js
const dayTodos      = allTodos.filter(t => t.date === dateStr);
const activeTodos   = dayTodos.filter(t => !t.completed);
const completedTodos = dayTodos.filter(t => t.completed);
```

每个任务的 onclick 拼接：

```js
onclick="Todo.toggleTodo('${id}');MonthViewModal.renderGrid();MonthViewModal.refreshDayDetail('${dateStr}');Todo.render();"
```

`addDayTask` 在输入框按 Enter 或点 ➕ 时触发：

```js
function addDayTask() {
    const text = input.value.trim();
    if (!text || !selectedDayDate) return;
    Todo.addTodo(text, { date: selectedDayDate });
    input.value = '';
    renderGrid();
    refreshDayDetail(selectedDayDate);
    Todo.render();
}
```

---

## 六、扩展指南

### 改成显示「任务数」而不是「任务预览」

```js
html += `<div class="cell-task-text">${activeTasks.length} 项待办</div>`;
```

### 添加月历热力图

按任务密度上色。`tasks.length` 决定 CSS class。

### 跨月快捷键

在 `init()` 末尾加 `document.addEventListener('keydown', ...)`，左右方向键切月。
