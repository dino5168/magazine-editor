"""Stress test: append N story pages through MCP, report latency, WebView memory and lost edits.

Run from `tools/`:  uv run python -m stress.stress_test --pages 200 [--exe PATH] [--log timings.csv]
Report: docs/00-需求分析/06-系統極限測試-報告.md
"""

from __future__ import annotations

import argparse
import statistics
import subprocess
import time
from pathlib import Path

from mcp_client import ToolError, connect, default_bridge
from stress.layout import add_pages, fill_page


def webview_mb() -> int:
    """Working set of the largest msedgewebview2 process (the app's renderer), in MB; 0 if unknown."""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "[int]((Get-Process msedgewebview2 | Measure-Object WorkingSet64 -Maximum).Maximum / 1MB)"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return 0
    return int(out) if out.isdigit() else 0


def main() -> None:
    """Runs the stress test and prints a summary."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pages", type=int, default=200)
    parser.add_argument("--exe", type=Path, default=default_bridge(), help="magazine-mcp.exe")
    parser.add_argument("--log", type=Path, help="write every call's timing to this CSV")
    args = parser.parse_args()

    with connect([args.exe], "stress-test") as session:
        started = time.perf_counter()
        page_ids = add_pages(session, args.pages)
        expected: dict[str, int] = {}
        try:
            for i, page_id in enumerate(page_ids):
                expected[page_id] = fill_page(session, page_id, i % 3)
                if (i + 1) % 20 == 0:
                    recent = [r.ms for r in session.records[-20:]]
                    print(f"page {i + 1}/{args.pages}  elapsed {time.perf_counter() - started:.1f}s  "
                          f"last20 avg {statistics.mean(recent):.0f}ms  webview {webview_mb()}MB", flush=True)
        except ToolError as error:
            # 第一次失敗就停：WebView 失去回應後，後面的呼叫只會一直失敗
            print(f"aborted: {error}", flush=True)

        # 核對「回報成功」的新增是否真的留在文件裡（WebView 重新載入時會遺失）
        kept = {p["id"]: p["elementCount"] for p in session.call("list_pages")["pages"]}
        added_ok = sum(r.ok for r in session.records if r.tool in ("add_text", "add_shape"))
        mismatched = [pid for pid, n in expected.items() if kept.get(pid) != n]
        total = time.perf_counter() - started
        records = list(session.records)

    print(f"\nverify: successful adds {added_ok}, kept {sum(kept.get(pid, 0) for pid in expected)}, "
          f"pages with mismatched counts {len(mismatched)}")
    print(f"calls {len(records)}  failed {sum(not r.ok for r in records)}  total {total:.1f}s")
    for tool in sorted({r.tool for r in records}):
        ms = [r.ms for r in records if r.tool == tool]
        print(f"{tool:14} n={len(ms):4}  avg {statistics.mean(ms):7.1f}  p50 {statistics.median(ms):7.1f}  max {max(ms):7.1f} ms")
    element_ms = [r.ms for r in records if r.tool in ("add_text", "add_shape")]
    if (quarter := len(element_ms) // 4) > 0:
        print(f"element calls: first quarter avg {statistics.mean(element_ms[:quarter]):.1f}ms, "
              f"last quarter avg {statistics.mean(element_ms[-quarter:]):.1f}ms")
    if args.log:
        args.log.write_text(
            "seq,tool,ms,ok\n" + "".join(f"{n},{r.tool},{r.ms:.1f},{r.ok}\n" for n, r in enumerate(records)), encoding="utf-8"
        )


if __name__ == "__main__":
    main()
