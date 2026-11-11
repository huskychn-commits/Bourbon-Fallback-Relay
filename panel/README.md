# 通用 panel

这是一个可选的 Chatbox / OneBot 面板模板。

它只管理：

```text
onebot/server.mjs
chatbox/server.mjs
profile
adminQQ
```

不包含角色、记忆、DSH 或内置 agent。Chatbox 需要外部 OneBot bot 才会回复。

## 启动

```powershell
cd <repo>
python panel\server.py
```

打开：

```text
http://127.0.0.1:3134
```

Chatbox：

```text
http://127.0.0.1:3199
```

端口可以改：

```powershell
$env:EMERGENCY_PANEL_PORT = '3134'
```

## API

```text
GET  /api/state
POST /api/start
POST /api/mode     {"mode":"snowluma"|"napcat"}
POST /api/admin    {"adminQQ":"..."}
```

## 自定义

直接改：

```text
panel/index.html
panel/server.py
```

没有插件系统，没有前端框架。  
想加按钮、状态、启动逻辑，直接在这两个文件里加。

