# 如何接入 Bourbon Fallback Relay

这个项目不是 SnowLuma 的替代品，而是一个 **OneBot 11 兼容层**。

如果你原来的 bot 接的是：

```text
SnowLuma
NapCat
go-cqhttp
```

只需要把连接地址改到：

```text
HTTP  http://127.0.0.1:3000
WS    ws://127.0.0.1:3001/
```

协议仍然是 OneBot 11，不需要改消息结构。

## 1. 启动

```powershell
cd <repo>
node onebot\server.mjs
```

默认端口：

```text
3000  HTTP
3001  WebSocket
3200  本地控制
```

## 2. 设置管理员 QQ

启动后，本地聊天窗 / 控制面板会提供管理员 QQ 输入。

写入：

```text
runtime/admin.json
```

```json
{"adminQQ":"123456789"}
```

外部 bot 发消息时：

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

只要 `user_id` 等于管理员 QQ，回复就会进入本地聊天窗。

不填时使用占位号：

```text
10001
```

## 3. 选择 profile

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

两者核心都是 OneBot 11，差异只在额外接口/默认值。

## 4. 接收事件

连接：

```text
ws://127.0.0.1:3001/
```

会收到：

```json
{
  "post_type": "message",
  "message_type": "private",
  "sub_type": "friend",
  "self_id": 10000,
  "user_id": 123456789,
  "message": [
    { "type": "text", "data": { "text": "在吗" } }
  ],
  "sender": {
    "user_id": 123456789,
    "nickname": "Admin"
  }
}
```

## 5. 发送回复

```json
{
  "action": "send_private_msg",
  "params": {
    "user_id": 123456789,
    "message": [
      { "type": "text", "data": { "text": "……在。" } }
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

## 6. 实现自己的 adapter

如果你有自己的 bot，只需：

```text
连接 ws://127.0.0.1:3001/
收 message 事件
处理
send_private_msg 回复
```

不需要理解任何特定项目的目录结构。
