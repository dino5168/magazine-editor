"""`Document`: the app's open document as a Python object, with `batch()` for one-call batches."""

from __future__ import annotations

import re
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from magazine import client
from magazine._tools import BATCH_OPS_MAX, ToolMethods
from magazine.client import McpSession, ToolError

_NOT_YET = object()


class BatchError(ToolError):
    """A batch the app rejected; nothing in it was applied.

    Attributes:
        index: Which operation failed (0-based, as in `ops[N]`), or None when unknown.
        tool: That operation's tool name, or None.
    """

    def __init__(self, message: str, index: int | None, tool: str | None) -> None:
        super().__init__(message)
        self.index = index
        self.tool = tool


class Ref:
    """A field of a pending result, e.g. `pending["id"]`; sent as `{"$ref": "N.id"}`."""

    def __init__(self, pending: Pending, path: tuple[str | int, ...]) -> None:
        self.pending = pending
        self.path = path

    def __getitem__(self, key: str | int) -> Ref:
        return Ref(self.pending, (*self.path, key))

    def ref_string(self) -> str:
        return ".".join(str(part) for part in (self.pending.index, *self.path))

    def value(self) -> Any:
        """The real value, once the batch has been sent."""
        value = self.pending.result
        for part in self.path:
            value = value[part]
        return value

    def __repr__(self) -> str:
        return f"Ref({self.ref_string()!r})"


class Pending(Ref):
    """What a tool method returns inside `doc.batch()`: the result arrives when the batch is sent.

    Index it (`pending["id"]`, `pending["pages"][0]["id"]`) to pass a field to a later call in the
    same batch; read `pending.result` after the `with` block.
    """

    def __init__(self, batch: _Batch, index: int, tool: str) -> None:
        super().__init__(self, ())
        self.batch = batch
        self.index = index
        self.tool = tool
        self._result: Any = _NOT_YET

    @property
    def result(self) -> Any:
        """The tool's result. Raises RuntimeError before the batch was sent successfully."""
        if self._result is _NOT_YET:
            raise RuntimeError(f"ops[{self.index}]（{self.tool}）還沒有結果：batch 還沒送出或失敗了")
        return self._result

    def __repr__(self) -> str:
        state = "pending" if self._result is _NOT_YET else "done"
        return f"Pending(ops[{self.index}] {self.tool}, {state})"


class _Batch:
    def __init__(self) -> None:
        self.ops: list[dict[str, Any]] = []
        self.pendings: list[Pending] = []


_OP_INDEX = re.compile(r"^(?:batch: )?ops\[(\d+)\]（([^）]+)）")


class Document(ToolMethods):
    """The document open in the app. Every generated tool method is available (`doc.add_text(...)`).

    Outside `batch()` each method call is one MCP call (one undo step) and returns the result.
    Inside `batch()` calls are collected and sent as one `batch` call when the block ends.
    """

    def __init__(self, session: McpSession) -> None:
        self.session = session
        self._batch: _Batch | None = None

    def call(self, tool: str, args: dict[str, Any] | None = None) -> Any:
        """Calls a tool by name (batch-aware, like the generated methods).

        Args:
            tool: MCP tool name.
            args: Arguments; may hold `Ref` / `Pending`.

        Returns:
            The result, or a `Pending` inside `batch()`.
        """
        return self._call(tool, args or {})

    def _call(self, tool: str, args: dict[str, Any]) -> Any:
        batch = self._batch
        if batch is None:
            return self.session.call(tool, _resolved(args))
        if len(batch.ops) >= BATCH_OPS_MAX:
            raise ValueError(f"一個 batch 最多 {BATCH_OPS_MAX} 個操作；請分成幾個 batch")
        pending = Pending(batch, len(batch.ops), tool)
        batch.ops.append({"tool": tool, "args": _with_refs(args, batch)})
        batch.pendings.append(pending)
        return pending

    @contextmanager
    def batch(self) -> Iterator[Document]:
        """Collects the calls made inside the block and sends them as one `batch` call.

        All of them apply as one undo step, or none of them (the app rolls the whole batch back on
        the first error). Nothing is sent when the block raises or makes no calls.

        Yields:
            This document.

        Raises:
            BatchError: The app rejected the batch (`index` tells which operation).
            RuntimeError: `batch()` is already open.
        """
        if self._batch is not None:
            raise RuntimeError("batch() 不能巢狀使用")
        batch = _Batch()
        self._batch = batch
        try:
            yield self
        finally:
            self._batch = None
        if not batch.ops:
            return
        try:
            response = self.session.call("batch", {"ops": batch.ops})
        except ToolError as error:
            message = str(error).removeprefix("batch: ")
            match = _OP_INDEX.match(message)
            raise BatchError(message, int(match[1]) if match else None, match[2] if match else None) from None
        for pending, result in zip(batch.pendings, response["results"], strict=True):
            pending._result = result


def _with_refs(value: Any, batch: _Batch) -> Any:
    if isinstance(value, Ref):
        if value.pending.batch is not batch:
            return value.value()  # 前一個 batch 的結果：已經有實際的值
        return {"$ref": value.ref_string()}
    if isinstance(value, dict):
        return {key: _with_refs(item, batch) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_with_refs(item, batch) for item in value]
    return value


def _resolved(value: Any) -> Any:
    if isinstance(value, Ref):
        return value.value()
    if isinstance(value, dict):
        return {key: _resolved(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_resolved(item) for item in value]
    return value


@contextmanager
def connect(bridge: str | Path | None = None, *, profile: str = "release", command: Sequence[str | Path] | None = None) -> Iterator[Document]:
    """Connects to the running app.

    Args:
        bridge: Path of `magazine-mcp.exe`; defaults to `MAGAZINE_MCP_EXE` or the repo's build.
        profile: Cargo profile of the repo's build (`release` or `debug`) when `bridge` is omitted.
        command: Full bridge command line (tests); overrides `bridge` and `profile`.

    Yields:
        The open document.
    """
    line = command or [bridge or client.default_bridge(profile)]
    with client.connect(line) as session:
        yield Document(session)
