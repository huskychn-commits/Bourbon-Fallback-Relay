# OneBot 11 兼容层

SnowLuma 和 NapCat 都是 OneBot 11 实现，所以这里共用一套 HTTP + WS，只切换 profile。

## 端口

```text
3000  HTTP API
3001  WebSocket
3200  本地控制（聊天窗使用，不需要给外部 bot）
```

## 模式

面板切换：

```text
SnowLuma 兼容 → 聊天窗把消息交给外部 OneBot bot
NapCat 兼容   → 同上，使用 NapCat profile
```

模式文件：

```text
runtime/mode.json
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

与 SnowLuma / NapCat 默认端口一致。

### 管理员 QQ

在紧急面板「当前角色 → 管理员 QQ」里填写。

会写入：

```text
runtime/admin.json
```

外部 bot 发送时，`user_id` 填这个号：

```json
{
  "action": "send_private_msg",
  "params": {
    "user_id": 123456789,
    "message": [{ "type": "text", "data": { "text": "……收到。" } }]
  }
}
```

不填时使用内部占位号 `10001`。

## 事件

连接后会收到：

```json
{
  "post_type": "message",
  "message_type": "private",
  "sub_type": "friend",
  "self_id": 10000,
  "user_id": 10001,
  "message_id": 1000,
  "time": 1790000000,
  "raw_message": "在吗",
  "message": [
    { "type": "text", "data": { "text": "在吗" } }
  ],
  "sender": {
    "user_id": 10001,
    "nickname": "Admin",
    "card": ""
  }
}
```

`user_id` 是本地管理员占位号，不需要真实 QQ。

### 发送

```json
{
  "action": "send_private_msg",
  "params": {
    "user_id": 10001,
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

## HTTP API

```text
POST /send_private_msg
POST /send_msg
POST /friend_poke
POST /send_poke
POST /send_group_msg（空实现）
GET  /get_login_info
GET  /get_friend_list
GET  /get_group_list
GET  /get_group_member_list
GET  /get_status
GET  /get_version_info
GET  /get_msg
```

也可以使用 OneBot 标准 POST：

```json
{"action":"get_login_info","params":{},"echo":"1"}
```

## Profile 差异

### SnowLuma

额外提供：

```text
GET /api/login
GET /api/processes
```

### NapCat

额外支持：

```text
get_status
get_version_info
message_sent_type
```

核心消息/发送协议相同。

## 语音

发送语音用标准 `record` 段：

```json
{
  "action": "send_private_msg",
  "params": {
    "user_id": 123456789,
    "message": [
      { "type": "record", "data": { "file": "base64://<wav/base64>" } }
    ]
  }
}
```

`file` 也接受 `file:///绝对路径`、本地绝对路径、`http(s)://` URL，或 `runtime/media` 下已有文件名。
服务端会把音频落到：

```text
runtime/media/<sha1>.wav
```

并回写可播放地址：

```json
{ "type": "record", "data": { "file": "ab12cd34ef567890.wav", "url": "http://127.0.0.1:3200/media/ab12cd34ef567890.wav" } }
```

`can_send_record` 返回 `yes`。收到的语音暂不做识别（不做 ASR）。

## 拍一拍

私聊拍一拍，SnowLuma / NapCat 兼容：

```json
{
  "action": "friend_poke",
  "params": { "user_id": 123456789 }
}
```

`send_poke` 是同一动作的别名；返回 `data: null`。
群聊拍一拍未实现，带 `group_id` 会返回 `retcode: 1404`。

对方拍你时，会向已连接的 bot 推送 notice：

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

`user_id` 是私聊对象，`sender_id` 是拍的人，`target_id` 是被拍的人。

## 本地控制

聊天窗调用：

```text
POST http://127.0.0.1:3200/local/send
{"text":"在吗"}
```

响应：

```json
{"ok":true,"message_id":1000}
```

消息发出即返回；bot 的回复通过 `GET /local/events?since=` 异步读取。

## 限制

```text
只实现私聊
群聊返回空/成功但不投递
拍一拍仅私聊，群聊拍一拍返回 1404
图片/文件暂不支持；语音支持发送和本地回放
```

## Auth

如果 `config.json` 设置了：

```json
"emergency": {
  "onebot": {
    "accessToken": "..."
  }
}
```

HTTP 需要：

```text
Authorization: Bearer <token>
```

默认不开启。

## 切换

面板：

```text
SnowLuma 兼容 / NapCat 兼容
```

切换只改 profile 和聊天窗路由，不重启外部 bot 连接。

