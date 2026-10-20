"""Python SDK for 雜誌編輯軟體 (magazine-editor): drives the running app through its MCP bridge.

The app must be open with 設定 → 偏好設定 → Claude Code 連線（MCP） turned on.

    import magazine

    with magazine.connect(profile="debug") as doc:
        with doc.batch():
            page = doc.add_page()
            doc.add_text(pageId=page["pages"][0]["id"], text="標題", x=40, y=40)
"""

from magazine.client import CallRecord, McpSession, ToolError, default_bridge
from magazine.document import BatchError, Document, Pending, Ref, connect

__all__ = [
    "BatchError",
    "CallRecord",
    "Document",
    "McpSession",
    "Pending",
    "Ref",
    "ToolError",
    "connect",
    "default_bridge",
]
