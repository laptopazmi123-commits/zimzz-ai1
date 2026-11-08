let sessions = JSON.parse(localStorage.getItem('nexus_sessions') || '[]');
let currentSessionId = null;
let isStreaming = false;
let reasoningMode = false;

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function saveSessions() { localStorage.setItem('nexus_sessions', JSON.stringify(sessions)); renderSidebar(); }
function getCurrentSession() { return sessions.find(s => s.id === currentSessionId); }
function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => `<pre><code>${code.trim()}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return html.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '').join('');
}
function renderSidebar() {
    const list = document.getElementById('session-list');
    list.innerHTML = '';
    sessions.forEach(s => {
        const div = document.createElement('div');
        div.className = `session-item ${s.id === currentSessionId ? 'active' : ''}`;
        div.innerHTML = `<span>${s.title || 'Percakapan'}</span><span class="del-btn">✕</span>`;
        div.onclick = () => switchSession(s.id);
        div.querySelector('.del-btn').onclick = (e) => { e.stopPropagation(); deleteSession(s.id); };
        list.appendChild(div);
    });
}
function newSession() {
    const id = generateId();
    sessions.unshift({ id, title: 'Percakapan Baru', messages: [] });
    currentSessionId = id; saveSessions(); renderChat();
    document.getElementById('chat-title').textContent = 'Percakapan Baru';
    document.getElementById('user-input').focus();
}
function switchSession(id) {
    currentSessionId = id; renderSidebar(); renderChat();
    const s = getCurrentSession();
    document.getElementById('chat-title').textContent = s?.title || 'Percakapan';
}
function deleteSession(id) {
    if (!confirm('Hapus?')) return;
    sessions = sessions.filter(s => s.id !== id);
    if (currentSessionId === id) { currentSessionId = sessions[0]?.id || null; if (!currentSessionId) { newSession(); return; } }
    saveSessions(); renderChat();
}
function toggleReasoning() { reasoningMode = !reasoningMode; document.getElementById('reasoning-toggle').classList.toggle('active', reasoningMode); }
function renderChat() {
    const box = document.getElementById('chat-box'); box.innerHTML = '';
    const session = getCurrentSession();
    if (!session || session.messages.length === 0) { box.innerHTML = '<div style="text-align:center; margin-top:40px; color:#666;">Mulai obrolan...</div>'; return; }
    session.messages.forEach(msg => {
        if (msg.role === 'user') { addMessageToDOM('user', msg.content); }
        else if (msg.role === 'assistant') {
            const wrapper = addMessageToDOM('ai', '');
            if (msg.reasoning) { const det = document.createElement('details'); det.innerHTML = `<summary>Berpikir...</summary><pre>${escapeHtml(msg.reasoning)}</pre>`; wrapper.querySelector('.bubble').before(det); }
            wrapper.querySelector('.bubble').innerHTML = renderMarkdown(msg.content);
        }
    });
    box.scrollTop = box.scrollHeight;
}
function addMessageToDOM(role, text) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div'); div.className = `msg ${role}`;
    div.innerHTML = `<div class="avatar">${role === 'user' ? 'U' : '✦'}</div><div class="msg-content"><div class="bubble">${role === 'user' ? escapeHtml(text) : text}</div></div>`;
    box.appendChild(div); box.scrollTop = box.scrollHeight; return div;
}
async function sendMessage() {
    const input = document.getElementById('user-input');
    const text = input.value.trim(); if (!text || isStreaming) return;
    let session = getCurrentSession(); if (!session) { newSession(); session = getCurrentSession(); }
    addMessageToDOM('user', text); session.messages.push({ role: 'user', content: text });
    if (session.messages.length === 1) { session.title = text.slice(0, 40) + '...'; document.getElementById('chat-title').textContent = session.title; saveSessions(); }
    input.value = ''; input.style.height = '40px'; document.getElementById('send-btn').disabled = true; isStreaming = true;
    const aiWrapper = addMessageToDOM('ai', ''); const bubble = aiWrapper.querySelector('.bubble');
    bubble.innerHTML = '<span>...</span>';
    try {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: session.messages, reasoning: reasoningMode }) });
        if (!response.ok) throw new Error('Server Error');
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '', fullContent = '';
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const dataStr = line.slice(6); if (dataStr === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(dataStr);
                    if (parsed.type === 'content') { fullContent += parsed.content; bubble.innerHTML = renderMarkdown(fullContent); }
                } catch (e) {}
            }
            document.getElementById('chat-box').scrollTop = document.getElementById('chat-box').scrollHeight;
        }
        session.messages.push({ role: 'assistant', content: fullContent }); saveSessions();
    } catch (err) { bubble.innerHTML = `<span style="color:red">Error: ${err.message}</span>`; }
    finally { isStreaming = false; document.getElementById('send-btn').disabled = false; input.focus(); }
}
(function init() { if (sessions.length === 0) { newSession(); } else { currentSessionId = sessions[0].id; renderSidebar(); renderChat(); document.getElementById('chat-title').textContent = sessions[0].title; } })();
