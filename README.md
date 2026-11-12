# Bourbon Fallback Relay

一个 QQ 端口被封时的本地 OneBot 11 应急中继。

目标很简单：

```text
把原本接 SnowLuma / NapCat 的 bot
改成接这个本地端口
不需要改协议
```

它不实现聊天 AI，也不依赖任何特定项目。  
它只负责：

```text
OneBot 11 事件
send_private_msg
本地控制
```
 
## 组成

```text
onebot/    OneBot 11 协议层
chatbox/   本地聊天窗
panel/     通用面板模板
runtime/   本机状态（不发布）
```

Chatbox 需要外部 OneBot bot 连接后才会产生回复。

## 功能

- OneBot 11 HTTP / WebSocket
- SnowLuma / NapCat 两种 profile
- 私聊消息
- 生成中可继续发送，消息按到达顺序排队
- 私聊拍一拍（`friend_poke` / `send_poke`）
- 管理员 QQ 映射
- 共享 Chatbox
- 可选通用 panel 模板
- 无 Node 第三方依赖
- panel 只使用 Python 标准库

## 能力矩阵

| 能力 | 方向 | 状态 | 说明 |
|---|---|---|---|
| 文本 | 双向 | 支持 | 私聊 |
| 拍一拍 | 双向 | 支持 | 仅私聊；群聊返回 1404 |
| 语音 | 角色 → 用户 | 支持 | `record` 段落盘到 `runtime/media`，Chatbox 内回放 |
| 语音 | 用户 → 角色 | 不支持 | 不做语音识别（ASR） |
| 图片 | 双向 | 未支持 | OneBot 与 Chatbox 均未实现 |
| 群聊 | — | 未实现 | 仅私聊 |

## 端口

```text
3000   OneBot HTTP
3001   OneBot WebSocket
3200   本地控制
3199   Chatbox
3134   通用 panel
```

## 快速开始

只需要 Node.js：

```powershell
cd <repo>
node onebot\server.mjs
```

或者同时启动模板 panel：

```powershell
python panel\server.py
```

Windows 也可以直接双击 `panel\start-panel.vbs`。

打开：

```text
http://127.0.0.1:3134
```

## 外部 bot 接入

HTTP：

```text
http://127.0.0.1:3000
```

WebSocket：

```text
ws://127.0.0.1:3001/
```

把它当成 SnowLuma / NapCat 即可。

### 收到事件

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

### 发送回复

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

## 管理员 QQ

在 panel 里填写，或直接写：

```text
runtime/admin.json
```

```json
{"adminQQ":"123456789"}
```

外部 bot 发送时，`user_id` 填这个号，回复会投递到本地控制端。

不填时使用占位号：

```text
10001
```

## Profile

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

核心都是 OneBot 11；差异只在额外接口和默认值。

## 本地控制

聊天窗 / 本地 UI：

```text
POST http://127.0.0.1:3200/local/send
{"text":"在吗"}
```

```json
{"ok":true,"reply":"……在。"}
```

## 目录

```text
onebot/
  server.mjs      OneBot 11 服务
panel/
  server.py       可选通用 panel
  index.html
  README.md
runtime/          本地状态（gitignore）
```

## 安全

默认只监听：

```text
127.0.0.1
```

没有鉴权也可以本地使用。  
如果要暴露到局域网，请在前面加反向代理和 token。

可选 token：

```powershell
$env:ONEBOT_ACCESS_TOKEN = "your-token"
```

请求头：

```text
Authorization: Bearer your-token
```

## 限制

```text
只实现私聊
群聊返回空实现
拍一拍仅私聊，群聊拍一拍返回 1404
图片 / 文件暂不支持；语音支持发送和本地回放
```

## 文档

- [ONEBOT.md](ONEBOT.md)
- [PORT.md](PORT.md)
- [HOW-TO-ADAPT.md](HOW-TO-ADAPT.md)
- [panel/README.md](panel/README.md)

## 存储

`runtime/` 是本机状态，不发布：

```text
runtime/
├─ admin.json                     管理员 QQ
├─ mode.json                      snowluma / napcat
├─ logs/agent.log                 运行日志
├─ media/                         语音文件（按 sha1 命名）
└─ chat-history/YYYY-MM-DD.jsonl  完整聊天记录
```

聊天记录格式：

```json
{"role":"me","text":"...","time":"17:20","at":1794388800000}
```

`role` 为 `me` 或 `bot`。

## 扩展

本项目只提供 OneBot 11 协议层。

角色、记忆、聊天 AI、完整 panel 由使用者自己的项目实现。

`panel/` 是一个可选的通用模板，可以直接改。本地专用的扩展适配不属于本仓库。

## License

MIT。见 [LICENSE](LICENSE)。





