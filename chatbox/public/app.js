const $ = (id) => document.getElementById(id);
const messages = $('messages');
const input = $('input');
const composer = $('composer');
const send = $('send');
const typing = $('typing');
const status = $('status');
const avatar = $('avatar');

let history = [];

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function hasVisibleContent(text, segments) {
  if (String(text || '').trim()) return true;
  return Array.isArray(segments) && segments.some((part) => part?.type !== 'text' || String(part?.data?.text ?? '').trim());
}

function add(role, text, time = now(), segments = []) {
  if (!hasVisibleContent(text, segments)) return;
  history.push({ role, text, time, ...(segments.length ? { segments } : {}) });
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
    if (item.role === 'sys') {
      const sys = document.createElement('div');
      sys.className = 'sys';
      sys.textContent = item.text;
      messages.appendChild(sys);
      continue;
    }
    if (item.role === 'bot' && !hasVisibleContent(item.text, item.segments)) continue;
    const row = document.createElement('div');
    row.className = `row ${item.role === 'me' ? 'me' : 'bot'}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = item.text;
    if (Array.isArray(item.segments)) {
      for (const seg of item.segments) {
        if (seg?.type !== 'record') continue;
        const file = String(seg.data?.file || '');
        const src = file ? `/media/${encodeURIComponent(file)}` : String(seg.data?.url || '');
        if (!src) continue;
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'metadata';
        audio.src = src;
        bubble.appendChild(audio);
      }
    }
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

let inflight = 0;

function beginTurn() {
  inflight += 1;
  typing.hidden = false;
  typing.textContent = inflight > 1 ? `波旁正在输入…（还有 ${inflight - 1} 条排队）` : '波旁正在输入…';
}

function endTurn() {
  inflight = Math.max(0, inflight - 1);
  if (inflight === 0) typing.hidden = true;
  input.focus();
}

async function sendText() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  input.classList.remove('scroll');
  add('me', text);
  beginTurn();
  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
  } catch (error) {
    const sys = document.createElement('div');
    sys.className = 'sys';
    sys.textContent = `发送失败：${error.message}`;
    messages.appendChild(sys);
    messages.scrollTop = messages.scrollHeight;
  } finally {
    endTurn();
  }
}

avatar.addEventListener('dblclick', async () => {
  if (avatar.dataset.busy === '1') return;
  avatar.dataset.busy = '1';
  add('sys', '你拍了拍波旁');
  beginTurn();
  try {
    const response = await fetch('/api/poke', { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
  } catch (error) {
    add('sys', `拍一拍失败：${error.message}`);
  } finally {
    delete avatar.dataset.busy;
    endTurn();
  }
});

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

let lastEventId = null;
async function pollEvents() {
  try {
    const response = await fetch(`/api/events?since=${lastEventId ?? 999999999}`, { cache: 'no-store' });
    const data = await response.json();
    if (!data.ok) return;
    if (lastEventId === null) {
      lastEventId = Number(data.lastId) || 0;
      return;
    }
    for (const event of data.events || []) {
      lastEventId = Math.max(lastEventId, Number(event.local_event_id) || 0);
      if (event.post_type === 'message_sent') {
        const segments = Array.isArray(event.message) ? event.message : [];
        const text = segments.filter((part) => part?.type === 'text').map((part) => String(part.data?.text ?? '')).join('');
        if (text === '[SILENT]' || !hasVisibleContent(text, segments)) continue;
        add('bot', text, undefined, segments);
      } else if (event.sub_type === 'poke' && Number(event.sender_id) === 10000) {
        add('sys', event.action ? `波旁拍了拍你（${event.action}）` : '波旁拍了拍你');
      }
    }
  } catch {}
}
pollEvents();
setInterval(pollEvents, 1000);

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



