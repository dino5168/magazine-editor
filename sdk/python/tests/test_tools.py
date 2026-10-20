"""The generated tool methods (`magazine/_tools.py`) against the app's tool list."""

from __future__ import annotations

import inspect
from typing import Any

import generate  # scripts/generate.py（pytest 的 pythonpath 含 scripts）
from magazine._tools import TOOL_NAMES, UNSET, ToolMethods

TOOLS = generate.load_tools()


class Recorder(ToolMethods):
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def _call(self, tool: str, args: dict[str, Any]) -> Any:
        self.calls.append((tool, args))
        return {"ok": tool}


def test_generated_file_is_up_to_date() -> None:
    # 失敗時：cd sdk/python; uv run python scripts/generate.py
    assert generate.OUTPUT.read_text(encoding="utf-8") == generate.generate(TOOLS)


def test_every_tool_but_batch_has_a_method() -> None:
    names = {tool["name"] for tool in TOOLS}
    assert TOOL_NAMES == names - {"batch"}
    for name in TOOL_NAMES:
        assert callable(getattr(ToolMethods, name))
    assert "batch" not in vars(ToolMethods)


def test_parameters_follow_the_schema() -> None:
    for tool in TOOLS:
        if tool["name"] == "batch":
            continue
        schema = tool["inputSchema"]
        parameters = inspect.signature(getattr(ToolMethods, tool["name"])).parameters
        assert set(parameters) - {"self"} == set(schema.get("properties", {}))
        for name in schema.get("properties", {}):
            parameter = parameters[name]
            assert parameter.kind is inspect.Parameter.KEYWORD_ONLY
            required = name in schema.get("required", [])
            assert (parameter.default is inspect.Parameter.empty) == required, f"{tool['name']}.{name}"
            if not required:
                assert parameter.default is UNSET


def test_calls_send_given_arguments_only_and_keep_none() -> None:
    recorder = Recorder()
    assert recorder.add_text(text="標題", x=1, y=2, pageId="p1") == {"ok": "add_text"}
    recorder.update_element(id="e1", shadow=None)
    recorder.get_document()
    assert recorder.calls == [
        ("add_text", {"text": "標題", "x": 1, "y": 2, "pageId": "p1"}),
        ("update_element", {"id": "e1", "shadow": None}),
        ("get_document", {}),
    ]


def test_python_type_mapping() -> None:
    assert generate.python_type({"type": "string"}) == "str"
    assert generate.python_type({"anyOf": [{"type": "null"}, {"type": "string"}]}) == "str | None"
    assert generate.python_type({"type": "string", "enum": ["a", "b"]}) == 'Literal["a", "b"]'
    assert generate.python_type({"type": "array", "items": {"type": "number"}}) == "list[float]"
    assert generate.python_type({"type": "array", "prefixItems": [{}], "items": False}) == "list[Any]"
    assert generate.python_type({"type": "object"}) == "dict[str, Any]"
    assert generate.python_type({}) == "Any"
