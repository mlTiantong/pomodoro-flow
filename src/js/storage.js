/**
 * storage.js — 数据持久化模块
 *
 * 使用 localStorage 存储待办清单、番茄钟记录和统计数据。
 * 所有数据以 JSON 格式序列化。
 *
 * 数据结构:
 *   todos:    TodoItem[]
 *   pomodoros: PomodoroSession[]
 *   stats:    { [date: string]: DailyStats }
 *   settings: Settings
 */

// ============================================================
// 存储键名
// ============================================================

const STORAGE_KEYS = {
    TODOS: 'tomato_clock_todos',
    POMODOROS: 'tomato_clock_pomodoros',
    STATS: 'tomato_clock_stats',
    SETTINGS: 'tomato_clock_settings',
    COMPLETED_TASKS: 'tomato_clock_completed', // 已完成任务归档
    FOCUS_ACTIVITY: 'tomato_clock_focus_activity',
    KEYBOARD_GARDEN: 'tomato_clock_keyboard_garden',
    AI_CONFIG: 'tomato_clock_ai_config'
};

// ============================================================
// 默认值
// ============================================================

const DEFAULT_SETTINGS = {
    focusDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    autoStartBreak: true,
    autoStartFocus: true,
    volume: 0.5
};

// ============================================================
// 默认外观设置
// ============================================================

const DEFAULT_APPEARANCE = {
    theme: 'tomato',          // 'tomato'|'ocean'|'forest'|'purple'|'dark'
    glassBlur: 24,
    backgroundOpacity: 0.55,
    windowWidth: 340,
    windowHeight: 500,
    positionPreset: 'bottom-right', // 'top-left'|'top-right'|'bottom-left'|'bottom-right'|'custom'
    positionX: null,
    positionY: null,
    clickThrough: false,
    alwaysOnTop: false,
    embedDesktop: true
};

const DEFAULT_DAILY_STATS = {
    totalPomodoros: 0,
    totalFocusMinutes: 0,
    tasksCompleted: 0,
    sessionsCompleted: 0,
    keystrokes: 0,
    clicks: 0,
    focusActiveSeconds: 0,
    bestFocusScore: 0,
    lastSessionScore: 0,
    lastSessionKeystrokes: 0,
    lastSessionClicks: 0,
    lastSessionActiveSeconds: 0,
    lastSessionEndedAt: null,
    focusSecondsByHour: Array(24).fill(0)
};

const DEFAULT_GARDEN_STATE = {
    coins: 0,
    totalHarvests: 0,
    totalKeystrokes: 0,
    level: 1,
    lastHarvestAt: null,
    keys: {}
};

const DEFAULT_KEY_STATE = {
    growth: 0,
    harvests: 0,
    presses: 0,
    stage: 0,
    lastPressedAt: null
};

// AI 助手配置（OpenAI 兼容格式）
// 安全说明：
//   - apiKey 明文存 localStorage（个人单机工具，不引入 native keyring 依赖）
//   - enabled 默认 false，需用户在设置中显式启用
//   - apiKey 不进 console.log / BroadcastChannel / 任何持久化日志
const DEFAULT_AI_CONFIG = {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    enabled: false
};

// ============================================================
// 工具函数（已抽到 utils/dom-utils.js、utils/date-utils.js）
// ============================================================

const getTodayString = () => DateUtils.getTodayString();
const generateId     = () => DomUtils.generateId();
const safeParse      = (json, fb) => DomUtils.safeParse(json, fb);

