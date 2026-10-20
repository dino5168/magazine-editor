"""Example: build one magazine page in a single batch (one MCP call, one undo step).

Run from `sdk/python/` with the app open and MCP turned on:

    uv run python examples/one_page.py --profile debug
"""

from __future__ import annotations

import argparse

import magazine

MARGIN = 42.52  # 15 mm, the default margin of a new document
BODY = (
    "這一頁由 Python SDK 的一個 batch 建立：新增頁面、標題、分隔線、色塊與內文，"
    "全部在一次 MCP 呼叫裡完成；在 App 按一次 Ctrl+Z 就整頁撤銷。"
)


def build_page(doc: magazine.Document, title: str) -> dict[str, str]:
    """Adds a page with a title, a rule, a colored box and body text.

    Args:
        doc: The connected document.
        title: Page title text.

    Returns:
        The new page id and the ids of the title and box.
    """
    size = doc.get_document()["pageSizes"][0]
    content_width = size["width"] - 2 * MARGIN
    with doc.batch():
        page = doc.add_page()
        page_id = page["pages"][0]["id"]
        heading = doc.add_text(pageId=page_id, text=title, x=MARGIN, y=60, width=content_width, style="標題")
        doc.add_shape(pageId=page_id, shape="rect", x=MARGIN, y=118, width=content_width, height=4, fill={"swatch": "文字"})
        box = doc.add_shape(
            pageId=page_id,
            shape="roundedRect",
            x=MARGIN,
            y=150,
            width=content_width * 0.45,
            height=180,
            fill="#e0f2fe",
            text="重點",
            fontSize=20,
            bold=True,
        )
        doc.add_text(pageId=page_id, text=BODY, x=MARGIN + content_width * 0.5, y=150, width=content_width * 0.5, style="內文")
    return {"pageId": page_id.value(), "title": heading.result["id"], "box": box.result["id"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--profile", default="release", choices=["release", "debug"], help="which build of magazine-mcp.exe")
    parser.add_argument("--exe", help="path of magazine-mcp.exe (overrides --profile)")
    parser.add_argument("--title", default="本期焦點")
    options = parser.parse_args()
    with magazine.connect(options.exe, profile=options.profile) as doc:
        ids = build_page(doc, options.title)
        record = doc.session.records[-1]
        print(f"新增頁面 {ids['pageId']}（batch {record.ms:.0f} ms）")


if __name__ == "__main__":
    main()
