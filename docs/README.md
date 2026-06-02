# Tomato Clock — 项目文档索引

> Windows 11 桌面小组件：待办清单 + 番茄钟，嵌入桌面壁纸的半透明毛玻璃工具。

## 一、阅读顺序

| # | 文档 | 作用 | 适合谁 |
|---|------|------|--------|
| 1 | [architecture.md](./architecture.md) | 整体架构、模块依赖、启动流程、数据流 | 想快速了解项目的人 |
| 2 | [data-model.md](./data-model.md) | 所有数据实体的字段定义、生命周期 | 需要修改存储结构的人 |
| 3 | [modules/utils.md](./modules/utils.md) | `utils/date-utils.js` + `dom-utils.js` — 共享工具 | 需要复用日期/HTML/ID 工具的人 |
| 4 | [modules/storage.md](./modules/storage.md) | `storage.js` — 唯一数据出入口 | 需要改持久化层的人 |
| 5 | [modules/todo.md](./modules/todo.md) | `todo.js` — 待办 CRUD + 周期任务 | 需要改待办功能的人 |
| 6 | [modules/pomodoro.md](./modules/pomodoro.md) | `pomodoro.js` — 番茄钟状态机 | 需要改计时逻辑的人 |
| 7 | [modules/notifications.md](./modules/notifications.md) | `notifications.js` — 系统通知 + 窗口闪烁 | 需要扩展通知方式的人 |
| 8 | [modules/appearance.md](./modules/appearance.md) | `appearance.js` — 主题/不透明度/位置 | 需要改主题或外观的人 |
| 9 | [modules/settings-modal.md](./modules/settings-modal.md) | `settings-modal.js` — 设置弹窗 + 4 个 Tab | 需要改设置界面的人 |
| 10 | [modules/month-view-modal.md](./modules/month-view-modal.md) | `month-view-modal.js` — 内联月视图弹窗 | 需要改月历视图的人 |
| 11 | [modules/app.md](./modules/app.md) | `app.js` — 主协调器（装配 + facade） | 想了解装配流程的人 |
| 12 | [modules/month-view.md](./modules/month-view.md) | `month-view.js/html/css` — 独立周视图窗口 | 需要改独立窗口的人 |
| 13 | [electron/main.md](./electron/main.md) | `main.js` — Electron 主进程 | 需要改窗口/托盘的人 |
| 14 | [electron/preload.md](./electron/preload.md) | `preload.js` — contextBridge 桥 | 需要扩展渲染端 API 的人 |
| 15 | [electron/desktop-embed.md](./electron/desktop-embed.md) | `native/desktop-embed.js` — Win32 调用 | 需要改桌面嵌入的人 |
| 16 | [electron/ipc.md](./electron/ipc.md) | 主↔渲染 IPC 协议表 | 需要新增 IPC 通道的人 |
| 17 | [styles.md](./styles.md) | CSS 变量、主题、玻璃态 | 需要改样式/主题的人 |

## 二、模块地图

```
┌──────────────────────────────────────────────────────────┐
│  Electron 主进程 (main.js)                                │
│  ├─ createWindow()   主透明无边框窗口                      │
│  ├─ createTray()     系统托盘                              │
│  └─ ipcMain.on(...)  IPC 接收                             │
│                                                          │
│  原生模块 (native/desktop-embed.js)                        │
│  └─ koffi → user32.dll → 嵌入 WorkerW                     │
│                                                          │
│  preload.js                                               │
│  └─ contextBridge.exposeInMainWorld('electronAPI', ...)  │
└──────────────────────────────────────────────────────────┘
                          │ IPC
                          ▼
┌──────────────────────────────────────────────────────────┐
│  渲染进程：主窗口 (src/index.html)                        │
│                                                          │
│  utils/                                                  │
│  ├─ date-utils.js     YYYY-MM-DD 工具                     │
│  └─ dom-utils.js      HTML 转义 / ID / 颜色               │
│                                                          │
│  数据 + 业务                                             │
│  ├─ storage.js        localStorage 封装                   │
│  ├─ todo.js           待办 CRUD + 周期任务                │
│  └─ pomodoro.js       番茄钟状态机                        │
│                                                          │
│  视图                                                     │
│  ├─ notifications.js  系统通知 + 窗口闪烁                 │
│  ├─ appearance.js     主题/不透明度/位置                  │
│  ├─ settings-modal.js 设置弹窗 4 Tab                      │
│  └─ month-view-modal.js  内联月视图                       │
│                                                          │
│  装配                                                     │
│  └─ app.js            init + Tab 切换 + 统计 + facade    │
│                                                          │
│  渲染进程：月视图窗口 (src/month-view.html)               │
│  ├─ utils/  + storage.js + todo.js                        │
│  └─ month-view.js     7 天列 + 任务列表                   │
└──────────────────────────────────────────────────────────┘
```

## 三、文件总览

| 文件 | 行数 | 模块 | 说明 |
|------|------|------|------|
| `main.js` | 305 | Electron 主进程 | 窗口/托盘/IPC |
| `preload.js` | 46 | Electron 预加载 | 暴露 `window.electronAPI` |
| `native/desktop-embed.js` | 341 | Win32 桥 | 通过 koffi 调 user32.dll |
| `src/index.html` | 366 | 主界面 | 标题栏、Tab、番茄钟/待办/统计面板、设置弹窗 |
| `src/month-view.html` | 43 | 月视图 | 7 天网格骨架 |
| `src/styles/main.css` | ~1566 | 样式 | CSS 变量 + 玻璃态 + 5 套主题 |
| `src/styles/month-view.css` | 245 | 月视图样式 | 列布局、任务卡 |
| `src/js/utils/date-utils.js` | 89 | 工具 | YYYY-MM-DD 工具 |
| `src/js/utils/dom-utils.js` | 67 | 工具 | HTML 转义 / ID / 颜色 |
| `src/js/storage.js` | 358 | 数据 | localStorage 封装 + 默认值 |
| `src/js/todo.js` | 769 | 待办 | CRUD、周期、双击编辑、跨窗口广播 |
| `src/js/pomodoro.js` | 391 | 计时器 | 状态机 + 进度环 + 自动切换 |
| `src/js/notifications.js` | 53 | 通知 | 系统通知 + 窗口边缘闪烁 |
| `src/js/appearance.js` | 211 | 外观 | 主题、不透明度、模糊、位置、置顶、点击穿透 |
| `src/js/settings-modal.js` | 256 | 设置弹窗 | 4 Tab：每日待办 / 已完成 / 快速添加 / 外观 |
| `src/js/month-view-modal.js` | 232 | 内联月视图 | 日历网格 + 选中详情 |
| `src/js/app.js` | 153 | 协调器 | 装配模块、Tab 切换、统计、Esc 处理 |
| `src/js/month-view.js` | 226 | 月视图 | 周导航、内联编辑、跨窗口同步 |

## 四、技术栈

- **运行时**：Electron 33（Node 20+）
- **原生调用**：koffi 2.x（`user32.dll`）
- **图像处理**：sharp、pngjs（图标生成）
- **持久化**：浏览器 `localStorage` + `BroadcastChannel` 跨窗口同步
- **样式**：原生 CSS（CSS 变量驱动主题）
- **前端框架**：无（vanilla JS + IIFE 模块）
