"""Document and batch() against a fake session (no app, no bridge)."""

from __future__ import annotations

from typing import Any

import pytest

from magazine import BatchError, Document, ToolError
from magazine._tools import BATCH_OPS_MAX


class FakeSession:
    """Records calls; `batch` answers one result per op (`{"id": "r<N>"}`, add_page like the app)."""

    def __init__(self, fail: str | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.fail = fail

    def call(self, tool: str, args: dict[str, Any] | None = None) -> Any:
        self.calls.append((tool, args or {}))
        if tool != "batch":
            return {"tool": tool}
        if self.fail:
            raise ToolError(f"batch: {self.fail}")
        return {"results": [_result(op["tool"], index) for index, op in enumerate(args["ops"])]}


def _result(tool: str, index: int) -> Any:
    if tool == "add_page":
        return {"pages": [{"id": f"page{index}", "name": "Page-2"}], "activePageId": f"page{index}"}
    return {"id": f"r{index}"}


def test_calls_outside_a_batch_go_straight_to_the_app() -> None:
    session = FakeSession()
    doc = Document(session)  # type: ignore[arg-type]
    assert doc.get_document() == {"tool": "get_document"}
    assert doc.call("list_elements", {"pageId": "p"}) == {"tool": "list_elements"}
    assert session.calls == [("get_document", {}), ("list_elements", {"pageId": "p"})]


def test_batch_collects_calls_and_turns_pending_fields_into_refs() -> None:
    session = FakeSession()
    doc = Document(session)  # type: ignore[arg-type]
    with doc.batch():
        page = doc.add_page()
        text = doc.add_text(pageId=page["pages"][0]["id"], text="標題", x=40, y=40)
        doc.update_element(id=text["id"], points=[{"x": 0, "y": 0}], shadow=None)
        doc.call("get_element", {"id": text})
        assert session.calls == []

    assert session.calls == [
        (
            "batch",
            {
                "ops": [
                    {"tool": "add_page", "args": {}},
                    {"tool": "add_text", "args": {"pageId": {"$ref": "0.pages.0.id"}, "text": "標題", "x": 40, "y": 40}},
                    {"tool": "update_element", "args": {"id": {"$ref": "1.id"}, "points": [{"x": 0, "y": 0}], "shadow": None}},
                    {"tool": "get_element", "args": {"id": {"$ref": "1"}}},
                ]
            },
        )
    ]
    assert text.result == {"id": "r1"}
    assert page["pages"][0]["id"].value() == "page0"


def test_results_of_an_earlier_batch_are_sent_as_real_values() -> None:
    session = FakeSession()
    doc = Document(session)  # type: ignore[arg-type]
    with doc.batch():
        text = doc.add_text(text="一", x=0, y=0)
    doc.update_element(id=text["id"], x=10)
    with doc.batch():
        doc.delete_elements(ids=[text["id"]])

    assert session.calls[1] == ("update_element", {"id": "r0", "x": 10})
    assert session.calls[2] == ("batch", {"ops": [{"tool": "delete_elements", "args": {"ids": ["r0"]}}]})


def test_nothing_is_sent_for_an_empty_batch_or_when_the_block_raises() -> None:
    session = FakeSession()
    doc = Document(session)  # type: ignore[arg-type]
    with doc.batch():
        pass
    with pytest.raises(KeyError):
        with doc.batch():
            pending = doc.add_text(text="x", x=0, y=0)
            raise KeyError("stop")
    assert session.calls == []
    with pytest.raises(RuntimeError, match="還沒有結果"):
        _ = pending.result
    assert doc.get_document() == {"tool": "get_document"}  # 離開後回到一般呼叫


def test_a_rejected_batch_raises_batch_error_with_the_operation() -> None:
    session = FakeSession(fail="ops[1]（add_text）：參數 x：必須是數字\n整批沒有套用，文件沒有改變。")
    doc = Document(session)  # type: ignore[arg-type]
    with pytest.raises(BatchError) as caught:
        with doc.batch():
            page = doc.add_page()
            doc.add_text(text="x", x="bad", y=0)  # type: ignore[arg-type]
    assert (caught.value.index, caught.value.tool) == (1, "add_text")
    assert str(caught.value).startswith("ops[1]（add_text）")
    with pytest.raises(RuntimeError):
        _ = page.result


def test_batches_cannot_nest_or_exceed_the_limit() -> None:
    doc = Document(FakeSession())  # type: ignore[arg-type]
    with pytest.raises(RuntimeError, match="巢狀"):
        with doc.batch():
            with doc.batch():
                pass
    with pytest.raises(ValueError, match=str(BATCH_OPS_MAX)):
        with doc.batch():
            for _ in range(BATCH_OPS_MAX + 1):
                doc.get_document()


def test_example_one_page_builds_the_page_in_one_batch() -> None:
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent / "examples" / "one_page.py"
    spec = importlib.util.spec_from_file_location("one_page", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    session = FakeSession()
    session.call = _with_document(session.call)  # type: ignore[method-assign]
    ids = module.build_page(Document(session), "標題")  # type: ignore[arg-type]
    assert ids == {"pageId": "page0", "title": "r1", "box": "r3"}
    assert [tool for tool, _ in session.calls] == ["get_document", "batch"]
    assert [op["tool"] for op in session.calls[1][1]["ops"]] == ["add_page", "add_text", "add_shape", "add_shape", "add_text"]


def _with_document(call: Any) -> Any:
    def wrapped(tool: str, args: dict[str, Any] | None = None) -> Any:
        result = call(tool, args)
        return {"pageSizes": [{"width": 595.28, "height": 841.89}]} if tool == "get_document" else result

    return wrapped
