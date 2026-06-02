/**
 * keyboard-garden.js — 键盘植物花园 v2（参考图深度重做）
 *
 * 5 种植物 × 5 阶段 = 25 个 SVG 工厂
 * 5 种格子内点缀（蘑菇/石头/小花/草/虫）按字母 hash 分配
 * 2 种格子底色（土/水）按植物种类分配
 *
 * 视觉层次：装饰层（z:1）→ 主键盘（z:5）→ 动物层（z:20）→ 前景栅栏（z:50）
 */

const KeyboardGarden = (() => {
    'use strict';

    const KEY_LAYOUT = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Enter'],
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Space', 'Backspace', 'Tab']
    ];

    const PLANT_TYPES = ['tomato', 'sunflower', 'corn', 'apple', 'lotus'];
    const DECOR_TYPES = [
        { icon: '🍄', name: 'mushroom' },
        { icon: '🪨', name: 'rock' },
        { icon: '🌼', name: 'flower' },
        { icon: '🌿', name: 'grass' },
        { icon: '🐛', name: 'bug' }
    ];
    const DECOR_POSITIONS = ['top-left', 'top-right', 'bot-left'];

    // ============================================================
    // 字母 → 植物种类 / 点缀 / 位置（按 hash 决定，稳定不变）
    // ============================================================

    function hash(key) {
        let h = 0;
        for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        return h;
    }

    function getPlantType(key) {
        return PLANT_TYPES[hash(key) % PLANT_TYPES.length];
    }

    function getKeyDecor(key) {
        const h = hash(key + 'd');
        return {
            type: DECOR_TYPES[h % DECOR_TYPES.length],
            position: DECOR_POSITIONS[(h >> 3) % DECOR_POSITIONS.length]
        };
    }

    function getKeyBgClass(type) {
        return type === 'lotus' ? 'type-water' : 'type-soil';
    }

    // ============================================================
    // SVG 工厂（5 种植物 × 5 阶段 = 25 个）
    // ============================================================

    const SVG = {
        dirt: () => `<ellipse cx="32" cy="56" rx="20" ry="6" fill="#5a3c2d"/>`,
        water: () => `<ellipse cx="32" cy="58" rx="22" ry="5" fill="#5b8db8"/>
                      <ellipse cx="32" cy="56" rx="22" ry="2" fill="#7eb0d8" opacity="0.6"/>`,

        // 番茄
        tomato_seed: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <ellipse cx="32" cy="44" rx="8" ry="11" fill="#d4a574" transform="rotate(18 32 44)"/>
            <path d="M25 41c5 4 9 4 14 0" fill="none" stroke="#fff" stroke-width="1.5" opacity=".4"/></svg>`,
        tomato_sprout: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V32" stroke="#6fcf78" stroke-width="3" stroke-linecap="round"/>
            <ellipse cx="25" cy="34" rx="5" ry="3" fill="#84df86" transform="rotate(-20 25 34)"/>
            <ellipse cx="39" cy="34" rx="5" ry="3" fill="#84df86" transform="rotate(20 39 34)"/></svg>`,
        tomato_leaves: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V22" stroke="#6fcf78" stroke-width="3"/>
            <path d="M28 38c-8-2-12-8-10-15 8 0 14 4 14 12z" fill="#84df86"/>
            <path d="M36 32c8-3 14-9 12-18-8 0-16 6-14 14z" fill="#6fcf78"/>
            <path d="M32 24c-6-4-10-10-7-18 6 0 11 6 10 14z" fill="#9aea8c"/></svg>`,
        tomato_flower: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V32" stroke="#6fcf78" stroke-width="3"/>
            <path d="M28 40c-7-2-11-7-9-13 7 0 12 4 12 11z" fill="#84df86"/>
            <path d="M36 36c7-3 12-8 10-16-7 0-14 6-12 13z" fill="#6fcf78"/>
            <circle cx="32" cy="20" r="6" fill="#ffd66e"/>
            <circle cx="25" cy="20" r="7" fill="#ffaa00"/>
            <circle cx="39" cy="20" r="7" fill="#ffaa00"/>
            <circle cx="32" cy="13" r="7" fill="#ffaa00"/>
            <circle cx="32" cy="27" r="7" fill="#ffaa00"/>
            <circle cx="32" cy="20" r="4" fill="#fff8b0"/></svg>`,
        tomato_fruit: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V36" stroke="#6fcf78" stroke-width="3"/>
            <path d="M28 42c-6-2-10-6-8-12 6 0 11 4 11 10z" fill="#84df86"/>
            <path d="M36 38c6-2 11-7 9-15-6 0-13 6-11 12z" fill="#6fcf78"/>
            <circle cx="28" cy="30" r="7" fill="#ff3030"/>
            <circle cx="38" cy="32" r="6" fill="#ff4444"/>
            <circle cx="32" cy="40" r="5" fill="#ff2020"/>
            <ellipse cx="26" cy="28" rx="2" ry="1.5" fill="#ffaaaa"/>
            <path d="M30 22c2-2 4-2 6 0" fill="#6fcf78"/></svg>`,

        // 向日葵
        sunflower_seed: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <ellipse cx="32" cy="46" rx="7" ry="9" fill="#c8956d" transform="rotate(-15 32 46)"/></svg>`,
        sunflower_sprout: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V34" stroke="#6fcf78" stroke-width="3"/>
            <ellipse cx="26" cy="36" rx="4" ry="2.5" fill="#84df86" transform="rotate(-25 26 36)"/>
            <ellipse cx="38" cy="36" rx="4" ry="2.5" fill="#84df86" transform="rotate(25 38 36)"/></svg>`,
        sunflower_leaves: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V24" stroke="#6fcf78" stroke-width="3"/>
            <path d="M28 38c-9-2-13-9-11-17 9 0 15 5 15 13z" fill="#84df86"/>
            <path d="M36 32c9-2 15-9 13-19-9 0-17 7-15 15z" fill="#6fcf78"/>
            <path d="M32 26c-7-3-11-9-8-18 7 0 12 7 11 16z" fill="#9aea8c"/></svg>`,
        sunflower_flower: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V38" stroke="#6fcf78" stroke-width="3"/>
            <path d="M28 42c-7-2-11-7-9-14 7 0 12 4 12 12z" fill="#84df86"/>
            <path d="M36 40c7-2 12-7 10-15-7 0-14 6-12 13z" fill="#6fcf78"/>
            <ellipse cx="32" cy="22" rx="3" ry="5" fill="#ffaa00"/>
            <ellipse cx="32" cy="38" rx="3" ry="5" fill="#ffaa00"/>
            <ellipse cx="16" cy="22" rx="5" ry="3" fill="#ffaa00"/>
            <ellipse cx="48" cy="22" rx="5" ry="3" fill="#ffaa00"/>
            <ellipse cx="20" cy="10" rx="4" ry="3" fill="#ffaa00" transform="rotate(-45 20 10)"/>
            <ellipse cx="44" cy="10" rx="4" ry="3" fill="#ffaa00" transform="rotate(45 44 10)"/>
            <ellipse cx="20" cy="34" rx="4" ry="3" fill="#ffaa00" transform="rotate(45 20 34)"/>
            <ellipse cx="44" cy="34" rx="4" ry="3" fill="#ffaa00" transform="rotate(-45 44 34)"/>
            <circle cx="32" cy="22" r="8" fill="#8b5e3c"/>
            <circle cx="30" cy="20" r="1.5" fill="#5e3a1e"/>
            <circle cx="34" cy="22" r="1.5" fill="#5e3a1e"/>
            <circle cx="32" cy="24" r="1.5" fill="#5e3a1e"/></svg>`,
        sunflower_fruit: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V40" stroke="#6fcf78" stroke-width="3"/>
            <path d="M28 44c-6-2-10-6-8-13 6 0 11 4 11 11z" fill="#84df86"/>
            <path d="M36 42c6-2 11-6 9-14-6 0-13 6-11 12z" fill="#6fcf78"/>
            <ellipse cx="32" cy="22" rx="3" ry="4" fill="#5e3a1e"/>
            <ellipse cx="32" cy="14" rx="3" ry="4" fill="#ffaa00"/>
            <ellipse cx="32" cy="30" rx="3" ry="4" fill="#ffaa00"/>
            <ellipse cx="22" cy="18" rx="4" ry="3" fill="#ffaa00" transform="rotate(-60 22 18)"/>
            <ellipse cx="42" cy="18" rx="4" ry="3" fill="#ffaa00" transform="rotate(60 42 18)"/>
            <ellipse cx="22" cy="26" rx="4" ry="3" fill="#ffaa00" transform="rotate(60 22 26)"/>
            <ellipse cx="42" cy="26" rx="4" ry="3" fill="#ffaa00" transform="rotate(-60 42 26)"/>
            <circle cx="32" cy="22" r="6" fill="#6b3e1e"/></svg>`,

        // 玉米
        corn_seed: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <ellipse cx="32" cy="46" rx="6" ry="8" fill="#fff8b0" transform="rotate(20 32 46)"/></svg>`,
        corn_sprout: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V36" stroke="#6fcf78" stroke-width="3"/>
            <path d="M26 38l-4-6 6-2z" fill="#84df86"/>
            <path d="M38 38l4-6-6-2z" fill="#84df86"/></svg>`,
        corn_leaves: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V22" stroke="#6fcf78" stroke-width="3"/>
            <path d="M22 36c-6-2-8-8-4-14 5 0 8 4 8 10z" fill="#84df86"/>
            <path d="M42 32c6-2 8-8 4-16-5 0-8 6-8 12z" fill="#6fcf78"/>
            <path d="M32 24c-4-3-6-8-3-14 4 0 7 5 6 11z" fill="#9aea8c"/></svg>`,
        corn_flower: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V22" stroke="#6fcf78" stroke-width="3"/>
            <path d="M22 38c-6-2-8-8-4-14 5 0 8 4 8 10z" fill="#84df86"/>
            <path d="M42 36c6-2 9-7 5-15-5 0-9 5-9 12z" fill="#6fcf78"/>
            <ellipse cx="32" cy="30" rx="5" ry="11" fill="#ffaa00"/>
            <ellipse cx="28" cy="20" rx="3" ry="5" fill="#6fcf78" transform="rotate(-25 28 20)"/>
            <ellipse cx="36" cy="20" rx="3" ry="5" fill="#6fcf78" transform="rotate(25 36 20)"/>
            <circle cx="29" cy="26" r="1.2" fill="#ffe48a"/>
            <circle cx="35" cy="28" r="1.2" fill="#ffe48a"/>
            <circle cx="29" cy="32" r="1.2" fill="#ffe48a"/>
            <circle cx="35" cy="34" r="1.2" fill="#ffe48a"/></svg>`,
        corn_fruit: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V22" stroke="#6fcf78" stroke-width="3"/>
            <path d="M22 40c-5-2-7-7-3-12 4 0 7 4 7 9z" fill="#84df86"/>
            <path d="M42 38c5-2 8-6 4-13-4 0-8 5-8 11z" fill="#6fcf78"/>
            <ellipse cx="32" cy="30" rx="6" ry="13" fill="#ffd700"/>
            <ellipse cx="28" cy="20" rx="3" ry="6" fill="#6fcf78" transform="rotate(-25 28 20)"/>
            <ellipse cx="36" cy="20" rx="3" ry="6" fill="#6fcf78" transform="rotate(25 36 20)"/>
            <ellipse cx="22" cy="32" rx="3" ry="6" fill="#6fcf78" transform="rotate(60 22 32)"/>
            <ellipse cx="42" cy="32" rx="3" ry="6" fill="#6fcf78" transform="rotate(-60 42 32)"/>
            <circle cx="30" cy="24" r="1.2" fill="#ffaa00"/>
            <circle cx="34" cy="28" r="1.2" fill="#ffaa00"/>
            <circle cx="30" cy="32" r="1.2" fill="#ffaa00"/>
            <circle cx="34" cy="36" r="1.2" fill="#ffaa00"/>
            <circle cx="30" cy="40" r="1.2" fill="#ffaa00"/></svg>`,

        // 苹果
        apple_seed: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <ellipse cx="32" cy="46" rx="6" ry="8" fill="#a87850" transform="rotate(-10 32 46)"/></svg>`,
        apple_sprout: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V36" stroke="#6b3e1e" stroke-width="3"/>
            <ellipse cx="26" cy="36" rx="4" ry="2.5" fill="#84df86" transform="rotate(-20 26 36)"/>
            <ellipse cx="38" cy="38" rx="4" ry="2.5" fill="#84df86" transform="rotate(20 38 38)"/></svg>`,
        apple_leaves: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V22" stroke="#6b3e1e" stroke-width="3"/>
            <path d="M24 38c-6-2-8-8-4-14 5 0 8 4 8 10z" fill="#84df86"/>
            <path d="M40 32c6-2 8-8 4-16-5 0-8 6-8 12z" fill="#6fcf78"/>
            <path d="M32 24c-4-3-6-8-3-14 4 0 7 5 6 11z" fill="#9aea8c"/></svg>`,
        apple_flower: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V24" stroke="#6b3e1e" stroke-width="3"/>
            <path d="M24 40c-6-2-8-8-4-14 5 0 8 4 8 10z" fill="#84df86"/>
            <path d="M40 36c6-2 8-8 4-15-5 0-8 5-8 12z" fill="#6fcf78"/>
            <circle cx="32" cy="22" r="5" fill="#ff91b6"/>
            <circle cx="27" cy="22" r="4" fill="#ffb0c8"/>
            <circle cx="37" cy="22" r="4" fill="#ffb0c8"/>
            <circle cx="32" cy="17" r="4" fill="#ffb0c8"/>
            <circle cx="32" cy="27" r="4" fill="#ffb0c8"/>
            <circle cx="32" cy="22" r="2" fill="#ffe48a"/></svg>`,
        apple_fruit: () => `<svg viewBox="0 0 64 64">${SVG.dirt()}
            <path d="M32 54V32" stroke="#6b3e1e" stroke-width="3"/>
            <path d="M24 42c-5-2-7-7-3-12 4 0 7 4 7 9z" fill="#84df86"/>
            <path d="M40 38c5-2 8-7 4-14-4 0-8 5-8 11z" fill="#6fcf78"/>
            <path d="M32 26c1-3 2-5 4-6" stroke="#5e3a1e" stroke-width="2" fill="none"/>
            <ellipse cx="34" cy="22" rx="3" ry="1.5" fill="#6fcf78" transform="rotate(-30 34 22)"/>
            <circle cx="28" cy="34" r="7" fill="#ff3030"/>
            <circle cx="36" cy="34" r="6" fill="#ff4040"/>
            <ellipse cx="26" cy="32" rx="1.5" ry="1" fill="#ffaaaa"/></svg>`,

        // 莲花
        lotus_seed: () => `<svg viewBox="0 0 64 64">${SVG.water()}
            <ellipse cx="32" cy="48" rx="5" ry="7" fill="#a87850" opacity="0.8"/></svg>`,
        lotus_sprout: () => `<svg viewBox="0 0 64 64">${SVG.water()}
            <ellipse cx="32" cy="50" rx="20" ry="3" fill="#6fcf78"/>
            <ellipse cx="20" cy="52" rx="6" ry="2" fill="#6fcf78"/>
            <ellipse cx="44" cy="52" rx="6" ry="2" fill="#6fcf78"/>
            <circle cx="32" cy="44" r="2" fill="#84df86"/></svg>`,
        lotus_leaves: () => `<svg viewBox="0 0 64 64">${SVG.water()}
            <ellipse cx="32" cy="50" rx="22" ry="3" fill="#84df86"/>
            <ellipse cx="20" cy="52" rx="7" ry="2" fill="#6fcf78"/>
            <ellipse cx="44" cy="52" rx="7" ry="2" fill="#6fcf78"/>
            <path d="M32 50V20" stroke="#6fcf78" stroke-width="3"/>
            <ellipse cx="32" cy="22" rx="10" ry="4" fill="#6fcf78"/></svg>`,
        lotus_flower: () => `<svg viewBox="0 0 64 64">${SVG.water()}
            <ellipse cx="32" cy="50" rx="22" ry="3" fill="#84df86"/>
            <path d="M32 50V22" stroke="#6fcf78" stroke-width="3"/>
            <ellipse cx="32" cy="22" rx="10" ry="4" fill="#6fcf78"/>
            <ellipse cx="32" cy="18" rx="3" ry="6" fill="#ffb0c8"/></svg>`,
        lotus_fruit: () => `<svg viewBox="0 0 64 64">${SVG.water()}
            <ellipse cx="32" cy="50" rx="22" ry="3" fill="#84df86"/>
            <path d="M32 50V24" stroke="#6fcf78" stroke-width="3"/>
            <ellipse cx="32" cy="22" rx="10" ry="3" fill="#6fcf78"/>
            <ellipse cx="32" cy="16" rx="3" ry="5" fill="#ffb0c8"/>
            <ellipse cx="28" cy="17" rx="3" ry="5" fill="#ff91b6" transform="rotate(-30 28 17)"/>
            <ellipse cx="36" cy="17" rx="3" ry="5" fill="#ff91b6" transform="rotate(30 36 17)"/>
            <ellipse cx="25" cy="20" rx="3" ry="5" fill="#ff7fb0" transform="rotate(-60 25 20)"/>
            <ellipse cx="39" cy="20" rx="3" ry="5" fill="#ff7fb0" transform="rotate(60 39 20)"/>
            <circle cx="32" cy="18" r="2" fill="#ffe48a"/></svg>`
    };

    const STAGE_KEYS = ['seed', 'sprout', 'leaves', 'flower', 'fruit'];

    function renderPlantSvg(type, stage) {
        const fn = SVG[`${type}_${STAGE_KEYS[stage]}`];
        return fn ? fn() : SVG.tomato_seed();
    }

    // ============================================================
    // DOM refs
    // ============================================================
    let coinsEl, harvestsEl, totalKeysEl, levelEl, lastHarvestEl;
    let bannerEl, boardEl, rankingEl, feedEl, sidePanelEl;
    let feed = [];

    function init() {
        FocusActivity.init();
        coinsEl       = document.getElementById('gardenCoins');
        harvestsEl    = document.getElementById('gardenHarvests');
        totalKeysEl   = document.getElementById('gardenTotalKeys');
        levelEl       = document.getElementById('gardenLevel');
        lastHarvestEl = document.getElementById('gardenLastHarvest');
        bannerEl      = document.getElementById('gardenBanner');
        boardEl       = document.getElementById('gardenBoard');
        rankingEl     = document.getElementById('gardenRanking');
        feedEl        = document.getElementById('gardenFeed');
        sidePanelEl   = document.getElementById('gardenSidePanel');

        document.getElementById('gardenBtnRefresh').addEventListener('click', render);
        document.getElementById('gardenBtnClose').addEventListener('click', () => {
            if (window.electronAPI?.closeKeyboardGarden) window.electronAPI.closeKeyboardGarden();
            else window.close();
        });
        document.getElementById('gardenBtnStats').addEventListener('click', () => {
            sidePanelEl.hidden = !sidePanelEl.hidden;
            if (!sidePanelEl.hidden) render();
        });
        document.getElementById('gardenSideClose').addEventListener('click', () => {
            sidePanelEl.hidden = true;
        });

        try {
            const bc = new BroadcastChannel('tomato-activity');
            bc.addEventListener('message', onBroadcast);
        } catch(e) {}
        window.addEventListener('storage', (e) => {
            if (e.key && (e.key === 'tomato_clock_keyboard_garden' || e.key === 'tomato_clock_focus_activity')) {
                render();
            }
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
        setText(coinsEl, String(garden.coins || 0));
        setText(harvestsEl, String(garden.totalHarvests || 0));
        setText(totalKeysEl, compact(garden.totalKeystrokes || 0));
        setText(levelEl, `Lv.${garden.level || 1}`);
        setText(lastHarvestEl, formatRelative(garden.lastHarvestAt));

        if (bannerEl) {
            if ((garden.totalHarvests || 0) >= 20) {
                bannerEl.textContent = '温室已经进入熟练期，连打会让果实快速成熟。';
            } else if ((garden.totalKeystrokes || 0) >= 100) {
                bannerEl.textContent = '已经形成苗圃节奏，继续打字会带动更多键位开花。';
            } else {
                bannerEl.textContent = '按下任意键，让苗开始长。';
            }
        }
    }

    function renderBoard(garden) {
        if (!boardEl) return;

        const html = KEY_LAYOUT.flat().map(key => {
            const plant = garden.keys[key] || { growth: 0, harvests: 0, presses: 0, stage: 0 };
            const stage = window.FocusActivity
                ? FocusActivity.calculateStage(plant.growth || 0, plant.harvests || 0)
                : (plant.stage || 0);
            const progress = Math.max(0, Math.min(100, Math.round(plant.growth || 0)));
            const active = Date.now() - new Date(plant.lastPressedAt || 0).getTime() < 900 ? 'active' : '';
            const type = getPlantType(key);
            const decor = getKeyDecor(key);
            const bgClass = getKeyBgClass(type);
            const harvests = plant.harvests || 0;

            return `
                <div class="garden-key stage-${stage} ${bgClass} ${active}" data-key="${key}">
                    <span class="garden-key-label">${key}</span>
                    <div class="garden-key-plant">${renderPlantSvg(type, stage)}</div>
                    <div class="garden-key-decor ${decor.position}" data-decor="${decor.type.name}">${decor.type.icon}</div>
                    <div class="garden-key-progress"><div class="garden-key-progress-fill" style="width:${progress}%"></div></div>
                    <div class="garden-key-harvest">
                        <span class="garden-key-harvest-icon">${harvests > 0 ? '🌾' : '·'}</span>${harvests}
                    </div>
                </div>
            `;
        }).join('');

        boardEl.innerHTML = html;
    }

    function renderRanking(garden) {
        if (!rankingEl) return;
        const items = Object.entries(garden.keys || {})
            .sort((a, b) => ((b[1].harvests || 0) * 1000 + (b[1].presses || 0)) - ((a[1].harvests || 0) * 1000 + (a[1].presses || 0)))
            .slice(0, 6);

        if (!items.length) {
            rankingEl.innerHTML = '<div class="garden-empty">还没有键位种出成果。</div>';
            return;
        }

        rankingEl.innerHTML = items.map(([key, plant], idx) => `
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
        if (!feedEl) return;
        if (!feed.length) {
            feedEl.innerHTML = '<div class="garden-empty">按键、丰收和成长消息会出现在这里。</div>';
            return;
        }

        feedEl.innerHTML = feed.map(item => `
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

    function setText(el, value) {
        if (el) el.textContent = value;
    }

    return { init, render };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', KeyboardGarden.init);
} else {
    KeyboardGarden.init();
}
