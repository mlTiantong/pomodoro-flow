# 📋 Tomato Clock - 开发任务清单

> 总目标：构建一个嵌入 Windows 11 桌面的半透明「待办清单 + 番茄钟」小组件

---

## 🚀 阶段一：项目初始化

### 1.1 初始化 npm 项目
- [x] 创建 `package.json`
- [ ] 安装核心依赖：`electron`, `koffi`
- [ ] 安装开发依赖：`electron-builder`
- [ ] 配置 `.gitignore`

### 1.2 基础配置
- [ ] 配置 `main.js` Electron 入口
- [ ] 配置 `preload.js` 安全桥接
- [ ] 配置 `electron-builder` 打包参数

---

## 🪟 阶段二：桌面嵌入引擎

### 2.1 Win32 API 桥接 (`native/desktop-embed.js`)
- [ ] 实现 `findWorkerW()` - 查找桌面 WorkerW 窗口
- [ ] 实现 `embedInDesktop(hwnd)` - 将窗口嵌入桌面
- [ ] 实现 `setClickThrough(hwnd)` - 设置点击穿透
- [ ] 实现 `setWindowTransparency(hwnd, alpha)` - 透明度控制
- [ ] 实现错误回退机制（若嵌入失败则降级为普通置底窗口）

### 2.2 Electron 主进程集成 (`main.js`)
- [ ] 创建透明无边框 `BrowserWindow`
- [ ] 集成桌面嵌入模块
- [ ] 处理窗口生命周期与系统托盘
- [ ] IPC 通信通道设计

---

## 🎨 阶段三：UI 设计与实现

### 3.1 HTML 结构 (`src/index.html`)
- [ ] 番茄钟区域：计时器显示、控制按钮、进度条
- [ ] 待办清单区域：任务列表、输入框、操作按钮
- [ ] 统计区域：今日完成番茄数、专注时长
- [ ] 设置区域（可选）：番茄时长、休息时长

### 3.2 CSS 毛玻璃效果 (`src/styles/main.css`)
- [ ] 玻璃态容器：`backdrop-filter: blur(20px)`
- [ ] 番茄红/暖橙主题配色方案
- [ ] 按钮悬停/点击动画效果
- [ ] 计时器环形进度条
- [ ] 任务列表交互动画
- [ ] 响应式适配不同屏幕

### 3.3 JavaScript 功能模块

#### `src/js/storage.js`
- [ ] `loadTodos()` - 加载待办列表
- [ ] `saveTodos(todos)` - 保存待办列表
- [ ] `loadStats()` - 加载统计数据
- [ ] `saveStats(stats)` - 保存统计数据
- [ ] `loadSettings()` - 加载设置
- [ ] `saveSettings(settings)` - 保存设置

#### `src/js/todo.js`
- [ ] `addTodo(text)` - 添加任务
- [ ] `toggleTodo(id)` - 切换完成状态
- [ ] `deleteTodo(id)` - 删除任务
- [ ] `editTodo(id, newText)` - 编辑任务
- [ ] `clearCompleted()` - 清除已完成
- [ ] `getTodos()` - 获取任务列表
- [ ] `getStats()` - 获取统计信息

#### `src/js/pomodoro.js`
- [ ] `start()` - 开始计时
- [ ] `pause()` - 暂停计时
- [ ] `reset()` - 重置计时
- [ ] `switchMode()` - 切换专注/休息模式
- [ ] 计时器 `setInterval` 精确倒计时
- [ ] 完成提示音效（可选）
- [ ] 自动切换模式
- [ ] `getProgress()` - 获取进度百分比

#### `src/js/app.js`
- [ ] 初始化所有模块
- [ ] 事件绑定与协调
- [ ] 数据流管理
- [ ] 自动保存

---

## 🔧 阶段四：功能增强

### 4.1 系统托盘
- [ ] 系统托盘图标
- [ ] 托盘右键菜单：显示/隐藏、退出
- [ ] 最小化到托盘
- [ ] 通知提醒（番茄完成）

