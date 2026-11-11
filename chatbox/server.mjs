// Bourbon Fallback Relay · 通用 Chatbox
// 只把本地消息转成 OneBot 事件；回复由外部 OneBot bot 产生。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const HISTORY_DIR = path.join(HERE, '..', 'runtime', 'chat-history');
const MEDIA_DIR = path.join(HERE, '..', 'runtime', 'media');
const MODE_FILE = path.join(HERE, '..', 'runtime', 'mode.json');
const PORT = Number(process.env.CHATBOX_PORT || 3199);
const ONEBOT_LOCAL = `http://127.0.0.1:${process.env.ONEBOT_LOCAL_PORT || 3200}`;

let active = 0;

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return fallback; }
}
function currentMode() {
  const value = String(readJson(MODE_FILE, {}).mode || 'snowluma').toLowerCase();
  return value === 'napcat' ? 'napcat' : 'snowluma';
}
function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 2_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}

function historyFile() {
  return path.join(HISTORY_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
}
function appendHistory(role, text, segments = []) {
  const item = {
    role,
    text: String(text ?? ''),
    ...(Array.isArray(segments) && segments.length ? { segments } : {}),
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    at: Date.now(),
  };
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.appendFileSync(historyFile(), `${JSON.stringify(item)}\n`, 'utf8');
  } catch {}
  return item;
}
function readHistory(limit = 300) {
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    const files = fs.readdirSync(HISTORY_DIR).filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort();
    const items = [];
    for (const name of files.slice(-7)) {
      const lines = fs.readFileSync(path.join(HISTORY_DIR, name), 'utf8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try { items.push(JSON.parse(line)); } catch {}
      }
    }
    return items.slice(-limit);
  } catch { return []; }
}
function clearHistory() {
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    for (const name of fs.readdirSync(HISTORY_DIR)) {
      if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) fs.unlinkSync(path.join(HISTORY_DIR, name));
    }
  } catch {}
}

async function sendOneBot(text) {
  const response = await fetch(`${ONEBOT_LOCAL}/local/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `OneBot HTTP ${response.status}`);
  return { message_id: Number(data.message_id) || 0 };
}

async function pokeOneBot() {
  const response = await fetch(`${ONEBOT_LOCAL}/local/poke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `OneBot HTTP ${response.status}`);
  return true;
}

async function oneBotEvents(since = 0) {
  const response = await fetch(`${ONEBOT_LOCAL}/local/events?since=${encodeURIComponent(since)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `OneBot HTTP ${response.status}`);
  return data;
}

function segmentsText(segments) {
  if (!Array.isArray(segments)) return '';
  return segments.filter((part) => part?.type === 'text').map((part) => String(part.data?.text ?? '')).join('');
}

let eventCursor = 0;
async function pollOneBotEvents() {
  try {
    const data = await oneBotEvents(eventCursor);
    for (const event of data.events || []) {
      eventCursor = Math.max(eventCursor, Number(event.local_event_id) || 0);
      if (event.post_type === 'message_sent') {
        const segments = Array.isArray(event.message) ? event.message : [];
        const text = segmentsText(segments);
        if (text === '[SILENT]') continue;
        appendHistory('bot', text, segments);
      } else if (event.post_type === 'notice' && event.sub_type === 'poke' && Number(event.sender_id) === 10000) {
        appendHistory('sys', '波旁拍了拍你');
      }
    }
    if (Number(data.lastId) > eventCursor) eventCursor = Number(data.lastId);
  } catch {}
}

async function startEventPoller() {
  try {
    const data = await oneBotEvents(999999999);
    eventCursor = Number(data.lastId) || 0;
  } catch {}
  const timer = setInterval(pollOneBotEvents, 800);
  timer.unref?.();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const staticFile = (name, type) => {
    const body = fs.readFileSync(path.join(PUBLIC, name));
    res.writeHead(200, { 'content-type': type, 'content-length': body.length });
    res.end(body);
  };
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(PUBLIC, 'index.html')));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/style.css') return staticFile('style.css', 'text/css; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/app.js') return staticFile('app.js', 'application/javascript; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/favicon.ico') return staticFile('favicon.ico', 'image/x-icon');
  if (req.method === 'GET' && url.pathname === '/logo.png') return staticFile('logo.png', 'image/png');

  if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
    const name = decodeURIComponent(url.pathname.slice('/media/'.length));
    if (!/^[a-z0-9]{6,64}\.[a-z0-9]{1,5}$/i.test(name)) return json(res, 404, { ok: false, error: 'not found' });
    const file = path.join(MEDIA_DIR, name);
    if (!fs.existsSync(file)) return json(res, 404, { ok: false, error: 'not found' });
    const buf = fs.readFileSync(file);
    const types = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.flac': 'audio/flac' };
    res.writeHead(200, { 'content-type': types[path.extname(name).toLowerCase()] || 'application/octet-stream', 'content-length': buf.length, 'cache-control': 'no-store' });
    res.end(buf);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/status') {
    return json(res, 200, { ok: true, busy: active > 0, queued: active, mode: currentMode(), model: 'OneBot 11', transport: 'onebot' });
  }
  if (req.method === 'GET' && url.pathname === '/v1/health') {
    return json(res, 200, { ok: true, service: 'bourbon-fallback-relay', version: 1, transport: 'onebot' });
  }
  if (req.method === 'GET' && url.pathname === '/api/history') {
    return json(res, 200, { ok: true, items: readHistory(300) });
  }
  if (req.method === 'GET' && url.pathname === '/api/events') {
    try {
      const data = await oneBotEvents(url.searchParams.get('since') || 0);
      return json(res, 200, { ok: true, events: data.events || [], lastId: data.lastId || 0 });
    } catch (error) {
      return json(res, 200, { ok: false, error: String(error?.message ?? error), events: [], lastId: 0 });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/poke') {
    appendHistory('sys', '你拍了拍波旁');
    active += 1;
    try {
      await pokeOneBot();
      return json(res, 200, { ok: true, mode: currentMode() });
    } catch (error) {
      return json(res, 500, { ok: false, error: String(error?.message ?? error) });
    } finally {
      active -= 1;
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/reset') {
    clearHistory();
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && (url.pathname === '/api/send' || url.pathname === '/v1/messages')) {
    const body = await readBody(req);
    const text = String(body.text ?? '').trim();
    if (!text) return json(res, 400, { ok: false, error: 'empty' });
    appendHistory('me', text);
    active += 1;
    try {
      const result = await sendOneBot(text);
      return json(res, 200, { ok: true, message_id: result.message_id, mode: currentMode() });
    } catch (error) {
      return json(res, 500, { ok: false, error: String(error?.message ?? error) });
    } finally {
      active -= 1;
    }
  }
  return json(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[chatbox] http ${PORT}`);
  void startEventPoller();
});





