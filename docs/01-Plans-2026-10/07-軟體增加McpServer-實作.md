# 07 軟體增加 MCP Server：實作計畫

> 任務檔：`07-軟體增加McpServer.md`（不 commit）
> 流程圖：[`Claude-McpServer-System.html`](Claude-McpServer-System.html)（Claude Code ↔ MCP ↔ 系統）
> 前一份評估：[`../01-Plans/eval-mcp-server.md`](../01-Plans/eval-mcp-server.md)（2026-09-30，當時建議 HTTP；這份改成任務要求的 stdio，理由見第 2 節）
> 狀態：**步驟 3 完成（2026-10-09），等使用者在 Claude Code 實測（見進度紀錄）並說「繼續」再做步驟 4**
> 建立：2026-10-09

---

## 1. 目標與範圍

| 任務檔的要求 | 這份計畫的做法 |
|---|---|
| 前端使用 Claude Code | Claude Code 是 MCP client；在專案的 `.mcp.json` 登記本系統的 MCP server |
| MCP server 和主程式在同一台機器，優先 stdio | Claude Code 啟動一支小的**橋接程式** `magazine-mcp.exe`（stdio），它再透過 **Windows named pipe** 連到**正在執行的** App |
| 使用者可以透過 Claude Code 執行系統命令 | 第一階段開放：查詢文件、執行 App 的選單指令（`COMMANDS`）、基本編輯（新增 / 修改 / 刪除物件、頁面）。「系統命令」的意思待確認（第 7 節 Q1） |
| 漸進式開發 | 第一階段 6 步（第 4 節），第二、三階段只列方向（第 5 節） |

**不做**（第一階段）：無頭模式（不開 App 直接改檔）、匯出到 AI 指定的路徑、從任意本機路徑放圖片、把頁面算成圖片給 AI 看、使用者腳本。

---

## 2. 架構決定

### 2.1 為什麼要「橋接程式 + 正在執行的 App」

stdio MCP server 是**由 Claude Code 啟動的子程式**，和使用者自己開的 App 不是同一個行程。有三個限制：

1. **不能讓 Claude Code 直接啟動主程式**：`tauri-plugin-single-instance` 會讓第二個 `magazine-editor.exe` 立刻結束（評估文件已指出）。
2. **文件狀態在前端的 reducer**（`history.present`），不在 Rust、也不在磁碟；要改「使用者眼前的文件」（畫面即時更新、可 Ctrl+Z、會標記未存檔與自動備份），只能請 App 的前端執行。
3. 主程式在 release 是 `windows_subsystem = "windows"`（GUI 程式），拿來當 stdio 程式不可靠。

所以：

```
Claude Code ──stdio(JSON-RPC)──▶ magazine-mcp.exe ──named pipe──▶ App(Rust) ──Tauri event──▶ 前端(自動化指令層 → reducer)
            ◀───────────────────                 ◀──────────────          ◀── invoke mcp_respond ──
```

### 2.2 程式之間怎麼分工

| 元件 | 位置 | 負責 | 不負責 |
|---|---|---|---|
| `magazine-mcp.exe`（橋接程式） | `src-tauri/src/bin/magazine-mcp.rs`（同一個 crate 的第二個 bin，console 程式） | MCP 協定（initialize、tools/list、tools/call），用官方 Rust SDK **`rmcp`** 的 stdio transport；工具清單從 `mcp-tools.json` 內嵌；每次 tools/call 轉送到 pipe；**App 沒開時回傳中文錯誤**（「請先開啟雜誌編輯軟體」） | 驗證參數、碰文件 |
| App 的 Rust 端 | `src-tauri/src/mcp/`（新模組） | 開 named pipe `\\.\pipe\magazine-editor-mcp-<使用者名稱>`（`tokio::net::windows::named_pipe`，`reject_remote_clients`）；把請求以 Tauri event `mcp://request` 交給前端；`mcp_respond` command 收回結果；逾時（30 秒）回錯誤 | 工具內容（Rust 看不到文件） |
| 前端：橋接 hook | `src/lib/automation/use-mcp-bridge.ts`（掛在 `home-page.tsx`，在 `EditorProvider` / `ProjectProvider` 內） | 收 event → 找工具 → 執行 → `invoke("mcp_respond")` | — |
| 前端：自動化指令層 | `src/lib/automation/`（純邏輯，vitest） | 工具定義（名稱、說明、參數 schema）、參數驗證、查詢函式、把工具呼叫轉成 reducer action | UI |

