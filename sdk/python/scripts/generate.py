"""Generates `magazine/_tools.py` from the app's MCP tool list (`src-tauri/mcp-tools.json`).

Run from `sdk/python/` after the tool list changes (`npx vitest run mcp-tools -u` in the repo root):

    uv run python scripts/generate.py

`tests/test_tools.py` fails when the file is out of date.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

SDK_ROOT = Path(__file__).resolve().parent.parent
TOOLS_JSON = SDK_ROOT.parent.parent / "src-tauri" / "mcp-tools.json"
OUTPUT = SDK_ROOT / "magazine" / "_tools.py"

# batch 由 Document.batch()（收集呼叫、一次送出）提供，不產生同名方法
SKIPPED_TOOLS = frozenset({"batch"})

_JSON_TYPES = {"string": "str", "number": "float", "integer": "int", "boolean": "bool", "null": "None"}

HEADER = '''\
"""MCP tool methods, generated from `src-tauri/mcp-tools.json` by `scripts/generate.py`. Do not edit.

Parameter names are the MCP names (camelCase, e.g. `pageId`), the same Claude Code sees. Omitted
optional parameters are not sent; `None` is sent as JSON `null` (e.g. `shadow=None` removes it).
"""

# ruff: noqa: E501, N803

from __future__ import annotations

from typing import Any, Final, Literal


class _Unset:
    """Marks an optional parameter that was not given (so it is not sent)."""

    _instance: _Unset | None = None

    def __new__(cls) -> _Unset:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __repr__(self) -> str:
        return "UNSET"


UNSET: Final = _Unset()


def _args(values: dict[str, Any]) -> dict[str, Any]:
    return {name: value for name, value in values.items() if value is not UNSET}


class ToolMethods:
    """One method per MCP tool; subclasses decide how a call is sent (`_call`)."""

    def _call(self, tool: str, args: dict[str, Any]) -> Any:
        raise NotImplementedError
'''


def python_type(schema: dict[str, Any]) -> str:
    """Annotation for one JSON Schema property (loose: objects and arrays stay `dict` / `list`).

    Args:
        schema: Property schema from `mcp-tools.json`.

    Returns:
        A type expression such as `str | dict[str, Any] | None`.
    """
    if not isinstance(schema, dict):  # items: false（tuple 的 prefixItems 之外不收）
        return "Any"
    if "anyOf" in schema:
        parts: list[str] = []
        for option in schema["anyOf"]:
            for part in python_type(option).split(" | "):
                if part not in parts:
                    parts.append(part)
        if "None" in parts:  # None 放最後
            parts.remove("None")
            parts.append("None")
        return " | ".join(parts)
    if "enum" in schema:
        return f"Literal[{', '.join(json.dumps(value, ensure_ascii=False) for value in schema['enum'])}]"
    kind = schema.get("type")
    if kind == "array" and "prefixItems" in schema:  # 固定長度，例如圓角 [左上, 右上, 右下, 左下]
        return "list[Any]"
    if kind == "array":
        return f"list[{python_type(schema.get('items', {}))}]"
    if kind == "object":
        return "dict[str, Any]"
    if isinstance(kind, str) and kind in _JSON_TYPES:
        return _JSON_TYPES[kind]
    return "Any"


def _docstring_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"""', '\\"\\"\\"')


# 不自動換行：說明大多是中文，textwrap 只在空白處斷，斷出來的行長短不一
def _indented(text: str, indent: str) -> list[str]:
    return [f"{indent}{line}".rstrip() for line in text.splitlines() or [""]]


def method_source(tool: dict[str, Any]) -> str:
    """Source of one generated method.

    Args:
        tool: One entry of `mcp-tools.json`.

    Returns:
        The method, indented for the class body.
    """
    name = tool["name"]
    schema = tool["inputSchema"]
    properties: dict[str, Any] = schema.get("properties", {})
    required = set(schema.get("required", []))
    # 必填在前；其餘照 schema 的順序
    ordered = [n for n in properties if n in required] + [n for n in properties if n not in required]
    params = ["self"]
    if ordered:
        params.append("*")
    for param in ordered:
        annotation = python_type(properties[param])
        params.append(f"{param}: {annotation}" if param in required else f"{param}: {annotation} | _Unset = UNSET")

    doc = [f'        """{_docstring_text(tool["title"])}', ""]
    doc += _indented(_docstring_text(tool["description"]), "        ")
    if ordered:
        doc += ["", "        Args:"]
        for param in ordered:
            description = properties[param].get("description", "")
            suffix = "" if param in required else "（可省略）"
            doc += _indented(_docstring_text(f"{param}: {description}{suffix}".rstrip()), "            ")
    doc += ["", "        Returns:", "            The tool's JSON result.", '        """']

    values = ", ".join(f'"{param}": {param}' for param in ordered)
    body = f'        return self._call("{name}", _args({{{values}}}))'
    if ordered:
        signature = f"    def {name}(\n" + "".join(f"        {param},\n" for param in params) + "    ) -> Any:"
    else:
        signature = f"    def {name}(self) -> Any:"
    return "\n".join([signature, *doc, body])


def generate(tools: list[dict[str, Any]]) -> str:
    """Builds the whole `_tools.py`.

    Args:
        tools: The parsed `mcp-tools.json`.

    Returns:
        The file text (LF, trailing newline).
    """
    methods = [method_source(tool) for tool in tools if tool["name"] not in SKIPPED_TOOLS]
    names = sorted(tool["name"] for tool in tools if tool["name"] not in SKIPPED_TOOLS)
    footer = "\n\nTOOL_NAMES: Final = frozenset({\n" + "".join(f'    "{n}",\n' for n in names) + "})\n"
    batch = next((tool for tool in tools if tool["name"] == "batch"), None)
    if batch:
        limit = batch["inputSchema"]["properties"]["ops"]["maxItems"]
        footer += f'\nBATCH_OPS_MAX: Final = {limit}\n"""Most operations the `batch` tool accepts in one call."""\n'
    return HEADER + "\n" + "\n\n".join(methods) + "\n" + footer


def load_tools() -> list[dict[str, Any]]:
    return json.loads(TOOLS_JSON.read_text(encoding="utf-8"))


def main() -> int:
    OUTPUT.write_text(generate(load_tools()), encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT.relative_to(SDK_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
