---
paths:
  - "src/lib/automation/**"
  - "src/components/app/mcp-*.tsx"
  - "src/components/editor/mcp-status-button.tsx"
  - "src-tauri/src/mcp/**"
  - "src-tauri/src/bin/**"
  - "src-tauri/src/commands/mcp.rs"
  - "src-tauri/mcp-tools.json"
  - "sdk/python/**"
  - "tools/**"
  - ".mcp.json"
---

# MCP（Claude Code 連線）與 Python SDK

精簡前的完整原文（每個工具的參數、開關 UI、檔案說明）：`docs/progress-archive/rules-2026-10/mcp.md`。計畫：`docs/01-Plans-2026-10/07-軟體增加McpServer-實作.md`（流程圖 `Claude-McpServer-System.html`）、`docs/09-Plans-Scripts/1-python-scripts-實作.md`（batch、SDK）、`docs/11-Plans-匯入/1-McpServer沒有匯入圖片功能-實作.md`。工具清單（給人看）：`docs/01-Plans-2026-10/MCP-工具清單.md`。

## 架構

- Claude Code 以 stdio 啟動橋接程式 `magazine-mcp.exe` → 每次呼叫連一次 named pipe（一行一個 JSON）→ Rust 以 event `mcp://request` 交給前端 → `runToolAsync` → `mcp_respond`。
  - 為什麼要橋接：single-instance 不能開第二個主程式、文件狀態在前端 reducer、release 主程式是 GUI subsystem。橋接程式只處理協定（`rmcp`），不碰文件。
  - 橋接程式的 stdout 是 MCP 通道，**不可 `println!`**。
  - App 沒開 / 沒開放時回 `isError` 的中文說明（`APP_NOT_RUNNING`），不是協定錯誤。
- 開關 `Preferences.mcpEnabled` **預設關**；關閉時 Rust 不開 pipe（`McpState::set_enabled`）。pipe 只在前端 listener 註冊好之後才開（`use-mcp-bridge.ts`）。瀏覽器模式沒有 MCP。
- 安全：只收本機（`reject_remote_clients`）、目前 Windows 帳號（pipe 名稱）、第一個 instance（`first_pipe_instance`）。存檔、匯出、開啟、字型匯入 / 改名 / 刪除不給 MCP（要使用者在對話框確認）。**上傳到網站沒有 MCP 工具**（密碼不能經過 AI 的對話）；`run_command file.uploadFlipbook` 只打開對話框。

## 工具定義（單一資料來源）

- `tool-definitions.ts` 的 `TOOL_DEFINITIONS`（名稱、給 AI 的中文說明、zod strict schema、`readOnly`）；`run-tool.ts` 的 `HANDLERS` 是 mapped type，漏實作編譯失敗。`src-tauri/mcp-tools.json` 由 `mcp-tools.test.ts` 產生（**不要手改**），橋接程式 `include_str!` 內嵌。
- **新增 / 修改工具**：照 skill `add-mcp-tool`（`TOOL_DEFINITIONS` → `HANDLERS` → 測試 → `npx vitest run mcp-tools -u` → 重編 `magazine-mcp` → `scripts/generate.py` → `MCP-工具清單.md`），一步都不能省。
- 驗證失敗回中文（`z.locales.zhTW()`，前面加「參數 xxx：」），不 dispatch。顏色寫成 regex 才會進 JSON Schema（和 `isElementColor` / `isHexColor` 同規則）；**不用 ajv**（`new Function` 被 CSP 擋）。
- 顏色參數是 `hex | { swatch, opacity? }`（`colorInput`；背景 `pageColorInput`）：給 hex = 不連色票。
- `run_command` 和選單呼叫**同一個 handler**；佔位 handler 由 `isPlaceholderHandler` 認出，回「尚未實作」不執行。

## 編輯的規則