**為什麼工具清單放在前端、再產生 JSON 給橋接程式**：驗證與執行都在前端（文件狀態在那裡），工具定義和驗證寫在一起才不會兩邊不一致；橋接程式內嵌一份產生出來的 `mcp-tools.json`，App 沒開時 Claude Code 仍然看得到工具清單。JSON 由腳本產生、commit 進 repo，vitest 檢查「commit 的 JSON = 目前定義產生的結果」（同 `sample.magproj` 共用 fixture 的做法）。

### 2.3 不重複造輪子

| 需要的東西 | 沿用 | 不自己寫 |
|---|---|---|
| MCP 協定（JSON-RPC、initialize、能力協商、stdio framing） | 官方 Rust SDK `rmcp`（`server` + `transport-io`），版本實作時確認並鎖 `=`（比照 Typst） | 不手寫 JSON-RPC |
| 參數 schema + 執行時驗證 | **zod 4**（`z.toJSONSchema` 產生 MCP 要的 JSON Schema，同一份定義也做驗證）；顏色、geometry、stroke、label、陰影等領域規則呼叫既有的 `validation.ts`（`isElementColor`、`isShapeGeometry`、`isStroke`…） | 不另寫一套顏色 / 圖形驗證。**不用 ajv**：它靠 `new Function` 產生程式碼，會被 App 的 CSP 擋下（zod 4 偵測到 CSP 時會自動改用不產生程式碼的路徑） |
| 建立物件的預設值 | `element-factory.ts`（`createShapeInBox`、文字的建立函式） | — |
| 修改文件 | 現有 reducer action（`element/*`、`page/*`、`history/*`）；`updateSheet(state, id, …)` 已經能指定頁面 | 不在自動化層直接改文件 |
| 執行選單指令 | `COMMANDS`（label / 停用原因）+ `home-page.tsx` 已建立的 `CommandHandlers` | 不為 MCP 另寫存檔 / 匯出流程 |
| 本機連線 | Windows named pipe（tokio 內建） | 不開 HTTP / TCP port |
| 未存檔、自動備份、復原 | 既有的 `selectIsDirty`、`useAutosave`、undo 歷史 | MCP 的修改自動享有 |

### 2.4 安全性（第一階段）

- **named pipe 只在本機**、瀏覽器網頁連不到（HTTP localhost 才有 DNS rebinding 問題），`reject_remote_clients(true)` 拒絕網路上的 pipe 連線；pipe 名稱帶使用者名稱，另一個 Windows 帳號連不到同一條。
- **預設關閉**，在偏好設定開啟，開啟時畫面上有狀態顯示（待確認 Q3）。
- **沿用「外部不傳路徑」原則**：沒有任何工具接受檔案路徑；存檔 / 匯出 / 開啟一律走 App 原本的對話框，由使用者在 App 裡確認。
- MCP 參數視為不可信任：**每個工具先過 zod + 既有驗證，失敗回傳讓 AI 看得懂的中文錯誤，不 dispatch**（評估文件的缺口 1）。
- 第一階段只開放**可復原**的編輯；`run_command` 會開對話框的指令（開啟、另存、匯出）都要使用者在 App 裡按確定。
- token、操作記錄（log）、權限分級留到第三階段（任務檔的要求）。

---

## 3. 第一階段的工具（草案）

每次工具呼叫 = **最多一筆復原紀錄**，回傳精簡 JSON（圖片只回資訊，不回內容）。

