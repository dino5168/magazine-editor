# MCP：從素材庫放圖片到頁面：實作計畫

> 起因：2026-10-10 用 Claude Code 測試 MCP 時（`10-mcpserver-測試文字.md`），要把素材 `mcp-server.webp` 放到 Page-6，但現有工具做不到。
> 狀態：**五個步驟全部完成（2026-10-10）。**

## 1. 現況

| 項目 | 現況 |
|---|---|
| MCP 工具 | 只能操作文字、圖形、頁面、主頁、文字樣式；**看不到素材庫，也不能新增圖片物件** |
| 安全原則 | 沒有工具接受檔案路徑（`07-軟體增加McpServer-實作.md`），匯入新檔案只能由使用者在 App 裡選 |
| 素材庫 | `LibraryProvider` 管理（不在編輯器 reducer 裡）；`useLibraryControl().getLibrary()` 可以同步取得最新內容（含還沒重畫的變更） |
| 放到頁面 | `usePlaceLibraryItem`（素材面板、管理視窗共用）：圖片 → `createImageElement(src, 原始尺寸, 頁面, 中心)`；文字檔要先 `library_read_text` **非同步**讀全文 |
| `runTool` | **同步**（`Result`），`use-mcp-bridge.ts` 收到事件後直接回應 |

所以這次只需要讓 MCP **看得到素材庫、能引用裡面已有的素材**。安全原則不變：素材已經由使用者匯入到專案資料夾，工具只傳素材的 id。

## 2. 設計

### 2.1 兩個新工具

**`list_library_items`**（唯讀）

- 參數（都可省略）：`kind`（`image` / `text` / `audio`）、`query`（名稱包含，不分大小寫，同管理視窗的搜尋）、`folderId`（含子資料夾）、`includeTrashed`（預設 false）。
- 回傳：
  - `folders`：`id`、`name`、`path`（例如 `封面 / 人物`，沿用 `folderPath`）。
  - `items`：`id`、`name`、`kind`、`folder`（路徑，`null` = 未分類）、`width` / `height`（圖片的像素）、`bytes`、`trashed`。新的在前，排序沿用 `visibleItems`。
- 不回傳 `src`：AI 用不到，而且工具只認 id。

**`place_library_item`**

- 參數：`item`（**素材 id 或名稱**，名稱要完全相符）、`pageId`（省略 = 使用者正在看的頁面）、`x` / `y`（**外框左上角**，和 `add_text` / `add_shape` 一致；省略 = 放在頁面中央）、`width`（可省略，見問題 2）。
- 行為：沿用 `createImageElement`（太大時縮到頁面的比例，和面板放到頁面相同），再套用 `x` / `y` / `width`；`element/add` 帶 `pageId`，**一次呼叫 = 一筆復原**，不切換使用者的頁面（同 `add_text`）。回傳 `{ id, pageId, width, height }`。
- 錯誤（中文、告訴 AI 下一步怎麼做）：找不到素材、同名素材不只一個（列出 id，請改用 id）、素材在垃圾桶、音訊不能放到頁面、文字檔（見問題 1）。

### 2.2 不重複造輪子

| 需要的功能 | 沿用 |
|---|---|
| 頁面 id 檢查、加物件 | `edits.ts` 的 `targetSheet` / `addElement` |
| 建立圖片物件 | `element-factory.ts` 的 `createImageElement` |
| 篩選與排序 | `library-selectors.ts` 的 `visibleItems`（`LibraryView` + `query`） |
| 資料夾路徑 | `library-tree.ts` 的 `folderPath` |
| 讀最新的素材庫 | `LibraryControl.getLibrary()`（和 `stateRef` 一樣不會讀到舊值） |
| 測試 | `__tests__/tool-session.ts`（加可選的 `library`）、`tests/fixtures/sample-library.json` |

### 2.3 素材庫怎麼交給工具

`ToolContext` 多一個 `library: Library`。`use-mcp-bridge.ts` 每次呼叫時用 `getLibrary()` 取得最新內容（`McpBridge` 在 `EditorLayout` 裡，已經在 `LibraryProvider` 內）。工具**只讀素材庫、不改它**，所以不需要 library 的 dispatch。

## 3. 步驟（一步一步，每步完成後停下來等確認）