- **一次工具呼叫 = 一個 action = 一筆復原**；指定 `pageId` 不切換使用者的頁面（`add_page` 例外）。建立物件沿用 `element-factory`，新增頁面沿用 `add-pages.ts`。
- `ToolContext.apply`：先用純 reducer 算結果，再 dispatch 同一個 action，**並先把結果記在 ref**（「新增後立刻修改」的下一個呼叫可能比 React 重畫早到）。
- **MCP 送出的 action 必須是確定的**（新 id 由工具產生並寫進 action），否則 batch 的暫存結果與重播結果不同。
- **文字尺寸一律用量的**：`ToolContext.measure`（App = `measureTextLayout`，和畫布、匯出同一套；測試 = `tool-session.ts` 的 `fakeMeasure`），高度用 `layout.ts` 的 `measuredTextHeight`。**不要用 `getElementBounds` / `estimateTextHeight`**（估計值）。
- `check_layout`（`layout-check.ts`，唯讀、可進 batch）：頁面內容由 `export-request.ts` 的 `pageLayers`（和匯出共用，保留原 id）加 `pageNumberShape` 組成；`ToolContext.measureWidth` 給頁碼。排除規則改了要同步工具說明與 `MCP-工具清單.md`。
- **`batch`**（≤ `BATCH_OPS_MAX`）：`$ref` 由 `batch-refs.ts` 的 `resolveRefs` 換掉；`runBatch` 在暫存 state 上逐一執行，任一失敗整批退回，成功才 `history/batch`（一筆復原）。`batch` / `undo` / `redo` / `run_command` / `import_library_item` 不能進批次（`NOT_IN_BATCH`）；reducer 只收 `BatchableAction`（排除 `history/*`、`document/load`、`document/markSaved`、`page/add`）。

## `render_page`（圖片在 App 的 Rust 端畫）

- 前端只回 `{ render: RenderJob }`（只含那一頁的匯出請求、`pageIndex`、`maxPx`、`region`、`pageName`）；`bridge.rs` 看到 `RENDER_TOOL` 的 `Ok` 回應就交給 `render_answer` → `export/page_image.rs` 的 `render_page_image`（和 PDF / 封面同一套 typst 排版），回 `ToolResponse::Image`（base64）。**圖片不經過 WebView**，也不用 Konva 截圖（全形標點會被擠）。
- pipe 的請求上限 `MAX_LINE_BYTES` 1 MiB，回應上限 `MAX_RESPONSE_BYTES` 16 MiB（`client.rs`）。橋接程式把 `Image` 包成 MCP 的 image content + 一行說明。

## `import_library_item`（唯一收檔案路徑的工具）

- 路徑**只在 Rust**：`bridge.rs` 交給前端前用 `mcp/attachment.rs` 檢查並讀檔，位元組以一次性 token 放在 `FrontendRequest.attachment`（`args` 外面，AI 偽造不了），前端 `mcp_take_attachment(token)` 取回。**WebView 不能有讀任意路徑的能力**；其他工具都不收路徑。
- 前端建成 `File`（MIME 由 `imageTypeOfFile` 依副檔名填）交給 `useLibraryImport().importFile`，和人匯入同一條流程。
- 非同步工具：`ASYNC_HANDLERS` / `runToolAsync`（`runTool` 拒絕它）；`use-mcp-bridge.ts` 用 promise 佇列一個接一個處理呼叫。

## 開發與 SDK

- `tauri dev` 只編主程式：改了 Rust 或工具清單要 `cargo build --bin magazine-mcp`；`.mcp.json` 第一次要在 `/mcp` 核准。橋接程式還沒打包進安裝檔。
- Python SDK（`sdk/python`，Python ≥ 3.13）：`_tools.py` 由 `generate.py` 從 `mcp-tools.json` 產生（**不要手改**），參數名照 MCP 原樣；`with doc.batch():` 把 `pending["id"]` 換成 `$ref`。`tools/` 的腳本也用 `magazine.client`。
- 伺服器說明在 `magazine-mcp.rs` 的 `INSTRUCTIONS`（連線時交給 Claude Code）。
