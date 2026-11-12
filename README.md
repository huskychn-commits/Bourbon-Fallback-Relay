# Bourbon Fallback Relay

Bourbon Fallback Relay（以下简称 BFR）是一个本地 OneBot 11 兼容层，用于在
SnowLuma / NapCat 不可用时，为私聊 bot 提供可替换的本地接入端点。

BFR 不实现聊天 AI、人格、记忆或桥接调度。它的职责仅限于：

- 提供标准 OneBot 11 HTTP / WebSocket 接口；
- 将本地聊天窗的输入转换为 OneBot 事件；
- 将 bot 的回复、语音与拍一拍投递回本地聊天窗；
- 维护本地媒体文件与聊天记录。

## 1. 能力矩阵

| 能力 | 方向 | 状态 | 说明 |
|---|---|---|---|
| 文本 | 双向 | 支持 | 仅私聊 |
| 拍一拍 | 双向 | 支持 | `friend_poke` / `send_poke`；群聊返回 `1404` |
| 语音 | 角色 → 用户 | 支持 | 标准 `record` 段，落盘后可回放 |
| 语音 | 用户 → 角色 | 不支持 | 不包含语音识别（ASR） |
| 图片 | 双向 | 支持 | Chatbox 选择 / 粘贴 / 拖拽；仅转发本地图片，模型不生成图片 |
| 文件 | 双向 | 不支持 | — |
| 群聊 | — | 不支持 | 仅实现私聊 |

## 2. 系统组成

| 目录 | 职责 |
|---|---|
| `onebot/` | OneBot 11 协议层：HTTP、WebSocket、本地控制、媒体服务 |
| `chatbox/` | 本地聊天窗：消息输入、事件轮询、历史与语音回放 |
| `panel/` | 可选的通用 panel 模板，仅使用 Python 标准库 |
| `runtime/` | 本机状态：管理员 QQ、profile、媒体、聊天记录（不发布） |

`chatbox/` 需要外部 OneBot bot 连接后才会产生回复。

## 3. 架构与数据流

### 3.1 入站

```text
Chatbox
  → POST http://127.0.0.1:3200/local/send
  → BFR 生成 message 事件（message_id 唯一）
  → 广播到 ws://127.0.0.1:3001/
  → 外部 OneBot bot
```

### 3.2 出站

```text
外部 bot
  → send_private_msg / friend_poke
  → BFR 校验目标是否为管理员 QQ
  → 写入本地事件队列
  → Chatbox 轮询 /local/events
  → 渲染文本、语音、图片或拍一拍
```

BFR 采用单向事件模型：

- 每条本地发送立即生成独立事件，不等待回复；
- 每条消息分配唯一 `message_id`；
- 不在协议层做请求 / 回复配对；
- 消息批处理、会话合并与回复策略由上层 bot / bridge 负责。

## 4. 端口

| 端口 | 协议 | 用途 |
|---|---|---|
| `3000` | HTTP | OneBot 11 HTTP API |
| `3001` | WebSocket | OneBot 11 事件与动作 |
| `3200` | HTTP | 本地控制：`/local/*` 与 `/media/*` |
| `3199` | HTTP | Chatbox |
| `3134` | HTTP | 通用 panel（可选） |

默认全部只监听 `127.0.0.1`。

## 5. 快速开始

### 5.1 依赖

- Node.js（运行 `onebot/` 与 `chatbox/`）
- Python 3.8+（可选，运行 `panel/`）

### 5.2 启动 OneBot 兼容层

```powershell
cd <repo>
node onebot\server.mjs
```

### 5.3 启动 Chatbox

```powershell
node chatbox\server.mjs
```

打开：

```text
http://127.0.0.1:3199
```

### 5.4 启动通用 panel（可选）

```powershell
python panel\server.py
```

Windows 也可以直接双击：

```text
panel\start-panel.vbs
```

打开：

```text
http://127.0.0.1:3134
```

## 6. OneBot 接入

### 6.1 连接地址

```text
HTTP  http://127.0.0.1:3000
WS    ws://127.0.0.1:3001/
```

将 BFR 视为 SnowLuma / NapCat 即可，协议仍为 OneBot 11。

### 6.2 接收消息事件

```json
{
  "post_type": "message",
  "message_type": "private",
  "sub_type": "friend",
  "self_id": 10000,
  "user_id": 123456789,
  "message_id": 1000,
  "time": 1790000000,
  "raw_message": "在吗",
  "message": [
    { "type": "text", "data": { "text": "在吗" } }
  ],
  "sender": {
    "user_id": 123456789,
    "nickname": "Admin",
    "card": ""
  }
}
```

### 6.3 发送文本

```json
{
  "action": "send_private_msg",
  "params": {
    "user_id": 123456789,
    "message": [
      { "type": "text", "data": { "text": "……收到。" } }
    ]
  }
}
```

响应：

```json
{
  "status": "ok",
  "retcode": 0,
  "data": { "message_id": 1001 }
}
```

