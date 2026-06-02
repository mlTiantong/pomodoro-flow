/**
 * settings-modal.js — 设置弹窗模块
 *
 * 负责设置弹窗的 4 个 Tab：
 *   - 每日待办：日期选择 + 任务列表 + 内联添加
 *   - 已完成：按日期分组的已完成任务
 *   - 快速添加：日期+周期+任务
 *   - 外观：实际逻辑在 appearance.js
 *
 * 依赖：Storage, Todo, Appearance
 */

const SettingsModal = (() => {
    'use strict';

    let dailySelectedDate = '';

    function init() {
        // 弹窗开关
        document.getElementById('btnSettings').addEventListener('click', open);
        document.getElementById('btnModalClose').addEventListener('click', close);
        document.getElementById('settingsOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) close();
        });

        // 番茄钟面板的「修改时长」入口
        const btnEditDuration = document.getElementById('btnEditDuration');
        if (btnEditDuration) {
            btnEditDuration.addEventListener('click', () => {
                open();
                Appearance.switchToAppearanceTab();
            });
        }

        // 月视图弹窗里的设置按钮
        const btnMonthSettings = document.getElementById('btnMonthSettings');
        if (btnMonthSettings) {
            btnMonthSettings.addEventListener('click', () => {
                MonthViewModal.close();
                open();
                Appearance.switchToAppearanceTab();
            });
        }

        initModalTabs();
        DailyTodos.init();
        CompletedView.init();
        QuickAdd.init();
        AISettings.init();
    }

    function open() {
        document.getElementById('settingsOverlay').classList.add('open');
        DailyTodos.refresh();
        CompletedView.refresh();
        Appearance.syncUI(Storage.loadAppearance());

        const s = Storage.loadSettings();
        document.getElementById('focusDuration').value = s.focusDuration;
        document.getElementById('breakDuration').value = s.breakDuration;

        // 日期选择器默认今天
        dailySelectedDate = DateUtils.getTodayString();
        const picker = document.getElementById('dailyDatePicker');
        if (picker) picker.value = dailySelectedDate;
    }

    function close() {
        document.getElementById('settingsOverlay').classList.remove('open');
    }

    function isOpen() {
        return document.getElementById('settingsOverlay').classList.contains('open');
    }

    function initModalTabs() {
        const tabs = document.querySelectorAll('.modal-tab');
        const panels = {
            daily:      document.getElementById('mtabDaily'),
            completed:  document.getElementById('mtabCompleted'),
            quickadd:   document.getElementById('mtabQuickAdd'),
            appearance: document.getElementById('mtabAppearance'),
            ai:         document.getElementById('mtabAI')
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.mtab;
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                Object.values(panels).forEach(p => p?.classList.remove('active'));
                if (panels[target]) panels[target].classList.add('active');
                if (target === 'completed') CompletedView.refresh();
                if (target === 'ai') AISettings.syncUI();
            });
        });
    }

    // ============================================================
    // 子模块：每日待办
    // ============================================================

    const DailyTodos = (() => {
        function init() {
            const picker   = document.getElementById('dailyDatePicker');
            const btnToday = document.getElementById('btnTodayDate');
            const btnPrev  = document.getElementById('btnDatePrev');
            const btnNext  = document.getElementById('btnDateNext');
            const input    = document.getElementById('dailyTodoInput');
            const btnAdd   = document.getElementById('btnDailyAdd');

            // 默认今天
            dailySelectedDate = DateUtils.getTodayString();
            picker.value = dailySelectedDate;

            picker.addEventListener('change', () => {
                dailySelectedDate = picker.value;
                refresh();
            });
            btnPrev.addEventListener('click', () => {
                dailySelectedDate = DateUtils.shiftDate(dailySelectedDate, -1);
                picker.value = dailySelectedDate;
                refresh();
            });
            btnNext.addEventListener('click', () => {
                dailySelectedDate = DateUtils.shiftDate(dailySelectedDate, 1);
                picker.value = dailySelectedDate;
                refresh();
            });
            btnToday.addEventListener('click', () => {
                dailySelectedDate = DateUtils.getTodayString();
                picker.value = dailySelectedDate;
                refresh();
            });

            const doAdd = () => {
                const text = input.value.trim();
                if (!text || !dailySelectedDate) return;
                Todo.addTodo(text, { date: dailySelectedDate });
                input.value = '';
                refresh();
                Todo.render();
            };
            btnAdd.addEventListener('click', doAdd);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') doAdd();
            });
        }

        function refresh() {
            if (!dailySelectedDate) return;

            const list = document.getElementById('dailyTodoList');
            const title = document.getElementById('dailyDateTitle');
            const count = document.getElementById('dailyTodoCount');

            title.textContent = `📋 ${DateUtils.formatDisplayDate(dailySelectedDate)} 的待办`;

            const todos = Todo.getTodosByDate(dailySelectedDate);
            const allTodos = Storage.loadTodos();
            const completedToday = allTodos.filter(t =>
                t.completed && t.completedDate === dailySelectedDate
            );

            count.textContent = `${todos.length + completedToday.length} 项`;

            if (todos.length === 0 && completedToday.length === 0) {
                list.innerHTML = '<div class="daily-todo-empty">📭 该日期没有任务</div>';
                return;
            }

            let html = '';
            for (const t of todos) {
                html += renderTodoItem(t, false);
            }
            for (const t of completedToday) {
                html += renderTodoItem(t, true);
            }
            list.innerHTML = html;
        }

        function renderTodoItem(t, isCompleted) {
            const isRecurring = t.recurring && t.recurring !== 'none';
            const checkedClass = isCompleted ? 'checked' : '';
            const itemClass = isCompleted ? 'completed' : '';
            const textStyle = isCompleted ? 'style="text-decoration:line-through;color:var(--text-dim)"' : '';
            const recurringBadge = isRecurring
                ? `<span class="todo-recurring-badge">↻${Todo.getRecurringShortLabel(t.recurring)}</span>`
                : '';
            const deleteAllBtn = isRecurring ? `
                <button class="todo-delete-all-btn"
                        onclick="Todo.deleteRecurringAll('${t.id}');SettingsModal.DailyTodos.refresh();Todo.render();"
                        title="删除全部周期任务">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>` : '';

            return `
                <div class="todo-item ${itemClass}" data-id="${t.id}">
                    <button class="todo-checkbox ${checkedClass}"
                            onclick="Todo.toggleTodo('${t.id}');SettingsModal.DailyTodos.refresh();Todo.render();"></button>
                    <span class="todo-text" ${textStyle}>${DomUtils.escapeHtml(t.text)}</span>
                    ${recurringBadge}
                    ${deleteAllBtn}
                    <button class="todo-delete-btn"
                            onclick="Todo.deleteTodo('${t.id}', true);SettingsModal.DailyTodos.refresh();Todo.render();" title="删除此任务">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            `;
        }

        return { init, refresh };
    })();

    // ============================================================
    // 子模块：已完成任务
    // ============================================================

    const CompletedView = (() => {
        function init() {
            document.getElementById('btnClearAllCompleted').addEventListener('click', () => {
                if (confirm('确定清除所有已完成任务？')) {
                    Todo.clearAllCompleted();
                    refresh();
                    Todo.render();
                }
            });
        }

        function refresh() {
            const container = document.getElementById('completedList');
            const grouped = Todo.getCompletedGrouped();
            const dates = Object.keys(grouped);

            if (dates.length === 0) {
                container.innerHTML = '<div class="completed-empty">✅ 还没有完成的任务</div>';
                return;
            }

            let html = '';
            for (const date of dates) {
                const items = grouped[date];
                html += `
                    <div class="completed-date-group">
                        <div class="completed-date-label">📅 ${DateUtils.formatDisplayDate(date)}</div>
                        ${items.map(t => `
                            <div class="completed-item">
                                <span>✅</span>
                                <span class="todo-text">${DomUtils.escapeHtml(t.text)}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            container.innerHTML = html;
        }

        return { init, refresh };
    })();

    // ============================================================
    // 子模块：快速添加
    // ============================================================

    const QuickAdd = (() => {
        function init() {
            const input     = document.getElementById('quickaddInput');
            const datePicker = document.getElementById('quickaddDate');
            const recurring = document.getElementById('quickaddRecurring');
            const btnAdd    = document.getElementById('btnQuickAdd');

            datePicker.value = DateUtils.getTodayString();

            btnAdd.addEventListener('click', () => {
                const text = input.value.trim();
                if (!text) { input.focus(); return; }
                Todo.addTodo(text, {
                    date: datePicker.value || DateUtils.getTodayString(),
                    recurring: recurring.value
                });
                input.value = '';
                input.focus();
                btnAdd.textContent = '✅ 已添加！';
                setTimeout(() => { btnAdd.textContent = '➕ 添加任务'; }, 1200);
                Todo.render();
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') btnAdd.click();
            });
        }

        return { init };
    })();

    // ============================================================
    // 子模块：AI 助手配置
    // ============================================================

    const AISettings = (() => {
        function init() {
            const btnSave = document.getElementById('btnAISave');
            if (btnSave) {
                btnSave.addEventListener('click', () => {
                    const config = readFromUI();
                    Storage.saveAIConfig(config);
                    btnSave.textContent = '✅ 已保存！';
                    setTimeout(() => { btnSave.textContent = '💾 保存配置'; }, 1500);
                });
            }
        }

        function readFromUI() {
            return {
                baseUrl: document.getElementById('aiBaseUrl')?.value || '',
                apiKey:  document.getElementById('aiApiKey')?.value || '',
                model:   document.getElementById('aiModel')?.value || '',
                enabled: document.getElementById('chkAIEnabled')?.checked || false
            };
        }

        function syncUI() {
            const config = Storage.loadAIConfig();
            const baseEl = document.getElementById('aiBaseUrl');
            const keyEl  = document.getElementById('aiApiKey');
            const modelEl = document.getElementById('aiModel');
            const enabledEl = document.getElementById('chkAIEnabled');
            if (baseEl)    baseEl.value    = config.baseUrl || '';
            if (keyEl)     keyEl.value     = config.apiKey  || '';
            if (modelEl)   modelEl.value   = config.model   || '';
            if (enabledEl) enabledEl.checked = !!config.enabled;
        }

        return { init, syncUI, readFromUI };
    })();

    return {
        init,
        open,
        close,
        isOpen,
        DailyTodos,
        CompletedView,
        QuickAdd,
        AISettings
    };
})();
