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

Windows 也可以直接双击：

```text
panel\start-panel.vbs
```

脚本会按 `pythonw` → `python` → `py -3` 的顺序查找 Python 3.8+，并复用已在运行的实例。
找不到时用 `PANEL_PYTHON` 指定解释器路径；加 `/no-open` 可只启动、不打开浏览器。

```powershell
$env:PANEL_PYTHON = "C:\Path\To\pythonw.exe"
cscript //nologo panel\start-panel.vbs /no-open
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

