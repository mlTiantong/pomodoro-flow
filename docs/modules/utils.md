# 工具模块：`src/js/utils/`

> **职责**：把跨模块重复的纯函数统一抽出来，避免在 4+ 个文件里复制粘贴同一份实现。

---

## 一、模块总览

| 文件 | 暴露符号 | 行数 | 内容 |
|------|---------|------|------|
| `date-utils.js` | `DateUtils` | 89 | YYYY-MM-DD 日期加减、格式化、显示 |
| `dom-utils.js`  | `DomUtils`  | 67 | HTML 转义、颜色调整、ID 生成、JSON 容错 |

这两个模块在 `src/index.html` 和 `src/month-view.html` 中都是最先加载的，其他模块依赖它们。

---

## 二、`DateUtils` — 日期工具

```js
DateUtils.getTodayString()       // '2026-05-30' 本地时间今天
DateUtils.formatDate(date)       // Date → 'YYYY-MM-DD'（本地）
DateUtils.shiftDate('2026-05-30', 1)  // → '2026-05-31'（+1 天）
DateUtils.getWeekStart(date)     // 找该日期所在周的周一
DateUtils.formatDisplayDate('2026-05-30')  // '2026-05-30 (今天)' 或 '2026-05-30 (周六)'
DateUtils.formatWeekRange(start, end)      // '5月25日 周一 — 5月31日 周日'
DateUtils.WEEKDAY_LABELS_SHORT   // ['日','一','二','三','四','五','六']
DateUtils.WEEKDAY_LABELS_LONG    // ['周日','周一','周二','周三','周四','周五','周六']
```

### 设计要点

1. **本地时间构造**：`new Date(y, m-1, d)` 而非 `new Date('2026-05-30')`，避免 ISO 字符串被解释为 UTC 跨日。
2. **`getWeekStart`**：周一定位 (`day === 0 ? -6 : 1 - day`)，跨周日→周一 6 天回退。
3. **`formatDisplayDate`**：今天显示「(今天)」，其他日期显示「(周X)」，调用方无需判断。

### 之前散落的副本

| 副本 | 原来位置 | 状态 |
|------|---------|------|
| `getTodayString` | `storage.js`、`todo.js`、`app.js`、`month-view.js` | 已统一 |
| `formatDate` | `app.js`、`todo.js` | 已统一 |
| `shiftDate` | `app.js` | 已统一 |
| `formatDisplayDate` | `app.js` | 已统一 |
| `getWeekStart` | `month-view.js` | 已统一 |
| 周标题拼接 | `month-view.js` | 已用 `formatWeekRange` |

---

## 三、`DomUtils` — DOM/通用工具

```js
DomUtils.escapeHtml(text)        // '<' → '&lt;'
DomUtils.escapeAttr(text)        // 用于拼 onclick 属性
DomUtils.adjustColor('#E85D3A', -20)  // 加减亮度，返回 #RRGGBB
DomUtils.generateId()            // 'lx1234abcd'（36 进制时间戳 + 6 位随机）
DomUtils.safeParse(json, fb)     // 容错 JSON.parse，null/失败返 fallback
```

### 设计要点

1. **`escapeHtml`**：用 `div.textContent` 一次性转义所有 HTML 特殊字符。
2. **`adjustColor`**：HSL 空间的最简近似，只调整 RGB 三个通道。在主题切换时用来生成 `--primary-dark`、`--primary-light` 等衍生色。
3. **`generateId`**：36 进制 `Date.now()`（11 字符）+ 6 字符随机串。同源不冲突足够用。
4. **`safeParse`**：`?? fallback` 处理解析出 `null` 的情况。

### 之前散落的副本

| 副本 | 原来位置 | 状态 |
|------|---------|------|
| `escapeHtml` | `app.js`、`todo.js`、`month-view.js`（名为 `esc`） | 已统一 |
| `adjustColor` | `app.js` | 已统一 |
| `generateId` | `storage.js`、`todo.js` | 已统一 |
| `safeParse` | `storage.js` | 已统一 |
| `escapeAttr` | `app.js`（定义但未使用） | 已保留供扩展 |

---

## 四、扩展指南

### 新增日期格式

在 `DateUtils` 加一个导出函数。统一格式在 `formatDate` 内部维护。

### 新增 DOM 工具

1. 判断是否跨模块都用 — 单次使用的工具放本文件即可，不要进 utils
2. 名字以「动宾结构」或「用途明确」为佳
3. 必须保证纯函数（不依赖 DOM 状态）才能进 utils

### 边界条件

- `safeParse(null, fb)` 直接返 `fb`（因为 `JSON.parse(null)` 会报错）
- `adjustColor` 不会自动处理 3 位 hex（`#fff`），需要 caller 自行补全
- `getWeekStart` 返回的是新 `Date` 对象，**不会**修改入参
