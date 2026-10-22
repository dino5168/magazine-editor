# MCP：匯入圖片到素材庫：實作計畫

> 需求：`1-McpServer沒有匯入圖片功能.md`。主要使用者是 LLM：用其他 MCP 工具（產圖、截圖、下載）做出圖片檔之後，現在必須由人在 App 裡「匯入」，才能用 `place_library_item` 放到頁面。
> 狀態：**計畫已確認（2026-10-22），第 4 節四個問題都採建議方案；六個步驟全部完成（2026-10-22），commit `e3ca24d`（沒有 push）。**

## 1. 現況

| 項目 | 現況 |
|---|---|
| MCP 素材工具 | `list_library_items`（唯讀）、`place_library_item`（只放素材庫裡已有的圖片）；計畫 `docs/01-Plans-2026-10/11-mcpserver-addimage-實作.md` |
| 安全原則 | 「沒有工具接受檔案路徑」（`07-軟體增加McpServer-實作.md`、CLAUDE.md 的 MCP 安全）；「前端不傳路徑給 Rust」（檔案系統） |
| 匯入流程 | `useLibraryImport().importFiles(files, folderId, accept)`：前端擋明顯不合格的檔案 → 解碼取尺寸（SVG 只有 viewBox 時用 viewBox）→ `library_import`（raw body）由 Rust `assets::import_asset` 檢查檔頭、20 MB 上限、存成 `assets/images/<hash>.<ext>` → `item/add`（同檔不重複、在垃圾桶就還原）。**錯誤一律 toast**，不回傳原因 |
| `runTool` | **同步**；`use-mcp-bridge.ts` 收到 `mcp://request` 直接回應。`batch` 也是同步重播 |
| pipe | 一行一個 JSON，上限 1 MB（`MAX_LINE_BYTES`）；Rust 等前端 30 秒 |
| CSP | `connect-src` 沒有 asset protocol：前端不能 `fetch` 專案裡的檔案 |

要解決的是兩件事：**檔案從哪裡來**（LLM 手上只有檔案路徑，不可能把 20 MB 圖片寫成 base64 參數），以及**匯入是非同步的**（`runTool` 是同步的）。

## 2. 設計

### 2.1 新工具 `import_library_item`

- 名稱沿用 `list_library_items` / `place_library_item` 的命名；**這次只收圖片**（PNG / JPEG / WebP / GIF / SVG），之後要收文字檔 / 音訊時同一個工具依副檔名分流（見問題 3）。
- 參數：
  - `path`：**本機檔案的絕對路徑**（見問題 1）。
  - `folderId`（可省略 = 未分類；id 由 `list_library_items` 的 `folders` 取得，未知 → 錯誤）。
  - `name`（可省略 = 檔名，**含副檔名**，同 `libraryItemName` 與人在 App 匯入；步驟 5 實測時更正）。
- 回傳：`{ itemId, name, kind: "image", width, height, folder, status }`，`status` = `new` / `duplicate`（同檔已在素材庫，回傳那一筆，不是錯誤）/ `restored`（從垃圾桶還原到這次的資料夾）。拿到 `itemId` 後用 `place_library_item` 或 `add_shape.image` 放到頁面。
- 素材庫照舊**立即寫入、不進復原**（同人在 App 匯入）。App 顯示 toast「Claude Code 匯入了素材「xxx」」，讓人知道素材庫多了東西（見問題 4）。
- **不能放進 `batch`**（`NOT_IN_BATCH`）：它是非同步的，而且素材庫不在編輯器的復原歷史裡，整批退回時也退不回已寫入的檔案。

### 2.2 檔案由誰讀：App 的 Rust 端「暫存附件」

路徑只在 Rust 裡出現，**WebView 拿不到「讀任意路徑」的能力**：

```
Claude Code ─stdio→ magazine-mcp.exe ─pipe→ App Rust (bridge.rs)
                                              │ tool == import_library_item：
                                              │   檢查路徑 → 讀檔（spawn_blocking）→ 暫存成附件 token
                                              │   （讀不到 / 不是圖片副檔名 / 超過 20 MB → 直接回錯誤，不經前端）
                                              ↓ mcp://request { id, tool, args, attachment: { token, fileName } }
                                           前端 → mcp_take_attachment(token)（raw bytes，用一次就刪）
                                              → new File([bytes], fileName) → 共用的匯入流程 → 回應
```

