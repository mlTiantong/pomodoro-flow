# 模块：`src/js/storage.js`

> **职责**：本地持久化的唯一出入口。所有 `localStorage` 调用都封装在这里，UI 模块只通过 `Storage.xxx()` 访问数据。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 暴露符号 | `const Storage` (object) |
| IIFE 包裹 | 是 |
| 依赖 | `DateUtils`、`DomUtils`（id/JSON 容错）、浏览器 `localStorage` |
| 被谁依赖 | `Todo`、`Pomodoro`、`SettingsModal`、`MonthViewModal`、`Appearance`、`App`、月视图 |
| 行数 | 358 |

---

## 二、内部结构

```
storage.js
├─ STORAGE_KEYS          5 个 localStorage 键名
├─ DEFAULT_SETTINGS      设置默认值
├─ DEFAULT_APPEARANCE    外观默认值
├─ 工具（已抽到 utils）:
│  getTodayString = DateUtils.getTodayString
│  generateId     = DomUtils.generateId
│  safeParse      = DomUtils.safeParse
└─ Storage (主对象)
   ├─ 待办: loadTodos / saveTodos / loadTodosByDate / loadActiveTodosByDate
   │        / loadCompletedTodosGrouped / getAllTaskDates
   ├─ 番茄: loadPomodoros / savePomodoros / addPomodoro
   ├─ 统计: loadTodayStats / saveTodayStats / updateTodayStats
   │        / loadAllStats / calculateStreak
   ├─ 设置: loadSettings / saveSettings
   ├─ 导入: exportAll / importAll / clearAll
   └─ 外观: loadAppearance / saveAppearance
```

---

## 三、键名常量

```js
// storage.js:18-24
const STORAGE_KEYS = {
    TODOS:           'tomato_clock_todos',
    POMODOROS:       'tomato_clock_pomodoros',
    STATS:           'tomato_clock_stats',
    SETTINGS:        'tomato_clock_settings',
    COMPLETED_TASKS: 'tomato_clock_completed'   // 预留，未使用
};
```

⚠️ **注意**：`appearance` 没用这个常量，代码里直接写字面量 `'tomato_clock_appearance'`。`clearAll()` 中也单独补了这一项。

---

## 四、默认值

### `DEFAULT_SETTINGS` (storage.js:30-38)

```js
{
    focusDuration: 25,        // 分钟
    breakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    autoStartBreak: true,
    autoStartFocus: true,
    volume: 0.5               // 暂未使用
}
```

`loadSettings()` 用 `{ ...DEFAULT_SETTINGS, ...safeParse(raw, {}) }` 合并，保证新字段也能拿到默认。

### `DEFAULT_APPEARANCE` (storage.js:44-56)

```js
{
    theme: 'tomato',          // 'tomato'|'ocean'|'forest'|'purple'|'dark'
    glassBlur: 24,            // px
    backgroundOpacity: 0.55,
    windowWidth: 340,
    windowHeight: 500,
    positionPreset: 'bottom-right',
    positionX: null,
    positionY: null,
    clickThrough: false,
    alwaysOnTop: false,
    embedDesktop: true
}
```

---

## 五、工具函数（已统一到 utils）

```js
const getTodayString = () => DateUtils.getTodayString();
const generateId     = () => DomUtils.generateId();
const safeParse      = (json, fb) => DomUtils.safeParse(json, fb);
```

这三个原本在 `storage.js` / `todo.js` / `app.js` / `month-view.js` 都有副本，现在统一到 `src/js/utils/`。详见 [utils.md](./utils.md)。

---

## 六、待办 API

### `loadTodos(): TodoItem[]`
读取 `tomato_clock_todos`，解析失败返 `[]`。

### `saveTodos(todos): void`
整体覆盖写回。

### `loadTodosByDate(date): TodoItem[]`
返回**未完成的所有任务** + **当天完成的任务**（`completedDate === date`）。用于「每日待办」视图。

### `loadActiveTodosByDate(date): TodoItem[]`
仅返回 `!completed && date === date` 的任务。

### `loadCompletedTodosGrouped(): { [date]: TodoItem[] }`
按 `completedDate` 分组，**已按日期降序排好**（最新完成的在前）。内部用 `new Date(b.completedDate) - new Date(a.completedDate)`。

### `getAllTaskDates(): string[]`
返回所有出现过的日期（计划日期 + 完成日期），去重并升序排序。可用于日历标记。

---

## 七、番茄 API

### `loadPomodoros(): PomodoroSession[]`
读取完整会话列表。

### `savePomodoros(arr): void`
整体覆盖。