### 6.4 发送语音

BFR 接受标准 `record` 段：

```json
{
  "action": "send_private_msg",
  "params": {
    "user_id": 123456789,
    "message": [
      { "type": "record", "data": { "file": "base64://<wav base64>" } }
    ]
  }
}
```

`file` 支持以下形式：

- `base64://...`
- `file:///绝对路径`
- 本地绝对路径
- `http(s)://` URL
- `runtime/media` 下已有文件名

音频会保存至 `runtime/media/`，并通过 `/media/<file>` 提供回放。
`can_send_record` 返回 `yes`。

### 6.5 拍一拍

发送：

```json
{
  "action": "friend_poke",
  "params": { "user_id": 123456789 }
}
```

`send_poke` 为同一动作的别名；返回 `data: null`。
群聊拍一拍未实现，带 `group_id` 时返回 `retcode: 1404`。

接收：

```json
{
  "post_type": "notice",
  "notice_type": "notify",
  "sub_type": "poke",
  "self_id": 10000,
  "time": 1790000000,
  "user_id": 123456789,
  "sender_id": 123456789,
  "target_id": 10000,
  "action": "拍一拍",
  "suffix": "",
  "action_img_url": ""
}
```

`user_id` 为私聊对象，`sender_id` 为发起者，`target_id` 为被拍者。

## 7. 本地控制 API

Chatbox 与本地界面使用以下接口，不建议外部 bot 直接调用。

### 7.1 发送消息

```text
POST http://127.0.0.1:3200/local/send
{"text":"在吗","images":["ab12cd34ef567890.png"]}
```

`images` 为 `runtime/media` 下的文件名，最多 4 张；也可以只发图片、不带文本。

响应：

```json
{"ok":true,"message_id":1000}
```

该接口立即返回，不等待 bot 回复。

### 7.2 拍一拍

```text
POST http://127.0.0.1:3200/local/poke
```

响应：

```json
{"ok":true}
```

### 7.3 本地事件

```text
GET http://127.0.0.1:3200/local/events?since=0
```

返回 `message_sent`、`notice` 等异步事件及 `lastId`。

### 7.4 上传图片

```text
POST http://127.0.0.1:3199/api/upload
Content-Type: image/png

<原始图片字节>
```

响应：

```json
{"ok":true,"file":"ab12cd34ef567890.png","url":"/media/ab12cd34ef567890.png"}
```

支持 PNG / JPEG / GIF / WebP，单张上限 10MB。

### 7.5 媒体

```text
GET http://127.0.0.1:3200/media/<file>
GET http://127.0.0.1:3199/media/<file>
```

媒体目录同时存放语音与图片，文件名按内容 sha1 生成。

## 8. 配置

### 8.1 管理员 QQ

通过 panel 填写，或直接编辑：

```text
runtime/admin.json
```

```json
{"adminQQ":"123456789"}
```

bot 发送时 `user_id` 必须为该号码，否则返回 `1404`。
未配置时使用内部占位号 `10001`。

### 8.2 Profile

```text
runtime/mode.json
```

```json
{"mode":"snowluma"}
```

或：

```json
{"mode":"napcat"}
```

两者均基于 OneBot 11，差异仅在额外接口与默认值。

### 8.3 Access Token（可选）

```powershell
$env:ONEBOT_ACCESS_TOKEN = "your-token"
```

请求头：

```text
Authorization: Bearer your-token
```

## 9. 存储

`runtime/` 为本机状态，不进入版本库：

```text
runtime/
├─ admin.json                     管理员 QQ
├─ mode.json                      snowluma / napcat
├─ media/                         语音与图片文件（按 sha1 命名）
└─ chat-history/YYYY-MM-DD.jsonl  聊天记录
```

聊天记录格式：

```json
{"role":"me","text":"...","time":"17:20","at":1794388800000}
```

`role` 为 `me`、`bot` 或 `sys`；语音消息额外包含 `segments`。

## 10. 安全

默认只监听 `127.0.0.1`，适用于本机使用。

如需暴露到局域网，应在前面增加反向代理与访问控制，并配置
`ONEBOT_ACCESS_TOKEN`。BFR 本身不提供 TLS、账号体系或多租户隔离。

## 11. 限制与非目标

- 仅实现私聊；群聊动作返回空实现或 `1404`。
- 不支持文件与视频。
- 不支持用户语音转文字（无 ASR）。
- 不生成图片；图片能力仅用于转发本地图片。
- 不实现聊天 AI、人格、记忆、主动对话或 bridge 调度。
- 不保证与 SnowLuma / NapCat 的全部扩展接口兼容。

## 12. 文档

- [ONEBOT.md](ONEBOT.md)
- [PORT.md](PORT.md)
- [HOW-TO-ADAPT.md](HOW-TO-ADAPT.md)
- [panel/README.md](panel/README.md)

## 13. License

MIT。见 [LICENSE](LICENSE)。
