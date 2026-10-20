"""Fill the next N empty pages (after page 4) with the story layouts; prints the average call time as JSON.

Used as the workload while profiling the WebView (see profiling/profile_webview.mjs).
Run from `tools/`:  uv run python -m stress.fill_pages --count 10 [--exe PATH]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from magazine.client import connect, default_bridge
from stress.layout import fill_page


def main() -> None:
    """Fills empty pages and prints `{pages, calls, avgMs, maxMs}`."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--exe", type=Path, default=default_bridge())
    args = parser.parse_args()

    with connect([args.exe], "fill-pages") as session:
        pages = session.call("list_pages")["pages"]
        empty = [p["id"] for p in pages if p["elementCount"] == 0 and p["index"] > 4][: args.count]
        # 版型照「第 4 頁」那種（整欄文字 | 圖片 + 文字），每頁 3 次呼叫，方便和舊數據比較
        for page_id in empty:
            fill_page(session, page_id, 2)
        ms = [r.ms for r in session.records if r.tool in ("add_text", "add_shape")]
    print(json.dumps({"pages": len(empty), "calls": len(ms), "avgMs": sum(ms) / len(ms) if ms else 0, "maxMs": max(ms, default=0)}))


if __name__ == "__main__":
    main()
