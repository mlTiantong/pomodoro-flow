# 模块：`src/js/pomodoro.js`

> **职责**：番茄钟倒计时、状态机、进度环、自动切换专注/休息。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 暴露符号 | `const Pomodoro` (object) |
| IIFE 包裹 | 是 |
| 依赖 | `Storage` (global) |
| 被谁依赖 | `app.js` |
| 行数 | 391 |

---

## 二、模块结构

```
Pomodoro (IIFE)
├─ 枚举:
│  ├─ State: IDLE / RUNNING / PAUSED / COMPLETED
│  └─ Mode:  FOCUS / BREAK
├─ DOM 引用 (init 时抓):
│  ├─ #pomodoroTimer    (时间文本)
│  ├─ #pomodoroMode     (模式文本)
│  ├─ #progressRing     (SVG 圆)
│  ├─ #progressText     (百分数)
│  ├─ #btnStart / #btnPause / #btnReset
│  ├─ #todayPomodoros
│  └─ #todayFocusTime
├─ 状态:
│  ├─ state         当前 State
│  ├─ mode          当前 Mode
│  ├─ timeRemaining 剩余秒数
│  ├─ totalTime     本轮总秒数
│  ├─ timerInterval setInterval id
│  ├─ currentTaskId 关联 todo id
│  ├─ todayPomodoroCount  / todayFocusMinutes  (内存缓存)
│  └─ onComplete   回调
├─ 核心:
│  ├─ start()      开始/继续
│  ├─ pause()      暂停
│  ├─ reset()      重置当前模式
│  ├─ onTimerComplete()  跑完
│  ├─ switchMode(newMode, autoStart)
│  └─ resetToMode(targetMode)
├─ UI:
│  ├─ updateUI()        时间/进度/颜色
│  └─ updateStatsDisplay() 今日计数
└─ 公开:
   ├─ init, start, pause, reset
   ├─ getStatus, getTodayStats
   └─ Mode, State
```

---

## 三、状态机

```
                    ┌──────────────┐
        start()    │              │   onTimerComplete()
   ┌──────────────►│    RUNNING   │──────────────────────┐
   │               │              │                      │
   │               └──────┬───────┘                      ▼
   │      pause()         │                       ┌────────────┐
   │                      ▼                       │ COMPLETED  │
   │               ┌──────────────┐               └─────┬──────┘
   │               │    PAUSED    │                     │
   │               └──────┬───────┘                     │
   │      start()         │                             │ 1.5s 后
   │                      ▼                             │ switchMode
   │               ┌──────────────┐                     ▼
   └───────────────│    IDLE      │◄────────────────────┘
        reset()    └──────────────┘                resetToMode
```

| State | 进入 | 退出 | 按钮状态 |
|-------|------|------|---------|
| `IDLE` | `reset()`、`switchMode()` 之后 | `start()` 触发新轮 | Start 可，Pause 不可 |
| `RUNNING` | `start()`（新轮或继续） | `pause()` 或 `onTimerComplete()` | Start 不可，Pause 可 |
| `PAUSED` | `pause()` | `start()`（继续） | Start 改文案为「继续」，Pause 不可 |
| `COMPLETED` | 倒计时归 0 | 1.5s 后 `switchMode()` 自动切 | Start 改文案为「开始」 |

---

## 四、初始化

```js
Pomodoro.init({
    onComplete: (type, taskId) => { ... }
});
```

执行流程：
1. 抓 DOM 引用
2. `Storage.loadSettings()` 拿配置（**不**缓存，每次都现读）
3. `Storage.loadTodayStats()` 载入内存 `todayPomodoroCount` / `todayFocusMinutes`
4. `resetToMode(Mode.FOCUS)` 初始化倒计时
5. 绑事件：
   - Start / Pause / Reset 按钮
   - `#taskSelect` 的 `change` → 更新 `currentTaskId`
6. `updateStatsDisplay()` 渲染底部「今日 N 🍅」

---

## 五、核心操作

### `start()`

```js
function start() {
    if (state === State.RUNNING) return;

    if (state === State.IDLE || state === State.COMPLETED) {
        // 新一轮：按当前 mode 决定时长
        const s = Storage.loadSettings();
        timeRemaining = (mode === Mode.FOCUS) ? s.focusDuration * 60 : s.breakDuration * 60;
        totalTime = timeRemaining;
    }
    // PAUSED 时，timeRemaining 保持不变，继续跑

    state = State.RUNNING;
    updateUI();

    timerInterval = setInterval(() => {
        timeRemaining--;
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            state = State.COMPLETED;
            onTimerComplete();
            return;
        }
        updateUI();
    }, 1000);

    btnStart.disabled = true;
    btnPause.disabled = false;
}
```

**注意**：每次 `start()` 都重新读 `Storage.loadSettings()`，所以设置弹窗里改了时长，下一轮立即生效（**仅当 state 为 IDLE 或 COMPLETED 时**）。