| 步驟 | 內容 | 改哪裡 | 畫面變化 |
|---|---|---|---|
| 1 | **接線**：`ToolContext.library`；`useMcpBridge` 接收 `getLibrary`（`McpBridge` 用 `useLibraryControl()` 傳入）；`toolSession(initial, commands, library?)`，預設 `EMPTY_LIBRARY` | `run-tool.ts`、`use-mcp-bridge.ts`、`mcp-bridge.tsx`、`tool-session.ts` | 無 |
| 2 | **`list_library_items`**：`queries.ts` 的 `listLibraryItems(library, args)` + 測試（用 `sample-library.json`：篩種類、名稱、資料夾含子資料夾、垃圾桶） | `tool-definitions.ts`、`queries.ts`、`run-tool.ts`、測試 | 無 |
| 3 | **`place_library_item`**（圖片）：`edits.ts` 的 `placeLibraryItem` + 測試（id / 名稱、同名、垃圾桶、音訊、預設中央、指定 `x` / `y` / `width`、不切頁、一筆復原、未知頁面） | `tool-definitions.ts`、`edits.ts`、`run-tool.ts`、測試 | 無 |
| 4 | **工具清單與實測**：`npx vitest run mcp-tools -u` 更新 `mcp-tools.json`、`cargo build --bin magazine-mcp`；和使用者在桌面版實測：把 `mcp-server.webp` 放到 Page-6、復原一次 | `mcp-tools.json`、橋接程式 | 有（實測） |
| 5 | **文件**：`CLAUDE.md`（MCP 的目前的工具、`ToolContext`）、`docs/progress.md`、`07-軟體增加McpServer-實作.md` 補一行連到這份計畫 | 文件 | 無 |

文字檔素材這次不做（問題 1 選 a），沒有額外的步驟。

## 4. 要和使用者討論的問題

1. **文字檔素材要不要也能放？** 讀全文是非同步（`library_read_text`），`runTool` 現在是同步的。
   - (a) **這次只做圖片**，文字檔回「目前只能放圖片；文字請用 add_text」（建議：AI 本來就能用 `add_text` 寫文字，需求較小）。
   - (b) 把 `runTool` 改成 async（handler 可以回傳 Promise），文字檔沿用 `createTextFromFile`。改動面是整個 bridge 與所有測試的呼叫方式。
2. **尺寸參數**：
   - (a) **只有 `width`，高度依原圖比例算**（建議：不會不小心把照片壓扁；之後要改比例可以用 `update_element` 同時給寬高）。
   - (b) `width` / `height` 都可以給，只給一個時依比例、兩個都給時照給的值。
3. **素材的指定方式**：(a) **id 或名稱都可以**，同名時要求改用 id（建議，同文字樣式的做法）；(b) 只收 id，一定要先 `list_library_items`。

## 5. 計畫檢核

- **安全**：工具不收路徑；`src` 來自使用者已匯入的素材庫，`element/add` 和 Rust 存檔時照樣驗證 `assets/images/<檔名>`。不能透過 MCP 匯入、刪除、移動素材（之後要的話另排）。
- **素材庫寫入**：只讀不寫，不影響 `library.json` 的立即寫入佇列與 `flush()`。
- **時序**：同一批呼叫裡「放圖 → 立刻 `update_element`」照樣可行（`apply` 先把算好的 state 記在 ref）。素材庫用 `getLibrary()`，使用者剛匯入、畫面還沒重畫的素材也看得到。
- **垃圾桶**：放垃圾桶裡的圖片會讓「永久刪除後下次開檔清理」的規則變複雜（頁面還在用就保留檔案，所以不會壞），但使用者把它丟進垃圾桶，就代表不想再用，所以拒絕並提示先還原。
- **圖片遺失**：素材的檔案不在了時，和面板一樣照樣建立物件（畫布顯示灰框、匯出時略過），不額外檢查檔案。
- **瀏覽器模式**：沒有 MCP，不受影響。
- **測試**：`mcp-tools.test.ts` 的快照會因為新工具改變，屬於預期內的變化（步驟 4 更新）。

## 6. 進度紀錄

