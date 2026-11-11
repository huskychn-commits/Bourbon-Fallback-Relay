// Bourbon Fallback Relay · OneBot 11 facade.
// SnowLuma / NapCat 都是 OneBot 11 实现；这里共用同一套 HTTP + WS，
// 只通过 profile 切换默认值和额外接口，不写两套协议。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');
const CONFIG_FILE = process.env.EMERGENCY_CONFIG || path.join(APP_ROOT, 'config.json');
const RUNTIME = path.join(APP_ROOT, 'runtime');
const MODE_FILE = path.join(RUNTIME, 'mode.json');
const ADMIN_FILE = path.join(RUNTIME, 'admin.json');
const HTTP_PORT = Number(process.env.ONEBOT_HTTP_PORT || 3000);
const WS_PORT = Number(process.env.ONEBOT_WS_PORT || 3001);
const LOCAL_PORT = Number(process.env.ONEBOT_LOCAL_PORT || 3200);
const SELF_ID = 10000;
const DEFAULT_ADMIN_ID = 10001;

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}
function mode() {
  const value = String(readJson(MODE_FILE, {}).mode || 'snowluma').toLowerCase();
  return value === 'napcat' ? 'napcat' : 'snowluma';
}
function adminId() {
  const value = String(readJson(ADMIN_FILE, {}).adminQQ || '').trim();
  return /^\d+$/.test(value) ? Number(value) : DEFAULT_ADMIN_ID;
}
function accessToken() {
  const fromEnv = String(process.env.ONEBOT_ACCESS_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const cfg = readJson(CONFIG_FILE, {});
    return String(cfg.onebot?.accessToken || cfg.emergency?.onebot?.accessToken || '');
  } catch { return ''; }
}
function authorized(req) {
  const token = accessToken();
  if (!token) return true;
  const value = String(req.headers.authorization || '');
  return value === `Bearer ${token}` || value === `Token ${token}`;
}
function response(data, echo, code = 0) {
  return { status: code === 0 ? 'ok' : 'failed', retcode: code, data: data ?? null, ...(echo != null ? { echo } : {}) };
}
function segmentsToText(message) {
  if (typeof message === 'string') return message;
  if (!Array.isArray(message)) return String(message ?? '');
  return message.map((part) => {
    const type = String(part?.type || '');
    const data = part?.data || {};
    if (type === 'text') return String(data.text ?? '');
    if (type === 'at') return data.qq === 'all' ? '@全体成员' : `@${data.name || data.qq || ''}`;
    if (type === 'image') return '[图片]';
    if (type === 'record') return '[语音]';
    return '';
  }).join('');
}
function textSegments(text) {
  return [{ type: 'text', data: { text: String(text ?? '') } }];
}

const clients = new Set();
let nextMessageId = 1000;
let pending = null;
const queued = [];
const startedAt = Date.now();

function eventPayload(text) {
  const id = nextMessageId++;
  return {
    post_type: 'message',
    message_type: 'private',
    sub_type: 'friend',
    self_id: SELF_ID,
    user_id: adminId(),
    message_id: id,
    time: Math.floor(Date.now() / 1000),
    raw_message: text,
    font: 0,
    sender: { user_id: adminId(), nickname: 'Admin', card: '' },
    message: textSegments(text),
    ...(mode() === 'napcat' ? { message_sent_type: 'other' } : {}),
  };
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const ws of clients) {
    try { ws.sendText(data); } catch {}
  }
}

function onLocalSend(text) {
  if (!clients.size) throw new Error('没有 OneBot 客户端连接');
  const event = eventPayload(text);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending?.reject === reject) pending = null;
      reject(new Error('等待外部 bot 回复超时'));
    }, Number(process.env.ONEBOT_REPLY_TIMEOUT_MS || 180000));
    pending = {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    };
    broadcast(event);
  });
}

function action(name, params, echo) {
  const profile = mode();
  if (name === 'send_private_msg' || name === 'send_msg') {
    const text = segmentsToText(params?.message ?? params?.text ?? '');
    const target = String(params?.user_id ?? params?.user ?? adminId());
    if (target !== String(adminId()) && target !== 'admin') {
      return response(null, echo, 1404);
    }
    if (pending) {
      const waiter = pending;
      pending = null;
      waiter.resolve(text);
    } else {
      queued.push({ text, at: Date.now() });
      if (queued.length > 100) queued.shift();
    }
    return response({ message_id: nextMessageId++ }, echo);
  }
  if (name === 'send_group_msg') {
    return response({ message_id: nextMessageId++ }, echo);
  }
  if (name === 'get_login_info') {
    return response({ user_id: SELF_ID, nickname: profile === 'napcat' ? 'NapCat' : 'SnowLuma' }, echo);
  }
  if (name === 'get_friend_list') {
    return response([{ user_id: adminId(), nickname: 'Admin', remark: '' }], echo);
  }
  if (name === 'get_group_list') return response([], echo);
  if (name === 'get_group_member_list') return response([], echo);
  if (name === 'get_status') {
    return response({ online: true, good: true, status: 'ok', version: 'onebot-11' }, echo);
  }
  if (name === 'get_version_info') {
    return response({ app_name: profile === 'napcat' ? 'NapCat' : 'SnowLuma', app_version: 'emergency', protocol_version: 'v11' }, echo);
  }
  if (name === 'get_msg') {
    return response(null, echo, 1404);
  }
  if (name === 'can_send_image' || name === 'can_send_record') {
    return response({ yes: false }, echo);
  }
  if (name === 'get_status') return response({ online: true }, echo);
  return response(null, echo, 1404);
}

