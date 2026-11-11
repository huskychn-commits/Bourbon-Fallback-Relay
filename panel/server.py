#!/usr/bin/env python3
"""Bourbon Fallback Relay · 通用 panel：只管理 OneBot 11 兼容层。

这是模板，不是完整后台。clone 后可直接改 index.html / server.py。
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RUNTIME = ROOT / "runtime"
MODE_FILE = RUNTIME / "mode.json"
ADMIN_FILE = RUNTIME / "admin.json"
ONEBOT_SERVER = ROOT / "onebot" / "server.mjs"
CHATBOX_SERVER = ROOT / "chatbox" / "server.mjs"
PANEL_PORT = int(os.environ.get("EMERGENCY_PANEL_PORT", "3134"))
CHATBOX_PORT = int(os.environ.get("CHATBOX_PORT", "3199"))
ONEBOT_HTTP_PORT = int(os.environ.get("ONEBOT_HTTP_PORT", "3000"))
ONEBOT_WS_PORT = int(os.environ.get("ONEBOT_WS_PORT", "3001"))
ONEBOT_LOCAL_PORT = int(os.environ.get("ONEBOT_LOCAL_PORT", "3200"))
NODE = os.environ.get("NODE") or shutil.which("node") or "node"


def read_json(path, fallback=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except Exception:
        return fallback if fallback is not None else {}


def write_json(path, value):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(target) + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(target)


def http_json(url, timeout=3):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:
        return exc.code, None
    except Exception:
        return 0, None


def read_mode():
    value = str(read_json(MODE_FILE, {}).get("mode") or "snowluma").lower()
    return value if value in ("snowluma", "napcat") else "snowluma"


def write_mode(value):
    mode = value if value in ("snowluma", "napcat") else "snowluma"
    write_json(MODE_FILE, {"mode": mode, "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S")})
    return mode


def admin_qq():
    return str(read_json(ADMIN_FILE, {}).get("adminQQ") or "").strip()


def write_admin(value):
    qq = str(value or "").strip()
    if qq and not qq.isdigit():
        raise ValueError("管理员 QQ 只能是数字")
    if len(qq) > 20:
        raise ValueError("管理员 QQ 太长")
    write_json(ADMIN_FILE, {"adminQQ": qq, "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S")})
    return qq


def ensure_runtime():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    if not MODE_FILE.exists():
        write_json(MODE_FILE, {"mode": "snowluma", "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S")})
    if not ADMIN_FILE.exists():
        write_json(ADMIN_FILE, {"adminQQ": "", "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S")})


def onebot_state():
    status, data = http_json(f"http://127.0.0.1:{ONEBOT_LOCAL_PORT}/local/status")
    return {
        "running": status == 200,
        "httpPort": ONEBOT_HTTP_PORT,
        "wsPort": ONEBOT_WS_PORT,
        "localPort": ONEBOT_LOCAL_PORT,
        "profile": (data or {}).get("mode") or read_mode(),
        "clients": (data or {}).get("clients") or 0,
    }


def start_onebot():
    current = onebot_state()
    if current["running"]:
        return {"ok": True, "reused": True, **current}
    node = NODE if Path(NODE).exists() else shutil.which(NODE)
    if not node:
        raise RuntimeError("找不到 node，请设置 NODE 环境变量")
    if not ONEBOT_SERVER.exists():
        raise RuntimeError("找不到 onebot/server.mjs")
    env = os.environ.copy()
    env["ONEBOT_HTTP_PORT"] = str(ONEBOT_HTTP_PORT)
    env["ONEBOT_WS_PORT"] = str(ONEBOT_WS_PORT)
    env["ONEBOT_LOCAL_PORT"] = str(ONEBOT_LOCAL_PORT)
    flags = 0
    if os.name == "nt":
        flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(
        [node, str(ONEBOT_SERVER)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=flags,
    )
    deadline = time.time() + 15
    while time.time() < deadline:
        if onebot_state()["running"]:
            return {"ok": True, "reused": False, **onebot_state()}
        time.sleep(0.5)
    raise RuntimeError("OneBot 兼容层 15 秒内没有起来")


def chatbox_state():
    status, data = http_json(f"http://127.0.0.1:{CHATBOX_PORT}/api/status")
    return {"running": status == 200, "url": f"http://127.0.0.1:{CHATBOX_PORT}", "port": CHATBOX_PORT, "mode": (data or {}).get("mode") or read_mode()}


def start_chatbox():
    current = chatbox_state()
    if current["running"]:
        return {"ok": True, "reused": True, **current}
    node = NODE if Path(NODE).exists() else shutil.which(NODE)
    if not node:
        raise RuntimeError("找不到 node，请设置 NODE 环境变量")
    if not CHATBOX_SERVER.exists():
        raise RuntimeError("找不到 chatbox/server.mjs")
    flags = 0
    if os.name == "nt":
        flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    env = os.environ.copy()
    env["CHATBOX_PORT"] = str(CHATBOX_PORT)
    subprocess.Popen(
        [node, str(CHATBOX_SERVER)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=flags,
    )
    deadline = time.time() + 15
    while time.time() < deadline:
        if chatbox_state()["running"]:
            return {"ok": True, "reused": False, **chatbox_state()}
        time.sleep(0.5)
    raise RuntimeError("Chatbox 15 秒内没有起来")


def state():
    return {"ok": True, "mode": read_mode(), "adminQQ": admin_qq(), "onebot": onebot_state(), "chatbox": chatbox_state()}


class Handler(BaseHTTPRequestHandler):
    server_version = "EmergencyPanel/1.0"

    def log_message(self, fmt, *args):
        # pythonw.exe has no stderr; writing a log line there raises and kills
        # the request before headers are sent. Stay silent instead.
        if sys.stderr:
            super().log_message(fmt, *args)

    def _json(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        try:
            length = int(self.headers.get("content-length") or 0)
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8", "replace") or "{}")
        except Exception:
            return {}

    def do_GET(self):
        if self.path.startswith("/api/state"):
            return self._json(state())
        if self.path in ("/favicon.ico", "/logo.png"):
            name = "favicon.ico" if self.path == "/favicon.ico" else "logo.png"
            body = (HERE / name).read_bytes()
            self.send_response(200)
            self.send_header("content-type", "image/x-icon" if name.endswith(".ico") else "image/png")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path in ("/", "/index.html"):
            body = (HERE / "index.html").read_bytes()
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return self._json({"ok": False, "error": "not found"}, 404)

    def do_POST(self):
        if self.path.startswith("/api/start"):
            try:
                onebot = start_onebot()
                chatbox = start_chatbox()
                return self._json({"ok": True, "onebot": onebot, "chatbox": chatbox, "chatUrl": chatbox["url"]})
            except Exception as exc:
                return self._json({"ok": False, "error": str(exc)}, 500)
        if self.path.startswith("/api/mode"):
            body = self._body()
            return self._json({"ok": True, "mode": write_mode(str(body.get("mode") or ""))})
        if self.path.startswith("/api/admin"):
            body = self._body()
            try:
                return self._json({"ok": True, "adminQQ": write_admin(body.get("adminQQ"))})
            except Exception as exc:
                return self._json({"ok": False, "error": str(exc)}, 400)
        return self._json({"ok": False, "error": "not found"}, 404)


def main():
    ensure_runtime()
    server = ThreadingHTTPServer(("127.0.0.1", PANEL_PORT), Handler)
    print(f"Bourbon Fallback Relay panel http://127.0.0.1:{PANEL_PORT}")
    server.serve_forever()


if __name__ == "__main__":
    raise SystemExit(main())




