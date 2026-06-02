# 数据模型

所有持久化数据都存在浏览器 `localStorage`，由 `src/js/storage.js` 统一读写。本文档列出每个实体的字段。

---

## 一、`tomato_clock_todos` — 待办列表

类型：`TodoItem[]`

```ts
interface TodoItem {
    id: string;            // 生成: Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    text: string;          // 任务文本，已 escape
    completed: boolean;    // 是否完成
    date: string;          // 计划日期，YYYY-MM-DD
    recurring: 'none' | 'daily' | 'weekly' | 'weekdays';
    createdAt: string;     // ISO 8601
    completedAt: string | null;   // ISO 8601，完成时刻
    completedDate: string | null; // YYYY-MM-DD，完成当天
    pomodoroCount: number; // 累计完成的番茄数
    order: number;         // 创建顺序（越大越靠前）
}
```

### 字段说明

| 字段 | 必有 | 说明 |
|------|------|------|
| `id` | ✓ | 36 进制时间戳 + 随机串，唯一 |
| `text` | ✓ | 不可空，会被 `trim()` |
| `completed` | ✓ | 切换完成时取反 |
| `date` | ✓ | 计划日期，不一定是今天 |
| `recurring` | ✓ | 默认 `'none'`，枚举见上 |
| `createdAt` | ✓ | ISO 时间，用于排序 |
| `completedAt` | × | 仅 `completed===true` 时存在 |
| `completedDate` | × | 用于「已完成」按日期分组 |
| `pomodoroCount` | ✓ | `Pomodoro.onTimerComplete()` 时 `+1` |
| `order` | ✓ | `todos.length`（新增时） |

### 周期任务的生命周期

`recurring: 'daily' | 'weekly' | 'weekdays'` 时：

1. **添加时**：`generateRecurringInstances()` 预生成未来 30 天实例
2. **启动时**：`hydrateRecurringTasks()` 补全未来 14 天
3. **完成时**：`scheduleNextRecurring()` 推算下一周期并插入
4. **删除时**：
   - 单个删除用 `deleteTodo(id)`，只删这一条
   - 周期任务额外提供 `deleteRecurringAll(id)` 删全部同模板

### 排序规则

`render()` 中：
1. 过期未完成（`date < today && !completed`）放最前，按 `date` 升序
2. 今天未完成（`date === today && !completed`）按 `order` 降序
3. 今天已完成（`completedDate === today`）放最后

---

## 二、`tomato_clock_pomodoros` — 番茄钟记录

类型：`PomodoroSession[]`

```ts
interface PomodoroSession {
    id: string;            // 同 TodoItem
    type: 'focus' | 'break';
    startTime: string;     // ISO 8601，开始时刻
    endTime: string;       // ISO 8601，结束时刻
    completed: boolean;    // 是否完整跑完
    taskId: string | null; // 关联的 Todo id
    createdAt: string;     // 记录入库时间
}
```

目前代码中只 `push` 不 `read`，为未来统计保留。

---

## 三、`tomato_clock_stats` — 每日统计

类型：`{ [date: string]: DailyStats }`

```ts
interface DailyStats {
    date: string;              // YYYY-MM-DD
    totalPomodoros: number;    // 当日完成的专注番茄数
    totalFocusMinutes: number; // 当日专注分钟数
    tasksCompleted: number;    // 当日完成的任务数
}
```

### 写入时机

| 字段 | 触发 | 写入方 |
|------|------|--------|
| `totalPomodoros` | `Pomodoro.onTimerComplete()` 专注完成 | `pomodoro.js:206-209` |
| `totalFocusMinutes` | 同上，累加 `settings.focusDuration` | `pomodoro.js:206-209` |
| `tasksCompleted` | `Todo.toggleTodo()` 勾选完成 / `clearAllCompleted()` | `todo.js:172-187, 423-437` |

### 连续天数

`Storage.calculateStreak()`：
- 从今天（含）往前回溯 365 天
- 累计 `totalPomodoros > 0` 的连续天数
- 今天若未完成允许跳过，从昨天开始算

