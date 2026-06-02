# 整体架构

## 一、设计目标

把一个完整的待办 + 番茄钟应用做到「桌面小组件」的体量（窗口 340×500，嵌入壁纸层）。为此采用：

- **零运行时框架**：vanilla JS + IIFE 模块，避免 React/Vue 拖大体积
- **数据驱动 UI**：所有状态都从 `localStorage` 解析，UI 只是状态的投影
- **主进程/渲染进程严格分离**：Win32 桌面嵌入只发生在主进程，渲染进程只做 UI

## 二、进程划分

```
┌───────────────────────────── 主进程 ─────────────────────────────┐
│  main.js (Node.js)                                                │
│   ├─ app.whenReady() → createWindow() + createTray()              │
│   ├─ createWindow()   → 新建 BrowserWindow, frame:false,         │
│   │                      transparent:true, skipTaskbar:true      │
│   ├─ 延迟 500ms 后调 desktop-embed.embedInDesktop(window)        │
│   │   ├─ 成功: SetParent(winHwnd, workerW) → 嵌入壁纸层          │
│   │   └─ 失败: SetWindowPos(HWND_BOTTOM) → 降级为置底            │
│   ├─ ipcMain.on('xxx', ...) 接收渲染进程指令                     │
│   └─ app.on('window-all-closed') 退出                            │
│                                                                   │
│  preload.js                                                       │
│   └─ contextBridge.exposeInMainWorld('electronAPI', {...})        │
│      只把 8 个白名单方法挂到 window 上                            │
│                                                                   │
│  native/desktop-embed.js                                          │
│   ├─ koffi.load('user32.dll')                                     │
│   ├─ func('FindWindowW', ...), func('SetParent', ...), ...        │
│   ├─ embedInDesktop(win)   → 5 步嵌入流程                        │
│   ├─ setWindowAlpha(win, 240)                                     │
│   ├─ setClickThrough(win, bool)                                   │
│   └─ moveToBottom(win)                                            │
└───────────────────────────────────────────────────────────────────┘
                  ▲               │  IPC (ipcRenderer.send)
                  │               ▼
┌───────────────────────────── 渲染进程 ────────────────────────────┐
│  src/index.html + src/js/*.js + src/styles/main.css               │
│                                                                   │
│  utils/                       ← 共享工具（无业务）                │
│   ├─ date-utils.js            日期加减、格式化、显示               │
│   └─ dom-utils.js             HTML 转义、颜色调整、ID 生成        │
│                                                                   │
│  storage.js                   ← 唯一数据出入口                   │
│     │  localStorage: 5 个 key                                     │
│     │  - tomato_clock_todos                                       │
│     │  - tomato_clock_pomodoros                                   │
│     │  - tomato_clock_stats       (按日期分组)                    │
│     │  - tomato_clock_settings                                    │
│     │  - tomato_clock_appearance                                  │
│     ▼                                                             │
│  业务模块（todo.js / pomodoro.js）                                │
│     │  互相通过 Storage 协作（不直接 import）                     │
│     ▼                                                             │
│  视图模块                                                         │
│   ├─ notifications.js          通知（系统通知 + 窗口闪烁）        │
│   ├─ appearance.js              主题/不透明度/位置                │
│   ├─ settings-modal.js         设置弹窗（4 个 Tab）              │
│   └─ month-view-modal.js       内联月视图（主窗口内）             │
│     ▼                                                             │
│  app.js                       ← 顶层协调器（仅装配 + 事件路由）   │
│     ├─ init() 装配所有模块                                        │
│     ├─ 主面板 3 Tab + Esc 关闭处理                                │
│     ├─ 统计面板                                                   │
│     └─ 跨窗口同步: BroadcastChannel('tomato-clock')               │
└───────────────────────────────────────────────────────────────────┘
```

## 三、模块依赖图

