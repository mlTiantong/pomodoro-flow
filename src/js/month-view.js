/**
 * month-view.js — 周视图 + 跨窗口同步
 *
 * 显示连续7天，每格完整显示任务内容。
 * 4个导航按钮：⏪上一周 ◀前一天 ▶后一天 ⏩下一周
 * 通过 localStorage 的 storage 事件与主窗口同步。
 */

const WeekView = (() => {
    'use strict';

    /** 当前视图的起始日期（周一） */
    let weekStart = null;
    let delegatedEventsBound = false;

    function init() {
        if (window.FocusActivity) {
            FocusActivity.init();
        }
        weekStart = getWeekStart(new Date());

        document.getElementById('wvBtnPrevWeek').addEventListener('click', () => {
            weekStart.setDate(weekStart.getDate() - 7);
            isNavigating = true; render();
        });
        document.getElementById('wvBtnPrevDay').addEventListener('click', () => {
            weekStart.setDate(weekStart.getDate() - 1);
            isNavigating = true; render();
        });
        document.getElementById('wvBtnNextDay').addEventListener('click', () => {
            weekStart.setDate(weekStart.getDate() + 1);
            isNavigating = true; render();
        });
        document.getElementById('wvBtnNextWeek').addEventListener('click', () => {
            weekStart.setDate(weekStart.getDate() + 7);
            isNavigating = true; render();
        });
        document.getElementById('mvBtnToday').addEventListener('click', () => {
            weekStart = getWeekStart(new Date());
            isNavigating = true; render();
        });
        document.getElementById('mvBtnClose').addEventListener('click', () => {
            if (window.electronAPI) window.electronAPI.closeMonthView();
            else window.close();
        });
        bindDelegatedEvents();

        // 跨窗口同步: 专用 channel（只听 todos 模块）
        try {
            const bc = new BroadcastChannel('tomato-todos');
            bc.addEventListener('message', () => {
                if (!isInputFocused()) requestAnimationFrame(() => render());
            });
        } catch(e) {}

        // 跨窗口同步: localStorage storage 事件（不同 app 实例间）
        // 只对 todos 相关 key 响应，避免被 focus-activity / 键盘花园误触发
        window.addEventListener('storage', (e) => {
            if (e.key && (
                e.key === 'tomato_clock_todos' ||
                e.key === 'tomato_clock_completed' ||
                e.key === 'tomato_clock_stats'
            )) {
                if (!isInputFocused()) requestAnimationFrame(() => render());
            }
        });

        // 兜底: 定时刷新（用户不在输入时才刷新）
        setInterval(() => {
            if (!isInputFocused()) requestAnimationFrame(() => render());
        }, 5000);

        render();
    }

    /** 是否为导航触发的渲染（控制动画） */
    let isNavigating = false;

    function render() {
        // 如果用户正在输入，不重新渲染
        if (isInputFocused()) return;

        const grid = document.getElementById('wvGrid');
        const title = document.getElementById('wvNavTitle');

        // 先同步数据
        Todo.reload();

        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            days.push(d);
        }

        const s = days[0], e = days[6];
        const wds = DateUtils.WEEKDAY_LABELS_LONG;
        title.textContent = DateUtils.formatWeekRange(s, e);

        // 使用 Todo.getAllTodos() 而非 Storage.loadTodos() 确保内存数据一致
        const allTodos = Todo.getAllTodos();
        const today = DateUtils.getTodayString();
        const taskMap = {};
        for (const t of allTodos) {
            if (!t.date) continue;
            if (!taskMap[t.date]) taskMap[t.date] = [];
            taskMap[t.date].push(t);
        }

        let html = '';
        for (const dateObj of days) {
            const dateStr = DateUtils.formatDate(dateObj);
            const isToday = dateStr === today;
            const wd = dateObj.getDay();

            const dayTodos = taskMap[dateStr] || [];
            const active = dayTodos.filter(t => !t.completed);
            const done = dayTodos.filter(t => t.completed);

            let taskHtml = '';
            for (const t of active) {
                const rec = t.recurring && t.recurring !== 'none';
                taskHtml += `
                    <div class="wv-task">
                        <button class="wv-task-cb" onclick="WeekView.toggle('${t.id}')"></button>
                        <span class="wv-task-text">${esc(t.text)}</span>
                        ${rec ? `<span class="wv-task-badge">↻</span>` : ''}
                        ${rec ? `<button class="wv-task-delall" onclick="WeekView.delAll('${t.id}')" title="删全部">🗑️</button>` : ''}
                        <button class="wv-task-del" onclick="WeekView.del('${t.id}')" title="删除">✕</button>
                    </div>
                `;
            }
            for (const t of done) {
                taskHtml += `
                    <div class="wv-task wv-task-done">
                        <button class="wv-task-cb checked" onclick="WeekView.toggle('${t.id}')"></button>
                        <span class="wv-task-text">${esc(t.text)}</span>
                    </div>
                `;
            }
            taskHtml += `
                <div class="wv-task-add" onclick="WeekView.focusAdd('${dateStr}')">
                    <span class="wv-add-icon">＋</span>
                    <span class="wv-add-text">添加任务</span>
                </div>
            `;

            const cls = ['wv-col', isToday ? 'wv-today' : ''].filter(Boolean).join(' ');

            html += `
                <div class="${cls}">
                    <div class="wv-col-header">
                        <span class="wv-col-day">${wds[wd]}</span>
                        <span class="wv-col-date ${isToday ? 'wv-col-date-today' : ''}">${dateObj.getDate()}</span>
                    </div>
                    <div class="wv-col-tasks" data-date="${dateStr}">${taskHtml}</div>
                    <div class="wv-col-input" style="display:none;" data-date="${dateStr}">
                        <input type="text" class="wv-inline-input" placeholder="输入任务..." maxlength="200">
                        <button class="wv-inline-add">➕</button>
                    </div>
                </div>
            `;
        }

        // 导航时加动画，其他刷新不加
        if (isNavigating) {
            grid.classList.add('wv-animate');
            isNavigating = false;
        } else {
            grid.classList.remove('wv-animate');
        }

        grid.innerHTML = html;

    }

    function bindDelegatedEvents() {
        if (delegatedEventsBound) return;
        const grid = document.getElementById('wvGrid');
        grid.addEventListener('click', (e) => {
            const addBtn = e.target.closest('.wv-inline-add');
            if (!addBtn) return;
            const row = addBtn.closest('.wv-col-input');
            const inp = row.querySelector('.wv-inline-input');
            const date = row.dataset.date;
            const text = inp.value.trim();
            if (!text) return;
            Todo.addTodo(text, { date });
            inp.value = '';
            requestAnimationFrame(() => render());
        });
        grid.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const inp = e.target.closest('.wv-inline-input');
            if (!inp) return;
            const addBtn = inp.closest('.wv-col-input').querySelector('.wv-inline-add');
            if (addBtn) addBtn.click();
        });
        delegatedEventsBound = true;
    }

    function toggle(id) { Todo.toggleTodo(id); render(); }
    function del(id) { Todo.deleteTodo(id, true); render(); }
    function delAll(id) { Todo.deleteRecurringAll(id); render(); }

    function focusAdd(dateStr) {
        document.querySelectorAll('.wv-col-input').forEach(el => el.style.display = 'none');
        const row = document.querySelector(`.wv-col-input[data-date="${dateStr}"]`);
        if (row) {
            row.style.display = 'flex';
            const inp = row.querySelector('.wv-inline-input');
            inp.value = '';
            inp.focus();
        }
    }

    function getWeekStart(date) {
        return DateUtils.getWeekStart(date);
    }

    function esc(text) {
        return DomUtils.escapeHtml(text);
    }

    /** 检测是否有输入框正在被编辑 */
    function isInputFocused() {
        const el = document.activeElement;
        return el && (el.classList.contains('wv-inline-input') || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    }

    return { init, render, toggle, del, delAll, focusAdd };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', WeekView.init);
} else {
    WeekView.init();
}