### 4.2 任务与番茄钟联动
- [ ] 番茄钟开始时选择关联任务
- [ ] 每个任务显示完成的番茄数
- [ ] 番茄完成后自动标记任务进度

### 4.3 数据持久化增强
- [ ] 数据导出/导入 (JSON)
- [ ] 数据备份机制

---

## 🧪 阶段五：测试与打包

### 5.1 功能测试
- [ ] 番茄钟计时准确性
- [ ] 待办清单 CRUD 操作
- [ ] 数据持久化验证
- [ ] 桌面嵌入效果验证
- [ ] 窗口透明与点击穿透

### 5.2 兼容性测试
- [ ] Windows 11 多显示器测试
- [ ] DPI 缩放适配
- [ ] 不同桌面壁纸场景

### 5.3 打包发布
- [ ] `electron-builder` NSIS 安装包
- [ ] 图标和资源文件
- [ ] 自动更新配置（可选）

---

## 🐛 已修复 Bug 记录

### Bug: 键盘花园不激活窗口时不记录按键 ✅ 已修复

**症状**：键盘花园窗口未激活时，不记录任何按键（按了不增长）。

**根因**（详见 [ARCHITECTURE.md §五](../architecture.md)）：
- `native/global-key-monitor.js` 的 `GetAsyncKeyState` 轮询是有效的全局机制，但 `main.js` 的 `setGlobalKeyboardTracking(true)` **只在番茄钟专注会话启动时**被调用（`focus-activity.js:55` `setKeyboardTracking(true)`）
- 没开番茄钟时，主进程的全局监听从未启动 → 任何窗口（包括主窗口）即使激活也不会触发全局按键事件
- 即便开启番茄钟，窗口未激活时窗口内 `keydown` 不触发，**且 IPC 通道建立需要等会话启动**，存在时间窗口

**修复**（v1.1+）：
1. **常驻全局键盘监听**：`app.whenReady` 时主进程立即 `startGlobalKeyboardTracking()`，不依赖番茄钟。
2. **多窗口去重 — key receiver 机制**：同一时刻只有一个 BrowserWindow 是 receiver（`claim-key-receiver` / `release-key-receiver` IPC），按键事件只发给它；其他窗口通过 `localStorage` `storage` 事件 + `BroadcastChannel` 被动同步。
3. **receiver 失效兜底**：当前 receiver 关闭后，主进程通过 `pickNextKeyReceiver()` 挑选存活窗口接管，推送 `key-receiver-changed` 事件（M→R）。
4. **降级路径**：koffi 加载失败时降级到窗口内 `keydown` 监听。

**改动文件**：
- `main.js` — `startGlobalKeyboardTracking` / `pickNextKeyReceiver` / `tryClaimKeyReceiver` / `releaseKeyReceiver` / `wireWindow` + 新增 3 个 IPC handler
- `preload.js` — 新增 `claimKeyReceiver` / `releaseKeyReceiver` / `onKeyReceiverChanged` 三个白名单方法
- `src/js/focus-activity.js` — `init()` 改为 async，优先全局 → 降级窗口内；所有窗口订阅 `onGlobalKeyPress` + `onKeyReceiverChanged`，靠 `isKeyReceiver` 标志决定处理
- 文档：`docs/ARCHITECTURE.md` §五新增"全局键盘监听"小节；`docs/electron/ipc.md` 新增 5 个通道；`docs/electron/main.md` 更新 IPC 列表

---

### Bug: 按键触发主窗口/周视图 todoList 频繁刷新 ✅ 已修复

**症状**：每次按键盘，主窗口和周视图窗口的 todoList 都会被重渲染；并且用户报告"主窗口/周视图都不能完成任务了"（推测是频繁刷新导致 UI 闪烁，让人误以为点击无响应）。