```
   ┌────────┐
   │  app   │ ← 主协调器（仅装配，无业务逻辑）
   └───┬────┘
       │
       ├─────────────────────────────────────┐
       ▼                                     ▼
   ┌─────────────┐                    ┌─────────────────┐
   │ Notifications│ Appearance        │ SettingsModal   │
   └─────────────┘    │                │  ├─ DailyTodos   │
                      ▼                │  ├─ CompletedView│
                ┌──────────┐          │  └─ QuickAdd     │
                │Pomodoro  │          └────────┬─────────┘
                └────┬─────┘                   │
                     │                         ▼
                     │                ┌──────────────────┐
                     │                │ MonthViewModal   │
                     │                └────────┬─────────┘
                     │                         │
   ┌────────┐        │                         │
   │  Todo  │◄───────┴─────────────────────────┘
   └───┬────┘
       │
       ▼
   ┌────────┐
   │Storage │ ← 唯一数据层
   └────────┘
       │
       ▼
   localStorage


   utils (date-utils / dom-utils) ──── 所有模块共用

   main.js (主进程) ──IPC──> app.js
   preload.js 提供 window.electronAPI
```

**重要约束**：
- 所有模块用 `const X = (() => { ... })()` 模式（IIFE + window 全局），无 ES Module 依赖
- `app.js` 不写业务逻辑，只做 DOM ↔ 模块的桥接
- `app.js` 暴露的 facade（`App.refreshDailyTodos` 等）只是为了兼容 HTML 内嵌 onclick
- `Todo` ↔ `Pomodoro` 不直接引用，仅通过 `Storage` 交换数据
- 视图模块可单向调用业务模块，反之不行
- 跨模块共享工具放 `utils/`，任何模块都可以引用

## 四、启动流程

### 主进程侧

```
1.  require('./native/desktop-embed')     ← 失败不致命，降级
2.  app.whenReady().then(() => {
3.    createWindow()      ← 340x500, transparent, skipTaskbar
4.    window.once('ready-to-show', () => {
5.      window.show()
6.      setTimeout(500ms, () => {
7.        desktopEmbed.embedInDesktop(window)   ← 嵌入 WorkerW
8.        desktopEmbed.setWindowAlpha(window, 240)
9.      })
10.   })
11.   createTray()        ← 16x16 红色托盘 + 右键菜单
12. })
```

### 渲染进程侧

`src/index.html` 的 `<script>` 顺序（顶层 IIFE 全局变量互相依赖）：

```
1.  utils/date-utils.js   → 暴露 DateUtils
2.  utils/dom-utils.js    → 暴露 DomUtils
3.  storage.js            → 暴露 Storage（依赖 1+2）
4.  todo.js               → 暴露 Todo（依赖 1+2+3）
5.  pomodoro.js           → 暴露 Pomodoro（依赖 3+4）
6.  notifications.js      → 暴露 Notifications
7.  appearance.js         → 暴露 Appearance（依赖 1+3+5）
8.  month-view-modal.js   → 暴露 MonthViewModal（依赖 1+2+3+4）
9.  settings-modal.js     → 暴露 SettingsModal（依赖 1+2+3+4+7+8）
10. app.js                → DOMContentLoaded → App.init()
   ├─ Todo.listenExternal()              ← 订阅 BroadcastChannel
   ├─ Todo.init({ onTodosChanged })      ← 任何变更后回调
   ├─ Pomodoro.init({ onComplete })      ← 完成通知回调
   ├─ initTabs()                          ← 主面板 3 Tab
   ├─ Notifications.init()
   ├─ SettingsModal.init()                ← 设置弹窗 4 Tab
   ├─ MonthViewModal.init()               ← 内联月视图
   ├─ Appearance.init()                   ← 主题/不透明度/位置
   ├─ Appearance.apply(Storage.loadAppearance())  ← 首次应用外观
   └─ updateStats()                       ← 统计面板
```

`src/month-view.html`（独立窗口）顺序：
```
1. utils/date-utils.js + utils/dom-utils.js
2. storage.js + todo.js
3. month-view.js          → WeekView.init()
```

## 五、跨窗口同步

主窗口和月视图窗口都使用同一份 `localStorage`。同步靠两层机制：