function normalizeDailyStats(stats = {}, date = getTodayString()) {
    const normalized = {
        ...DEFAULT_DAILY_STATS,
        ...stats,
        date: stats.date || date
    };

    normalized.totalPomodoros = Number(normalized.totalPomodoros) || 0;
    normalized.totalFocusMinutes = Number(normalized.totalFocusMinutes) || 0;
    normalized.tasksCompleted = Number(normalized.tasksCompleted) || 0;
    normalized.sessionsCompleted = Number(normalized.sessionsCompleted) || normalized.totalPomodoros || 0;
    normalized.keystrokes = Number(normalized.keystrokes) || 0;
    normalized.clicks = Number(normalized.clicks) || 0;
    normalized.focusActiveSeconds = Number(normalized.focusActiveSeconds) || 0;
    normalized.bestFocusScore = Number(normalized.bestFocusScore) || 0;
    normalized.lastSessionScore = Number(normalized.lastSessionScore) || 0;
    normalized.lastSessionKeystrokes = Number(normalized.lastSessionKeystrokes) || 0;
    normalized.lastSessionClicks = Number(normalized.lastSessionClicks) || 0;
    normalized.lastSessionActiveSeconds = Number(normalized.lastSessionActiveSeconds) || 0;
    normalized.focusSecondsByHour = normalizeHourlyStats(normalized.focusSecondsByHour);

    return normalized;
}

function normalizeHourlyStats(hours) {
    const result = Array(24).fill(0);
    if (!Array.isArray(hours)) return result;
    for (let i = 0; i < 24; i++) {
        result[i] = Math.max(0, Number(hours[i]) || 0);
    }
    return result;
}

// ============================================================
// 待办清单存储
// ============================================================