- **路徑檢查**（Rust）：必須是絕對路徑、是一般檔案（不是資料夾 / 裝置）、副檔名在白名單、≤ 20 MB（`MAX_ASSET_BYTES`，先看 metadata 再讀）。內容的真正檢查照舊在 `library_import` 的 `assets::import_asset`（檔頭、SVG 解析），不另寫。
- **附件**存在 `McpState` 裡（token → bytes），只能被**這一次呼叫**取一次；回應送出（或逾時）時一併清掉，不會累積。`attachment` 放在 `FrontendRequest` 的 `args` **外面**：AI 不能自己編一個 token。
- **為什麼不是前端呼叫新 command 讀路徑**：那等於讓 WebView 可以讀這台電腦的任何檔案，違反「前端不傳路徑給 Rust」。
- **為什麼不是橋接程式讀檔、用 base64 送過 pipe**：要把 pipe 的上限從 1 MB 提高到約 27 MB，橋接程式也要懂特定工具、把 `path` 換成 `data`（兩份 schema）。Rust 端讀比較單純（見問題 1 的替代方案）。
- 讀檔的位元組再經前端送回 `library_import`（Rust → JS → Rust，本機 ≤ 20 MB，可以接受），換來**整條匯入流程完全沿用**：尺寸、SVG viewBox、去重、垃圾桶還原、`library.json` 寫入佇列都不用另寫。

### 2.3 非同步工具

- `run-tool.ts` 多一個 `ASYNC_HANDLERS`（目前只有 `import_library_item`），`runToolAsync(name, args, context)`：非同步工具 await、其他照舊呼叫同步的 `runTool`。**`runTool` 與既有測試不變**；`batch` 只呼叫同步的 `runTool`，非同步工具在 batch 裡回「要單獨呼叫」。
- `ToolContext` 多兩個可選欄位：`attachment`（這次呼叫的附件，只有 Rust 塞得進來）與 `importImage`（`McpBridge` 由 `useLibraryImport` 注入；測試可以塞假的）。
- `use-mcp-bridge.ts` 的 `answer` 改成 async；**呼叫依序處理**（pipe 本來就一個請求一個回應），所以「匯入 → 立刻 `place_library_item`」看得到新素材（`getLibrary()` 同步讀最新的，見前一份計畫）。

### 2.4 不重複造輪子

| 需要的功能 | 沿用 |
|---|---|
| 檢查、取尺寸、存檔、加進素材庫 | `use-library-import.ts` 的 `prepare` / `toItem` / `importOutcome`（改成回傳原因，見步驟 1） |
| 內容檢查（檔頭、SVG） | Rust `assets::import_asset`（經 `library_import`） |
| 大小上限 | `MAX_ASSET_BYTES`（Rust）/ `validateImageFile`（前端） |
| 資料夾路徑 | `library-tree.ts` 的 `folderPath`（同 `list_library_items`） |
| 放到頁面 | 不在這個工具裡做，交給既有的 `place_library_item`（見問題 2） |
| 工具清單、SDK | `mcp-tools.json` 快照、`sdk/python/scripts/generate.py` |

## 3. 步驟（一步一步，每步完成後停下來等確認）

| 步驟 | 內容 | 改哪裡 | 畫面變化 |
|---|---|---|---|
| 1 | **匯入流程回傳原因**：把 `prepare` 的錯誤從 toast 改成回傳 `Result`；新增 `importFile(file, folderId, accept)` 回傳 `{ item, status } \| error`，`importFiles` 包一層照舊 toast（人操作的行為不變） | `use-library-import.ts` | 無（人工點一次匯入確認不變） |
| 2 | **Rust 附件**：`bridge.rs` 在 `call_frontend` 前攔 `import_library_item`：檢查路徑、讀檔、暫存 token；`FrontendRequest.attachment`；command `mcp_take_attachment(token)`（raw bytes，取一次就刪）；回應 / 逾時時清除。cargo 測試：相對路徑、資料夾、副檔名、超過上限、token 只能取一次、別的工具沒有附件 | `mcp/bridge.rs`、`commands/mcp.rs`、`lib.rs` | 無 |
| 3 | **非同步工具接線**：`ASYNC_HANDLERS` / `runToolAsync`、`ToolContext.attachment` / `importImage`、`answer` 改 async、`McpBridge` 注入 `importImage`、`NOT_IN_BATCH` 加入 | `run-tool.ts`、`batch.ts`、`use-mcp-bridge.ts`、`mcp-bridge.tsx`、`tool-session.ts` | 無 |
| 4 | **`import_library_item` 工具**：定義（中文說明寫給 AI：絕對路徑、支援格式、20 MB、回傳後怎麼放到頁面）+ handler（沒有附件 → 錯誤、資料夾檢查、`name`、status、toast）+ 測試（假的 `importImage`：新增 / 重複 / 還原 / 未知資料夾 / 格式錯誤的訊息 / batch 拒絕）；更新 `mcp-tools.json` | `tool-definitions.ts`、`edits.ts`（或新檔 `imports.ts`）、`run-tool.ts`、測試 | 無 |
| 5 | **重編與實測**：`cargo build --bin magazine-mcp`、Python SDK 重新產生；在桌面版用 Claude Code：產一張 PNG 與一張 SVG（scratchpad）→ 匯入 → `place_library_item` 放到頁面；再匯入同一張（duplicate）、錯誤路徑 | 橋接程式、`sdk/python/magazine/_tools.py` | 有（實測） |
| 6 | **文件**：CLAUDE.md（MCP 目前的工具、**安全原則改寫**：唯一收路徑的工具、只讀不回傳內容）、`MCP-工具清單.md`、`docs/progress.md`、`07-軟體增加McpServer-實作.md` 與 `11-mcpserver-addimage-實作.md` 補連結 | 文件 | 無 |

