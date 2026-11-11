# Chatbox

本地聊天窗 UI。

它只负责：

```text
输入消息 / 双击头像拍一拍
POST http://127.0.0.1:3200/local/send
POST http://127.0.0.1:3200/local/poke
显示外部 bot 的文本 / 语音 / 拍一拍
```

不包含：

```text
DSH
人格
记忆
内置 agent
```

因此使用时必须有一个 OneBot bot 连接到：

```text
ws://127.0.0.1:3001/
```

## 启动

由 panel 启动：

```text
http://127.0.0.1:3134 → 启动 Chatbox
```

或者直接：

```powershell
cd <repo>
node chatbox\server.mjs
```

打开：

```text
http://127.0.0.1:3199
```

## 端口

```text
3199
```

可以通过环境变量覆盖：

```powershell
$env:CHATBOX_PORT = '3199'
```

## 历史

保存在：

```text
runtime/chat-history/YYYY-MM-DD.jsonl
```

已 gitignore。

## 说明

生成过程中可以继续输入、发送；服务端按到达顺序串行处理，输入框不会被锁。

UI 沿用 Bourbon 的聊天窗，保留「波旁」昵称与 B 头像作为彩蛋；使用者可以直接改 `public/`。


