# Ports · OneBot 11

```text
3000   OneBot HTTP
3001   OneBot WebSocket
3200   本地控制（Chatbox 使用）
3199   Chatbox
3134   通用 panel（可选）
```

## 外部 bot

```text
http://127.0.0.1:3000
ws://127.0.0.1:3001/
```

与 SnowLuma / NapCat 默认端口一致。

## 本地控制

```text
POST http://127.0.0.1:3200/local/send
{"text":"在吗"}
```

响应：

```json
{"ok":true,"reply":"……在。"}
```