- 2026-10-10：計畫草稿；第 4 節三個問題都採建議方案：這次只做圖片（文字檔回提示改用 `add_text`）、只有 `width` 依比例、素材以 id 或名稱指定。
- 2026-10-10 步驟 1（完成，畫面不變）：`ToolContext` 加 `library: Library`（只讀）。`useMcpBridge(commands, enabled, getLibrary)`：`getLibrary` 放在 ref（同 `stateRef` 的做法），**每次呼叫時**才取素材庫，剛匯入、還沒重畫的素材也看得到；`McpBridge` 由 `useLibraryControl()` 傳入（它在 `EditorLayout` 裡，已在 `LibraryProvider` 內）。`toolSession(initial, commands, library = EMPTY_LIBRARY)`，既有測試不用改。`tsc --noEmit` 通過，`src/lib/automation` 測試 46 個通過。
- 2026-10-10 步驟 2（完成，畫面不變）：工具 `list_library_items`（唯讀；參數 `kind` / `query` / `folderId` / `includeTrashed`，都可省略）。`queries.ts` 的 `listLibraryItems(library, args)`：篩選與排序直接用 `visibleItems`（全部或資料夾含子資料夾 + 名稱），`includeTrashed` 時把 `visibleItems(trash)` 接在最後（指定資料夾時不會有，因為垃圾桶的素材沒有資料夾），種類最後再篩；`folders` 全部列出（`id` / `name` / `parentId` / `path`，路徑用 `folderPath` 以「 / 」連接，同垃圾桶顯示的格式）。素材欄位：`id` / `name` / `kind` / `folder`（路徑，null = 未分類）/ `bytes` / `trashed`；圖片加 `width` / `height`（像素），文字檔加 `excerpt`（沿用 `excerpt()` 成一行、最多 80 字），不回傳 `src`。未知資料夾回錯誤。測試 4 個（用 `sample-library.json`）。**和計畫不同**：`mcp-tools.json` 的快照這一步就先更新（否則步驟之間測試是紅的），重編橋接程式仍在步驟 4。vitest 558 個，`tsc --noEmit` 通過。
- 2026-10-10 步驟 3（完成，畫面不變）：工具 `place_library_item { item, pageId?, x?, y?, width? }`。`edits.ts`：`findLibraryItem`（先比 id，再比名稱（去頭尾空白、完全相符）；同名時以不在垃圾桶的為準，仍不只一個就列出 id 請改用 id；只有垃圾桶裡有才找得到它，好回報「在垃圾桶」）、`placeLibraryItem`：拒絕垃圾桶 / 音訊 / 文字檔（提示改用 `add_text`）→ `createImageElement`（和素材面板相同：原始像素當 pt、超過頁寬或頁高的一半就縮小）→ 給 `width` 時高度用**原圖像素比例**算（用縮小後的尺寸算會多出浮點誤差，測試抓到 300.00000000000006）→ `x` / `y` 省略的那一軸置中 → `addElement`（`element/add` 帶 `pageId`，一筆復原、不切頁；加在目前頁時和 `add_text` 一樣會選取新物件）。回傳 `{ id, pageId, width, height }`。工具說明裡的縮小規則照程式寫「頁面寬、高的一半」（`IMAGE_MAX_PAGE_RATIO = 0.5`）。測試 5 個（預設中央、名稱與寬度、只給一軸、別頁不切頁與未知頁、文字 / 音訊 / 垃圾桶 / 找不到 / 同名都不改 state）。`mcp-tools.json` 已更新。vitest 563 個，`tsc --noEmit` 通過。
- 2026-10-10 步驟 4（完成）：重編橋接程式（執行中的 `magazine-mcp.exe` 被 Claude Code 佔用、不能覆蓋，先改名成 `.old.exe` 再編）。Claude Code 要在 `/mcp` 重新連線才看得到新工具（重開 `tauri dev` 只更新 App），所以實測用 stdio 小腳本直接啟動新的橋接程式：`list_library_items` 列出資料夾「封面」與三個素材；`place_library_item { item: "mcp-server.webp", pageId: Page-6 }` → 1536×1024 px 縮成 420.9×280.6 pt、置中（x 210.5、y 157.3）、最上層，使用者在畫面上確認 OK。復原沒有另外測。
- 2026-10-10 步驟 5（完成）：`CLAUDE.md` 的 MCP 目前的工具、`docs/progress.md`、`07-軟體增加McpServer-實作.md` 補一行連到這份計畫。
