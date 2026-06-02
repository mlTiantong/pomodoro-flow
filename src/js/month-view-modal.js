/**
 * month-view-modal.js — 主窗口内联的月视图弹窗
 *
 * 显示一个完整月历 + 选中日期的任务详情。
 * 与独立窗口的 month-view.js（WeekView）功能不同：
 *   - 本模块：日历网格 + 选中详情
 *   - month-view.js：7 天列视图
 *
 * 依赖：Storage, Todo
 */

const MonthViewModal = (() => {
    'use strict';

    let viewYear = 0;
    let viewMonth = 0;
    let selectedDayDate = null;

    const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

    function init() {
        const now = new Date();
        viewYear = now.getFullYear();
        viewMonth = now.getMonth() + 1;

        document.getElementById('btnOpenMonthView').addEventListener('click', open);
        document.getElementById('btnMonthClose').addEventListener('click', close);
        document.getElementById('monthViewOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) close();
        });

        document.getElementById('btnMonthPrev').addEventListener('click', () => {
            viewMonth--;
            if (viewMonth < 1) { viewMonth = 12; viewYear--; }
            renderGrid();
        });
        document.getElementById('btnMonthNext').addEventListener('click', () => {
            viewMonth++;
            if (viewMonth > 12) { viewMonth = 1; viewYear++; }
            renderGrid();
        });
        document.getElementById('btnMonthToday').addEventListener('click', () => {
            const now = new Date();
            viewYear = now.getFullYear();
            viewMonth = now.getMonth() + 1;
            renderGrid();
        });

        document.getElementById('btnDayDetailAdd').addEventListener('click', addDayTask);
        document.getElementById('dayDetailInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addDayTask();
        });
    }

    function addDayTask() {
        const input = document.getElementById('dayDetailInput');
        const text = input.value.trim();
        if (!text || !selectedDayDate) return;
        Todo.addTodo(text, { date: selectedDayDate });
        input.value = '';
        renderGrid();
        refreshDayDetail(selectedDayDate);
        Todo.render();
    }

    function open() {
        if (window.electronAPI) {
            // 走 IPC 打开独立窗口
            window.electronAPI.openMonthView();
            return;
        }
        // 降级：内联弹窗
        document.getElementById('monthViewOverlay').classList.add('open');
        renderGrid();
    }

    function close() {
        document.getElementById('monthViewOverlay').classList.remove('open');
        selectedDayDate = null;
    }

    function selectDay(dateStr) {
        selectedDayDate = dateStr;
        renderGrid();
        refreshDayDetail(dateStr);
    }

    function renderGrid() {
        const grid = document.getElementById('monthGrid');
        const title = document.getElementById('monthNavTitle');
        title.textContent = `${viewYear}年${viewMonth}月`;

        const taskMap = Todo.getTodosByMonth(viewYear, viewMonth);
        const today = DateUtils.getTodayString();

        const firstDay = new Date(viewYear, viewMonth - 1, 1);
        const lastDay = new Date(viewYear, viewMonth, 0);
        const daysInMonth = lastDay.getDate();
        const startWeekday = firstDay.getDay();
        const startOffset = startWeekday === 0 ? 6 : startWeekday - 1;

        let html = '';
        for (const wd of WEEKDAYS) {
            html += `<div class="month-grid-header">${wd}</div>`;
        }
        for (let i = 0; i < startOffset; i++) {
            html += `<div class="month-grid-cell other-month"></div>`;
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const tasks = taskMap[dateStr] || [];
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDayDate;

            let taskHtml = '';
            const activeTasks = tasks.filter(t => !t.completed).slice(0, 2);
            const completedTasks = tasks.filter(t => t.completed).slice(0, 1);
            const remaining = Math.max(0, tasks.filter(t => !t.completed).length - 2);

            for (const t of activeTasks) {
                taskHtml += `<div class="cell-task-text">${DomUtils.escapeHtml(t.text.substring(0, 8))}</div>`;
            }
            if (completedTasks.length > 0) {
                taskHtml += `<div class="cell-task-text completed">✓${DomUtils.escapeHtml(completedTasks[0].text.substring(0, 6))}</div>`;
            }
            if (remaining > 0) {
                taskHtml += `<div class="cell-more">+${remaining}项</div>`;
            }

            const classes = [
                'month-grid-cell',
                isToday ? 'today' : '',
                isSelected ? 'selected' : ''
            ].filter(Boolean).join(' ');

            html += `
                <div class="${classes}" data-date="${dateStr}" onclick="MonthViewModal.selectDay('${dateStr}')">
                    <span class="cell-day">${d}</span>
                    <div class="cell-tasks">${taskHtml || ''}</div>
                </div>
            `;
        }

        const totalCells = startOffset + daysInMonth;
        const remainder = totalCells % 7;
        if (remainder > 0) {
            for (let i = 0; i < 7 - remainder; i++) {
                html += `<div class="month-grid-cell other-month"></div>`;
            }
        }

        grid.innerHTML = html;
    }

    function refreshDayDetail(dateStr) {
        const title = document.getElementById('dayDetailTitle');
        const count = document.getElementById('dayDetailCount');
        const list = document.getElementById('dayDetailList');
        const inputRow = document.getElementById('dayDetailInputRow');

        title.textContent = `📋 ${DateUtils.formatDisplayDate(dateStr)}`;

        const allTodos = Storage.loadTodos();
        const dayTodos = allTodos.filter(t => t.date === dateStr);
        const activeTodos = dayTodos.filter(t => !t.completed);
        const completedTodos = dayTodos.filter(t => t.completed);

        count.textContent = `${activeTodos.length} 项待办`;

        if (dayTodos.length === 0) {
            list.innerHTML = '<div class="daily-todo-empty">📭 该日期没有任务</div>';
            inputRow.style.display = 'flex';
            return;
        }

        let html = '';
        for (const t of activeTodos) {
            const isRecurring = t.recurring && t.recurring !== 'none';
            const recurringBadge = isRecurring
                ? `<span class="todo-recurring-badge">↻${Todo.getRecurringShortLabel(t.recurring)}</span>`
                : '';
            const deleteAllBtn = isRecurring ? `
                <button class="todo-delete-all-btn"
                        onclick="Todo.deleteRecurringAll('${t.id}');MonthViewModal.renderGrid();MonthViewModal.refreshDayDetail('${dateStr}');Todo.render();" title="删除全部">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>` : '';

            html += `
                <div class="todo-item" data-id="${t.id}">
                    <button class="todo-checkbox"
                            onclick="Todo.toggleTodo('${t.id}');MonthViewModal.renderGrid();MonthViewModal.refreshDayDetail('${dateStr}');Todo.render();"></button>
                    <span class="todo-text">${DomUtils.escapeHtml(t.text)}</span>
                    ${recurringBadge}
                    ${deleteAllBtn}
                    <button class="todo-delete-btn"
                            onclick="Todo.deleteTodo('${t.id}', true);MonthViewModal.renderGrid();MonthViewModal.refreshDayDetail('${dateStr}');Todo.render();" title="删除">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            `;
        }
        for (const t of completedTodos) {
            html += `
                <div class="todo-item completed" data-id="${t.id}">
                    <button class="todo-checkbox checked"
                            onclick="Todo.toggleTodo('${t.id}');MonthViewModal.renderGrid();MonthViewModal.refreshDayDetail('${dateStr}');Todo.render();"></button>
                    <span class="todo-text" style="text-decoration:line-through;color:var(--text-dim)">${DomUtils.escapeHtml(t.text)}</span>
                </div>
            `;
        }

        list.innerHTML = html;
        inputRow.style.display = 'flex';
    }

    return {
        init,
        open,
        close,
        selectDay,
        renderGrid,
        refreshDayDetail
    };
})();
