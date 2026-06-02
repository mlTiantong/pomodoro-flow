/**
 * ai-tools.js — AI 助手的工具集
 *
 * 权限：
 *   - 4 个只读工具（list_todos / list_completed / get_today_stats / get_pomodoro_settings）
 *   - 8 个写工具（add_todo / toggle_todo / edit_todo / delete_todo / delete_completed /
 *                start_pomodoro / stop_pomodoro / update_pomodoro_settings）
 *   - 所有写工具**必须经用户 confirm** 才能执行（在 ai-chat.js 里通过 confirmAIAction 拦截）
 *
 * 跨窗口执行：
 *   - todo 写操作：AI 窗口直接调 Todo.xxx() → 写 localStorage → 主窗口 storage 事件自动同步
 *   - pomodoro 写操作：通过 BroadcastChannel 'tomato-commands' 发指令 → 主窗口接收后执行
 *
 * 工具结果：返回 JSON.stringify(result)，符合 OpenAI tool result content 规范。
 */

const AITools = (() => {
    'use strict';

    const COMMANDS_CHANNEL = 'tomato-commands';

    // ============================================================
    // 工具定义（OpenAI function calling 格式）
    // ============================================================

    const TOOL_DEFINITIONS = [
        // ---- 只读 ----
        {
            type: 'function',
            function: {
                name: 'list_todos',
                description: '查询某一日的未完成任务列表。不传 date 则查今日。',
                parameters: {
                    type: 'object',
                    properties: {
                        date: { type: 'string', description: 'YYYY-MM-DD 格式，可选' }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'list_completed',
                description: '查询已完成任务（按日期分组）。不传 date 则返回最近 30 天。',
                parameters: {
                    type: 'object',
                    properties: {
                        date: { type: 'string', description: 'YYYY-MM-DD 格式，可选' },
                        days: { type: 'number', description: '查询最近 N 天（默认 30）' }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_today_stats',
                description: '获取今日统计数据：番茄数、专注分钟、完成任务数、连续天数。',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_pomodoro_settings',
                description: '获取番茄钟设置：专注时长、休息时长等。',
                parameters: { type: 'object', properties: {} }
            }
        },

        // ---- 写：todo ----
        {
            type: 'function',
            function: {
                name: 'add_todo',
                description: '添加一个新任务。',
                parameters: {
                    type: 'object',
                    properties: {
                        text: { type: 'string', description: '任务内容（必填）' },
                        date: { type: 'string', description: 'YYYY-MM-DD 格式日期，可选，默认今天' },
                        recurring: {
                            type: 'string',
                            enum: ['none', 'daily', 'weekdays', 'weekly'],
                            description: '重复周期，可选'
                        }
                    },
                    required: ['text']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'toggle_todo',
                description: '勾选/取消完成一个任务。可以通过 id 或 text 定位。',
                parameters: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: '任务 ID（推荐）' },
                        text: { type: 'string', description: '任务文字（模糊匹配，仅在无 id 时使用）' }
                    }
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'edit_todo',
                description: '修改一个任务的文字。',
                parameters: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: '任务 ID' },
                        text: { type: 'string', description: '新的任务文字' }
                    },
                    required: ['id', 'text']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'delete_todo',
                description: '删除一个任务。**高危操作** — 删除后不可恢复。',
                parameters: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: '任务 ID' }
                    },
                    required: ['id']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'delete_completed',
                description: '清除某日所有已完成任务。**高危操作**。',
                parameters: {
                    type: 'object',
                    properties: {
                        date: { type: 'string', description: 'YYYY-MM-DD 格式日期' }
                    },
                    required: ['date']
                }
            }
        },

        // ---- 写：pomodoro ----
        {
            type: 'function',
            function: {
                name: 'start_pomodoro',
                description: '开始一个番茄钟（专注）。主窗口的 Pomodoro 会启动。',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'stop_pomodoro',
                description: '停止当前番茄钟（重置）。主窗口的 Pomodoro 会停止。',
                parameters: { type: 'object', properties: {} }
            }
        },
        {
            type: 'function',
            function: {
                name: 'update_pomodoro_settings',
                description: '修改番茄钟设置（专注/休息时长）。只在 Pomodoro IDLE 时生效。',
                parameters: {
                    type: 'object',
                    properties: {
                        focusDuration: { type: 'number', description: '专注时长（分钟，1-120）' },
                        breakDuration: { type: 'number', description: '休息时长（分钟，1-60）' }
                    }
                }
            }
        }
    ];

    // ============================================================
    // 工具分类
    // ============================================================

    const READ_TOOLS = new Set([
        'list_todos', 'list_completed', 'get_today_stats', 'get_pomodoro_settings'
    ]);

    const WRITE_TOOLS = new Set([
        'add_todo', 'toggle_todo', 'edit_todo', 'delete_todo', 'delete_completed',
        'start_pomodoro', 'stop_pomodoro', 'update_pomodoro_settings'
    ]);

    const DANGEROUS_TOOLS = new Set([
        'delete_todo', 'delete_completed'
    ]);

    // ============================================================
    // Helpers
    // ============================================================

    /**
     * 通过 BroadcastChannel 通知主窗口执行 UI 操作
     */
    function sendCommand(type) {
        try {
            const bc = new BroadcastChannel(COMMANDS_CHANNEL);
            bc.postMessage({ type });
            bc.close();
        } catch (e) {
            return { error: e.message };
        }
        return { ok: true };
    }

    /**
     * 通过 ID 或文字模糊匹配定位 todo
     */
    function findTodo(identifier) {
        const all = Storage.loadTodos();
        if (identifier.id) {
            return all.find(t => t.id === identifier.id);
        }
        if (identifier.text) {
            const text = String(identifier.text).trim().toLowerCase();
            return all.find(t => !t.completed && t.text.toLowerCase().includes(text));
        }
        return null;
    }

    /**
     * 生成 todo ID（与 DomUtils.generateId 一致）
     */
    function makeId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    }

    /**
     * 周期类型在指定日期是否应该有任务
     * 复制自 todo.js shouldHaveTaskOnDate（私有，无法跨模块复用）
     */
    function shouldHaveTaskOnDate(recurring, dateStr, firstWeekday) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const dayOfWeek = date.getDay();
        switch (recurring) {
            case 'daily':    return true;
            case 'weekdays': return dayOfWeek >= 1 && dayOfWeek <= 5;
            case 'weekly':   return dayOfWeek === firstWeekday;
            default:         return false;
        }
    }

    /**
     * 周期任务完成后，安排下一个周期的任务
     * 复制自 todo.js scheduleNextRecurring（私有，无法跨模块复用）
     * @returns {Object|null} 新任务对象（不存 storage，由调用者存）
     */
    function scheduleNextRecurring(completedTodo) {
        const [y, m, d] = completedTodo.date.split('-').map(Number);
        const baseDate = new Date(y, m - 1, d);
        let nextDate = null;

        switch (completedTodo.recurring) {
            case 'daily': {
                nextDate = new Date(baseDate);
                nextDate.setDate(nextDate.getDate() + 1);
                break;
            }
            case 'weekly': {
                nextDate = new Date(baseDate);
                nextDate.setDate(nextDate.getDate() + 7);
                break;
            }
            case 'weekdays': {
                nextDate = new Date(baseDate);
                do {
                    nextDate.setDate(nextDate.getDate() + 1);
                } while (nextDate.getDay() === 0 || nextDate.getDay() === 6);
                break;
            }
            default:
                return null;
        }

        const dateStr = DateUtils.formatDate(nextDate);

        // 检查该日期是否已有相同的未完成任务（基于最新 storage）
        const all = Storage.loadTodos();
        const exists = all.some(t =>
            !t.completed &&
            t.text === completedTodo.text &&
            t.recurring === completedTodo.recurring &&
            t.date === dateStr
        );
        if (exists) return null;

        return {
            id: makeId(),
            text: completedTodo.text,
            completed: false,
            date: dateStr,
            recurring: completedTodo.recurring,
            createdAt: new Date().toISOString(),
            completedAt: null,
            completedDate: null,
            pomodoroCount: 0,
            order: all.length
        };
    }

    /**
     * 广播 todos 变更（触发主窗口同步）
     * 走专用 channel 'tomato-todos'，与 Todo.broadcastChange 保持一致
     */
    function broadcastTodosChanged() {
        try {
            const bc = new BroadcastChannel('tomato-todos');
            bc.postMessage('changed');
            bc.close();
        } catch (e) { /* 忽略 */ }
    }

    // ============================================================
    // Handlers（同步或 async 都行，统一 async 包装）
    // ============================================================

    const HANDLERS = {
        // ---- 只读 ----
        list_todos: ({ date } = {}) => {
            const target = date || DateUtils.getTodayString();
            const all = Storage.loadTodos();
            const todos = all
                .filter(t => !t.completed && t.date === target)
                .map(t => ({
                    id: t.id, text: t.text,
                    recurring: t.recurring || 'none',
                    pomodoroCount: t.pomodoroCount || 0
                }));
            return { date: target, count: todos.length, tasks: todos };
        },

        list_completed: ({ date, days = 30 } = {}) => {
            const all = Storage.loadTodos();
            const completed = all.filter(t => t.completed && t.completedDate);
            let filtered = completed;
            if (date) {
                filtered = completed.filter(t => t.completedDate === date);
            } else {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - days);
                const cutoffStr = DateUtils.formatDate(cutoff);
                filtered = completed.filter(t => t.completedDate >= cutoffStr);
            }
            const grouped = {};
            for (const t of filtered) {
                const d = t.completedDate;
                if (!grouped[d]) grouped[d] = [];
                grouped[d].push({ id: t.id, text: t.text });
            }
            const sortedDates = Object.keys(grouped).sort().reverse();
            return {
                date: date || `last ${days} days`,
                totalCount: filtered.length,
                grouped: sortedDates.reduce((acc, d) => { acc[d] = grouped[d]; return acc; }, {})
            };
        },

        get_today_stats: () => {
            const stats = Storage.loadTodayStats();
            const streak = Storage.calculateStreak();
            return {
                date: DateUtils.getTodayString(),
                totalPomodoros: Number(stats.totalPomodoros) || 0,
                totalFocusMinutes: Number(stats.totalFocusMinutes) || 0,
                tasksCompleted: Number(stats.tasksCompleted) || 0,
                streakDays: streak,
                keystrokes: Number(stats.keystrokes) || 0,
                clicks: Number(stats.clicks) || 0,
                bestFocusScore: Number(stats.bestFocusScore) || Number(stats.lastSessionScore) || 0,
                lastSessionEndedAt: stats.lastSessionEndedAt || null
            };
        },

        get_pomodoro_settings: () => {
            const s = Storage.loadSettings();
            return {
                focusDuration: s.focusDuration,
                breakDuration: s.breakDuration,
                longBreakDuration: s.longBreakDuration,
                autoStartBreak: !!s.autoStartBreak,
                autoStartFocus: !!s.autoStartFocus,
                volume: s.volume
            };
        },

        // ---- 写：todo（直接调 Storage + 自己广播，**不依赖** Todo 模块的 in-memory 数组） ----
        // 原因：AI 窗口没调 Todo.init()，Todo 模块的 in-memory todos 是空数组。
        // 如果依赖 Todo.xxx()，写操作会用空数组作为基础，覆盖 storage（丢失旧任务）。
        // 同时防 race condition：自己实现 = 永远从 storage 读最新、写完整数据。
        add_todo: ({ text, date, recurring } = {}) => {
            if (!text || !String(text).trim()) {
                return { error: 'text 不能为空' };
            }
            const all = Storage.loadTodos();
            const target = date || DateUtils.getTodayString();
            const recur = recurring || 'none';
            const newTodo = {
                id: makeId(),
                text: String(text).trim(),
                completed: false,
                date: target,
                recurring: recur,
                createdAt: new Date().toISOString(),
                completedAt: null,
                completedDate: null,
                pomodoroCount: 0,
                order: all.length
            };
            let updated = [newTodo, ...all];

            // 周期任务：预生成未来 30 天
            if (recur !== 'none') {
                const baseDate = new Date(target);
                const firstWeekday = baseDate.getDay();
                for (let i = 1; i <= 30; i++) {
                    const nextDate = new Date(baseDate);
                    nextDate.setDate(nextDate.getDate() + i);
                    const dateStr = DateUtils.formatDate(nextDate);
                    if (!shouldHaveTaskOnDate(recur, dateStr, firstWeekday)) continue;
                    if (updated.some(t => t.text === newTodo.text && t.recurring === recur && t.date === dateStr)) continue;
                    updated.push({
                        id: makeId(),
                        text: newTodo.text,
                        completed: false,
                        date: dateStr,
                        recurring: recur,
                        createdAt: new Date().toISOString(),
                        completedAt: null,
                        completedDate: null,
                        pomodoroCount: 0,
                        order: updated.length
                    });
                }
            }

            Storage.saveTodos(updated);
            broadcastTodosChanged();
            return { ok: true, id: newTodo.id, text: newTodo.text, date: newTodo.date, addedCount: updated.length - all.length };
        },

        toggle_todo: ({ id, text } = {}) => {
            const all = Storage.loadTodos();
            const idx = all.findIndex(t => {
                if (id) return t.id === id;
                if (text) return !t.completed && t.text.toLowerCase().includes(String(text).trim().toLowerCase());
                return false;
            });
            if (idx === -1) return { error: '找不到任务（id/text 都未匹配）' };

            const todo = all[idx];
            const wasCompleted = !!todo.completed;
            const now = !wasCompleted;
            const today = DateUtils.getTodayString();

            all[idx] = {
                ...todo,
                completed: now,
                completedAt: now ? new Date().toISOString() : null,
                completedDate: now ? today : null
            };

            // 更新统计
            if (now) {
                Storage.updateTodayStats(s => {
                    s.tasksCompleted = (s.tasksCompleted || 0) + 1;
                    return s;
                });
                // 周期任务：自动安排下一周期
                if (todo.recurring && todo.recurring !== 'none') {
                    const next = scheduleNextRecurring(todo);
                    if (next) all.push(next);
                }
            } else {
                Storage.updateTodayStats(s => {
                    s.tasksCompleted = Math.max(0, (s.tasksCompleted || 0) - 1);
                    return s;
                });
            }

            Storage.saveTodos(all);
            broadcastTodosChanged();
            return { ok: true, id: todo.id, text: todo.text, wasCompleted, nowCompleted: now };
        },

        edit_todo: ({ id, text } = {}) => {
            if (!text || !String(text).trim()) return { error: 'text 不能为空' };
            const all = Storage.loadTodos();
            const idx = all.findIndex(t => t.id === id);
            if (idx === -1) return { error: '找不到任务' };
            const oldText = all[idx].text;
            all[idx] = { ...all[idx], text: String(text).trim() };
            Storage.saveTodos(all);
            broadcastTodosChanged();
            return { ok: true, id, oldText, newText: text };
        },

        delete_todo: ({ id } = {}) => {
            const all = Storage.loadTodos();
            const idx = all.findIndex(t => t.id === id);
            if (idx === -1) return { error: '找不到任务' };
            const deletedText = all[idx].text;
            all.splice(idx, 1);
            // 同步扣减 tasksCompleted（如果之前算过的话）
            Storage.saveTodos(all);
            broadcastTodosChanged();
            return { ok: true, id, deletedText };
        },

        delete_completed: ({ date } = {}) => {
            if (!date) return { error: 'date 必填' };
            const all = Storage.loadTodos();
            const targets = all.filter(t => t.completed && t.completedDate === date);
            if (targets.length === 0) return { ok: true, deletedCount: 0, date };
            const remaining = all.filter(t => !(t.completed && t.completedDate === date));
            Storage.saveTodos(remaining);
            broadcastTodosChanged();
            return { ok: true, date, deletedCount: targets.length };
        },

        // ---- 写：pomodoro（通过 BroadcastChannel 指令） ----
        start_pomodoro: () => sendCommand('pomodoro-start'),
        stop_pomodoro:  () => sendCommand('pomodoro-stop'),

        update_pomodoro_settings: (args = {}) => {
            const current = Storage.loadSettings();
            const updated = { ...current };
            const changes = [];
            if (args.focusDuration != null) {
                const v = Math.max(1, Math.min(120, Number(args.focusDuration) || 0));
                if (v && v !== current.focusDuration) {
                    changes.push(`专注 ${current.focusDuration} → ${v} 分钟`);
                    updated.focusDuration = v;
                }
            }
            if (args.breakDuration != null) {
                const v = Math.max(1, Math.min(60, Number(args.breakDuration) || 0));
                if (v && v !== current.breakDuration) {
                    changes.push(`休息 ${current.breakDuration} → ${v} 分钟`);
                    updated.breakDuration = v;
                }
            }
            if (changes.length === 0) {
                return { ok: true, noChange: true, settings: current };
            }
            Storage.saveSettings(updated);
            sendCommand('settings-updated');
            return { ok: true, changes, settings: updated };
        }
    };

    // ============================================================
    // 预览文案（用于 confirm 对话框）
    // ============================================================

    function formatPreview(name, args) {
        const a = args || {};
        switch (name) {
            case 'add_todo': {
                const date = a.date || DateUtils.getTodayString();
                const recur = a.recurring && a.recurring !== 'none' ? `（重复：${a.recurring}）` : '';
                return `任务内容:「${a.text}」\n日期: ${date}${recur ? '\n' + recur : ''}`;
            }
            case 'toggle_todo': {
                const todo = findTodo(a);
                if (!todo) return `id/text: ${a.id || a.text}`;
                return `任务:「${todo.text}」\n当前状态: ${todo.completed ? '已完成' : '未完成'}`;
            }
            case 'edit_todo': {
                const todo = findTodo(a);
                if (!todo) return `id: ${a.id}`;
                return `原内容:「${todo.text}」\n新内容:「${a.text}」`;
            }
            case 'delete_todo': {
                const todo = findTodo(a);
                if (!todo) return `id: ${a.id}`;
                return `任务:「${todo.text}」`;
            }
            case 'delete_completed': {
                const all = Storage.loadTodos();
                const targets = all.filter(t => t.completed && t.completedDate === a.date);
                const preview = targets.slice(0, 5).map(t => `  • ${t.text}`).join('\n');
                const more = targets.length > 5 ? `\n  ... 还有 ${targets.length - 5} 个` : '';
                return `日期: ${a.date}\n共 ${targets.length} 个任务:${preview}${more}`;
            }
            case 'start_pomodoro':
                return '主窗口将开始一个番茄钟（专注 25 分钟，可在设置调整）';
            case 'stop_pomodoro':
                return '主窗口的番茄钟将被停止（重置）';
            case 'update_pomodoro_settings': {
                const current = Storage.loadSettings();
                const lines = [];
                if (a.focusDuration != null) lines.push(`专注: ${current.focusDuration} → ${a.focusDuration} 分钟`);
                if (a.breakDuration != null) lines.push(`休息: ${current.breakDuration} → ${a.breakDuration} 分钟`);
                return lines.join('\n') || '(无变化)';
            }
            default:
                return JSON.stringify(args, null, 2);
        }
    }

    // ============================================================
    // 执行入口
    // ============================================================

    /**
     * 执行工具。返回 JSON 字符串（OpenAI tool result content 规范）。
     * @param {string} name
     * @param {Object} args
     * @param {Object} [opts]
     * @param {Function} [opts.askUser] - async (title, message, detail, dangerous) => boolean
     *        渲染端注入 confirm 拦截；不传则直接拒绝所有写操作
     */
    async function execute(name, args, opts = {}) {
        const handler = HANDLERS[name];
        if (!handler) {
            return JSON.stringify({ error: `Unknown tool: ${name}` });
        }

        // 写操作：必须先经用户 confirm
        if (WRITE_TOOLS.has(name)) {
            if (typeof opts.askUser !== 'function') {
                return JSON.stringify({
                    error: 'write_blocked',
                    message: '写操作需要用户确认，但 askUser 回调未提供'
                });
            }
            const dangerous = DANGEROUS_TOOLS.has(name);
            const detail = formatPreview(name, args);
            const ok = await opts.askUser(
                'AI 操作确认',
                `AI 想要执行：${name}`,
                detail,
                dangerous
            );
            if (!ok) {
                return JSON.stringify({
                    error: 'user_denied',
                    message: '用户拒绝了此操作。请不要再次尝试。'
                });
            }
        }

        // 关键：写操作前强制 reload，确保 in-memory todos 是 storage 里的最新数据
        // 防御 race condition（即使 listenExternal 漏掉，强制 reload 兜底）
        if (WRITE_TOOLS.has(name) && window.Todo && typeof Todo.reload === 'function') {
            try { Todo.reload(); } catch (e) { /* 忽略 */ }
        }

        try {
            const result = await handler(args || {});
            return JSON.stringify(result);
        } catch (err) {
            return JSON.stringify({ error: err.message || String(err) });
        }
    }

    return {
        TOOL_DEFINITIONS,
        execute,
        READ_TOOLS: [...READ_TOOLS],
        WRITE_TOOLS: [...WRITE_TOOLS],
        DANGEROUS_TOOLS: [...DANGEROUS_TOOLS],
        formatPreview
    };
})();

window.AITools = AITools;
