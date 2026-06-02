/**
 * date-utils.js — 日期工具函数
 *
 * 统一管理所有 YYYY-MM-DD 格式日期处理、日期加减、显示格式化。
 * 之前散落在 storage.js / todo.js / app.js / month-view.js 各一份。
 *
 * 用法：先加载此文件，再 <script src="..."> 其他模块。
 */

const DateUtils = (() => {
    'use strict';

    const WEEKDAY_LABELS_SHORT = ['日', '一', '二', '三', '四', '五', '六'];
    const WEEKDAY_LABELS_LONG  = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    /**
     * 返回本地时间的今天日期字符串 (YYYY-MM-DD)
     * @returns {string}
     */
    function getTodayString() {
        const now = new Date();
        return formatDate(now);
    }

    /**
     * 把 Date 对象格式化为 YYYY-MM-DD（本地时间）
     * @param {Date} date
     * @returns {string}
     */
    function formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * 把 YYYY-MM-DD 偏移 n 天（本地时间构造，避免时区问题）
     * @param {string} dateStr - YYYY-MM-DD
     * @param {number} offset - 天数偏移
     * @returns {string}
     */
    function shiftDate(dateStr, offset) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        date.setDate(date.getDate() + offset);
        return formatDate(date);
    }

    /**
     * 在 YYYY-MM-DD 字符串上找该周的周一，返回 Date
     * @param {Date} date
     * @returns {Date}
     */
    function getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     * 显示用的日期：今天显示「(今天)」，其他显示「(周X)」
     * @param {string} dateStr - YYYY-MM-DD
     * @returns {string}
     */
    function formatDisplayDate(dateStr) {
        const [y, m, d] = dateStr.split('-');
        const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        const wd = WEEKDAY_LABELS_SHORT[date.getDay()];
        const today = getTodayString();
        if (dateStr === today) return `${y}-${m}-${d} (今天)`;
        return `${y}-${m}-${d} (周${wd})`;
    }

    /**
     * 周视图用的标题：5月25日 周一 — 5月31日 周日
     * @param {Date} start
     * @param {Date} end
     * @returns {string}
     */
    function formatWeekRange(start, end) {
        return `${start.getMonth() + 1}月${start.getDate()}日 ${WEEKDAY_LABELS_LONG[start.getDay()]} — ${end.getMonth() + 1}月${end.getDate()}日 ${WEEKDAY_LABELS_LONG[end.getDay()]}`;
    }

    return {
        getTodayString,
        formatDate,
        shiftDate,
        getWeekStart,
        formatDisplayDate,
        formatWeekRange,
        WEEKDAY_LABELS_SHORT,
        WEEKDAY_LABELS_LONG
    };
})();
