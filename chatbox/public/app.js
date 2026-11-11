const $ = (id) => document.getElementById(id);
const messages = $('messages');
const input = $('input');
const composer = $('composer');
const send = $('send');
const typing = $('typing');
const status = $('status');

let history = [];

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function add(role, text, time = now()) {
  if (!text) return;
  history.push({ role, text, time });
  render();
}

function render() {
  messages.innerHTML = '';
  if (!history.length) {
    const hi = document.createElement('div');
    hi.className = 'sys';
    hi.textContent = '本地私聊通道已连接。她以为自己在和管理员私聊。';
    messages.appendChild(hi);
    return;
  }
  for (const item of history) {
    const row = document.createElement('div');
    row.className = `row ${item.role === 'me' ? 'me' : 'bot'}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = item.text;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${item.role === 'me' ? 'Master' : '波旁'} · ${item.time}`;
    const wrap = document.createElement('div');
    wrap.appendChild(bubble);
    wrap.appendChild(meta);
    row.appendChild(wrap);
    messages.appendChild(row);
  }
  messages.scrollTop = messages.scrollHeight;
}

async function sendText() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  input.classList.remove('scroll');
  add('me', text);
  send.disabled = true;
  input.disabled = true;
  typing.hidden = false;
  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (data.silent) {
      const sys = document.createElement('div');
      sys.className = 'sys';
      sys.textContent = '[SILENT] 她这次没有开口';
      messages.appendChild(sys);
      messages.scrollTop = messages.scrollHeight;
    } else {
      add('bot', data.reply || '（空回复）');
    }
  } catch (error) {
    const sys = document.createElement('div');
    sys.className = 'sys';
    sys.textContent = `发送失败：${error.message}`;
    messages.appendChild(sys);
    messages.scrollTop = messages.scrollHeight;
  } finally {
    typing.hidden = true;
    send.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  void sendText();
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendText();
  }
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  const over = input.scrollHeight > 140;
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  input.classList.toggle('scroll', over);
});

$('reset').addEventListener('click', async () => {
  if (!confirm('开始新会话？本地聊天记录也会清空。')) return;
  await fetch('/api/reset', { method: 'POST' }).catch(() => {});
  history = [];
  render();
});

(async () => {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    if (data.ok) {
      status.textContent = data.mode && data.mode !== 'dsh' ? `${data.mode} 兼容 · ${data.model || 'DSH'} · 本地` : `管理员（admin） · ${data.model || 'DSH'} · 本地`;
    }
  } catch {}
  try {
    const response = await fetch('/api/history');
    const data = await response.json();
    if (data.ok && Array.isArray(data.items)) history = data.items;
  } catch {}
  render();
  input.focus();
})();



