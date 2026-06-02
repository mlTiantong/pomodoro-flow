# 🍅 Tomato Clock

> **Windows 11 桌面小组件** — 待办清单 + 番茄钟，嵌入桌面壁纸的半透明毛玻璃工具

![Tomato Clock](docs/screenshot.png)

---

## ✨ 特性

- ✅ **待办清单** — 添加、完成、删除、编辑，支持按日期分配
- 🔄 **周期任务** — 每天/工作日/每周重复，自动预生成 30 天
- 🍅 **番茄钟** — 25 分钟专注 + 5 分钟休息，环形进度条
- 🗓️ **周视图** — 独立大窗口，7天任务一览无余，内联编辑
- 🪟 **嵌入桌面** — 窗口显示在桌面壁纸上、图标下方
- 🎨 **毛玻璃效果** — 5 套主题、透明度/模糊可调
- 💾 **本地存储** — 所有数据保存在本地，无需联网
- 📊 **每日统计** — 完成番茄数、专注时长、连续天数

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) ≥ 18.x
- Windows 10/11

### 安装与运行

```bash
git clone https://github.com/your-username/tomato-clock.git
cd tomato-clock
npm install
npm start        # 启动
npm run dev      # 开发模式（带 DevTools）
npm run build    # 打包为安装包
```

或者直接双击 **`start.bat`** 一键启动。

## 🎯 使用指南

### 主界面

| 操作 | 说明 |
|------|------|
| **添加任务** | 主界面输入框输入，按 Enter/点 ➕ |
| **完成任务** | 点击任务前的○复选框 |
| **删除任务** | 悬停显示 ✕ 按钮，点击删除 |
| **编辑任务** | 双击任务文字可内联编辑 |
| **开始番茄钟** | 点击 ▶ 按钮开始 25 分钟倒计时 |
| **周期任务删除** | 周期任务显示两个按钮：🗑️删全部 / ✕删单个 |

### 设置弹窗

点击右上角 ⚙️ 打开设置：

| Tab | 功能 |
|-----|------|
| 📅 **每日待办** | 选择日期 ◀▶，管理该日任务 |
| ✅ **已完成** | 按日期分组查看已完成任务 |
| ⚡ **快速添加** | 选择日期 + 重复周期，一键添加 |
| 🎨 **外观** | 主题、透明度、模糊、位置、置顶等 |

### 周视图

点击设置弹窗右上角 📅 图标打开独立周视图窗口：

- 显示连续 7 天，每列完整显示任务
- 4 个导航按钮：⏪ ◀ ▶ ⏩（按天/按周滑动）
- 点击「＋添加任务」展开内联输入框
- 数据与主窗口实时同步

## 🏗️ 项目结构

```
tomato-clock/
├── main.js                 # Electron 主进程
├── preload.js              # 安全 IPC 桥梁
├── package.json            # 项目配置
├── start.bat               # 一键启动
├── src/
│   ├── index.html          # 主界面
│   ├── month-view.html     # 周视图窗口
│   ├── styles/
│   │   ├── main.css        # 主界面样式
│   │   └── month-view.css  # 周视图样式
│   └── js/
│       ├── app.js                  # 协调器：init + Tab + 统计 + facade（153 行）
│       ├── settings-modal.js       # 设置弹窗（4 Tab）
│       ├── month-view-modal.js     # 主窗口内联月视图
│       ├── appearance.js           # 主题/不透明度/位置
│       ├── notifications.js        # 系统通知 + 窗口闪烁
│       ├── todo.js                 # 待办模块 + 周期引擎
│       ├── pomodoro.js             # 番茄钟
│       ├── storage.js              # 数据存储
│       ├── month-view.js           # 独立窗口周视图
│       └── utils/
│           ├── date-utils.js       # YYYY-MM-DD 工具
│           └── dom-utils.js        # HTML 转义/ID/颜色
├── native/
│   └── desktop-embed.js    # Windows 桌面嵌入
└── docs/
    ├── ARCHITECTURE.md     # 架构文档
    ├── data-model.md       # 数据模型
    ├── styles.md           # 样式文档
    ├── README.md           # 文档索引
    ├── TASK.md             # 任务清单
    ├── electron/           # 主进程相关
    └── modules/            # 渲染进程各模块
```

## 🛠️ 技术栈

| 技术 | 用途 |
|------|------|
| [Electron](https://www.electronjs.org/) | 桌面应用框架 |
| [koffi](https://github.com/Koromix/koffi) | Node.js FFI，调用 Win32 API |
| Vanilla JS + CSS3 | 前端 UI（轻量无框架） |
| CSS Glassmorphism | 毛玻璃半透明效果 |
| BroadcastChannel API | 跨窗口实时同步 |
| Windows API | 桌面嵌入 (WorkerW) |
| electron-builder | 打包为 Windows 安装包 |

## ⚖️ 许可证

[MIT](LICENSE)

---

> 灵感来源于 Pomodoro Technique® (Francesco Cirillo)