// ── 最小 WebSocket server（无外部依赖） ─────────────────────
function wsFrame(text) {
  const payload = Buffer.from(String(text), 'utf8');
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}

function attachWs(socket) {
  const client = {
    socket,
    buffer: Buffer.alloc(0),
    sendText(text) { if (!socket.destroyed) socket.write(wsFrame(text)); },
  };
  clients.add(client);
  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    for (;;) {
      if (client.buffer.length < 2) return;
      const b0 = client.buffer[0];
      const b1 = client.buffer[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (client.buffer.length < 4) return;
        len = client.buffer.readUInt16BE(2); offset = 4;
      } else if (len === 127) {
        if (client.buffer.length < 10) return;
        len = Number(client.buffer.readBigUInt64BE(2)); offset = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (client.buffer.length < offset + maskLen + len) return;
      const mask = masked ? client.buffer.subarray(offset, offset + 4) : null;
      const payload = client.buffer.subarray(offset + maskLen, offset + maskLen + len);
      const data = Buffer.from(payload);
      if (mask) for (let i = 0; i < data.length; i += 1) data[i] ^= mask[i % 4];
      client.buffer = client.buffer.subarray(offset + maskLen + len);
      if (opcode === 0x8) {
        clients.delete(client);
        try { socket.end(); } catch {}
        return;
      }
      if (opcode === 0x9) {
        const pong = Buffer.concat([Buffer.from([0x8a, data.length]), data]);
        try { socket.write(pong); } catch {}
        continue;
      }
      if (opcode === 0x1) {
        try {
          const msg = JSON.parse(data.toString('utf8'));
          const result = action(String(msg.action || ''), msg.params || {}, msg.echo);
          client.sendText(JSON.stringify(result));
        } catch {
          client.sendText(JSON.stringify(response(null, null, 1400)));
        }
      }
    }
  });
  const cleanup = () => { clients.delete(client); };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
  client.sendText(JSON.stringify({
    post_type: 'meta_event',
    meta_event_type: 'lifecycle',
    sub_type: 'connect',
    self_id: SELF_ID,
    time: Math.floor(Date.now() / 1000),
  }));
  // 兼容：连接后补一条上线状态
  client.sendText(JSON.stringify({
    post_type: 'meta_event',
    meta_event_type: 'lifecycle',
    sub_type: 'enable',
    self_id: SELF_ID,
    time: Math.floor(Date.now() / 1000),
  }));
}

function upgrade(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '', '',
  ].join('\r\n'));
  if (head?.length) socket.unshift(head);
  attachWs(socket);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 2_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const json = (code, body) => {
    const data = JSON.stringify(body);
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) });
    res.end(data);
  };
  if (url.pathname === '/api/login' && mode() === 'snowluma') {
    return json(200, { code: 0, data: { uin: SELF_ID } });
  }
  if (url.pathname === '/api/processes' && mode() === 'snowluma') {
    return json(200, { code: 0, data: { list: [{ uin: SELF_ID, online: true }] } });
  }
  if (!authorized(req)) return json(401, response(null, null, 1401));
  if (req.method === 'POST') {
    const body = await readBody(req);
    return json(200, action(String(body.action || ''), body.params || {}, body.echo));
  }
  const name = url.pathname.replace(/^\/+/, '').split('/')[0];
  if (name) {
    const params = Object.fromEntries(url.searchParams.entries());
    return json(200, action(name, params, null));
  }
  return json(404, { ok: false, error: 'not found' });
});

const wsServer = http.createServer((req, res) => { res.writeHead(404); res.end(); });
wsServer.on('upgrade', (req, socket, head) => {
  if (req.url !== '/' && !req.url.startsWith('/?')) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return;
  }
  upgrade(req, socket, head);
});

const localServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const json = (code, body) => {
    const data = JSON.stringify(body);
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) });
    res.end(data);
  };
  if (req.method === 'GET' && url.pathname === '/local/status') {
    return json(200, { ok: true, mode: mode(), clients: clients.size, queued: queued.length, pending: Boolean(pending) });
  }
  if (req.method === 'POST' && url.pathname === '/local/send') {
    const body = await readBody(req);
    const text = String(body.text || '').trim();
    if (!text) return json(400, { ok: false, error: 'empty' });
    try { return json(200, { ok: true, reply: await onLocalSend(text) }); }
    catch (error) { return json(503, { ok: false, error: String(error?.message ?? error) }); }
  }
  return json(404, { ok: false, error: 'not found' });
});

function writeMode(modeValue) {
  const value = modeValue === 'napcat' ? 'napcat' : 'snowluma';
  writeJson(MODE_FILE, { mode: value, updatedAt: new Date().toISOString() });
}

function ensureRuntime() {
  fs.mkdirSync(RUNTIME, { recursive: true });
  if (!fs.existsSync(MODE_FILE)) writeJson(MODE_FILE, { mode: 'snowluma', updatedAt: new Date().toISOString() });
  if (!fs.existsSync(ADMIN_FILE)) writeJson(ADMIN_FILE, { adminQQ: '', updatedAt: new Date().toISOString() });
}

ensureRuntime();

httpServer.listen(HTTP_PORT, '127.0.0.1', () => console.log(`[onebot] http ${HTTP_PORT} profile=${mode()}`));
wsServer.listen(WS_PORT, '127.0.0.1', () => console.log(`[onebot] ws ${WS_PORT}`));
localServer.listen(LOCAL_PORT, '127.0.0.1', () => console.log(`[onebot] local ${LOCAL_PORT}`));

export { startedAt, queued, writeMode };