### `pause()`

```js
function pause() {
    if (state !== State.RUNNING) return;
    clearInterval(timerInterval);
    timerInterval = null;
    state = State.PAUSED;
    updateUI();

    btnStart.disabled = false;
    btnStart.innerHTML = `▶ 继续`;  // 改文案
    btnPause.disabled = true;
}
```

### `reset()`

```js
function reset() {
    clearInterval(timerInterval);
    timerInterval = null;
    state = State.IDLE;
    resetToMode(mode);  // 用当前 mode 重置

    btnStart.innerHTML = `▶ 开始`;
    btnStart.disabled = false;
    btnPause.disabled = true;
}
```

---

## 六、`onTimerComplete()`

```js
function onTimerComplete() {
    btnStart.disabled = false;
    btnPause.disabled = true;

    if (mode === Mode.FOCUS) {
        // 1. 累加内存计数
        todayPomodoroCount++;
        const sd = Storage.loadSettings();
        todayFocusMinutes += sd.focusDuration;

        // 2. 入库
        Storage.addPomodoro({
            type: 'focus',
            startTime: new Date(Date.now() - totalTime * 1000).toISOString(),
            endTime:   new Date().toISOString(),
            completed: true,
            taskId:    currentTaskId
        });

        // 3. 累加每日统计
        Storage.updateTodayStats(stats => {
            stats.totalPomodoros    = (stats.totalPomodoros    || 0) + 1;
            stats.totalFocusMinutes = (stats.totalFocusMinutes || 0) + sd.focusDuration;
            return stats;
        });

        // 4. 关联 todo +1
        if (currentTaskId) Todo.incrementPomodoro(currentTaskId);

        // 5. 触发回调 → app.js 发系统通知
        if (onComplete) onComplete('focus', currentTaskId);

        // 6. 1.5s 后切到休息
        const s3 = Storage.loadSettings();
        setTimeout(() => switchMode(Mode.BREAK, s3.autoStartBreak), 1500);
    } else {
        // BREAK 完成
        Storage.addPomodoro({ type:'break', ... });
        if (onComplete) onComplete('break', null);
        const s4 = Storage.loadSettings();
        setTimeout(() => switchMode(Mode.FOCUS, s4.autoStartFocus), 1500);
    }

    updateUI();
}
```

### 计算 startTime

```js
new Date(Date.now() - totalTime * 1000)
```

回溯 `totalTime` 秒。当 `totalTime` 是初始值（用户没暂停过）时是准确的；暂停过的会**多算**暂停时间（已知问题，未在文档承诺精确）。

### 回调

`onComplete` 由 `app.js` 传入，用于：
- 发系统通知
- 刷新统计面板

### 自动切换

1.5s 后调 `switchMode(otherMode, autoStart)`，根据 `settings.autoStartBreak / autoStartFocus` 决定是否立即开始下一轮。

---

## 七、`switchMode(newMode, autoStart)`

```js
function switchMode(newMode, autoStart = false) {
    mode = newMode;
    resetToMode(mode);

    btnStart.innerHTML = `▶ 开始`;
    btnStart.disabled = false;
    btnPause.disabled = true;

    if (autoStart) {
        setTimeout(start, 500);
    }
}
```

只切模式 + 重置 UI，不改 `currentTaskId`（专注任务跨模式保持）。

---

## 八、`resetToMode(targetMode)`

```js
function resetToMode(targetMode) {
    clearInterval(timerInterval);
    timerInterval = null;
    state = State.IDLE;
    mode = targetMode;

    const sr = Storage.loadSettings();
    if (mode === Mode.FOCUS) {
        timeRemaining = sr.focusDuration * 60;
        modeEl.textContent = '🎯 专注时间';
        modeEl.className = 'pomodoro-mode';
        timerEl.style.color = '';
    } else {
        timeRemaining = sr.breakDuration * 60;
        modeEl.textContent = '☕ 休息时间';
        modeEl.className = 'pomodoro-mode break-mode';
        timerEl.style.color = 'var(--break-color)';
    }

    totalTime = timeRemaining;
    updateUI();
}
```

唯一改 `modeEl.className` / `timerEl.style.color` 的地方。CSS 变量 `--break-color` 在主题切换时由 `Appearance.apply()`（`src/js/appearance.js`）写入。

---

## 九、UI 更新

### `updateUI()`

```js
function updateUI() {
    // 1. 时间文本
    const mins = Math.floor(timeRemaining / 60);
    const secs = timeRemaining % 60;
    timerEl.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

    // 2. 进度环
    const progress = totalTime > 0 ? (totalTime - timeRemaining) / totalTime : 0;
    const circumference = 2 * Math.PI * 80;     // r=80
    const offset = circumference * (1 - progress);
    progressRing.style.strokeDashoffset = offset;

    // 3. 百分比
    progressText.textContent = `${Math.round(progress * 100)}%`;

    // 4. 颜色
    if (mode === Mode.BREAK) {
        progressRing.classList.add('break-progress');
    } else {
        progressRing.classList.remove('break-progress');
    }
}
```