### `addPomodoro(session): PomodoroSession[]`
追加一条，自动补 `id` 和 `createdAt`：

```js
function addPomodoro(session) {
    const pomodoros = this.loadPomodoros();
    pomodoros.push({
        id: generateId(),
        ...session,
        createdAt: new Date().toISOString()
    });
    this.savePomodoros(pomodoros);
    return pomodoros;
}
```

⚠️ 返回的是**完整数组**而非新插入的对象。调用方一般忽略返回值。

---

## 八、统计 API

### `loadTodayStats(): DailyStats`
读取 `tomato_clock_stats[today]`，如果不存在则**就地创建**一个空对象并写回。

```js
function loadTodayStats() {
    const allStats = safeParse(localStorage.getItem(STORAGE_KEYS.STATS), {});
    const today = getTodayString();
    if (!allStats[today]) {
        allStats[today] = { date: today, totalPomodoros: 0, totalFocusMinutes: 0, tasksCompleted: 0 };
    }
    return allStats[today];
}
```

**注意**：空对象创建时**不**写回，所以 `localStorage` 仍然为空，直到 `updateTodayStats` 首次调用。

### `saveTodayStats(todayStats): void`
把单个 `DailyStats` 写回 `stats[todayStats.date]`。

### `updateTodayStats(updater: (stats) => stats): DailyStats`
原子读-改-写：

```js
function updateTodayStats(updater) {
    const stats = this.loadTodayStats();
    const updated = updater(stats);
    this.saveTodayStats(updated);
    return updated;
}
```

调用方一般写：
```js
Storage.updateTodayStats(s => {
    s.totalPomodoros = (s.totalPomodoros || 0) + 1;
    return s;
});
```

### `loadAllStats(): { [date]: DailyStats }`
读取所有历史统计。供 `calculateStreak` 使用。

### `calculateStreak(): number`
从「明天」开始往回数：

```js
let streak = 0;
const today = getTodayString();
const checkDate = new Date();
checkDate.setDate(checkDate.getDate() + 1);   // 起点：明天

for (let i = 0; i < 365; i++) {
    checkDate.setDate(checkDate.getDate() - 1);
    const dateStr = checkDate.toISOString().split('T')[0];
    const stats = allStats[dateStr];
    if (stats && stats.totalPomodoros > 0) {
        streak++;
    } else if (dateStr !== today) {
        break;
    }
}
return streak;
```

⚠️ **`toISOString()` 用 UTC**，所以跨时区可能把「今天」算成「昨天」。

---

## 九、设置 API

### `loadSettings(): Settings`
合并 `DEFAULT_SETTINGS` + 存储值。

### `saveSettings(settings): void`
整体覆盖。

---

## 十、导入/导出

### `exportAll(): string`
返回 JSON 字符串：

```json
{
  "version": "1.0",
  "exportedAt": "2026-05-30T08:00:00.000Z",
  "todos": [...],
  "pomodoros": [...],
  "stats": {...},
  "settings": {...}
}
```

⚠️ **不**包含 `appearance`。

### `importAll(json): boolean`
解析成功 + 有 `version` 字段才返 `true`；逐项覆盖存储。**不**验证 schema，向后兼容性靠 `version` 字段。

### `clearAll(): void`
删 5 个常量键 + 硬编码的 `appearance` 键。

---

## 十一、外观 API

### `loadAppearance(): Appearance`
合并 `DEFAULT_APPEARANCE` + 存储值。

### `saveAppearance(appearance): void`
整体覆盖。

---

## 十二、调用示例

```js
// 读
const todos = Storage.loadTodos();
const settings = Storage.loadSettings();
const stats = Storage.loadTodayStats();

// 写
Storage.saveTodos(newTodos);
Storage.updateTodayStats(s => ({ ...s, totalPomodoros: s.totalPomodoros + 1 }));
Storage.saveAppearance({ ...Storage.loadAppearance(), theme: 'ocean' });
```

---

## 十三、扩展指南

### 新增一个键

1. 在 `STORAGE_KEYS` 加一个常量
2. 写一个 `loadXxx()` / `saveXxx()` 函数
3. 在 `clearAll()` 里补一行（或者在常量里加，会被自动遍历）

### 改默认值

直接改 `DEFAULT_SETTINGS` / `DEFAULT_APPEARANCE`。`loadXxx()` 自动 merge，不会丢已有用户数据。

### 改 schema

1. 提升 `exportAll` 的 `version`
2. 在 `importAll` 里写迁移逻辑

### 调试

打开 DevTools → Application → Local Storage → `file://` 即可看到 5~6 个键的原始 JSON。