## 4. 要和使用者討論的問題

1. **圖片怎麼交給工具？**
   - (a) **本機檔案絕對路徑，由 App 的 Rust 讀**（建議：產圖 / 截圖類的 MCP 工具幾乎都把檔案存在本機並回傳路徑；LLM 只要傳一個字串）。代價：放寬「沒有工具接受檔案路徑」——但只讀、內容必須是圖片、不回傳任何檔案內容給 AI，Claude Code 本身也要使用者核准才會呼叫這個工具。
   - (b) (a) + **網址（http/https）**：Rust 用既有的 `reqwest` 下載（限制大小與逾時）。給「回傳網址」的產圖服務用；多一條對外連線，建議之後需要再加。
   - (c) **base64 參數**：不碰路徑，但 LLM 要輸出整張圖的 base64，實際上不可行（只適合幾 KB 的小圖）。
2. **匯入後要不要順便放到頁面？**
   - (a) **只匯入，回傳 `itemId`，放到頁面用既有的 `place_library_item`**（建議：一個工具做一件事；放的參數（頁、位置、寬度、圖片框）已經有了，不重寫）。
   - (b) 可選參數 `place: { pageId, x, y, width }`，一次呼叫匯入並放好（少一次來回，但兩件事的錯誤混在一起，而且匯入不能復原、放到頁面可以）。
3. **範圍**：(a) **這次只收圖片**（建議，需求只提到圖片；文字可以直接用 `add_text`）；(b) 圖片 + 文字檔 + 音訊一起做（同一條流程，多一些測試）。
4. **要不要讓人知道 / 確認？**
   - (a) **不另外確認，App 顯示 toast「Claude Code 匯入了素材「xxx」」**（建議：Claude Code 呼叫工具前已經會問使用者；素材進素材庫不改頁面，不想要可以丟垃圾桶）。
   - (b) App 跳對話框「Claude Code 要匯入 xxx，允許嗎？」（最安全，但 LLM 是主要使用者，每張都要人按，等於回到現在的問題；對話框還可能超過 30 秒的等待上限）。

## 5. 計畫檢核

- **安全**：路徑只在 Rust 出現；WebView 只拿得到「這次 MCP 呼叫、Rust 已經讀好」的位元組，token 用一次就刪、AI 無法偽造。讀到的內容不回傳給 AI（只回尺寸與 id）。只有開啟 MCP 開關時 pipe 才存在（預設關），沿用本機 / 本帳號 / 第一個 instance 的限制。
- **大小與時間**：先看 metadata 再讀，> 20 MB 不讀；本機 20 MB 讀檔 + 解碼遠低於 30 秒的等待上限。pipe 的 1 MB 上限不受影響（參數只有路徑）。
- **時序**：MCP 呼叫依序處理；匯入完成才回應，下一個 `place_library_item` 讀 `getLibrary()` 一定看得到。附件在回應或逾時時清除，App 逾時後才完成的匯入照常寫進素材庫（AI 再匯入一次會得到 `duplicate`，不會重複）。
- **換專案**：匯入時專案換了 → 走 `library_import` 時存進「目前的專案」，和人操作相同；素材庫寫入本來就檢查 `projectId`。
- **batch**：拒絕（理由見 2.1）。工具說明寫清楚「先匯入，再在 batch 裡放到頁面」。
- **重複**：同檔（hash 相同）不新增、回 `duplicate` 與原本的 `itemId`；`name` 參數不會改掉既有素材的名稱（要改名之後另排工具）。
- **SVG**：照人匯入的規則（原檔照存、viewBox 尺寸）；含文字的 SVG 匯出 PDF 時字型可能不同（既有限制）。
- **瀏覽器模式**：沒有 MCP，不受影響。
- **測試**：`mcp-tools.test.ts` 快照因新工具改變（步驟 4 更新）；`menu` 與既有工具測試不受影響（`runTool` 不變）。

