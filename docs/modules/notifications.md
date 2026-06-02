# 模块：`src/js/notifications.js`

> **职责**：「番茄完成/休息结束」等场景下的双通道提示：系统通知（已授权时）+ 窗口边缘闪烁。

---

## 一、模块总览

| 属性 | 值 |
|------|-----|
| 暴露符号 | `const Notifications` (object) |
| IIFE 包裹 | 是 |
| 依赖 | 无（仅 DOM + Notification API） |
| 被谁依赖 | `app.js` |
| 行数 | 53 |

---

## 二、模块结构

```
Notifications (IIFE)
├─ 内部状态: appEl（.glass-container 元素引用）
├─ init()                     ← DOMContentLoaded 后由 App.init 调用
├─ show(title, body)          ← 主入口：系统通知 + 窗口闪烁
├─ showSystemNotification()   ← 私有：调 new Notification()
└─ flashWindow(title)         ← 私有：box-shadow 1.5s 红色/蓝色光晕
```

---

## 三、API

### `init()`

绑定到 `id="app"` 的元素（`.glass-container`）。必须在 DOMContentLoaded 之后调用。

### `show(title, body)`

主入口。会并行触发两个提示：

```js
Notifications.show('🍅 专注完成！', '太棒了！休息一下吧~');
Notifications.show('☕ 休息结束',   '准备好开始下一轮专注了吗？');
```

#### 通道 1：系统通知

```js
if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '🍅' });
} else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(...);
}
```

- 已授权 → 立刻发
- 未决定 → 询问授权，授权后再发
- 已拒绝 → 静默不提示

#### 通道 2：窗口闪烁

```js
appEl.style.boxShadow = `0 0 30px ${glowColor}, 0 8px 32px rgba(0,0,0,0.25)`;
setTimeout(() => { appEl.style.boxShadow = originalShadow; }, 1500);
```

- 标题含「专注」→ 红色 `rgba(232,93,58,0.4)` 光晕
- 标题含「休息」/其他 → 蓝色 `rgba(74,144,217,0.4)` 光晕
- 1.5s 后还原原始 `box-shadow`

---

## 四、与 app.js 的协作

`app.js` 的 `Pomodoro.init({ onComplete })` 回调里调：

```js
Pomodoro.init({
    onComplete: (type) => {
        updateStats();
        if (type === 'focus') {
            Notifications.show('🍅 专注完成！', '...');
        } else {
            Notifications.show('☕ 休息结束', '...');
        }
    }
});
```

---

## 五、扩展指南

### 改光晕颜色

`flashWindow()` 里的 `glowColor` 改成 `getComputedStyle(document.documentElement).getPropertyValue('--primary-glow')` 即可跟随主题。

### 加声音

```js
function show(title, body) {
    showSystemNotification(title, body);
    flashWindow(title);
    playSound();
}

function playSound() {
    const audio = new Audio('data:audio/wav;base64,...');
    audio.volume = Storage.loadSettings().volume;
    audio.play();
}
```

### 关掉某通道

如果用户不需要闪烁，可以把 `flashWindow` 注释掉，仅保留系统通知。
