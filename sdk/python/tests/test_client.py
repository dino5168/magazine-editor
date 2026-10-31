"""magazine.client against a fake bridge that speaks the same line-delimited JSON-RPC."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from magazine.client import BRIDGE_ENV, ToolError, connect, default_bridge

FAKE_BRIDGE = r'''
import json, sys
sys.stdout.reconfigure(encoding="utf-8")  # the real bridge writes UTF-8; Windows pipes default to the ANSI code page
sys.stdin.reconfigure(encoding="utf-8")
for line in sys.stdin:
    msg = json.loads(line)
    if "id" not in msg:
        continue  # notification
    if msg["method"] == "initialize":
        result = {"protocolVersion": msg["params"]["protocolVersion"], "capabilities": {}, "serverInfo": {"name": "fake"}}
    else:
        name, args = msg["params"]["name"], msg["params"]["arguments"]
        # 先送一個沒有 id 的通知，用戶端要略過它
        print(json.dumps({"jsonrpc": "2.0", "method": "notifications/message", "params": {}}), flush=True)
        if name == "echo":
            result = {"content": [{"type": "text", "text": json.dumps(args, ensure_ascii=False)}]}
        elif name == "picture":
            result = {"content": [
                {"type": "image", "data": "iVBORw0K", "mimeType": "image/png"},
                {"type": "text", "text": "頁面「1」"},
            ]}
        elif name == "plain":
            result = {"content": [{"type": "text", "text": "not json"}]}
        else:
            result = {"content": [{"type": "text", "text": "找不到頁面"}], "isError": True}
    print(json.dumps({"jsonrpc": "2.0", "id": msg["id"], "result": result}, ensure_ascii=False), flush=True)
'''


@pytest.fixture
def bridge(tmp_path: Path) -> list[str]:
    script = tmp_path / "fake_bridge.py"
    script.write_text(FAKE_BRIDGE, encoding="utf-8")
    return [sys.executable, "-I", str(script)]


def test_call_returns_json_and_records_timing(bridge: list[str]) -> None:
    with connect(bridge) as session:
        assert session.call("echo", {"text": "中文"}) == {"text": "中文"}
        assert session.call("plain") == "not json"
    assert [(r.tool, r.ok) for r in session.records] == [("echo", True), ("plain", True)]
    assert all(r.ms >= 0 for r in session.records)


def test_pictures_come_back_as_bytes_with_their_description(bridge: list[str]) -> None:
    with connect(bridge) as session:
        picture = session.call("picture")
    assert picture == {"image": b"\x89PNG\r\n", "mimeType": "image/png", "info": "頁面「1」"}


def test_tool_error_carries_the_app_message(bridge: list[str]) -> None:
    with connect(bridge) as session:
        with pytest.raises(ToolError, match="找不到頁面"):
            session.call("add_text", {"pageId": "missing"})
    assert session.records[-1].ok is False


def test_default_bridge_points_into_the_cargo_target() -> None:
    path = default_bridge("debug")
    assert path.parts[-4:] == ("src-tauri", "target", "debug", "magazine-mcp.exe")


def test_environment_variable_overrides_the_bridge(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    exe = tmp_path / "magazine-mcp.exe"
    monkeypatch.setenv(BRIDGE_ENV, str(exe))
    assert default_bridge("debug") == exe