## 6. 進度紀錄

- 2026-10-22：計畫草稿；第 4 節四個問題都採建議方案：本機絕對路徑（App 的 Rust 讀）、只匯入（放到頁面用 `place_library_item`）、這次只收圖片、不另外確認（只顯示 toast）。
- 2026-10-22 步驟 1（完成，畫面不變）：`use-library-import.ts` 的 `store` / `prepare` 改成回傳 `Result`（錯誤訊息和原本的 toast 相同），`importFiles` 收到錯誤才 toast，行為不變。新增 `importFile(file, { folderId, accept?, name? })`：先檢查資料夾存在與名稱（`itemNameError`；檔案存進專案之後才不合格的話，`item/add` 只會默默不加），再 `prepare` → 共用的 `add`（`importOutcome` + `item/add` + 找回素材庫那一筆），回傳 `{ item, outcome }`（`new` / `duplicate` / `restore`）或錯誤，不 toast。已在素材庫的檔案保留原本的名稱。`tsc` 通過，`src/lib/library` 測試 65 個通過（這個 hook 用到 DOM 解碼，沒有單元測試；MCP 的部分在步驟 4 用假的 importer 測）。**和計畫不同**：回傳欄位叫 `outcome`（沿用 `ImportOutcome` 的 `restore`），工具回傳時再換成 `restored`。
- 2026-10-22 步驟 2（完成，畫面不變）：新模組 `src-tauri/src/mcp/attachment.rs`：`read_import(args)` 讀 `path`（不是字串 → `None`，交給前端的 schema 說明；必須 `is_absolute`（Windows 的 `C:foo`、`oo` 不算）、副檔名白名單（同 `library-files.ts` 的圖片）、`metadata` 是檔案、先看大小再讀、≤ `MAX_ASSET_BYTES`（改成 `pub(crate)`）；錯誤是給 AI 的中文、含路徑）；`Attachments`（token = UUID → bytes，`take` 一次就刪）。`bridge.rs` 的 `call_frontend` 只對 `import_library_item` 用 `spawn_blocking` 讀檔，讀不到直接回錯誤、不經前端；`FrontendRequest.attachment: { token, fileName }`（在 `args` 外面）；回應或逾時後一律 `remove(token)`。command `mcp_take_attachment(token)` 回傳 raw bytes（`tauri::ipc::Response`），未知 / 用過 → `InvalidInput`。cargo 測試 6 個（絕對路徑與中文檔名、缺 path、四種相對路徑、資料夾、副檔名、沒有副檔名、不存在、上限剛好 / 超過、token 只能取一次、事件欄位 camelCase）；全部 264 個通過、沒有警告。前端還不讀 `attachment`（步驟 3）。
- 2026-10-22 步驟 3（完成，畫面不變）：`run-tool.ts`：`AsyncToolName = Extract<ToolName, "import_library_item">`（工具還沒定義時是 never，步驟 4 加定義後漏寫 handler 會編譯失敗）、`HANDLERS` 只涵蓋同步工具、`ASYNC_HANDLERS`（目前是空的）、`runToolAsync`（非同步工具 await，其他交給 `runTool`）；`runTool` 遇到非同步工具回「要單獨呼叫」；參數驗證抽成 `parseArgs`。`ToolContext` 多兩個可選欄位 `attachedFile`（向 Rust 取這次的檔案，回傳 `File`）與 `importFile`（型別 `ImportFileFn`）。`batch.ts` 的 `NOT_IN_BATCH` 加 `import_library_item`，錯誤訊息改由清單產生。`use-mcp-bridge.ts`：`answer` 改 async；事件改成**一個接一個處理**（promise 佇列，每個呼叫輪到時才讀 state / 素材庫，不同連線同時到的呼叫不會在匯入途中插進來；佇列接住例外，免得之後的呼叫卡住）；payload 的 `attachment` 轉成 `attachedFile`；`useMcpBridge` 多一個參數 `importFile`，`McpBridge` 由 `useLibraryImport()` 傳入。`projectApi.mcpTakeAttachment(token)`。`tool-session.ts` 多 `hooks`（`attachedFile` / `importFile`）與 `callAsync`。測試：batch 拒絕 `import_library_item`、`runToolAsync` 對其他工具的結果和 `runTool` 相同。`tsc` 通過，vitest 1133 個全部通過（`mcp-tools.json` 沒有變：工具定義在步驟 4）。
- 2026-10-22 步驟 4（完成，畫面不變（桌面版在步驟 5 實測））：工具 `import_library_item { path, folderId?, name? }`（`path` 1–4096 字；`name` 上限同 `rename_page` 的做法放寬成兩倍，實際由 `itemNameError` 檢查）。新檔 `lib/automation/imports.ts` 的 `importLibraryItem`：沒有 `importFile` / 沒有附件 → 錯誤（後者提示絕對路徑）→ 先檢查資料夾（`queries.ts` 抽出 `unknownFolderError`，和 `list_library_items` 同訊息，不取檔案）→ `attachedFile()` → `importFile(file, { folderId, accept: ["image"], name })` → 回傳 `{ itemId, ...itemSummary, status }`（`itemSummary` 改成 export，欄位和 `list_library_items` 相同；`status` = `new` / `duplicate` / `restored`）。不送 reducer action（素材庫不在復原歷史）。toast 放在 `mcp-bridge.tsx` 包一層 `importFile`（`lib/automation` 不碰 UI）：「Claude Code 匯入了素材「xxx」」，重複 / 還原時加註。工具說明寫給 AI：支援格式、20 MB、絕對路徑、之後用 `place_library_item` / `image`、duplicate 時資料夾與名稱不變、不能 undo、不能放進 batch；`list_library_items` 的說明改成「新增圖片素材用 import_library_item」；`batch` 的說明裡不能放進批次的工具改由 `NOT_IN_BATCH` 產生。測試 5 個（`__tests__/imports.test.ts`，假的附件與 importer：回傳欄位與資料夾路徑、只收圖片、預設未分類、duplicate / restored、匯入失敗的原因原樣、未知資料夾不取檔案、沒有 / 過期的附件、缺 path / 多餘參數、`runTool` 與 batch 拒絕）。`mcp-tools.json` 已更新；vitest 1138 個通過。Python SDK 的 `test_tools.py` 要到步驟 5 重新產生後才會一致。
- 2026-10-22 步驟 5（完成；畫面待使用者確認）：橋接程式重編（執行中的舊檔被 Claude Code 佔用，先改名 `magazine-mcp.exe.old.exe`）、Python SDK 重新產生（pytest 16 個）。`npm run tauri dev` 啟動 App 後，用 scratchpad 的 stdio 腳本（`magazine.client.connect`，直接啟動新的 debug 橋接程式，不用 Claude Code 重連）實測。**實測抓到的 bug**：`new File([bytes], fileName)` 的 `type` 是空字串，`validateImageFile` 只看 MIME，所以每張圖都回「不是支援的圖片格式」（選檔對話框的 File 由瀏覽器依副檔名填 type）。修正：`library-files.ts` 加 `imageTypeOfFile(name)`（副檔名 → `ALLOWED_IMAGE_TYPES` 之一，測試守著每個圖片副檔名），`attachedFile` 建 File 時帶 `type`。**說明更正**：素材名稱保留副檔名（`libraryItemName` 本來就是），工具說明原本寫「去掉副檔名」，改成「檔名（含副檔名，和使用者在 App 匯入相同）」；`mcp-tools.json`、SDK、橋接程式再更新一次。結果：PNG 320×200 → `new`；同一張再匯入（帶 name）→ `duplicate`、同一個 id、名稱不變；只有 viewBox 的 SVG 帶 name「徽章」→ 240×120（viewBox 尺寸）；相對路徑 / 不存在 / `.txt` / 未知資料夾 / batch 都回中文錯誤；假 PNG（內容不是圖片）→「無法讀取圖片內容」（前端解碼擋下，沒有存進專案）；匯入後 `place_library_item` 放到第 1 頁：SVG 240×120 pt、PNG 依原本規則縮到頁寬一半（297.6 pt）。vitest 1139 個通過。
- 2026-10-22 步驟 6（完成）：`CLAUDE.md`（目錄結構的 `imports.ts` / `runToolAsync` / `attachment.rs`、MCP 目前的工具與新的「匯入素材」說明、安全原則改成「只有 `import_library_item` 收路徑」、IPC commands 加 `mcp_take_attachment`）、`MCP-工具清單.md`（34 個工具、素材庫分類、工具列與用法、安全與 batch 的說明）、`07-軟體增加McpServer-實作.md` 的紀錄、`11-mcpserver-addimage-實作.md` 註記「不能透過 MCP 匯入」不再成立、`docs/progress.md`。`docs-website/` 不用改（沒有改 `types.ts`）。