| 類別 | 工具 | 說明 / 對應 |
|---|---|---|
| 查詢 | `get_document` | 文件名稱、頁數、紙張、邊界、是否未存檔、目前頁 |
| 查詢 | `list_pages` | 每頁 id、名稱、套用的主頁、背景、物件數（主頁另列） |
| 查詢 | `list_elements(pageId?)` | 物件 id、類型、位置尺寸、旋轉、文字（截斷）；省略 pageId = 目前頁 |
| 查詢 | `get_element(id)` | 單一物件完整欄位 |
| 指令 | `list_commands` | `COMMANDS` 的 id、名稱、快捷鍵、是否停用 |
| 指令 | `run_command(id)` | 呼叫和選單同一個 handler；**觸發後立即回傳**（對話框由使用者處理），佔位指令回傳「尚未實作」 |
| 編輯 | `add_text(pageId?, x, y, text, 樣式…)` | `element/add`，回傳新 id |
| 編輯 | `add_shape(pageId?, kind, x, y, width, height, fill…)` | `element/add`（`createShapeInBox` 補預設值），回傳新 id |
| 編輯 | `update_element(id, patch)` | `element/update`；patch 依物件類型驗證 |
| 編輯 | `delete_elements(ids)` | `element/delete` |
| 編輯 | `add_page(after?, masterId?)` / `rename_page` / `set_page_background` | `page/addMany` / `page/rename` / `page/setBackground` |
| 編輯 | `undo` / `redo` | `history/undo` / `history/redo` |

> `pageId` 指定頁面時**不切換使用者正在看的頁面**（評估文件的缺口 2）：reducer 的 `element/add` / `update` / `delete` 加可選的 `pageId`，內部用已有的 `updateSheet`。

---

## 4. 第一階段：一步一步

每一步做完停下來，等使用者說「繼續下一步」。

| 步驟 | 內容 | 驗證 | 畫面變化 |
|---|---|---|---|
| **1. 自動化指令層：工具定義與查詢** | 加 zod；`src/lib/automation/`：`tool-definitions.ts`（工具名稱、中文說明、zod schema）、`queries.ts`（四個查詢，純函式）、`run-tool.ts`（`(state, name, args) → Result`，此步只接查詢）；`src-tauri/mcp-tools.json` 由 vitest 的 `toMatchFileSnapshot` 產生與比對（`npx vitest run mcp-tools -u` 更新），不另裝 tsx、不用 node fs | vitest：查詢結果（用 `sample.magproj`）、參數錯誤的訊息、JSON 和定義一致 | 無 |
| **2. App 端通道** | Rust `src/mcp/`：named pipe server（每行一個 JSON 的請求 / 回應）、待回應表（id → oneshot）、逾時、event `mcp://request`、command `mcp_respond`；前端 `use-mcp-bridge.ts` 執行步驟 1 的查詢；`capabilities` 補需要的 event 權限 | `cargo test`（pipe 收發、逾時）；`npm run tauri dev` 後用 PowerShell 的 `NamedPipeClientStream` 送一行 JSON，拿回 `get_document` | 無（之後加狀態） |
| **3. 橋接程式 + 接上 Claude Code**（第一階段「通訊流程驗證」的完成點） | `src/bin/magazine-mcp.rs`（rmcp stdio，工具清單 `include_str!("../../mcp-tools.json")`，tools/call 轉 pipe，App 沒開回中文錯誤）；`Cargo.toml` 加 `default-run = "magazine-editor"`（多一個 bin 後 `tauri dev` 需要）；專案根目錄 `.mcp.json` 指向 `src-tauri/target/debug/magazine-mcp.exe` | `cargo test`（App 沒開、轉送）；在 Claude Code 執行 `/mcp` 看到工具，問「目前文件有幾頁」 | 無 |
| **4. 指令工具** | `list_commands` / `run_command`：`use-mcp-bridge` 取得 `home-page.tsx` 的 `CommandHandlers`（以 ref 傳入，不新增流程）；停用中的指令回傳 `disabledReason` | vitest（id 驗證、停用）；Claude Code 執行「切換格線」「儲存」 | 無 |
| **5. 編輯工具** | reducer：`element/add` / `update` / `delete` 加可選 `pageId`；`update_element` 的 patch 驗證（沿用 `validation.ts`，補數字有限、欄位屬於該類型）；`add_text` / `add_shape` / `delete_elements` / 頁面三個 / `undo` / `redo`；新 id 由自動化層產生帶入（reducer 保持純函式） | vitest（指定頁不切頁、一呼叫一筆復原、非法 patch no-op）；Claude Code 實際排一頁 | AI 的修改即時出現 |
| **6. 開關、狀態與文件** | 偏好設定加「允許 Claude Code 連線（MCP）」（預設關，存 localStorage 經 `parsePreferences`，經 command 通知 Rust 開 / 關 pipe）；TopBar 小圖示顯示「MCP 已開啟 / 連線中」；`CLAUDE.md` 加「MCP」一節、`docs/progress.md`、`docs-website` 的流程頁（沿用這份 HTML） | 無頭 Edge 驗證開關；Claude Code 在關閉時得到「App 未開放 MCP」 | 偏好設定一個開關、TopBar 一個狀態圖示 |