1. **`BroadcastChannel`**：同源同进程窗口之间，最快
2. **`window.addEventListener('storage', ...)`**：兜底，应对不同 BrowserWindow 实例

**专用 channel 隔离**（v1.1+，避免误触发）：

| Channel | 用途 | 发送方 | 接收方 |
|---------|------|--------|--------|
| `tomato-todos` | 待办清单数据变更 | `Todo.broadcastChange` | `Todo.listenExternal`（主窗口）、`WeekView.init`（月视图） |
| `tomato-activity` | 专注统计 / 键盘花园事件 | `FocusActivity.broadcast` | `KeyboardGarden.init`（键盘花园） |

> **为什么必须分离**：BroadcastChannel 的「不回声」是**同一对象不收自己**，**不同对象**（包括同窗口内其他 listener）**会**收到。原代码 todos 和 activity 共用 `tomato-clock` channel，导致 `recordInput`（按键/点击统计）发的 `activity-input` 消息被 `Todo.listenExternal` 误当成 `todos-changed` 处理，触发主窗口 todoList 重新渲染——每次按键都刷一次。

发送端（`Todo.saveAndRender` → `broadcastChange`）：
```js
const bc = new BroadcastChannel('tomato-todos');
bc.postMessage('changed');
bc.close();
```

接收端（`Todo.listenExternal` 和 `WeekView.init`）：
```js
const bc = new BroadcastChannel('tomato-todos');
bc.addEventListener('message', () => {
    if (!isInputFocused()) requestAnimationFrame(() => render());
});
```

`isInputFocused()` 防抖：用户在某窗口输入框里打字时，**不**重新渲染，避免吞掉按键。

**storage 事件按 key 过滤**（v1.1+，避免误触发）：

- `WeekView`（月视图）只响应 `tomato_clock_todos` / `tomato_clock_completed` / `tomato_clock_stats`
- `KeyboardGarden`（键盘花园）只响应 `tomato_clock_keyboard_garden` / `tomato_clock_focus_activity`

这样按键触发 `Storage.saveKeyboardGarden` 写 localStorage 时，月视图不会被误触发刷新。

### 全局键盘监听（键盘花园）

键盘花园的按键记录**独立于番茄钟**——只要应用在运行就持续记录，无需开启番茄钟。

```
┌──────────────────┐   GetAsyncKeyState (24ms 轮询)   ┌─────────────────┐
│ native/global-   │ ──────────────────────────────►  │ main.js:        │
│ key-monitor.js   │                                  │ startGlobal-    │
│                  │ ◄── 边沿触发，标准化 key label ── │ KeyboardTracking│
└──────────────────┘                                  └────────┬────────┘
                                                                │
                                              webContents.send('global-key-press')
                                                                │
                                                                ▼
                                              ┌──────────────────────────┐
                                              │ 当前 key receiver 窗口    │
                                              │ (FocusActivity.init)     │
                                              └──────────────────────────┘
```

**机制要点**：

1. **常驻监听**：`app.whenReady` 时主进程立即 `startGlobalKeyboardTracking()`，不依赖番茄钟会话。
2. **多窗口去重**：通过 **key receiver 机制**——同一时刻只有一个 BrowserWindow 是 receiver（先到先得），按键事件只发给它；其他窗口通过 `localStorage` `storage` 事件 + `BroadcastChannel` 被动同步，避免重复计数。
3. **receiver 失效兜底**：当前 receiver 窗口被关闭后，下次全局按键触发 `pickNextKeyReceiver()`，主进程挑选一个存活窗口接管，并通过 `key-receiver-changed` 事件（M→R 推送）通知它。
4. **降级路径**：koffi 加载失败时，`is-global-keyboard-tracking-available` 返回 false，渲染端退回到窗口内 `keydown` 监听（窗口未激活时无法记录，这是已知限制）。

**典型场景**：