进度环用 `stroke-dasharray` + `stroke-dashoffset` 动画。
- 初始 `stroke-dasharray="502.65"`（2π × 80，CSS 已硬编码）
- `offset = circumference * (1 - progress)` 越大，缺口越大

### `updateStatsDisplay()`

```js
function updateStatsDisplay() {
    todayPomodorosEl.textContent = `今日完成: ${todayPomodoroCount} 🍅`;
    todayFocusTimeEl.textContent = `专注: ${todayFocusMinutes}m`;
}
```

`m` 是 `minutes` 缩写，不是分钟符号（`min`）。

---

## 十、对外 API

```js
Pomodoro.init({ onComplete });        // 启动
Pomodoro.start();                      // 开始/继续
Pomodoro.pause();                      // 暂停
Pomodoro.reset();                      // 重置当前模式

Pomodoro.getStatus();                  // { state, mode, timeRemaining, totalTime, progress, currentTaskId }
Pomodoro.getTodayStats();              // { totalPomodoros, totalFocusMinutes }

Pomodoro.Mode.FOCUS / BREAK
Pomodoro.State.IDLE / RUNNING / PAUSED / COMPLETED
```

`getStatus` 被 `Appearance.saveTimerDurations()`（`src/js/appearance.js`）用来判断当前是否 IDLE（决定要不要立即重置计时器）。

---

## 十一、与 `app.js` 的协作

### `app.js` 初始化

```js
Pomodoro.init({
    onComplete: (type) => {
        updateStats();
        if (type === 'focus') {
            Notifications.show('🍅 专注完成！', '太棒了！休息一下吧~');
        } else {
            Notifications.show('☕ 休息结束', '准备好开始下一轮专注了吗？');
        }
    }
});
```

`onComplete` 回调由 `app.js` 传入（`src/js/app.js:35-44`），业务调用 `Notifications.show()`（`src/js/notifications.js`）。

### `Appearance.saveTimerDurations` 修改时长后

`Appearance.saveTimerDurations()`（`src/js/appearance.js`）在 `focusDuration` 或 `breakDuration` 变化时调用 `Pomodoro.reset()`，**仅当**当前 state 是 IDLE：

```js
if (Pomodoro.getStatus().state === Pomodoro.State.IDLE) {
    Pomodoro.reset();
}
```

⚠️ **已知问题**：state 是 COMPLETED 时（刚跑完 1 轮、还没切到下个 mode），改时长不会立即刷新。`saveTimerDurations` 没考虑这个情况，但实际触发后 1.5s 内会自动 `switchMode` → `resetToMode` → 自然刷新，所以体感不明显。

---

## 十二、已知限制

1. **`setInterval` 漂移**：长时间运行会累积 1~2s 误差。修法：用 `Date.now()` 算 elapsed。
2. **暂停不计入进度**：上面 `startTime` 倒推时没扣暂停时长，记录的会话时长 > 实际专注时长。
3. **COMPLETED 状态期间改时长不生效**：见上节。
4. **`autoStartBreak` 改名为 autoStartFocus 时长未单独区分**：休息时长只有 `breakDuration` 一个。

---

## 十三、扩展指南

### 新增长休息

加一个 `Mode.LONG_BREAK`，每 4 个 focus 后切。需要在 `onTimerComplete` 里数 `todayPomodoroCount`：

```js
if (mode === Mode.FOCUS) {
    todayPomodoroCount++;
    const s = Storage.loadSettings();
    if (s.longBreakInterval > 0 && todayPomodoroCount % s.longBreakInterval === 0) {
        setTimeout(() => switchMode(Mode.LONG_BREAK, s.autoStartBreak), 1500);
        return;
    }
    setTimeout(() => switchMode(Mode.BREAK, s.autoStartBreak), 1500);
}
```

### 改用 `requestAnimationFrame`

把 `setInterval` 换成 RAF，每秒检查一次 `Date.now()`：

```js
const startTs = Date.now();
const startRemaining = timeRemaining;
function tick() {
    const elapsed = Math.floor((Date.now() - startTs) / 1000);
    const newRemaining = startRemaining - elapsed;
    if (newRemaining <= 0) { onTimerComplete(); return; }
    timeRemaining = newRemaining;
    updateUI();
    timerInterval = requestAnimationFrame(tick);
}
```

### 加声音提醒

`onTimerComplete` 时播一个 base64 嵌入的 WAV：

```js
const audio = new Audio('data:audio/wav;base64,...');
audio.volume = Storage.loadSettings().volume;
audio.play();
```
