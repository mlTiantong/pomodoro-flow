/**
 * dom-utils.js — DOM/通用工具
 *
 * 统一 HTML 转义、颜色调整、跨模块都会用到的小工具。
 * 之前散落在 app.js / todo.js / month-view.js。
 */

const DomUtils = (() => {
    'use strict';

    /**
     * HTML 转义防 XSS
     * @param {string} text
     * @returns {string}
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 转义 onclick 属性中的单引号
     * @param {string} text
     * @returns {string}
     */
    function escapeAttr(text) {
        return escapeHtml(text).replace(/'/g, "\\'");
    }

    /**
     * 调整 hex 颜色亮度（HSL 最简近似）
     * @param {string} hex - #RRGGBB
     * @param {number} amount - 负数变暗，正数变亮
     * @returns {string} #RRGGBB
     */
    function adjustColor(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
        const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    /**
     * 生成 36 进制时间戳 + 随机串的 ID
     * @returns {string}
     */
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    }

    /**
     * 安全的 JSON.parse，失败或 null 时返回 fallback
     * @param {string} json
     * @param {*} fallback
     * @returns {*}
     */
    function safeParse(json, fallback) {
        try {
            return JSON.parse(json) ?? fallback;
        } catch {
            return fallback;
        }
    }

    return {
        escapeHtml,
        escapeAttr,
        adjustColor,
        generateId,
        safeParse
    };
})();