const Storage = {
    /**
     * 获取所有待办事项
     * @returns {Array} 待办数组
     */
    loadTodos() {
        const raw = localStorage.getItem(STORAGE_KEYS.TODOS);
        return safeParse(raw, []);
    },

    /**
     * 保存待办事项
     * @param {Array} todos
     */
    saveTodos(todos) {
        localStorage.setItem(STORAGE_KEYS.TODOS, JSON.stringify(todos));
    },

    /**
     * 按日期加载待办（未完成的 + 该日期完成的）
     * @param {string} date - YYYY-MM-DD
     * @returns {Array}
     */
    loadTodosByDate(date) {
        const todos = this.loadTodos();
        return todos.filter(t => {
            // 指定日期未完成的任务
            if (!t.completed) return t.date === date;
            // 该日期完成的任务
            return t.completedDate === date;
        });
    },

    /**
     * 加载指定日期的未完成任务
     * @param {string} date - YYYY-MM-DD
     * @returns {Array}
     */
    loadActiveTodosByDate(date) {
        const todos = this.loadTodos();
        return todos.filter(t => !t.completed && t.date === date);
    },

    /**
     * 加载所有已完成任务，按日期分组
     * @returns {Object} { '2026-05-24': [...], '2026-05-23': [...] }
     */
    loadCompletedTodosGrouped() {
        const todos = this.loadTodos();
        const completed = todos.filter(t => t.completed && t.completedDate);
        const grouped = {};
        // 按 completedDate 排序（最新的在前）
        completed.sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
        for (const t of completed) {
            const date = t.completedDate;
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(t);
        }
        return grouped;
    },

    /**
     * 获取所有出现过任务的日期列表（用于日历标记）
     * @returns {string[]} sorted date strings
     */
    getAllTaskDates() {
        const todos = this.loadTodos();
        const dates = new Set();
        for (const t of todos) {
            if (t.date) dates.add(t.date);
            if (t.completedDate) dates.add(t.completedDate);
        }
        return [...dates].sort();
    },

    // ============================================================
    // 番茄钟会话存储
    // ============================================================

    /**
     * 获取所有番茄钟记录
     * @returns {Array}
     */
    loadPomodoros() {
        const raw = localStorage.getItem(STORAGE_KEYS.POMODOROS);
        return safeParse(raw, []);
    },

    /**
     * 保存番茄钟记录
     * @param {Array} pomodoros
     */
    savePomodoros(pomodoros) {
        localStorage.setItem(STORAGE_KEYS.POMODOROS, JSON.stringify(pomodoros));
    },

    /**
     * 添加一条番茄钟记录
     * @param {Object} session - { type, startTime, endTime, completed, taskId }
     */
    addPomodoro(session) {
        const pomodoros = this.loadPomodoros();
        pomodoros.push({
            id: generateId(),
            ...session,
            createdAt: new Date().toISOString()
        });
        this.savePomodoros(pomodoros);
        return pomodoros;
    },

    // ============================================================
    // 统计存储
    // ============================================================

    /**
     * 获取今日统计数据
     * @returns {Object}
     */
    loadTodayStats() {
        const raw = localStorage.getItem(STORAGE_KEYS.STATS);
        const allStats = safeParse(raw, {});
        const today = getTodayString();

        if (!allStats[today]) {
            allStats[today] = normalizeDailyStats({ date: today }, today);
        }
        return normalizeDailyStats(allStats[today], today);
    },

    /**
     * 保存今日统计
     * @param {Object} todayStats
     */
    saveTodayStats(todayStats) {
        const raw = localStorage.getItem(STORAGE_KEYS.STATS);
        const allStats = safeParse(raw, {});
        allStats[todayStats.date] = normalizeDailyStats(todayStats, todayStats.date);
        localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(allStats));
    },

    /**
     * 更新今日统计（原子操作）
     * @param {Function} updater - (stats) => updatedStats
     */
    updateTodayStats(updater) {
        const stats = this.loadTodayStats();
        const updated = normalizeDailyStats(updater(stats), stats.date);
        this.saveTodayStats(updated);
        return updated;
    },

    /**
     * 获取所有历史统计
     * @returns {Object}
     */
    loadAllStats() {
        const raw = localStorage.getItem(STORAGE_KEYS.STATS);
        const allStats = safeParse(raw, {});
        for (const date of Object.keys(allStats)) {
            allStats[date] = normalizeDailyStats(allStats[date], date);
        }
        return allStats;
    },

    /**
     * 计算连续天数
     * @returns {number}
     */
    calculateStreak() {
        const allStats = this.loadAllStats();
        const dates = Object.keys(allStats).sort().reverse();

        let streak = 0;
        const today = getTodayString();

        // 从昨天开始检查连续天数（今天也算）
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() + 1); // 从明天开始倒推

        for (let i = 0; i < 365; i++) {
            checkDate.setDate(checkDate.getDate() - 1);
            const dateStr = checkDate.toISOString().split('T')[0];

            const stats = allStats[dateStr];
            if (stats && stats.totalPomodoros > 0) {
                streak++;
            } else if (dateStr !== today) {
                // 今天还没完成番茄没关系，但昨天没有就断了
                break;
            }
        }

        return streak;
    },

    // ============================================================
    // 设置存储
    // ============================================================

    /**
     * 加载设置
     * @returns {Object}
     */
    loadSettings() {
        const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return { ...DEFAULT_SETTINGS, ...safeParse(raw, {}) };
    },

    /**
     * 保存设置
     * @param {Object} settings
     */
    saveSettings(settings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    },

    // ============================================================
    // 数据导出/导入
    // ============================================================

    /**
     * 导出全部数据
     * @returns {string} JSON 字符串
     */
    exportAll() {
        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            todos: this.loadTodos(),
            pomodoros: this.loadPomodoros(),
            stats: this.loadAllStats(),
            settings: this.loadSettings()
        };
        return JSON.stringify(data, null, 2);
    },

    /**
     * 导入数据
     * @param {string} json - 导出的 JSON 字符串
     * @returns {boolean} 是否成功
     */
    importAll(json) {
        try {
            const data = JSON.parse(json);
            if (!data.version) return false;

            if (data.todos) this.saveTodos(data.todos);
            if (data.pomodoros) this.savePomodoros(data.pomodoros);
            if (data.stats) localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(data.stats));
            if (data.settings) this.saveSettings(data.settings);

            return true;
        } catch {
            return false;
        }
    },

    /**
     * 清除所有数据
     */
    clearAll() {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    },

    // ============================================================
    // 外观设置
    // ============================================================

    /**
     * 加载外观设置
     * @returns {Object}
     */
    loadAppearance() {
        const raw = localStorage.getItem('tomato_clock_appearance');
        return { ...DEFAULT_APPEARANCE, ...safeParse(raw, {}) };
    },

    /**
     * 保存外观设置
     * @param {Object} appearance
     */
    saveAppearance(appearance) {
        localStorage.setItem('tomato_clock_appearance', JSON.stringify(appearance));
    },

    // ============================================================
    // 专注输入活动（跨窗口）
    // ============================================================

    loadFocusActivity() {
        const raw = localStorage.getItem(STORAGE_KEYS.FOCUS_ACTIVITY);
        const data = safeParse(raw, {});
        return {
            active: !!data.active,
            sessionId: data.sessionId || null,
            startedAt: data.startedAt || null,
            updatedAt: data.updatedAt || null,
            keystrokes: Number(data.keystrokes) || 0,
            clicks: Number(data.clicks) || 0,
            activeSeconds: Number(data.activeSeconds) || 0,
            lastInputAt: Number(data.lastInputAt) || 0,
            secondsByHour: normalizeHourlyStats(data.secondsByHour)
        };
    },

    saveFocusActivity(activity) {
        const normalized = {
            ...this.loadFocusActivity(),
            ...activity,
            secondsByHour: normalizeHourlyStats(activity.secondsByHour),
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEYS.FOCUS_ACTIVITY, JSON.stringify(normalized));
        return normalized;
    },

    resetFocusActivity(sessionId) {
        const activity = {
            active: true,
            sessionId,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            keystrokes: 0,
            clicks: 0,
            activeSeconds: 0,
            lastInputAt: 0,
            secondsByHour: Array(24).fill(0)
        };
        localStorage.setItem(STORAGE_KEYS.FOCUS_ACTIVITY, JSON.stringify(activity));
        return activity;
    },

    stopFocusActivity() {
        const activity = this.loadFocusActivity();
        activity.active = false;
        activity.updatedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEYS.FOCUS_ACTIVITY, JSON.stringify(activity));
        return activity;
    },

    // ============================================================
    // 键盘花园
    // ============================================================

    loadKeyboardGarden() {
        const raw = localStorage.getItem(STORAGE_KEYS.KEYBOARD_GARDEN);
        const data = { ...DEFAULT_GARDEN_STATE, ...safeParse(raw, {}) };
        data.coins = Number(data.coins) || 0;
        data.totalHarvests = Number(data.totalHarvests) || 0;
        data.totalKeystrokes = Number(data.totalKeystrokes) || 0;
        data.level = Math.max(1, Number(data.level) || 1);
        data.keys = normalizeGardenKeys(data.keys);
        return data;
    },

    saveKeyboardGarden(garden) {
        const normalized = {
            ...DEFAULT_GARDEN_STATE,
            ...garden,
            keys: normalizeGardenKeys(garden.keys)
        };
        normalized.level = Math.max(1, Math.floor((normalized.totalHarvests || 0) / 12) + 1);
        localStorage.setItem(STORAGE_KEYS.KEYBOARD_GARDEN, JSON.stringify(normalized));
        return normalized;
    },

    // ============================================================
    // AI 助手配置
    // ============================================================

    /**
     * 加载 AI 助手配置（OpenAI 兼容格式）
     * @returns {Object} { baseUrl, apiKey, model, enabled }
     */
    loadAIConfig() {
        const raw = localStorage.getItem(STORAGE_KEYS.AI_CONFIG);
        return { ...DEFAULT_AI_CONFIG, ...safeParse(raw, {}) };
    },

    /**
     * 保存 AI 助手配置
     * @param {Object} config
     */
    saveAIConfig(config) {
        const normalized = {
            baseUrl: String(config.baseUrl || DEFAULT_AI_CONFIG.baseUrl).trim(),
            apiKey: String(config.apiKey || '').trim(),
            model: String(config.model || DEFAULT_AI_CONFIG.model).trim(),
            enabled: !!config.enabled
        };
        localStorage.setItem(STORAGE_KEYS.AI_CONFIG, JSON.stringify(normalized));
        return normalized;
    }
};

function normalizeGardenKeys(keys = {}) {
    const normalized = {};
    for (const [key, value] of Object.entries(keys || {})) {
        normalized[key] = {
            ...DEFAULT_KEY_STATE,
            ...value,
            growth: Number(value.growth) || 0,
            harvests: Number(value.harvests) || 0,
            presses: Number(value.presses) || 0,
            stage: Number(value.stage) || 0,
            lastPressedAt: value.lastPressedAt || null
        };
    }
    return normalized;
}