**根因**（v1.1 全局键盘修复的副作用）：
- 修复后 `FocusActivity.recordInput` / `growKey` 每次按键/点击都会 broadcast `activity-input` / `garden-grow` 消息
- 这些消息通过 `BroadcastChannel('tomato-clock')` 发送
- `Todo.listenExternal`（主窗口）和 `WeekView`（月视图）**都监听**这个 channel，**无差别 reload**
- BroadcastChannel 的「不回声」是**同一对象不收自己**，`recordInput` 用临时实例（`new` + `close`）和 `Todo.listenExternal` 用的持久实例**是不同对象**，所以同窗口的 listener 也会收到消息 → 触发 `Todo.reload()` + `Todo.render()`
- 另外 `Storage.saveKeyboardGarden` 写 localStorage 触发其他窗口的 `storage` 事件，月视图的旧 storage listener 用 `key.startsWith('tomato_clock_')` 匹配，把按键写入的 garden 数据当成 todos 变更处理

**修复**（v1.1.1）：
1. **专用 channel 分离**：
   - `tomato-todos` — `Todo.broadcastChange` / `Todo.listenExternal` / `WeekView`
   - `tomato-activity` — `FocusActivity.broadcast` / `KeyboardGarden`
2. **storage 事件按 key 白名单过滤**：
   - `WeekView` 只响应 `tomato_clock_todos` / `tomato_clock_completed` / `tomato_clock_stats`
   - `KeyboardGarden` 只响应 `tomato_clock_keyboard_garden` / `tomato_clock_focus_activity`

**改动文件**：
- `src/js/todo.js:563-581` — broadcastChange + listenExternal 改用 `tomato-todos`
- `src/js/focus-activity.js:16` — `CHANNEL = 'tomato-activity'`
- `src/js/keyboard-garden.js:26,30-35` — channel 重命名 + storage 按 key 过滤
- `src/js/month-view.js:50,58-66` — channel 重命名 + storage 按 key 过滤
- 文档：`docs/ARCHITECTURE.md` §五补充"专用 channel 隔离"表格 + "storage 事件按 key 过滤"小节

---

### 调整：键盘花园成长值缩 30% + 阶段函数去重 ✅ 已修复

**背景**：
- 每次按键 `growth += 8`（原 `GROWTH_PER_KEY`），从 0 长到首次收成（100）只需 ~13 次按键
- "花"阶段（growth 75-99）持续仅 3 次按键就触发收成 → 视觉上一闪而过
- "果"阶段（harvests>0 且 growth>80）仅存在 **1-3 次按键**就再次收成 → 罕见、感觉像"概率触发"
- 此外 `calculateStage`（`focus-activity.js`，写入用）和 `getPlantStage`（`keyboard-garden.js`，显示用）的阈值**不一致**（果：写入 80，显示 70；花：写入 75，显示 72）— 同一 plant 在 storage 和 UI 上可能显示不同阶段

**修复**（v1.1.2）：
1. **`GROWTH_PER_KEY: 8 → 3`**（37.5%，约 30%）：
   - 首次收成按键数：~13 → **~34**
   - 各阶段持续时间显著延长
   - "果"阶段持续：1-3 次按键 → **4-6 次按键**
   - 收成后 `growth` 骤降到 0-5（步长 3-5）
2. **删除 `getPlantStage`，统一用 `FocusActivity.calculateStage`**：
   - `focus-activity.js` 把 `calculateStage` 暴露到 `FocusActivity` 导出对象
   - `keyboard-garden.js:renderBoard` 改用 `FocusActivity.calculateStage(growth, harvests)`
   - 顺手暴露 `STAGE` 常量（`SEED=0, SPROUT=1, LEAVES=2, FLOWER=3, FRUIT=4`）、`GROWTH_PER_KEY`、`HARVEST_AT` 供外部参考
   - 修复了写入/显示阈值不一致的隐藏 bug

**奖励保持原样**（`Math.min(6, Math.floor(harvests/3))`）：
- 总增长范围：3~9（早期慢、收成 3 次后 +4、6 次后 +5、18+ 次后 +6）
- "养熟"反馈：成熟键位成长加速，仍有节奏感