| 场景 | 行为 |
|------|------|
| 只开主窗口，**未启动番茄钟** | 主窗口 claim 成功 → 按键写入 `KEYBOARD_GARDEN`（无论窗口激活与否） |
| 番茄钟专注中 | 额外写入 `FOCUS_ACTIVITY` 的 keystrokes/clicks/activeSeconds |
| 主+月+花园三窗口 | 主窗口 claim 成功 → 写一次 localStorage → 另两窗口通过 storage 事件 + BroadcastChannel 同步 UI |
| 主窗口关闭，花园独存 | 兜底接管 → 花园收到 `key-receiver-changed` 事件 → 后续按键由花园处理 |
| koffi 加载失败 | 全局监听不可用 → 降级到窗口内 `keydown`（窗口必须激活） |

## 六、数据流向

### 番茄钟完成 1 次

```
1. setInterval 倒计时归 0
2. pomodoro.js → onTimerComplete()
   ├─ Storage.addPomodoro({ type:'focus', startTime, endTime, taskId })
   ├─ Storage.updateTodayStats(stats => { stats.totalPomodoros++; ... })
   ├─ if (currentTaskId) Todo.incrementPomodoro(currentTaskId)
   └─ onComplete('focus', currentTaskId)  →  app.js
       ├─ updateStats()
       └─ Notifications.show('🍅 专注完成！', '...')
3. setTimeout 1.5s → switchMode(BREAK, autoStart)
4. 更新 #todayPomodoros、#todayFocusTime 文本
```

### 用户添加 1 个任务

```
1. input#todoInput → Enter
2. todo.js → addTodo()
   ├─ 构造新对象 { id, text, completed:false, date:today, recurring, ... }
   ├─ todos.unshift(newTodo)
   ├─ if (recurring !== 'none') generateRecurringInstances(newTodo, 30)
   └─ saveAndRender()
       ├─ Storage.saveTodos(todos)
       ├─ render()  ← 重新拼 #todoList 的 innerHTML
       ├─ updateTaskSelect()  ← 同步 #taskSelect
       └─ broadcastChange()    ← 通知月视图窗口
3. onTodosChanged(todos) → app.js
   ├─ updateStats()
   └─ if (SettingsModal.isOpen()) {
        SettingsModal.DailyTodos.refresh();
        SettingsModal.CompletedView.refresh();
      }
```

## 七、关键设计取舍

| 决策 | 原因 | 代价 |
|------|------|------|
| 不用前端框架 | 启动快、体积小、无构建步骤 | 没有响应式系统，状态变了要手动 `render()` |
| localStorage 而非 SQLite | 不需要引入 better-sqlite3 这种 N-API 包 | 跨标签页需用 BroadcastChannel 同步 |
| 番茄钟精度依赖 setInterval | 简单 | 长时间运行会有 1~2s 漂移（已知问题，未在文档承诺） |
| 月视图做成独立 BrowserWindow | 可以拖到副屏、不挡主窗口 | 多一个进程，IPC 协议必须保持兼容 |
| 主色 + break 色两套变量 | 休息阶段需要蓝色提示 | CSS 变量变多，主题切换时要写更多 |
| 用 replace(`%s`) 拼 rgba | 主题色模板只声明一次 | 不直观，但能避免 5 个 rgba 写 5 遍 |

## 八、安全边界

- `nodeIntegration: false` + `contextIsolation: true` + `sandbox: false`（需要 koffi 在 preload 之外用，sandbox 关了）
- `contextBridge` 只暴露 8 个白名单方法
- HTML `Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';`
- 任务文本渲染前都经过 `escapeHtml()` 防 XSS

## 九、性能特征

| 操作 | 复杂度 | 备注 |
|------|--------|------|
| 启动 | O(周期任务数) | `hydrateRecurringTasks` 遍历未来 14 天 × 周期任务模板 |
| 添加任务 | O(1) | unshift + render 重写 innerHTML |
| 切换主题 | O(1) | 5 个 `setProperty` + 1 个 `querySelector` |
| 周期任务补全 | O(模板数 × 14) | 仅启动时执行一次 |
| 月视图渲染 | O(7 × 任务数) | 7 列，每列遍历所有 todos |

主面板永远不超 100 条任务，渲染一次 innerHTML 远低于 16ms，无需虚拟列表。
