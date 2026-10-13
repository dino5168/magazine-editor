# tools

開發用腳本：用 MCP 橋接程式（`magazine-mcp.exe`）驅動正在執行的 App，路徑和 Claude Code 完全相同。不屬於 App 本身，不會打包。

Python 用 [uv](https://docs.astral.sh/uv/)，所有指令都在 `tools/` 底下執行：

```powershell
cd tools
uv sync                 # 第一次：建立 .venv、裝 pillow / pytest
uv run pytest           # 測試（範本規格、字寬、MCP 用戶端）
```

## 前置條件

- App 開著，而且在「設定 → 偏好設定 → Claude Code 連線（MCP）」打開了（每台電腦、開發版與安裝版各自一份偏好，預設關）。
- 橋接程式已經編好。腳本預設用 release 版 `src-tauri/target/release/magazine-mcp.exe`（`npx tauri build --no-bundle` 會一起編）；用開發版時加 `--exe ../src-tauri/target/debug/magazine-mcp.exe`（`cargo build --manifest-path ../src-tauri/Cargo.toml --bin magazine-mcp`）。
- **一次 MCP 呼叫 = 一筆復原**，復原上限 100 筆：腳本動到的文件沒辦法一路復原回去，請用新文件或先存檔。

## 內容

| 檔案 | 用途 |
|---|---|
| `mcp_client.py` | 共用的 MCP stdio 用戶端：`connect()` 啟動橋接程式並完成握手，`session.call(tool, args)` 回傳結果、記錄耗時，App 回錯誤時丟 `ToolError` |
| `stress/stress_test.py` | 壓力測試：接在目前文件後面加 N 頁（預設 200）05-Story Test 的版型，每 20 頁回報延遲與 WebView 記憶體，第一次失敗就停，最後核對保留的物件數。報告：`docs/00-需求分析/06-系統極限測試-報告.md` |
| `stress/fill_pages.py` | 把第 4 頁之後的空白頁填上內容（profile 時的工作量） |
| `stress/layout.py`、`stress/frames.json` | 三種頁面版型（pt）與故事文字 |
| `profiling/profile_webview.mjs` | 一邊執行指定的命令、一邊錄 WebView 的 CPU profile，列出最耗時的函式（Node 22，需要遠端除錯，見下方） |
| `profiling/probe.mjs` | 在 WebView 裡執行一段 JS 並印出結果（記憶體、DOM 數量…） |
| `school_template/spec.py` | 學校雜誌範本的版面規格（量自 FlipHTML5 範本，px）與自己撰寫的內容 |
| `school_template/fitcheck.py` | 用 `fonts/` 的 Geist 量每個文字框，確認放得下 |
| `school_template/build.py` | 在新的空白 A4 文件建立範本（色票、文字樣式、主頁、12 頁）。報告：`docs/00-需求分析/07-抓網頁產生範本-報告.md` |

```powershell
uv run python -m stress.stress_test --pages 200 --log timings.csv
uv run python -m school_template.fitcheck
uv run python -m school_template.build                 # 先在 App「檔案 → 新增」開 A4 新文件
uv run python -m school_template.build --resume-from 5 # 中途停下時，保留設定、從第 5 頁重建
```

## Profile WebView

只有開發版吃遠端除錯參數（release 版的 9222 不會開）。**開發版有 React 的效能檢測，越跑越慢**，數字只能和同一個剛開啟的視窗比較。

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'; npm run tauri dev
# 另一個終端機，在 tools/：
node profiling/profile_webview.mjs out.cpuprofile -- uv run python -m stress.fill_pages --count 10 --exe ../src-tauri/target/debug/magazine-mcp.exe
node profiling/probe.mjs "performance.memory.usedJSHeapSize / 2**20"
```

`tauri dev` 執行中修改 repo 裡的檔案（包括 `docs/` 的 Markdown、`src-tauri/` 的設定）會讓 App 重新載入或重新編譯，記憶體裡沒存的內容只剩自動備份；壓測時先存檔。