**改动文件**：
- `src/js/focus-activity.js:21` — `GROWTH_PER_KEY = 3` + 注释说明
- `src/js/focus-activity.js:267-271` — 暴露 `calculateStage` / `STAGE` / 常量
- `src/js/keyboard-garden.js:84-89` — `renderBoard` 用 `FocusActivity.calculateStage`
- `src/js/keyboard-garden.js:115-117` — 删 `getPlantStage` 留注释说明

---

### 功能：AI 助手聊天窗口（OpenAI 兼容）✅ v1.2.0

**目的**：用户可在独立窗口中与 OpenAI 兼容 API 聊天，让 AI 查询任务/统计/设置（**只读**，不写）。

**功能范围**：
- 独立 BrowserWindow（类似 keyboard-garden，780x600）
- 设置里 4 个字段：baseUrl、apiKey（password）、model、enabled（默认 false）
- 头部新增 🤖 按钮触发，未配置时引导到设置
- 4 个只读工具：
  - `list_todos(date?)` — 查询某日未完成任务
  - `list_completed(date?/days?)` — 查询已完成（按日期分组）
  - `get_today_stats()` — 今日统计 + 24h 热力
  - `get_pomodoro_settings()` — 番茄钟配置
- System prompt 明确禁止任何写操作："如果用户要添加/删除任务，请告知目前 AI 只有只读权限"

**安全设计**：
- **API key 流向严格** — 仅在 `fetch` header 中使用，**绝不**写 console / BroadcastChannel / DOM
- **enabled 默认 false** — 用户必须显式启用才会发请求
- **30s 请求超时**（AbortController）
- **多轮 tool calls 上限 5 轮** — 防 AI 无限循环
- **历史消息上限 20 条** — 限制 token 增长
- **所有用户输入/AI 回复用 `textContent` 渲染** — 防 XSS
- **AI 窗口不加载 todo.js / pomodoro.js** — 只能调 `Storage` 只读方法，没有写入口
- **API key 明文存 localStorage** — 个人单机工具 MVP 接受，UI 提示"请勿在共享电脑使用"

**架构选择**：
- AI 窗口**不直接执行写操作**（即使 AI 想）—— ai-tools.js 4 个 handler 全部只读
- AI 窗口**不调 Todo/Pomodoro 模块** —— 只调 `Storage.loadTodos/loadSettings/loadTodayStats/calculateStreak`
- 跨窗口同步：AI 窗口读 localStorage（与主窗口共享），无需 IPC 桥

**Caveats（已知限制）**：
- 浏览器 fetch 受 CORS 限制 — 用 OpenAI 官方 OK，本地 Ollama 等可能需要主进程代理
- API key 明文存 localStorage — MVP 接受，后续可考虑 `safeStorage` 加密

**改动文件**：
- `src/js/storage.js` — `STORAGE_KEYS.AI_CONFIG` + `DEFAULT_AI_CONFIG` + `loadAIConfig/saveAIConfig`
- `main.js:34,493-538` — `aiWindow` 状态 + `openAIWindow()` + 2 个 IPC handler
- `preload.js:51-57` — 暴露 `openAIChat/closeAIChat`
- `src/index.html:23-29,260,387-422` — header AI 按钮 + AI Tab 表单
- `src/js/settings-modal.js:75-92,298-342` — `AISettings` 子模块
- `src/js/app.js:88-110` — AI 按钮事件（未配置时引导到设置）
- `src/js/ai-tools.js`（新）— 4 个只读工具 + OpenAI tool 格式定义
- `src/ai-chat.html`（新）— 窗口 HTML 骨架
- `src/js/ai-chat.js`（新）— 消息流 + OpenAI API 调用 + tool_calls 循环
- `src/styles/ai-chat.css`（新）— 玻璃态聊天窗口样式
- `src/styles/main.css:1305-1343` — AI Tab 表单样式（`.ai-input` / `.ai-hint`）

**未实现（按用户要求暂缓）**：
- 写操作工具（add_todo / delete_todo / toggle_todo / start_pomodoro 等）— 需后续评估安全风险后再开
- Pomodoro 操控（需要 BroadcastChannel 指令协议让主窗口执行 UI 操作）
- 流式响应（SSE）— 当前等完整响应后一次性显示
- 聊天记录持久化 — 当前仅内存保留，重启清空