---

## 5. 第二、三階段（只列方向，不在這次實作）

- **第二階段（隨主體開發）**：每完成一個功能就補對應工具，規則寫進 `CLAUDE.md`「新增 MCP 工具」：在 `tool-definitions.ts` 加定義 → 實作 → `npx vitest run mcp-tools -u` 更新 `mcp-tools.json` → 測試。候選：主頁（`master/*`）、頁碼規則、素材庫（列出 / 放到頁面）、頁面排序、`batch(operations[])`（多個操作一筆復原）、MCP resource（目前文件 JSON）、`render_page`（把頁面算成 PNG 給 AI 看，可用 Typst 的 render 或前端 Konva `toDataURL`）、匯出 EPUB。
- **第三階段（收尾）**：連線 token（App 產生、存在 `%LOCALAPPDATA%`，橋接程式讀取）、工具權限分級（唯讀 / 編輯 / 破壞性，偏好設定可勾選）、破壞性操作在 App 內確認、操作日誌（每次工具呼叫寫一行到 `%LOCALAPPDATA%\…\logs\mcp.log`，含時間、工具、結果，不含使用者全文）、錯誤分類（沿用 `AppError` 的 `kind`）、`tauri build` 一起打包橋接程式（`bundle.externalBin` sidecar，需要依 target triple 命名，由 `beforeBuildCommand` 先編譯）。

---

## 6. 計畫檢核（已發現的問題與處理）

| # | 問題 | 處理 |
|---|---|---|
| 1 | single-instance 讓 Claude Code 不能啟動主程式 | 橋接程式是另一個 exe（2.1） |
| 2 | 主程式 release 是 GUI subsystem，stdio 不可靠 | 橋接程式是 `src/bin/` 的 console 程式，不加 `windows_subsystem` |
| 3 | crate 有兩個 bin 後，`npm run tauri dev` / `cargo run` 不知道跑哪個 | `Cargo.toml` 的 `[package]` 加 `default-run` |
| 4 | App 沒開、還在啟動、前端還沒掛上 listener | 橋接程式連不到 pipe → 中文錯誤；Rust 端 30 秒逾時；前端 ready 後才開 pipe |
| 5 | `npm run dev`（瀏覽器模式）沒有 Tauri | 不支援 MCP；`use-mcp-bridge` 在 `!isDesktop` 時不做事 |
| 6 | 前端執行工具時讀到舊 state | hook 用 ref 保存最新 state；要回傳結果（例如新 id）的工具先以純 reducer 算出下一個 state 檢查成功與否再 dispatch |
| 7 | 現有 action 不做執行時驗證（評估缺口 1） | 自動化層驗證後才 dispatch；reducer 既有的名稱 / 顏色檢查保留 |
| 8 | 物件 action 只作用在目前頁（評估缺口 2） | 步驟 5 加可選 `pageId` |
| 9 | 會開對話框的指令（另存、匯出）在等使用者 | `run_command` 觸發後立即回傳「已在 App 開啟對話框」，不等結果 |
| 10 | 同時有兩個請求 | pipe 一次處理一個連線、前端依序執行（reducer dispatch 本來就是序列化的） |
| 11 | CSP 擋 `eval` | 用 zod 4（有不產生程式碼的路徑），不用 ajv |
| 12 | 工具清單兩份（TS 定義 / 橋接程式 JSON）不一致 | JSON 由腳本產生、vitest 比對 |
| 13 | 使用者全域設定裡已經有一個 `app-mcpserver`（`http://localhost:8000/mcp/`，在這個專案停用） | 和本系統無關；這次的 server 名稱用 `magazine-editor`，放在專案的 `.mcp.json`，不動全域設定 |
| 14 | `.mcp.json` 會 commit 進 public repo | 只含相對路徑 `src-tauri/target/debug/magazine-mcp.exe`，不含本機路徑或 token |

