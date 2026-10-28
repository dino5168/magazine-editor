<!-- 迭代 2（commit 8959b47）的 .claude/rules/mcp.md 原文；迭代 5 精簡前封存，不再更新 -->

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

# MCP（Claude Code 連線）

## MCP（Claude Code 連線）（`lib/automation` + `src-tauri/src/mcp` + `src/bin/magazine-mcp.rs`）

計畫與每一步的決定：`docs/01-Plans-2026-10/07-軟體增加McpServer-實作.md`；流程圖 `docs/01-Plans-2026-10/Claude-McpServer-System.html`。（取代 `docs/01-Plans/eval-mcp-server.md` 的「App 內嵌 HTTP」建議。）

- **流程**：Claude Code 以 **stdio** 啟動橋接程式 `magazine-mcp.exe` → 每次工具呼叫連一次 named pipe `\\.\pipe\magazine-editor-mcp-<USERNAME>`（一行一個 JSON）→ App 的 Rust 端以 event `mcp://request` 交給前端 → `runTool` 執行 → `mcp_respond` 送回。
  - **為什麼要橋接程式**：single-instance 讓 Claude Code 不能啟動第二個主程式；文件狀態在前端 reducer；主程式 release 是 GUI subsystem。橋接程式只處理 MCP 協定（`rmcp`），不碰文件。
  - 橋接程式每次呼叫才連 pipe：App 重開不必重新連 Claude Code；App 沒開 / 沒開放時回 `isError` 的中文說明（`client.rs` 的 `APP_NOT_RUNNING`），不是協定錯誤。
  - stdout 是 MCP 通道，橋接程式**不可 `println!`**。
- **開關**：App 偏好 `Preferences.mcpEnabled`（**預設關**，只有存成 `true` 才開），「設定 → 偏好設定 → Claude Code 連線（MCP）...」（`settings.mcp`）切換、「確定」才生效。關閉時 Rust 不開 pipe（`McpState::set_enabled` abort server task）；已連上的呼叫由前端回「已關閉」。開啟時 TopBar 顯示狀態圖示（`mcp-status-button.tsx`）。瀏覽器模式（`npm run dev`）沒有 MCP。
  - pipe 只在前端 listener 註冊好之後才開（`use-mcp-bridge.ts`），不會有沒人接的請求；Rust 端等前端 30 秒、橋接程式等 40 秒。
- **工具是單一資料來源**：`lib/automation/tool-definitions.ts` 的 `TOOL_DEFINITIONS`（名稱、寫給 AI 看的中文說明、zod strict schema、`readOnly`）。`run-tool.ts` 的 `HANDLERS` 是 mapped type，漏實作會編譯失敗。`src-tauri/mcp-tools.json` 由 `mcp-tools.test.ts` 的 `toMatchFileSnapshot` 產生並比對，橋接程式 `include_str!` 內嵌（App 沒開時 Claude Code 仍看得到工具）。
  - **新增工具**：在 `TOOL_DEFINITIONS` 加一筆 → 在 `HANDLERS` 實作（邏輯放 `queries.ts` / `commands.ts` / `edits.ts`，寫測試，用 `__tests__/tool-session.ts`）→ `npx vitest run mcp-tools -u` → `cargo build --bin magazine-mcp` → Python SDK 的方法（`cd sdk/python; uv run python scripts/generate.py`，`tests/test_tools.py` 守著）→ 更新給人看的工具清單 `docs/01-Plans-2026-10/MCP-工具清單.md`（參數改了也要）。
  - 參數驗證失敗回中文訊息（`z.locales.zhTW()`，前面加「參數 xxx：」），不 dispatch。顏色寫成 regex（和 `isElementColor` / `isHexColor` 同規則）才會出現在 JSON Schema；不用 ajv（`new Function` 會被 CSP 擋）。