---

### 功能：AI 助手获得写权限（需用户 confirm）✅ v1.3.0

**目的**：扩展 AI 助手能力——除查询外，AI 可执行 8 个写操作（增删改查任务、起停番茄钟、改设置），但**每个写操作都强制弹原生 confirm 对话框让用户确认**。

**新工具集（8 个写工具）**：

| 工具 | 风险 | 按钮文案 |
|------|------|----------|
| `add_todo` | 低 | 允许 / 拒绝 |
| `toggle_todo` | 低 | 允许 / 拒绝 |
| `edit_todo` | 中 | 允许 / 拒绝 |
| `delete_todo` | **高** | 允许（危险）/ 拒绝 |
| `delete_completed` | **高** | 允许（危险）/ 拒绝 |
| `start_pomodoro` | 中 | 允许 / 拒绝 |
| `stop_pomodoro` | 中 | 允许 / 拒绝 |
| `update_pomodoro_settings` | 中 | 允许 / 拒绝 |

**Confirm 机制**：
- 主进程 `dialog.showMessageBox`（原生 Windows 对话框，**非**浏览器 `window.confirm`）
- 默认按钮 = 拒绝（防误点）；Esc 也拒绝
- 详情区显示参数预览（任务内容、日期、新旧对比等）
- 拒绝时 tool result 返回 `{error: 'user_denied'}`，AI 看到后**不会**重试
- 危险操作的按钮文案加"危险"标注，dialog type 改 `warning`（黄色警告图标）

**安全边界**：
- `AITools.execute()` 入口拦截所有写操作（WRITE_TOOLS set 检查）
- 即使有人绕过注入 `askUser` 回调，写操作会被 `write_blocked` 错误拒绝
- 危险操作（删除）单独标记（DANGEROUS_TOOLS set）

**跨窗口执行**：
- **Todo 写**：AI 窗口直接调 `Todo.addTodo/deleteTodo/editTodo/toggleTodo` → 写 localStorage → 主窗口通过 storage 事件自动同步（复用现有同步机制）
- **Pomodoro 写**：通过新增 `tomato-commands` BroadcastChannel 发指令 → 主窗口接收并调 Pomodoro
  - 主窗口**唯一**订阅该 channel，避免被其他窗口误响应
  - **幂等**：`pomodoro-start` 仅在 IDLE/COMPLETED 时执行；`pomodoro-stop` 直接 reset
- **设置写**：`Storage.saveSettings` 写 localStorage + 通过 channel 通知主窗口 reset（仅 IDLE 时）

**改动文件**：
- `main.js:7,556-571` — import `dialog` + `confirm-ai-action` IPC handler
- `preload.js:64-71` — 暴露 `confirmAIAction`
- `src/js/ai-tools.js`（重写）— 12 个工具（4 只读 + 8 写），`execute` 改 async，加 `WRITE_TOOLS`/`DANGEROUS_TOOLS` 分类，`formatPreview` 预览函数
- `src/js/ai-chat.js:91-100,135,184-194` — `execute` 调用加 `await` + 注入 `askUserConfirm`，加 `askUserConfirm` 函数
- `src/ai-chat.html:41` — 加载 `todo.js`
- `src/js/app.js:21,76-103` — `listenToAICommands()` 订阅 `tomato-commands` channel（Pomodoro 幂等 + settings 通知 reset）

---

### Bug: AI 添加任务后所有历史任务消失 ✅ 已修复

**症状**：让 AI 添加一个新任务后，"应用打开前的所有任务"消失，但 AI 添加的当前任务保留。

**根因**（多层次问题）：
1. **AI 窗口没调 `Todo.init()`**，所以 `let todos = []` 永远是空数组
2. AI 调 `Todo.addTodo('A')` → `newTodo.order = todos.length` = `0`（空数组）
3. `todos.unshift(newTodo)` → in-memory 变成 `[A]`
4. `saveAndRender()` → `Storage.saveTodos([A])` → **localStorage 被覆盖**为只含 A
5. 广播 BroadcastChannel → 主窗口 reload → 看到 `[A]`，**旧任务消失**