---

## 7. 待使用者確認

> **2026-10-09 決定**：1 = App 選單指令 + 編輯；2 = Rust + `rmcp`；3 = 預設關、偏好設定開（步驟 2–5 開發期間一律開）；4 = 直接套用、一次呼叫一筆復原；5 = 加入 zod 4。

1. **「執行系統命令」指的是？** 建議：App 的選單指令（存檔、切換格線…）＋編輯文件內容。如果是 Windows 的指令（開資料夾、跑程式），Claude Code 本身就能做，不需要經過本系統。
2. **橋接程式用什麼寫？** 建議：Rust（同一個 crate 的第二個 bin，用官方 `rmcp`），使用者電腦不需要安裝 Node；另一個選項是 Node + 官方 TypeScript SDK（開發快，但執行時需要 Node）。
3. **MCP 開關**：建議預設關閉、在「偏好設定」開啟、畫面上顯示狀態；開發期間（步驟 2–5）先一律開啟，步驟 6 再加開關。
4. **AI 的修改**：建議直接套用、一次工具呼叫一筆復原（不滿意按 Ctrl+Z）；「先預覽再套用」比較複雜，留到之後。
5. **加入 zod**（新的 npm 依賴）作為工具參數的 schema 與驗證：建議加入，否則要手寫 JSON Schema 再手寫一份驗證，兩份會不一致。

---

## 8. 進度紀錄