- **目前的工具**：批次 `batch`（見下面的「批次」）；查詢 `get_document` / `list_pages` / `list_elements` / `get_element`；選單 `list_commands` / `run_command`；編輯 `add_text` / `add_shape` / `update_element` / `delete_elements` / `add_page` / `add_master` / `set_page_master` / `rename_page` / `set_page_background` / `rename_document` / `undo` / `redo`；文字樣式 `list_text_styles` / `add_text_style` / `update_text_style` / `delete_text_style` / `apply_text_style`（樣式以名稱或 id 指定；`add_text` / `add_shape` 也可帶 `style`，先取樣式的值再套這次的欄位；文字樣式參數含 `lineHeight`（倍數）/ `letterSpacing`（‰）/ `indentLeft` / `indentRight` / `indentFirstLine`（字；合併後檢查首行 ≥ −indentLeft，不合法回中文錯誤），`align` 含 `distributed`（首尾置中）；`update_element` 的 `cornerRadius` 收一個數字或 `[左上, 右上, 右下, 左下]`）；線條 `add_line`（points 是頁面座標，2–500 點；path / compound / color / width / dash / start / end）、`update_element` 的線條欄位（points、path、compound、stroke、start、end）、`get_element` 對線條多回 `pagePoints`；圖片框 `add_shape` / `update_element` 的 `image`（`{ item, fit, focusX, focusY, zoom }`，`null` = 移除）、`get_element` 的 `photoItem`；圖形庫 `list_shapes`（id、名稱、分類、預設大小、參數）、`add_shape.shape` 收基本 5 種或圖形庫 id（`SHAPE_NAMES`）並可帶 `params`、`update_element` 的 `params`（只改有給的）與 `shape`（換成，同屬性面板）——參數名稱不對時錯誤訊息列出可用的；素材庫 `list_library_items` / `place_library_item`（只讀素材庫、只能放圖片，尺寸規則同素材面板；`ToolContext.library` 由 `getLibrary()` 每次呼叫時取，計畫 `docs/01-Plans-2026-10/11-mcpserver-addimage-實作.md`）、`import_library_item`（見下面的「匯入素材」）；文件色票 `list_swatches` / `add_swatch` / `update_swatch` / `delete_swatch`（色票以名稱或 id 指定（`findSwatch`）；`delete_swatch` 的 `replaceWith` 省略 = 保留顏色、取消連結）。專案字型 `list_fonts`（內建四套 + 專案字型：id、名稱、缺字用的內建種類、有沒有粗體檔、授權、使用數）；文字樣式參數 `font` 是字串：內建名稱，或專案字型的名稱 / id（`findFont`，找不到時回中文錯誤）。匯入、改名、刪除字型不給 MCP（要選檔案、要確認替換）。
  - **顏色參數**（`textColor`、`shadow.color`、`fill`、`stroke.color`）是 `hex | { swatch, opacity? }`（`colorInput`，JSON Schema 是 `anyOf`），背景是 `hex | { swatch }`（`pageColorInput`）：給 hex = 不連色票；給 `{ swatch }` = 色票顏色（`opacity` 換成 `#rrggbbaa`）+ 連結。查詢回報連結的色票名稱（`list_pages` 的 `backgroundSwatch`、`list_text_styles` 的 `textColorSwatch`）。
  - **匯入素材**（`import_library_item { path, folderId?, name? }`，2026-10-22，計畫 `docs/11-Plans-匯入/1-McpServer沒有匯入圖片功能-實作.md`）：把本機圖片檔（PNG / JPEG / WebP / GIF / SVG，≤ 20 MB）匯入素材庫，回傳 `itemId` + `list_library_items` 的欄位 + `status`（`new` / `duplicate` / `restored`），放到頁面用 `place_library_item`。**唯一收檔案路徑的工具**：路徑只在 App 的 Rust 出現——`bridge.rs` 在交給前端之前用 `mcp/attachment.rs` 檢查（絕對路徑、圖片副檔名、檔案、先看大小）並讀檔，讀不到直接回錯誤；讀好的位元組以一次性 token 放在 `FrontendRequest.attachment`（`args` 外面，AI 偽造不了），前端 `mcp_take_attachment(token)` 取回（回應或逾時後刪除），所以 **WebView 沒有讀任意路徑的能力**。前端建成 `File`（MIME 由 `imageTypeOfFile` 依副檔名填，`validateImageFile` 只看 MIME）交給 `useLibraryImport().importFile`（和人匯入同一條流程：解碼、SVG viewBox、Rust 檢查檔頭、同檔不重複、垃圾桶還原），名稱預設是檔名（含副檔名）。素材庫立即寫入、不進復原；App 顯示 toast「Claude Code 匯入了素材…」（`mcp-bridge.tsx`），不另外確認（使用者決定）。它是**非同步工具**：`run-tool.ts` 的 `ASYNC_HANDLERS` / `runToolAsync`（`runTool` 與 `batch` 拒絕它，`NOT_IN_BATCH`）；`ToolContext.attachedFile` / `importFile`；`use-mcp-bridge.ts` 用 promise 佇列一個接一個處理呼叫（匯入途中不會插進其他呼叫，下一個呼叫看得到新素材）。
  - `run_command` 和點選單呼叫**同一個 handler**（`home-page.tsx` 的 `menuHandlers` 傳給 `McpBridge`）；佔位 handler 由 `isPlaceholderHandler` 認出，回「尚未實作」且不執行（不會跳 toast）。會開對話框的指令只觸發，不等結果。
  - **批次**（`batch`，2026-10-21，計畫 `docs/09-Plans-Scripts/1-python-scripts-實作.md`）：一次呼叫帶 1–200 個 `{ tool, args }`（`BATCH_OPS_MAX`），`args` 裡的 `{ "$ref": "<第幾個>.<路徑>" }` 換成前面操作回傳值的欄位（`batch-refs.ts` 的 `resolveRefs`）。`runBatch`（`batch.ts`）在暫存 state 上逐一 `runTool`、記下 action，**任何一個失敗整批退回**（錯誤 `ops[N]（工具）：…`），全部成功才一次 `apply({ type: "history/batch", actions })` = **一筆復原**。`batch` / `undo` / `redo` / `run_command` 不能放進批次（`NOT_IN_BATCH`）。橋接程式的伺服器說明（`magazine-mcp.rs` 的 `INSTRUCTIONS`，連線時交給 Claude Code）提示「兩個以上的修改用 batch」。reducer 的 `history/batch` 依序套用後從原本的歷史重建一筆；只收 `BatchableAction`（排除 `history/*`、`document/load`、`document/markSaved`、`page/add`：它自己產生 id，重播結果會不同）。**MCP 工具送出的 action 必須是確定的**（新 id 由工具產生並寫進 action），否則暫存結果與重播結果不同。
  - **Python SDK**（`sdk/python/`，套件 `magazine`，Python ≥ 3.13）：`magazine.connect()` → `Document`，每個工具一個方法（`_tools.py` 由 `scripts/generate.py` 從 `mcp-tools.json` 產生，參數名稱照 MCP 原樣），`with doc.batch():` 收集呼叫一次送出 `batch`（`pending["id"]` → `$ref`）。給 LLM（Claude Code 寫腳本）與開發者用；`tools/` 的腳本也用它的 `magazine.client`。
  - 編輯：**一次工具呼叫 = 一個 action = 一筆復原**（`batch` = 一筆）；指定 `pageId` 不切換使用者的頁面（`add_page` 例外：和 UI 一樣切到新頁）。`update_element` 依物件類型檢查欄位（文字沒有 height、文字顏色是 `textColor`、圖片只能改位置尺寸）。建立物件沿用 `element-factory`，新增頁面沿用 `add-pages.ts`。
  - `ToolContext.apply`：先用純 reducer 算出結果（回報有沒有變更），再 dispatch 同一個 action，**並先把結果記在 ref**：「新增後立刻修改」的第二個呼叫可能比 React 重畫早到。
