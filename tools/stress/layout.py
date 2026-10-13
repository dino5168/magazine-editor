"""The 05-Story Test page layouts (pt, A4 with 15 mm margins), shared by the stress scripts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from mcp_client import McpSession

LEFT_X, RIGHT_X, COLUMN_W = 42.52, 304.73, 248.03
TOP_Y, LOWER_Y = 42.52, 236.69
IMAGE_H, FULL_H = 180.0, 756.85
TITLE_BODY_Y = 133.49  # body under the two-line title

FRAMES: dict[str, str] = json.loads((Path(__file__).with_name("frames.json")).read_text(encoding="utf-8"))
TITLE, _, FIRST_BODY = FRAMES["p2A"].partition("\n\n")


def _image(session: McpSession, page_id: str, x: float, height: float) -> None:
    session.call("add_shape", {"pageId": page_id, "shape": "rect", "x": x, "y": TOP_Y, "width": COLUMN_W,
                               "height": height, "fill": "#e5e7eb", "text": "圖片", "textColor": "#6b7280", "fontSize": 14})


def _body(session: McpSession, page_id: str, x: float, y: float, text: str) -> None:
    session.call("add_text", {"pageId": page_id, "style": "內文", "x": x, "y": y, "width": COLUMN_W, "text": text})


def fill_page(session: McpSession, page_id: str, kind: int) -> int:
    """Fills one page with one of the three story layouts.

    Args:
        session: Connected MCP session.
        page_id: Target page.
        kind: 0 = title + text | image + text, 1 = image + text | full image, 2 = text | image + text.

    Returns:
        Number of elements added.
    """
    if kind == 0:
        session.call("add_text", {"pageId": page_id, "style": "標題", "x": LEFT_X, "y": TOP_Y, "width": COLUMN_W, "text": TITLE})
        _body(session, page_id, LEFT_X, TITLE_BODY_Y, FIRST_BODY)
        _image(session, page_id, RIGHT_X, IMAGE_H)
        _body(session, page_id, RIGHT_X, LOWER_Y, FRAMES["p2B"])
        return 4
    if kind == 1:
        _image(session, page_id, LEFT_X, IMAGE_H)
        _body(session, page_id, LEFT_X, LOWER_Y, FRAMES["p3"])
        _image(session, page_id, RIGHT_X, FULL_H)
        return 3
    _body(session, page_id, LEFT_X, TOP_Y, FRAMES["p4A"])
    _image(session, page_id, RIGHT_X, IMAGE_H)
    _body(session, page_id, RIGHT_X, LOWER_Y, FRAMES["p4B"])
    return 3


def add_pages(session: McpSession, count: int) -> list[str]:
    """Appends `count` blank pages without a master (`add_page` takes at most 100 at a time).

    Args:
        session: Connected MCP session.
        count: Pages to add.

    Returns:
        The new page ids in order.
    """
    before: int = session.call("get_document")["pageCount"]
    ids: list[str] = []
    for done in range(0, count, 100):
        added: dict[str, Any] = session.call(
            "add_page", {"count": min(100, count - done), "masterId": None, "pageNumber": before + done, "side": "after"}
        )
        ids += [page["id"] for page in added["pages"]]
    return ids
