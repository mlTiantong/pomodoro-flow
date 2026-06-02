/**
 * todo.js — 待办清单模块
 *
 * 负责待办事项的 CRUD 操作和 UI 渲染。
 * 与 storage.js 配合实现数据持久化。
 */

const Todo = (() => {
    'use strict';

    // ============================================================
    // 状态
    // ============================================================

    /** @type {Array} 当前待办列表 */
    let todos = [];

    /** @type {HTMLElement|null} */
    let todoListEl = null;
    let todoInputEl = null;
    let todoCountEl = null;
    let taskSelectEl = null;

    // ============================================================
    // 事件回调
    // ============================================================

    let onTodosChanged = null;

    // ============================================================
    // 初始化
    // ============================================================

    /**
     * 初始化待办模块
     * @param {Object} options
     */
    function init(options = {}) {
        todoListEl = document.getElementById('todoList');
        todoInputEl = document.getElementById('todoInput');
        todoCountEl = document.getElementById('todoCount');
        taskSelectEl = document.getElementById('taskSelect');
        onTodosChanged = options.onTodosChanged || null;

        // 加载数据
        todos = Storage.loadTodos();

        // 补全周期任务（确保今天及未来日期有对应实例）
        hydrateRecurringTasks();

        if (!todoListEl || !todoInputEl) {
            return;
        }

        // 绑定事件
        todoInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addTodo();
        });
        document.getElementById('btnAddTodo')?.addEventListener('click', () => addTodo());
        document.getElementById('btnClearCompleted')?.addEventListener('click', clearCompleted);

        // 初始渲染
        render();
        updateTaskSelect();
    }

    // ============================================================
    // 核心操作
    // ============================================================

    /**
     * 添加新任务
     * @param {string} text - 任务文本
     * @param {Object} [options]
     * @param {string} [options.date] - 指定日期 YYYY-MM-DD，默认今天
     * @param {string} [options.recurring] - 重复周期: 'none'|'daily'|'weekly'|'weekdays'
     */
    function addTodo(text, options = {}) {
        const textStr = (text || todoInputEl.value).trim();
        if (!textStr) return;

        const today = getTodayString();
        const targetDate = options.date || today;

        // 如果没传 date 但传了 text 和 options，说明是程序调用，用 options.date
        const newTodo = {
            id: generateId(),
            text: textStr,
            completed: false,
            date: targetDate,
            recurring: options.recurring || 'none',
            createdAt: new Date().toISOString(),
            completedAt: null,
            completedDate: null,
            pomodoroCount: 0,
            order: todos.length
        };

        todos.unshift(newTodo);

        // 如果是周期任务，预生成未来 30 天的所有实例
        if (newTodo.recurring && newTodo.recurring !== 'none') {
            generateRecurringInstances(newTodo, 30);
        }

        saveAndRender();
        if (todoInputEl) {
            todoInputEl.value = '';
            todoInputEl.focus();
        }
        updateTaskSelect();
        if (onTodosChanged) onTodosChanged(todos);
        return newTodo;
    }

    /**
     * 为周期任务预生成未来 N 天的所有实例（跳过已有任务的日期）
     * @param {Object} templateTodo - 模板任务（至少有 text, date, recurring）
     * @param {number} days - 生成多少天
     */
    function generateRecurringInstances(templateTodo, days = 30) {
        const [y, m, d] = templateTodo.date.split('-').map(Number);
        const baseDate = new Date(y, m - 1, d);
        const firstWeekday = baseDate.getDay();
        let added = 0;

        for (let i = 1; i <= days; i++) {
            const nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + i);
            const dateStr = formatDate(nextDate);

            // 判断该日期是否符合周期规则
            if (!shouldHaveTaskOnDate(templateTodo.recurring, dateStr, firstWeekday)) continue;

            // 检查是否已有相同任务
            const exists = todos.some(t =>
                t.text === templateTodo.text &&
                t.recurring === templateTodo.recurring &&
                t.date === dateStr
            );
            if (exists) continue;

            todos.push({
                id: generateId(),
                text: templateTodo.text,
                completed: false,
                date: dateStr,
                recurring: templateTodo.recurring,
                createdAt: new Date().toISOString(),
                completedAt: null,
                completedDate: null,
                pomodoroCount: 0,
                order: todos.length
            });
            added++;
        }

        if (added > 0) {
            console.log(`[Recurring] 为「${templateTodo.text}」预生成 ${added} 个周期任务`);
        }
    }

    /**
     * 切换任务完成状态
     * @param {string} id
     */
    function toggleTodo(id) {
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        todo.completed = !todo.completed;
        todo.completedAt = todo.completed ? new Date().toISOString() : null;
        todo.completedDate = todo.completed ? getTodayString() : null;

        // 如果完成，更新统计
        if (todo.completed) {
            Storage.updateTodayStats(stats => {
                stats.tasksCompleted = (stats.tasksCompleted || 0) + 1;
                return stats;
            });

            // 如果设置了重复，自动创建下个周期的任务
            if (todo.recurring && todo.recurring !== 'none') {
                scheduleNextRecurring(todo);
            }
        } else {
            Storage.updateTodayStats(stats => {
                stats.tasksCompleted = Math.max(0, (stats.tasksCompleted || 0) - 1);
                return stats;
            });
        }

        saveAndRender();
        if (onTodosChanged) onTodosChanged(todos);
    }

    /**
     * 根据重复规则，自动创建下一个周期的任务
     * @param {Object} completedTodo
     */
    function scheduleNextRecurring(completedTodo) {
        // 用任务的 date 字段计算下一周期（而不是 new Date()），避免时区问题
        const [y, m, d] = completedTodo.date.split('-').map(Number);
        const baseDate = new Date(y, m - 1, d);
        let nextDate = null;

        switch (completedTodo.recurring) {
            case 'daily':
                nextDate = new Date(baseDate);
                nextDate.setDate(nextDate.getDate() + 1);
                break;
            case 'weekly':
                nextDate = new Date(baseDate);
                nextDate.setDate(nextDate.getDate() + 7);
                break;
            case 'weekdays':
                nextDate = new Date(baseDate);
                do {
                    nextDate.setDate(nextDate.getDate() + 1);
                } while (nextDate.getDay() === 0 || nextDate.getDay() === 6);
                break;
            default:
                return;
        }

        const dateStr = formatDate(nextDate);

        // 检查该日期是否已有相同的未完成任务
        const exists = todos.some(t =>
            !t.completed &&
            t.text === completedTodo.text &&
            t.date === dateStr &&
            t.recurring === completedTodo.recurring
        );
        if (!exists) {
            const newTodo = {
                id: generateId(),
                text: completedTodo.text,
                completed: false,
                date: dateStr,
                recurring: completedTodo.recurring,
                createdAt: new Date().toISOString(),
                completedAt: null,
                completedDate: null,
                pomodoroCount: 0,
                order: todos.length
            };
            todos.push(newTodo);
        }
    }

    /**
     * 在启动/刷新时，检查所有周期任务是否为今天及未来日期生成了实例。
     * 如果某个周期任务在某个日期缺失，自动补上。
     */
    function hydrateRecurringTasks() {
        // 找出所有周期任务的"模板" — 按 text+recurring 分组，记录最早的 date 作为参考
        const templates = new Map(); // key → { text, recurring, firstDate }
        for (const t of todos) {
            if (t.recurring && t.recurring !== 'none') {
                const key = `${t.text}::${t.recurring}`;
                if (!templates.has(key) || t.date < templates.get(key).firstDate) {
                    templates.set(key, { text: t.text, recurring: t.recurring, firstDate: t.date });
                }
            }
        }

        // 从今天起未来 14 天
        const today = new Date();
        const futureDates = [];
        for (let i = 0; i < 14; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            futureDates.push(formatDate(d));
        }

        let changed = false;

        for (const [, tmpl] of templates) {
            // 解析首次出现的日期，获取 weekday 参考（用于 weekly）
            const [y0, m0, d0] = tmpl.firstDate.split('-').map(Number);
            const firstDateObj = new Date(y0, m0 - 1, d0);
            const firstWeekday = firstDateObj.getDay(); // 0=Sun, 1=Mon...

            for (const dateStr of futureDates) {
                // 检查当天是否该有任务
                if (!shouldHaveTaskOnDate(tmpl.recurring, dateStr, firstWeekday)) continue;

                // 检查是否已有任务
                const exists = todos.some(t =>
                    t.text === tmpl.text &&
                    t.recurring === tmpl.recurring &&
                    t.date === dateStr
                );
                if (!exists) {
                    todos.push({
                        id: generateId(),
                        text: tmpl.text,
                        completed: false,
                        date: dateStr,
                        recurring: tmpl.recurring,
                        createdAt: new Date().toISOString(),
                        completedAt: null,
                        completedDate: null,
                        pomodoroCount: 0,
                        order: todos.length
                    });
                    changed = true;
                }
            }
        }

        if (changed) {
            Storage.saveTodos(todos);
            render();
            updateTaskSelect();
        }
    }

    /**
     * 判断周期类型在指定日期是否应该出现
     * @param {string} recurring - 'daily'|'weekdays'|'weekly'
     * @param {string} dateStr - YYYY-MM-DD
     * @param {number} firstWeekday - 首次出现时的星期几 (0-6)，weekly 用
     * @returns {boolean}
     */
    function shouldHaveTaskOnDate(recurring, dateStr, firstWeekday) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const dayOfWeek = date.getDay();

        switch (recurring) {
            case 'daily':
                return true;
            case 'weekdays':
                return dayOfWeek >= 1 && dayOfWeek <= 5;
            case 'weekly':
                // 只在同一 weekday 出现
                return dayOfWeek === firstWeekday;
            default:
                return false;
        }
    }

    /**
     * 删除单个任务（不再弹确认框，周期任务有两个按钮供选择）
     * @param {string} id
     * @param {boolean} [silent=false] - 静默删除（不触发额外逻辑）
     * @returns {boolean}
     */
    function deleteTodo(id, silent = false) {
        const todo = todos.find(t => t.id === id);
        if (!todo) return false;

        // 如果已完成，从统计中扣除
        if (todo.completed) {
            Storage.updateTodayStats(stats => {
                stats.tasksCompleted = Math.max(0, (stats.tasksCompleted || 0) - 1);
                return stats;
            });
        }

        todos = todos.filter(t => t.id !== id);
        saveAndRender();
        if (onTodosChanged) onTodosChanged(todos);
        return true;
    }

    /**
     * 删除所有未完成的同名周期任务
     * @param {string} id - 其中某个周期任务的 ID
     * @returns {number} 删除的数量
     */
    function deleteRecurringAll(id) {
        const todo = todos.find(t => t.id === id);
        if (!todo) return 0;

        const { text, recurring } = todo;

        // 找到所有匹配的未完成任务
        const toDelete = todos.filter(t =>
            !t.completed &&
            t.text === text &&
            t.recurring === recurring
        );

        if (toDelete.length === 0) return 0;

        const ids = toDelete.map(t => t.id);
        const count = ids.length;

        todos = todos.filter(t => !ids.includes(t.id));
        saveAndRender();
        if (onTodosChanged) onTodosChanged(todos);
        return count;
    }

    /**
     * 编辑任务文本
     * @param {string} id
     * @param {string} newText
     */
    function editTodo(id, newText) {
        const todo = todos.find(t => t.id === id);
        if (!todo) return;

        todo.text = newText.trim();
        saveAndRender();
        if (onTodosChanged) onTodosChanged(todos);
    }

    /**
     * 清除所有已完成任务
     */
    function clearCompleted() {
        const completed = todos.filter(t => t.completed);
        if (completed.length === 0) return;

        todos = todos.filter(t => !t.completed);
        saveAndRender();
        if (onTodosChanged) onTodosChanged(todos);
    }

    /**
     * 清除所有已完成任务（包括统计中扣除）
     */
    function clearAllCompleted() {
        const completed = todos.filter(t => t.completed);
        if (completed.length === 0) return;

        // 从今日统计中扣除已完成数量
        const completedCount = completed.length;
        Storage.updateTodayStats(stats => {
            stats.tasksCompleted = Math.max(0, (stats.tasksCompleted || 0) - completedCount);
            return stats;
        });

        todos = todos.filter(t => !t.completed);
        saveAndRender();
        if (onTodosChanged) onTodosChanged(todos);
    }

    /**
     * 增加任务的番茄计数
     * @param {string} taskId
     */
    function incrementPomodoro(taskId) {
        const todo = todos.find(t => t.id === taskId);
        if (todo) {
            todo.pomodoroCount = (todo.pomodoroCount || 0) + 1;
            saveAndRender();
        }
    }

    /**
     * 获取未完成任务列表（用于番茄钟关联选择）
     * @returns {Array}
     */
    function getActiveTodos() {
        return todos.filter(t => !t.completed);
    }

    /**
     * 获取所有任务
     * @returns {Array}
     */
    function getAllTodos() {
        return [...todos];
    }

    /**
     * 获取指定月份的所有任务（按日期分组）
     * @param {number} year - 年份
     * @param {number} month - 月份 (1-12)
     * @returns {Object} { '2026-05-01': [...tasks], '2026-05-02': [...] }
     */
    function getTodosByMonth(year, month) {
        const prefix = `${year}-${String(month).padStart(2, '0')}`;
        const result = {};
        for (const t of todos) {
            if (t.date && t.date.startsWith(prefix)) {
                if (!result[t.date]) result[t.date] = [];
                result[t.date].push(t);
            }
        }
        return result;
    }

    /**
     * 获取未完成任务数（仅今天 + 过期任务）
     * @returns {number}
     */
    function getActiveCount() {
        const today = getTodayString();
        return todos.filter(t => !t.completed && t.date <= today).length;
    }

    /**
     * 获取指定日期的未完成任务
     * @param {string} date - YYYY-MM-DD
     * @returns {Array}
     */
    function getTodosByDate(date) {
        return todos.filter(t => !t.completed && t.date === date);
    }

    /**
     * 获取所有已完成任务，按日期分组
     * @returns {Object}
     */
    function getCompletedGrouped() {
        const completed = todos.filter(t => t.completed && t.completedDate);
        const grouped = {};
        completed.sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
        for (const t of completed) {
            const d = t.completedDate;
            if (!grouped[d]) grouped[d] = [];
            grouped[d].push(t);
        }
        return grouped;
    }

    /**
     * 获取有任务的日期列表
     * @returns {string[]}
     */
    function getAllDates() {
        const dates = new Set();
        for (const t of todos) {
            if (t.date) dates.add(t.date);
            if (t.completedDate) dates.add(t.completedDate);
        }
        return [...dates].sort();
    }

    // ============================================================
    // 渲染
    // ============================================================

    /**
     * 保存数据并重新渲染
     */
    function saveAndRender() {
        Storage.saveTodos(todos);
        render();
        updateTaskSelect();
        // 通知其他窗口数据已变化
        broadcastChange();
    }

    /**
     * 从 localStorage 重新加载数据（跨窗口同步用）
     */
    function reload() {
        todos = Storage.loadTodos();
        render();
        updateTaskSelect();
    }

    /**
     * 向其他窗口广播数据变更
     * 专用 channel：避免与 focus-activity / 键盘花园的广播相互干扰
     */
    function broadcastChange() {
        try {
            const bc = new BroadcastChannel('tomato-todos');
            bc.postMessage('changed');
            bc.close();
        } catch(e) {}
    }

    /**
     * 监听跨窗口同步信号（在主窗口 app.js 中调用）
     * 只听专用 channel，不响应 focus-activity / 键盘花园的广播
     */
    function listenExternal() {
        try {
            const bc = new BroadcastChannel('tomato-todos');
            bc.addEventListener('message', () => {
                reload();
            });
        } catch(e) {}
    }

    /**
     * 渲染任务列表 — 只显示今天的 + 过期未完成的
     */
    function render() {
        if (!todoListEl) return;

        const today = getTodayString();

        // 筛选出今天和过期的任务（未完成的）
        const todayActive = todos.filter(t => !t.completed && t.date === today);
        const overdueActive = todos.filter(t => !t.completed && t.date < today);
        // 今天完成的任务
        const todayCompleted = todos.filter(t => t.completed && t.completedDate === today);

        // 也显示今天之前完成的任务（可选，暂时不显示）
        // 只显示今天完成的任务

        const displayTodos = [
            ...overdueActive.map(t => ({ ...t, _overdue: true })),
            ...todayActive.map(t => ({ ...t, _overdue: false })),
            ...todayCompleted.map(t => ({ ...t, _overdue: false }))
        ];

        // 排序：过期按日期从旧到新，今天的按 order 倒序
        displayTodos.sort((a, b) => {
            if (a._overdue && !b._overdue) return -1;
            if (!a._overdue && b._overdue) return 1;
            if (a._overdue && b._overdue) {
                return a.date < b.date ? -1 : 1;
            }
            // 今天任务，已完成排在后面
            if (a.completed && !b.completed) return 1;
            if (!a.completed && b.completed) return -1;
            return b.order - a.order;
        });

        const displayedCount = displayTodos.filter(t => !t.completed).length;
        if (todoCountEl) {
            todoCountEl.textContent = `${displayedCount} 项待办`;
        }

        if (displayTodos.length === 0) {
            todoListEl.innerHTML = `
                <div class="todo-empty">
                    <div class="todo-empty-icon">📝</div>
                    <div class="todo-empty-text">今天还没有任务，添加一个吧</div>
                </div>
            `;
            return;
        }

        let html = '';
        for (const todo of displayTodos) {
            const checkedClass = todo.completed ? 'checked' : '';
            const itemClass = todo.completed ? 'completed' : '';
            const badgeHtml = todo.pomodoroCount > 0
                ? `<span class="todo-pomodoro-badge">${todo.pomodoroCount}🍅</span>`
                : '';
            const isRecurring = todo.recurring && todo.recurring !== 'none';
            const isOverdue = todo._overdue;

            html += `
                <div class="todo-item ${itemClass}" data-id="${todo.id}">
                    <button class="todo-checkbox ${checkedClass}"
                            onclick="Todo.toggleTodo('${todo.id}')"></button>
                    <span class="todo-text" ondblclick="Todo.startEdit('${todo.id}')">${escapeHtml(todo.text)}</span>
                    ${isOverdue ? `<span class="todo-overdue-badge">延期</span>` : ''}
                    ${isRecurring ? `<span class="todo-recurring-badge">↻${getRecurringShortLabel(todo.recurring)}</span>` : ''}
                    ${badgeHtml}
                    ${isRecurring && !todo.completed ? `
                    <button class="todo-delete-all-btn"
                            onclick="Todo.deleteRecurringAll('${todo.id}')"
                            title="删除全部周期任务">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>` : ''}
                    <button class="todo-delete-btn"
                            onclick="Todo.deleteTodo('${todo.id}', true)" title="删除此任务">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            `;
        }

        todoListEl.innerHTML = html;
    }

    /**
     * 开始编辑任务（双击文本触发的内联编辑）
     * @param {string} id
     */
    function startEdit(id) {
        const todo = todos.find(t => t.id === id);
        if (!todo || todo.completed) return;

        const item = document.querySelector(`.todo-item[data-id="${id}"]`);
        const textEl = item?.querySelector('.todo-text');
        if (!textEl) return;

        const oldText = todo.text;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'todo-input';
        input.value = oldText;
        input.style.flex = '1';
        input.style.padding = '4px 8px';
        input.style.fontSize = '13px';

        textEl.replaceWith(input);
        input.focus();
        input.select();

        const finishEdit = () => {
            const newText = input.value.trim();
            if (newText && newText !== oldText) {
                editTodo(id, newText);
            } else {
                render(); // 恢复原样
            }
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = oldText;
                input.blur();
            }
        });
    }

    /**
     * 更新任务选择下拉框（番茄钟关联用）
     */
    function updateTaskSelect() {
        if (!taskSelectEl) return;
        const active = getActiveTodos();

        let html = '<option value="">-- 无关联任务 --</option>';
        for (const t of active) {
            html += `<option value="${t.id}">${escapeHtml(t.text.substring(0, 30))}</option>`;
        }
        taskSelectEl.innerHTML = html;
    }

    // ============================================================
    // 工具函数（统一引用 utils，避免重复）
    // ============================================================

    const escapeHtml = DomUtils.escapeHtml;
    const generateId = DomUtils.generateId;
    const getTodayString = DateUtils.getTodayString;
    const formatDate = DateUtils.formatDate;

    function getRecurringShortLabel(recurring) {
        const map = { 'daily': '每天', 'weekly': '每周', 'weekdays': '工作日' };
        return map[recurring] || recurring;
    }

    // ============================================================
    // 公开 API
    // ============================================================

    return {
        init,
        reload,
        listenExternal,
        addTodo,
        toggleTodo,
        deleteTodo,
        deleteRecurringAll,
        editTodo,
        startEdit,
        clearCompleted,
        clearAllCompleted,
        incrementPomodoro,
        getActiveTodos,
        getAllTodos,
        getActiveCount,
        getTodosByDate,
        getTodosByMonth,
        getCompletedGrouped,
        getAllDates,
        getRecurringShortLabel,
        render
    };
})();