- **安全**：只接受本機（`reject_remote_clients`）、目前 Windows 帳號（pipe 名稱）、第一個 instance（`first_pipe_instance`，不會兩個 App 搶同一條）；只有 `import_library_item` 接受檔案路徑（只讀、內容必須是圖片、不回傳檔案內容，路徑只在 Rust 處理，見上面的「匯入素材」），其他工具都不收路徑；存檔、匯出、開啟都要使用者在 App 的對話框確認。token、權限分級、操作日誌留到第三階段。
- **開發**：`tauri dev` 只編主程式，改了 Rust 或工具清單要 `cargo build --manifest-path src-tauri/Cargo.toml --bin magazine-mcp`；`.mcp.json` 第一次要在 Claude Code `/mcp` 核准。橋接程式還沒打包進安裝檔（第三階段：`bundle.externalBin`）。

## 檔案（原 CLAUDE.md「目錄結構」）

```
    app/mcp-bridge.tsx            # McpBridge：不 render 的元件，依偏好開關執行 Claude Code 的 MCP 工具呼叫（見「MCP」）
      mcp-dialog.tsx              # 「Claude Code 連線（MCP）」：允許連線開關（App 偏好，預設關）、目前狀態、Claude Code 端的設定說明
      mcp-status-button.tsx       # TopBar 的 MCP 狀態圖示（開啟時才顯示；綠 / 黃 / 紅點，tooltip 是最近一次呼叫；按下開設定對話框）
    automation/                   # MCP 工具（見「MCP」）：tool-definitions.ts（工具名稱、說明、zod schema 的單一資料來源）、batch.ts / batch-refs.ts（batch 工具與 $ref）、queries.ts（查詢）、commands.ts（選單指令）、edits.ts（編輯 → reducer action）、imports.ts（`import_library_item`：附件 → 素材庫匯入）、run-tool.ts（找工具 → 驗證 → 執行；`runToolAsync` 給要等 App 的工具）、mcp-tools.ts（產生 MCP 工具清單）、mcp-status.ts（連線狀態 store）、use-mcp-bridge.ts（event ↔ runToolAsync（一個接一個處理）、開關 pipe、附件 → `File`）
  src/mcp/                        # MCP 的 App 端：protocol.rs（pipe 上的 ToolRequest / ToolResponse）、pipe.rs（named pipe server）、bridge.rs（McpState：開關 pipe、event 交給前端、等 mcp_respond）、attachment.rs（`import_library_item` 的 `path`：檢查、讀檔、一次性 token）、client.rs（橋接程式用的 pipe 用戶端）
  src/bin/magazine-mcp.rs         # MCP 橋接程式（Claude Code 以 stdio 啟動；rmcp；工具清單內嵌 mcp-tools.json）
  mcp-tools.json                  # MCP 工具清單，由 vitest 從 tool-definitions.ts 產生，不要手改（.gitattributes 固定 LF）
.mcp.json                         # Claude Code 的專案 MCP 設定：server「magazine-editor」→ src-tauri/target/debug/magazine-mcp.exe
sdk/python/                       # Python SDK（uv 專案，套件 magazine，見 README.md）：client.py（MCP stdio 用戶端，經橋接程式操作 App）、_tools.py（每個 MCP 工具一個方法，由 scripts/generate.py 從 mcp-tools.json 產生，不要手改）、document.py（Document、batch()：收集呼叫一次送出 batch，Pending / Ref 轉成 $ref）；計畫 docs/09-Plans-Scripts/1-python-scripts-實作.md
```
