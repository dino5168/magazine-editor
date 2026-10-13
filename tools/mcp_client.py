"""Minimal MCP client for the magazine-mcp bridge (stdio, one JSON-RPC message per line).

The scripts in this folder use it to drive the running app the same way Claude Code does.
"""

from __future__ import annotations

import json
import subprocess
import time
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
PROTOCOL_VERSION = "2025-06-18"


def default_bridge(profile: str = "release") -> Path:
    """Path of the bridge built by `cargo build --bin magazine-mcp` (or `tauri build`).

    Args:
        profile: Cargo profile directory, `release` or `debug`.

    Returns:
        Absolute path of `magazine-mcp.exe`.
    """
    return REPO_ROOT / "src-tauri" / "target" / profile / "magazine-mcp.exe"


class ToolError(RuntimeError):
    """A tool call the app answered with `isError` (bad arguments, app not running, ...)."""


@dataclass(frozen=True)
class CallRecord:
    """Timing of one tool call."""

    tool: str
    ms: float
    ok: bool


@dataclass
class McpSession:
    """An initialized connection to the bridge; `call` runs one tool and records its timing."""

    process: subprocess.Popen[bytes]
    records: list[CallRecord] = field(default_factory=list)
    _next_id: int = 0

    def _send(self, method: str, params: dict[str, Any] | None, notify: bool = False) -> dict[str, Any] | None:
        message: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            message["params"] = params
        if not notify:
            self._next_id += 1
            message["id"] = self._next_id
        assert self.process.stdin and self.process.stdout
        self.process.stdin.write((json.dumps(message, ensure_ascii=False) + "\n").encode("utf-8"))
        self.process.stdin.flush()
        if notify:
            return None
        # 橋接程式可能先送通知（沒有 id），只收對應這次 id 的回應
        while True:
            line = self.process.stdout.readline()
            if not line:
                raise ConnectionError("magazine-mcp exited")
            response = json.loads(line)
            if response.get("id") == self._next_id:
                return response

    def call(self, tool: str, args: dict[str, Any] | None = None) -> Any:
        """Calls one MCP tool.

        Args:
            tool: Tool name, e.g. `add_text`.
            args: Tool arguments.

        Returns:
            The tool's JSON result (decoded), or its text when it is not JSON.

        Raises:
            ToolError: The app rejected the call; the message is the app's explanation.
        """
        started = time.perf_counter()
        response = self._send("tools/call", {"name": tool, "arguments": args or {}})
        assert response is not None
        ms = (time.perf_counter() - started) * 1000
        if "error" in response:
            self.records.append(CallRecord(tool, ms, False))
            raise ToolError(f"{tool}: {response['error'].get('message', response['error'])}")
        result = response["result"]
        text = result["content"][0]["text"] if result.get("content") else ""
        ok = not result.get("isError")
        self.records.append(CallRecord(tool, ms, ok))
        if not ok:
            raise ToolError(f"{tool}: {text}")
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text


@contextmanager
def connect(command: Sequence[str | Path] | None = None, client_name: str = "magazine-tools") -> Iterator[McpSession]:
    """Starts the bridge, runs the MCP handshake and closes it afterwards.

    Args:
        command: Bridge command line; defaults to the release `magazine-mcp.exe`.
        client_name: Name reported to the server.

    Yields:
        The initialized session.
    """
    process = subprocess.Popen(
        [str(part) for part in (command or [default_bridge()])],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    session = McpSession(process)
    try:
        session._send(
            "initialize",
            {"protocolVersion": PROTOCOL_VERSION, "capabilities": {}, "clientInfo": {"name": client_name, "version": "0"}},
        )
        session._send("notifications/initialized", None, notify=True)
        yield session
    finally:
        if process.stdin:
            process.stdin.close()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
