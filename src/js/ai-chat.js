/**
 * ai-chat.js — AI 助手聊天窗口主逻辑
 *
 * 权限：仅查询（只读工具集）。
 * 安全：
 *   - apiKey 仅在 fetch header 中使用，**绝不**写 console.log / BroadcastChannel / DOM
 *   - 用户消息和 AI 回复都用 textContent 渲染（防 XSS）
 *   - 30s 请求超时
 *   - 最多 5 轮 tool calls（防无限循环）
 */

const AIChat = (() => {
    'use strict';

    const SYSTEM_PROMPT = `你是「番茄钟」桌面小组件内置的 AI 助手。

## 能力
- **只读工具**（无需确认）：list_todos、list_completed、get_today_stats、get_pomodoro_settings
- **写工具**（**每次都需用户弹窗确认**）：
  - add_todo / toggle_todo / edit_todo / delete_todo / delete_completed
  - start_pomodoro / stop_pomodoro / update_pomodoro_settings

## 规则
1. 用户问"今天有什么任务"时调 list_todos；问历史/已完成调 list_completed；问"完成多少/今天统计"调 get_today_stats。
2. 用户**明确要写操作**时（添加/删除/勾选/改任务、开始/停止番茄钟、改时长），**直接调对应的写工具**。系统会自动弹原生对话框让用户确认。
3. **不要**为写操作预道歉或要求用户二次确认——你只需要调工具，用户会看到弹窗。
4. 如果用户**拒绝**了（tool result 含 user_denied），告诉用户"好的，已取消"并**不要**再次尝试同一操作。
5. 回答简洁，中文优先，可少量 emoji。

## 例子
- 用户："添加任务：写周报" → 调 add_todo({text: "写周报"})
- 用户："把'开会'勾掉" → 调 toggle_todo({text: "开会"})
- 用户："开始番茄钟" → 调 start_pomodoro()
- 用户："专注改成 30 分钟" → 调 update_pomodoro_settings({focusDuration: 30})
- 用户："今天有什么任务" → 调 list_todos()，根据结果总结
- 用户："我本周完成了什么" → 调 list_completed({days: 7})`;

    const MAX_TOOL_ROUNDS = 5;
    const REQUEST_TIMEOUT_MS = 30000;
    const MAX_HISTORY = 20;

    let messages = [];
    let busy = false;

    // ============================================================
    // DOM refs
    // ============================================================
    let statusEl, messagesEl, inputEl, sendBtn, clearBtn, closeBtn;

    function init() {
        statusEl    = document.getElementById('aiStatus');
        messagesEl  = document.getElementById('aiMessages');
        inputEl     = document.getElementById('aiInput');
        sendBtn     = document.getElementById('aiSend');
        clearBtn    = document.getElementById('aiBtnClear');
        closeBtn    = document.getElementById('aiBtnClose');

        sendBtn.addEventListener('click', onSend);
        inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
            }
        });
        clearBtn.addEventListener('click', () => {
            if (busy) return;
            if (messages.length > 0 && !confirm('清空所有对话？')) return;
            messages = [];
            messagesEl.innerHTML = '';
            setStatus('就绪', 'ok');
        });
        closeBtn.addEventListener('click', () => {
            if (window.electronAPI?.closeAIChat) {
                window.electronAPI.closeAIChat();
            } else {
                window.close();
            }
        });

        // 启动时检查配置
        checkConfig();

        // 关键同步：AI 窗口加载了 todo.js 但没调 Todo.init()，
        // Todo 模块的 in-memory todos 数组初始为 []。
        // 如果 AI 直接调 Todo.addTodo() 会用空数组作为基础，导致
        // Storage.saveTodos([newTodo]) 覆盖整个 storage，旧任务丢失。
        // 解决：先 Todo.reload() 同步数据，再 listenExternal() 订阅主窗口的后续修改。
        if (window.Todo) {
            try {
                if (typeof Todo.reload === 'function') Todo.reload();
                if (typeof Todo.listenExternal === 'function') Todo.listenExternal();
            } catch (e) {
                console.warn('[AI] Todo 同步失败:', e);
            }
        }
    }

    function checkConfig() {
        const config = Storage.loadAIConfig();
        if (!config.enabled) {
            setStatus('AI 未启用 — 在主窗口设置中启用', 'warn');
        } else if (!config.apiKey) {
            setStatus('未配置 API Key — 在主窗口设置中填写', 'warn');
        } else {
            setStatus('就绪', 'ok');
        }
    }

    // ============================================================
    // 发送消息
    // ============================================================

    async function onSend() {
        if (busy) return;
        const text = inputEl.value.trim();
        if (!text) return;

        const config = Storage.loadAIConfig();
        if (!config.enabled) {
            setStatus('AI 未启用 — 在主窗口设置中启用', 'warn');
            return;
        }
        if (!config.apiKey) {
            setStatus('未配置 API Key — 在主窗口设置中填写', 'warn');
            return;
        }

        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendBtn.disabled = true;

        appendMessage('user', text);
        messages.push({ role: 'user', content: text });

        busy = true;
        try {
            await runConversation(config);
        } catch (err) {
            appendMessage('error', `错误: ${err.message || String(err)}`);
            setStatus(`错误: ${err.message || '未知错误'}`, 'err');
        } finally {
            busy = false;
            sendBtn.disabled = false;
            inputEl.focus();
        }
    }

    /**
     * 多轮对话循环：调 API → 收集 tool_calls → 执行 → 再调 API → 直到纯文本回复或达上限
     */
    async function runConversation(config) {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            setStatus(`思考中... (${round + 1}/${MAX_TOOL_ROUNDS})`, 'busy');
            const data = await callAPI(config, messages);
            const msg = data.choices?.[0]?.message;
            if (!msg) {
                throw new Error('API 返回空响应');
            }

            if (msg.tool_calls && msg.tool_calls.length > 0) {
                messages.push(msg);

                for (const tc of msg.tool_calls) {
                    const fnName = tc.function?.name || '?';
                    let args = {};
                    try {
                        args = JSON.parse(tc.function?.arguments || '{}');
                    } catch (e) {
                        args = { _parseError: e.message };
                    }

                    // 写操作会弹原生 confirm 对话框（async），UI 上显示「等待确认」
                    const isWrite = AITools.WRITE_TOOLS.includes(fnName);
                    if (isWrite) {
                        setStatus(`等待用户确认: ${fnName}...`, 'busy');
                    }

                    const resultStr = await AITools.execute(fnName, args, {
                        askUser: askUserConfirm
                    });
                    const display = resultStr.length > 200 ? resultStr.slice(0, 200) + '…' : resultStr;
                    appendMessage('tool', `${fnName} → ${display}`);
                    messages.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        content: resultStr
                    });
                }
                continue;
            }

            // 纯文本回复
            messages.push({ role: 'assistant', content: msg.content || '' });
            appendMessage('assistant', msg.content || '(空回复)');
            setStatus('就绪', 'ok');
            // 限制历史长度
            if (messages.length > MAX_HISTORY) {
                messages = messages.slice(-MAX_HISTORY);
            }
            return;
        }
        setStatus(`达到最大工具调用轮次 (${MAX_TOOL_ROUNDS})`, 'warn');
        appendMessage('warn', `AI 在 ${MAX_TOOL_ROUNDS} 轮工具调用内未给出最终回复。可能是查询太复杂或工具结果有歧义。`);
    }

    /**
     * 通过主进程弹原生 confirm 对话框
     * @returns {Promise<boolean>}
     */
    async function askUserConfirm(title, message, detail, dangerous) {
        if (window.electronAPI?.confirmAIAction) {
            return await window.electronAPI.confirmAIAction({
                title, message, detail, dangerous
            });
        }
        // 降级：浏览器 confirm（Electron BrowserWindow 里可能禁用，所以双保险）
        return window.confirm(`${title}\n\n${message}\n\n${detail || ''}\n\n点击"确定"允许，"取消"拒绝。`);
    }

    /**
     * 调 OpenAI 兼容 chat completions endpoint
     */
    async function callAPI(config, msgs) {
        const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        ...msgs
                    ],
                    tools: AITools.TOOL_DEFINITIONS,
                    tool_choice: 'auto',
                    max_tokens: 2000,
                    temperature: 0.5
                }),
                signal: controller.signal
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
            }
            return await res.json();
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error(`请求超时 (${REQUEST_TIMEOUT_MS / 1000}s)`);
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    // ============================================================
    // 渲染
    // ============================================================

    function appendMessage(role, content) {
        const div = document.createElement('div');
        div.className = `ai-msg ai-msg-${role}`;
        // 用 textContent 防 XSS
        div.textContent = content;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setStatus(text, kind) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = `ai-status ai-status-${kind || 'ok'}`;
    }

    return { init };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', AIChat.init);
} else {
    AIChat.init();
}