---

## 四、`tomato_clock_settings` — 番茄钟设置

```ts
interface Settings {
    focusDuration: number;       // 默认 25，单位分钟
    breakDuration: number;       // 默认 5
    longBreakDuration: number;   // 默认 15
    longBreakInterval: number;   // 默认 4（每 4 个专注后长休息）
    autoStartBreak: boolean;     // 默认 true
    autoStartFocus: boolean;     // 默认 true
    volume: number;              // 默认 0.5（暂未使用）
}
```

由 `Storage.loadSettings()` 与 `DEFAULT_SETTINGS` 合并读出。

---

## 五、`tomato_clock_appearance` — 外观设置

```ts
interface Appearance {
    theme: 'tomato' | 'ocean' | 'forest' | 'purple' | 'dark';
    glassBlur: number;            // 默认 24，px
    backgroundOpacity: number;    // 默认 0.55
    windowWidth: number;          // 默认 340
    windowHeight: number;         // 默认 500
    positionPreset: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
    positionX: number | null;
    positionY: number | null;
    clickThrough: boolean;        // 默认 false
    alwaysOnTop: boolean;         // 默认 false
    embedDesktop: boolean;        // 默认 true
}
```

### 主题表（`appearance.js` `THEMES`）

| key | primary | break | bg 模板 |
|-----|---------|-------|---------|
| `tomato` | `#E85D3A` | `#4A90D9` | `rgba(40,22,28, %s)` |
| `ocean` | `#2E86DE` | `#E85D3A` | `rgba(16,28,52, %s)` |
| `forest` | `#27AE60` | `#E67E22` | `rgba(18,34,26, %s)` |
| `purple` | `#8E44AD` | `#2ECC71` | `rgba(38,18,48, %s)` |
| `dark` | `#E85D3A` | `#4A90D9` | `rgba(6,6,10, %s)` |

`%s` 占位符在 `applyAppearance()` 中被 `String(opacity)` 替换。

---

## 六、键名常量

```js
// storage.js:18-24
const STORAGE_KEYS = {
    TODOS: 'tomato_clock_todos',
    POMODOROS: 'tomato_clock_pomodoros',
    STATS: 'tomato_clock_stats',
    SETTINGS: 'tomato_clock_settings',
    COMPLETED_TASKS: 'tomato_clock_completed'  // 预留，暂未使用
};
```

注意 `appearance` 没用常量，直接 `'tomato_clock_appearance'` 字符串。

---

## 七、导入/导出

```js
const data = JSON.parse(Storage.exportAll());
// data = { version, exportedAt, todos, pomodoros, stats, settings }

Storage.importAll(jsonString);  // 返回 boolean
```

`importAll` 会覆盖 `todos/pomodoros/stats/settings` 四个键，**不**会覆盖 `appearance`。

`Storage.clearAll()` 一键清空所有键（含 `appearance`，用 `Object.values(STORAGE_KEYS)` 加上硬编码的 `appearance` 字符串）。

---

## 八、并发安全

- `Todo.saveAndRender` 串行：`Storage.saveTodos → render → updateTaskSelect → broadcast`
- `Pomodoro.onTimerComplete` 串行：先 `updateTodayStats`，再 `Todo.incrementPomodoro`（后者又会触发 `saveAndRender`）
- 跨窗口：`BroadcastChannel` 单向，发送方不需要确认
- 没有事务：极端情况下（主窗口在写入时被月视图读到旧数据），月视图会用 `requestAnimationFrame` 重新拉一次

## 九、容量估算

| 数据 | 单条大小 | 一年上限 | 总占用 |
|------|---------|---------|--------|
| todos | ~250B | 365×10 | ~900 KB |
| pomodoros | ~200B | 365×16 | ~1.1 MB |
| stats | ~150B | 365 | ~55 KB |
| settings | ~300B | 1 | <1 KB |
| appearance | ~400B | 1 | <1 KB |

合计 2 MB 以内，远低于 `localStorage` 5 MB 限制。