| 日期 | 內容 |
|---|---|
| 2026-10-09 | 建立計畫與流程圖 `Claude-McpServer-System.html`；第 7 節五個問題確認，全部採用建議 |
| 2026-10-09 | **步驟 1 完成**：加入 `zod` ^4.6.5；`src/lib/automation/`：`tool-definitions.ts`（`TOOL_DEFINITIONS`，`satisfies Record`，嚴格物件 schema）、`queries.ts`（`getDocumentSummary` / `listPages` / `listElements` / `getElement`，清單數字取到 0.01 pt、文字摘要 80 字）、`run-tool.ts`（`runTool(name, args, { state })`，zod 用 `z.locales.zhTW()` 的中文訊息、前面加「參數 xxx：」）、`mcp-tools.ts`（產生 MCP `tools/list`，去掉 `$schema`）；`src-tauri/mcp-tools.json`。和計畫不同：JSON 改用 vitest `toMatchFileSnapshot` 產生與比對（前端 tsconfig 沒有 node 型別，不用 fs）。新測試 14 個，vitest 共 483 個通過、`tsc` 通過。zod 目前只被測試引用，App 的 bundle 不變 |
| 2026-10-09 | **步驟 2 完成**：`Cargo.toml` 直接引用 `tokio`（tauri 本來就用，只開 net / io-util / sync / time / macros / rt）。Rust `src/mcp/`：`protocol.rs`（`ToolRequest {tool, args}`、`ToolResponse`（`status: ok / error`）、一行上限 1 MB）、`pipe.rs`（`bind` 用 `first_pipe_instance` + `reject_remote_clients`，第二個 App 拿不到同一條 pipe；`serve` 每個連線一個 task、一行一個請求依序處理；壞 JSON 回錯誤但不斷線，超過上限回錯誤後斷線）、`bridge.rs`（`Pending`：id → oneshot、30 秒逾時、逾時後到的回應丟掉；`McpState::set_enabled` 開 / 關 pipe）；`mcp/mod.rs` 的 `pipe_name()` = `\\.\pipe\magazine-editor-mcp-<USERNAME>`。commands `mcp_set_enabled`、`mcp_respond`（`commands/mcp.rs`）；capabilities 不用改（`core:default` 已含 event）。前端：`projectApi.mcpSetEnabled / mcpRespond`、`lib/automation/use-mcp-bridge.ts`（listener 註冊好之後才開 pipe；用 ref 讀最新 state；`runTool` 例外也回錯誤）、`components/app/mcp-bridge.tsx`（不 render 任何東西的元件，訂閱 state 不會讓版面重畫），掛在 `home-page.tsx` 的 `EditorLayout`。開發期間一律開啟（步驟 6 改成偏好設定）。測試：Rust 新增 7 個（pipe 收發與換連線、壞請求、超長行、第二個 App 不能搶 pipe、等待 / 逾時 / id 唯一），全部 138 個通過；vitest 483 個、`tsc` 通過。**桌面版實測**：`npm run tauri dev` 後用 PowerShell `NamedPipeClientStream` 連 pipe，對使用者的「頁面測試」專案（3 頁）取得 `get_document`、`list_pages`、`list_elements`，找不到頁面、參數型別錯、未知工具、壞 JSON 都回中文錯誤。驗證腳本在 scratchpad（不 commit） |
| 2026-10-09 | **步驟 3 完成**：`rmcp` **=3.5.1**（只開 `server`、`transport-io`；3.x 的 API 和舊版不同：`get_info` 回傳 `ServerConfig`（= `InitializeResult`）、`call_tool` 回傳 `CallToolResponse`，`Tool` 可以直接從 JSON 反序列化）。`src/bin/magazine-mcp.rs`：`Tool` 清單 `include_str!("../../mcp-tools.json")` 反序列化；`call_tool` 把 `arguments` 轉成 `ToolRequest` 經 pipe 送 App，App 的錯誤與「App 沒開」都回 `CallToolResult::error`（`isError: true`，AI 看得到），不是協定錯誤；`instructions` 說明單位與先呼叫 `get_document`；stdout 是 MCP 通道，不可 `println!`。Rust 端 `mcp/client.rs`（每次呼叫重新連線，App 重開不必重連 Claude Code；`ERROR_PIPE_BUSY` 重試；40 秒逾時；`NotFound` → `APP_NOT_RUNNING` 中文訊息），`lib.rs` 的 `mcp` 改成 `pub`，但只有 `client` / `protocol` / `pipe_name` 是 pub。`Cargo.toml` 加 `default-run = "magazine-editor"`。專案根目錄 `.mcp.json`（server 名稱 `magazine-editor`，相對路徑 `src-tauri/target/debug/magazine-mcp.exe`）。測試：Rust 新增 3 個（client 經 pipe 往返、App 沒開的訊息、內嵌工具清單），全部 141 個通過；vitest 483 個通過。**實測**：用 PowerShell 以 stdio 跑 MCP（initialize → tools/list → tools/call）：App 沒開時回「連不到雜誌編輯軟體…」；`npm run tauri dev` 開著時 `get_document` 取回「頁面測試」、找不到頁面回 `isError: true`。**Claude Code 本身的實測待使用者做**：`.mcp.json` 是這次 session 開始後才加的，要重開 Claude Code（或 `/mcp`）並核准專案的 MCP server |
