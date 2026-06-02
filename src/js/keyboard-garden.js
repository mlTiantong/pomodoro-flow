/**
 * keyboard-garden.js — 键盘植物生长窗口
 */

const KeyboardGarden = (() => {
    'use strict';

    const KEY_LAYOUT = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Enter'],
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Space', 'Backspace', 'Tab']
    ];

    let feed = [];

    function init() {
        FocusActivity.init();
        document.getElementById('gardenBtnClose').addEventListener('click', () => {
            if (window.electronAPI) window.electronAPI.closeKeyboardGarden();
            else window.close();
        });
        document.getElementById('gardenBtnRefresh').addEventListener('click', render);

        try {
            // 专用 channel：只听 focus-activity / 键盘花园的事件
            const bc = new BroadcastChannel('tomato-activity');
            bc.addEventListener('message', onBroadcast);
        } catch(e) {}

        window.addEventListener('storage', (e) => {
            // 只对花园/活动相关的 localStorage key 响应，避免被 todos 操作误触发
            if (e.key && (
                e.key === 'tomato_clock_keyboard_garden' ||
                e.key === 'tomato_clock_focus_activity'
            )) render();
        });

        render();
    }

    function onBroadcast(message) {
        const data = message.data || message;
        if (data.type === 'garden-grow' || data.type === 'garden-harvest') {
            const action = data.type === 'garden-harvest' ? '丰收' : '成长';
            prependFeed(`${data.key} ${action}`, data.type === 'garden-harvest'
                ? `收下金币，累计 ${data.totalHarvests || 0} 次收成`
                : `${data.plant?.presses || 0} 次按压`);
        } else if (data.type === 'activity-input' && data.key) {
            pulseKey(data.key);
        }
        render();
    }

    function render() {
        const garden = Storage.loadKeyboardGarden();
        renderSummary(garden);
        renderBoard(garden);
        renderRanking(garden);
        renderFeed();
    }

    function renderSummary(garden) {
        setText('gardenCoins', String(garden.coins || 0));
        setText('gardenHarvests', String(garden.totalHarvests || 0));
        setText('gardenTotalKeys', compact(garden.totalKeystrokes || 0));
        setText('gardenLevel', `Lv.${garden.level || 1}`);
        setText('gardenLastHarvest', formatRelative(garden.lastHarvestAt));

        const banner = document.getElementById('gardenBanner');
        if (!banner) return;
        if ((garden.totalHarvests || 0) >= 20) {
            banner.textContent = '温室已经进入熟练期，连打会让果实快速成熟。';
        } else if ((garden.totalKeystrokes || 0) >= 100) {
            banner.textContent = '已经形成苗圃节奏，继续打字会带动更多键位开花。';
        } else {
            banner.textContent = '按下任意键，让苗开始长。';
        }
    }

    function renderBoard(garden) {
        const board = document.getElementById('gardenBoard');
        if (!board) return;

        const html = KEY_LAYOUT.flat().map(key => {
            const plant = garden.keys[key] || { growth: 0, harvests: 0, presses: 0, stage: 0 };
            // 单一真理之源：写入和显示都用 FocusActivity.calculateStage，避免阈值不一致
            const stage = window.FocusActivity
                ? window.FocusActivity.calculateStage(plant.growth || 0, plant.harvests || 0)
                : (plant.stage || 0);
            const progress = Math.max(0, Math.min(100, Math.round(plant.growth || 0)));
            const active = Date.now() - new Date(plant.lastPressedAt || 0).getTime() < 900 ? 'active' : '';
            return `
                <div class="garden-key ${active}" data-key="${key}">
                    <div class="garden-key-header">
                        <span class="garden-key-label">${key}</span>
                        <span class="garden-key-count">${compact(plant.presses || 0)}</span>
                    </div>
                    <div class="garden-plant-frame stage-${stage}">
                        ${renderPlantImage(stage)}
                    </div>
                    <div class="garden-progress">
                        <div class="garden-progress-bar" style="width:${progress}%"></div>
                    </div>
                    <div class="garden-footnote">
                        <span>${plant.harvests || 0}收</span>
                        <span>${progress}%</span>
                    </div>
                </div>
            `;
        }).join('');

        board.innerHTML = html;
    }

    // 注：原 getPlantStage 已被删除。
    // 阶段判定统一由 FocusActivity.calculateStage 负责（写入 + 显示共用），
    // 避免历史上写入（growth>80 为果）与显示（growth≥70 为果）的阈值不一致。

    function renderPlantImage(stage) {
        const art = [
            seedArt,
            sproutArt,
            leavesArt,
            flowerArt,
            fruitArt
        ][stage] || seedArt;
        return art();
    }

    function seedArt() {
        return `
            <svg class="plant-art" viewBox="0 0 64 64" aria-hidden="true">
                <ellipse cx="32" cy="50" rx="18" ry="7" fill="#5a3c2d"/>
                <ellipse cx="31" cy="42" rx="8" ry="11" fill="#d2a46c" transform="rotate(18 31 42)"/>
                <path d="M25 41c5 4 9 4 14 0" fill="none" stroke="#fff1c0" stroke-width="2" stroke-linecap="round" opacity=".45"/>
            </svg>
        `;
    }

    function sproutArt() {
        return `
            <svg class="plant-art" viewBox="0 0 64 64" aria-hidden="true">
                <ellipse cx="32" cy="51" rx="19" ry="7" fill="#5a3c2d"/>
                <path d="M32 49C31 38 33 31 36 24" fill="none" stroke="#6fcf78" stroke-width="4" stroke-linecap="round"/>
                <path d="M34 30c-8-1-13-5-15-11 9-1 15 2 18 9z" fill="#84df86"/>
                <path d="M36 26c6-5 12-6 18-3-4 6-10 8-17 6z" fill="#57bd6a"/>
            </svg>
        `;
    }

    function leavesArt() {
        return `
            <svg class="plant-art" viewBox="0 0 64 64" aria-hidden="true">
                <ellipse cx="32" cy="52" rx="19" ry="7" fill="#5a3c2d"/>
                <path d="M32 50V21" fill="none" stroke="#59bd68" stroke-width="5" stroke-linecap="round"/>
                <path d="M31 35C19 34 12 27 10 16c12 0 21 6 24 16z" fill="#7bdc7d"/>
                <path d="M35 31c10-8 19-9 27-3-6 9-15 11-27 8z" fill="#44b76b"/>
                <path d="M32 24c-8-7-10-14-7-21 8 4 12 10 11 20z" fill="#9aea8c"/>
            </svg>
        `;
    }

    function flowerArt() {
        return `
            <svg class="plant-art" viewBox="0 0 64 64" aria-hidden="true">
                <ellipse cx="32" cy="52" rx="19" ry="7" fill="#5a3c2d"/>
                <path d="M32 50V26" fill="none" stroke="#55b964" stroke-width="5" stroke-linecap="round"/>
                <path d="M30 39c-10 0-17-5-20-13 10-2 19 2 23 10z" fill="#70d878"/>
                <path d="M36 36c8-7 16-8 22-4-4 8-12 11-22 8z" fill="#43b866"/>
                <circle cx="32" cy="20" r="6" fill="#ffd66e"/>
                <circle cx="25" cy="20" r="7" fill="#ff91b6"/>
                <circle cx="39" cy="20" r="7" fill="#ff91b6"/>
                <circle cx="32" cy="13" r="7" fill="#ffa7c7"/>
                <circle cx="32" cy="27" r="7" fill="#ff7fb0"/>
                <circle cx="32" cy="20" r="4" fill="#ffe48a"/>
            </svg>
        `;
    }

    function fruitArt() {
        return `
            <svg class="plant-art" viewBox="0 0 64 64" aria-hidden="true">
                <ellipse cx="32" cy="52" rx="19" ry="7" fill="#5a3c2d"/>
                <path d="M32 50V23" fill="none" stroke="#50b360" stroke-width="5" stroke-linecap="round"/>
                <path d="M30 38c-10 0-17-5-20-13 10-2 19 2 23 10z" fill="#77db7e"/>
                <path d="M36 35c8-7 16-8 22-4-4 8-12 11-22 8z" fill="#43b866"/>
                <path d="M31 19c3-5 7-7 12-7-1 5-4 8-10 9z" fill="#8dde7c"/>
                <circle cx="28" cy="22" r="8" fill="#f6c453"/>
                <circle cx="41" cy="30" r="7" fill="#ff9b55"/>
                <circle cx="26" cy="36" r="6" fill="#ffcf68"/>
                <circle cx="25" cy="19" r="2" fill="#fff3b3" opacity=".8"/>
                <circle cx="39" cy="28" r="2" fill="#fff3b3" opacity=".7"/>
            </svg>
        `;
    }

    function renderRanking(garden) {
        const ranking = document.getElementById('gardenRanking');
        if (!ranking) return;
        const items = Object.entries(garden.keys || {})
            .sort((a, b) => ((b[1].harvests || 0) * 1000 + (b[1].presses || 0)) - ((a[1].harvests || 0) * 1000 + (a[1].presses || 0)))
            .slice(0, 6);

        if (!items.length) {
            ranking.innerHTML = '<div class="garden-empty">还没有键位种出成果。</div>';
            return;
        }

        ranking.innerHTML = items.map(([key, plant], idx) => `
            <div class="garden-rank-item">
                <div class="garden-rank-main">
                    <div class="garden-rank-title">#${idx + 1} ${key}</div>
                    <div class="garden-rank-sub">${compact(plant.presses || 0)} 次按压 · ${plant.harvests || 0} 次收成</div>
                </div>
                <div class="garden-rank-value">${Math.round(plant.growth || 0)}%</div>
            </div>
        `).join('');
    }

    function renderFeed() {
        const container = document.getElementById('gardenFeed');
        if (!container) return;
        if (!feed.length) {
            container.innerHTML = '<div class="garden-empty">按键、丰收和成长消息会出现在这里。</div>';
            return;
        }

        container.innerHTML = feed.map(item => `
            <div class="garden-feed-item">
                <div class="garden-feed-main">
                    <div class="garden-feed-title">${DomUtils.escapeHtml(item.title)}</div>
                    <div class="garden-feed-sub">${DomUtils.escapeHtml(item.subtitle)}</div>
                </div>
                <div class="garden-feed-value">${item.time}</div>
            </div>
        `).join('');
    }

    function prependFeed(title, subtitle) {
        feed.unshift({
            title,
            subtitle,
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        });
        feed = feed.slice(0, 12);
    }

    function pulseKey(key) {
        const el = document.querySelector(`.garden-key[data-key="${CSS.escape(key)}"]`);
        if (!el) return;
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 700);
    }

    function compact(value) {
        const num = Number(value) || 0;
        if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
        return String(num);
    }

    function formatRelative(iso) {
        if (!iso) return '暂无';
        const diff = Date.now() - new Date(iso).getTime();
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.round(diff / 60000)} 分钟前`;
        if (diff < 86400000) return `${Math.round(diff / 3600000)} 小时前`;
        return `${Math.round(diff / 86400000)} 天前`;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    return { init, render };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', KeyboardGarden.init);
} else {
    KeyboardGarden.init();
}
