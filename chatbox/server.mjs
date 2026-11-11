// Bourbon Fallback Relay · 通用 Chatbox
// 只把本地消息转成 OneBot 事件；回复由外部 OneBot bot 产生。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const HISTORY_DIR = path.join(HERE, '..', 'runtime', 'chat-history');
const MODE_FILE = path.join(HERE, '..', 'runtime', 'mode.json');
const PORT = Number(process.env.CHATBOX_PORT || 3199);
const ONEBOT_LOCAL = `http://127.0.0.1:${process.env.ONEBOT_LOCAL_PORT || 3200}`;

let busy = false;

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
function appendHistory(role, text) {
  const item = {
    role,
    text: String(text ?? ''),
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

async function askOneBot(text) {
  const response = await fetch(`${ONEBOT_LOCAL}/local/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `OneBot HTTP ${response.status}`);
  return String(data.reply || '');
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

  if (req.method === 'GET' && url.pathname === '/api/status') {
    return json(res, 200, { ok: true, busy, mode: currentMode(), model: 'OneBot 11', transport: 'onebot' });
  }
  if (req.method === 'GET' && url.pathname === '/v1/health') {
    return json(res, 200, { ok: true, service: 'bourbon-fallback-relay', version: 1, transport: 'onebot' });
  }
  if (req.method === 'GET' && url.pathname === '/api/history') {
    return json(res, 200, { ok: true, items: readHistory(300) });
  }
  if (req.method === 'POST' && url.pathname === '/api/reset') {
    clearHistory();
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && (url.pathname === '/api/send' || url.pathname === '/v1/messages')) {
    if (busy) return json(res, 409, { ok: false, error: '上一条还在处理' });
    const body = await readBody(req);
    const text = String(body.text ?? '').trim();
    if (!text) return json(res, 400, { ok: false, error: 'empty' });
    busy = true;
    try {
      appendHistory('me', text);
      const reply = await askOneBot(text);
      if (reply && reply !== '[SILENT]') appendHistory('bot', reply);
      return json(res, 200, { ok: true, reply: reply === '[SILENT]' ? '' : reply, silent: reply === '[SILENT]', mode: currentMode() });
    } catch (error) {
      return json(res, 500, { ok: false, error: String(error?.message ?? error) });
    } finally {
      busy = false;
    }
  }
  return json(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => console.log(`[chatbox] http ${PORT}`));





