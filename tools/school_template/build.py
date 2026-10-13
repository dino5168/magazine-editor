"""Build the school magazine template in the document open in the app, through MCP.

Start from a new blank A4 document (檔案 → 新增). If a run stopped half way, rerun with
--resume-from N: the setup (swatches, styles, master, pages) is kept and pages N.. are rebuilt.
Run from `tools/`:  uv run python -m school_template.build [--exe PATH] [--resume-from N]
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from mcp_client import McpSession, ToolError, connect, default_bridge
from school_template import spec

PX_TO_PT = 0.75  # the reference page is 794 x 1123 px = A4 595.28 x 841.89 pt
MIN_SHAPE_PT = 4  # the app's smallest element size (MIN_ELEMENT_SIZE_PT): no hairlines
DOCUMENT_NAME = "Maplewood School Magazine"


def pt(px: float) -> float:
    """Reference px -> pt."""
    return round(px * PX_TO_PT, 2)


def style_fields(style: dict[str, Any]) -> dict[str, Any]:
    """Spec style (px, swatch name...) -> MCP text style fields.

    Args:
        style: Entry of `spec.BUILTIN_STYLE_UPDATES` / `spec.NEW_STYLES`, or overrides on a text.

    Returns:
        Arguments for add_text_style / update_text_style / add_text.
    """
    fields: dict[str, Any] = {"font": "黑體"}
    if "px" in style:
        fields["fontSize"] = pt(style["px"])
    if "color" in style:
        fields["textColor"] = {"swatch": style["color"]}
    fields.update({key: style[key] for key in ("bold", "italic", "align", "lineHeight", "letterSpacing") if key in style})
    return fields


def add_item(session: McpSession, page_id: str, item: tuple[str, Any, list[float], str | None]) -> None:
    """Adds one spec element to a page or master page."""
    kind, options, box, text = item
    x, y, w, h = (pt(v) for v in box)
    if kind == "T":
        overrides = {"style": options} if isinstance(options, str) else dict(options)
        args = {"pageId": page_id, "style": overrides.pop("style"), "x": x, "y": y, "width": w, "text": text}
        args.update({k: v for k, v in style_fields(overrides).items() if k != "font"})  # 字型跟著樣式
        session.call("add_text", args)
    elif kind == "IMG":  # photo placeholder; MCP cannot import pictures
        session.call("add_shape", {"pageId": page_id, "shape": "ellipse" if options.get("round") else "rect",
                                   "x": x, "y": y, "width": w, "height": h, "fill": {"swatch": "佔位灰"},
                                   "text": text, "fontSize": 8, "letterSpacing": 150, "textColor": {"swatch": "內文灰"}})
    elif kind == "LINE":
        session.call("add_shape", {"pageId": page_id, "shape": "rect", "x": x, "y": y, "width": max(w, MIN_SHAPE_PT),
                                   "height": max(h, MIN_SHAPE_PT), "fill": {"swatch": options}})
    elif kind == "DOT":
        dot = {"fill": options} if isinstance(options, str) else options
        args = {"pageId": page_id, "shape": "ellipse", "x": x, "y": y, "width": w, "height": h, "fill": {"swatch": dot["fill"]}}
        if "text" in dot:
            args.update({"text": dot["text"], "fontSize": 11, "bold": True, "textColor": {"swatch": "白"}})
        session.call("add_shape", args)
    elif kind == "BOX":
        args = {"pageId": page_id, "shape": "rect", "x": x, "y": y, "width": w, "height": h}
        if "stroke" in options:
            args |= {"fill": "#00000000", "stroke": {"color": {"swatch": options["stroke"]}, "width": 0.75, "dash": "solid"}}
        else:
            args["fill"] = {"swatch": options["fill"], "opacity": options.get("opacity", 1)}
        session.call("add_shape", args)
    else:
        raise ValueError(f"unknown element kind {kind!r}")


def set_up(session: McpSession, first_page_id: str) -> list[str]:
    """Creates swatches, text styles, the master page and the pages; returns the page ids in order."""
    session.call("rename_document", {"name": DOCUMENT_NAME})
    for name, color in spec.SWATCHES:
        session.call("add_swatch", {"name": name, "color": color})
    for name, style in spec.BUILTIN_STYLE_UPDATES.items():
        session.call("update_text_style", {"style": name, **style_fields(style)})
    for name, style in spec.NEW_STYLES.items():
        session.call("add_text_style", {"name": name, **style_fields(style)})
    master_id = session.call("add_master", {"name": spec.MASTER_NAME})["id"]
    for item in spec.MASTER:
        add_item(session, master_id, item)
    added = session.call("add_page", {"count": len(spec.PAGES) - 1, "masterId": None, "pageNumber": 1, "side": "after"})
    page_ids = [first_page_id] + [page["id"] for page in added["pages"]]
    session.call("set_page_master", {"pageIds": [pid for pid, page in zip(page_ids, spec.PAGES) if page["master"]],
                                     "masterId": master_id})
    return page_ids


def main() -> None:
    """Builds (or resumes) the template and prints each page's element count."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--exe", type=Path, default=default_bridge())
    parser.add_argument("--resume-from", type=int, metavar="N", help="keep the setup and rebuild pages N..")
    args = parser.parse_args()

    with connect([args.exe], "school-template") as session:
        document = session.call("get_document")
        if args.resume_from is None:
            if document["pageCount"] != 1 or document["masterCount"] != 0:
                raise SystemExit("open a new blank document first (or use --resume-from)")
            page_ids = set_up(session, document["activeSheet"]["id"])
            start = 1
        else:
            if document["pageCount"] != len(spec.PAGES) or document["masterCount"] != 1:
                raise SystemExit("this document was not built by this script")
            page_ids = [page["id"] for page in session.call("list_pages")["pages"]]
            start = args.resume_from
            for page_id in page_ids[start - 1:]:
                existing = [element["id"] for element in session.call("list_elements", {"pageId": page_id})["elements"]]
                if existing:
                    session.call("delete_elements", {"ids": existing})

        try:
            for number, (page_id, page) in enumerate(zip(page_ids, spec.PAGES), 1):
                if number < start:
                    continue
                session.call("rename_page", {"pageId": page_id, "name": page["name"]})
                for item in page["items"]:
                    add_item(session, page_id, item)
                print(f"page {number}: {len(page['items'])} items", flush=True)
        except ToolError as error:
            raise SystemExit(f"stopped on page {number} ({error}); fix and rerun with --resume-from {number}") from error
        print(f"done: {len(session.records)} calls")


if __name__ == "__main__":
    main()