**同类问题**（同一根因的 5 个变体）：
- `toggle_todo` / `edit_todo` / `delete_todo`：调 `Todo.xxx()` 时通过 id/text 查找，但 `todos.find` 在空数组上找不到 → **静默失败**
- `delete_completed`：循环 `Todo.deleteTodo()` → 同样静默失败
- **Race condition**：AI 窗口 init 之后，主窗口添加新任务 → AI 窗口的 in-memory todos **永远不更新**（没订阅 BroadcastChannel）→ AI 调 add_todo 时丢失主窗口新加的任务

**修复**（v1.3.1）：
1. **写工具完全自己实现**，不依赖 Todo 模块：
   - 直接 `Storage.loadTodos()` 读、`Storage.saveTodos()` 写
   - 自己发 `BroadcastChannel('tomato-todos')` 触发主窗口同步
   - 周期任务预生成（30 天）+ `scheduleNextRecurring` 也自己实现
   - **不**再有 in-memory 缓存不一致问题
2. **冗余防御**：
   - `ai-chat.js` init 调 `Todo.reload()` + `Todo.listenExternal()`（让 AI 窗口的 Todo 模块也跟上主窗口的变更）
   - `ai-tools.js` execute 入口：写操作前**强制** `Todo.reload()`（兜底）

**为什么写工具不复用 Todo.xxx()**：
- Todo.xxx() 强依赖 in-memory `todos` 数组
- AI 窗口的 in-memory 数组不可信（没 init / 可能漏同步）
- 自己实现虽然代码重复，但**永远从 storage 读最新、写完整数据**，无 race condition

**复制的私有函数**（Todo.js 私有，无法跨模块复用）：
- `shouldHaveTaskOnDate`（周期判定）
- `scheduleNextRecurring`（完成时自动安排下一周期）
- `generateRecurringInstances` 的简化版（仅 add_todo 用）

**改动文件**：
- `src/js/ai-chat.js:80-95` — init 调 `Todo.reload()` + `Todo.listenExternal()`
- `src/js/ai-tools.js:223-235,308-417,484-489` — 5 个写工具全部重写为直接调 Storage；execute 写前强制 reload；新增 `makeId` / `shouldHaveTaskOnDate` / `scheduleNextRecurring` / `broadcastTodosChanged` helpers

---

## 📐 工作分解结构 (WBS)

```
Tomato Clock
├── 文档 (DONE)
│   ├── ARCHITECTURE.md
│   ├── TASK.md
│   └── README.md
├── 项目配置
│   ├── package.json
│   ├── .gitignore
│   └── electron-builder.yml
├── 主进程
│   ├── main.js
│   ├── preload.js
│   ├── native/desktop-embed.js
│   └── native/global-key-monitor.js
├── 渲染进程
│   ├── index.html / month-view.html / keyboard-garden.html
│   ├── styles/
│   └── js/
│       ├── app.js
│       ├── todo.js
│       ├── pomodoro.js
│       ├── storage.js
│       ├── focus-activity.js
│       ├── settings-modal.js
│       ├── month-view-modal.js / month-view.js
│       ├── keyboard-garden.js
│       ├── appearance.js
│       ├── notifications.js
│       └── utils/
│           ├── date-utils.js
│           └── dom-utils.js
└── 打包
    └── electron-builder 配置
```

---

## 📊 进度追踪

| 阶段 | 状态 | 预计工时 |
|------|------|---------|
| 阶段一：项目初始化 | ✅ 完成 | 1h |
| 阶段二：桌面嵌入引擎 | ✅ 完成 | 3h |
| 阶段三：UI 设计与实现 | ✅ 完成 | 4h |
| 阶段四：功能增强 | ✅ 完成 | 2h |
| 阶段五：测试与打包 | ⏳ 待开始 | 2h |
| 键盘花园全局监听修复 | ✅ 完成 | 1.5h |

---

> 📝 最后更新: 2026-06-02（键盘花园 bug 修复）
