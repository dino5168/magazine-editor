# 評估：接上 MCP server

> 狀態：**評估，尚未排入實作**。等匯出 EPUB 告一段落後再決定。
> 建立：2026-09-30

---

## 1. 結論

- **不需要先做「腳本功能」**（Krita 的指令稿 / Python 外掛那種）。MCP 需要的是**一組外部可以呼叫的指令介面**，這個 App 的原始碼在我們手上，可以直接開出來。
- 要先做的是**自動化指令層**：一份「外部可以做什麼」的清單，包含參數格式、執行時驗證、回傳值和復原歷史的規則。選單、MCP，以及將來可能的腳本功能都用這一層。
- MCP server 建議**內嵌在 App 的 Rust 端**，只接受本機連線，**預設關閉**，由使用者在偏好設定開啟。

## 2. 為什麼 Krita / Blender 的 MCP 要靠腳本

Blender 的 MCP 是跑在 Blender 裡的 Python 外掛，Krita 社群的 MCP 也是 Python 外掛，在程式內開一個 socket 接收指令。原因是那些軟體不是 MCP 作者寫的，唯一能從外部控制它們的入口就是腳本 API。

我們沒有這個限制：MCP 的工具呼叫可以直接轉成編輯器內部的指令，不必繞過一層腳本語言。

## 3. 現況盤點

### 可以直接沿用的

| 現有設計 | 對 MCP 的意義 |
|---|---|
| `EditorAction`（`editor-reducer.ts`） | 本身就是指令語言：可序列化、純函式、沒變化時回傳同一個 state（不會多一筆復原紀錄） |
| `selectIsDirty` + 自動備份 | MCP 的修改會自動標記未存檔，也會被 60 秒備份涵蓋 |
| 選單的 `COMMANDS` 單一資料來源 | 「新增 / 開啟 / 儲存 / 匯出」這類檔案指令已有清楚的入口 |
| Rust `project/format.rs` 的驗證 | 顏色、頁面尺寸、`src` 路徑的規則已經寫好，可以參考或共用 |
| `export/render.rs` 的 `RenderModel` | 將來「不開 App 直接輸出」或「把頁面算成圖片給 AI 看」都能用 |

### 缺口

| 缺口 | 說明 |
|---|---|
| **action 內容不在執行時驗證** | `element/add`、`element/update` 相信 TypeScript 型別，沒有檢查數字是否有限、欄位是否屬於該物件類型。UI 送的資料沒問題，但 MCP 送來的是外部 JSON，必須在進入 reducer 前驗證（名稱與顏色的驗證已經有，要補齊其他欄位） |
| **物件操作只作用在「目前頁面」** | `element/add` / `update` / `delete` / `reorder` 都透過 `updateActivePage`。MCP 指定 `pageId` 時，照現在的做法得先 `page/select`，會切換使用者正在看的頁面 |
| **沒有批次 / 交易** | AI 常一次做很多修改，每個 action 各記一筆復原紀錄，Ctrl+Z 要按很多次 |
| **沒有查詢介面** | 讀取頁面、物件清單目前只在 React 元件裡用 hook 取得，外部拿不到 |
| **檔案指令綁著對話框** | 開啟 / 另存 / 匯出都由 Rust 開系統對話框選路徑（「前端不傳路徑」原則）。MCP 呼叫匯出時，要跳出對話框給使用者選，還是存到固定位置，要另外決定 |
| **沒有 id 以外的定位方式** | AI 會想說「把標題改大」，需要能用類型、文字內容、名稱找到物件 |

## 4. 架構選項

文件狀態在前端的 reducer 裡，所以不論哪一種做法，MCP 工具呼叫最後都要轉成 reducer action。

| 選項 | 做法 | 優點 | 缺點 |
|---|---|---|---|
| **A. App 內嵌 HTTP MCP server（建議）** | Rust 端在 `127.0.0.1` 開 MCP（Streamable HTTP），工具呼叫以 Tauri event 轉給前端，前端執行後回傳結果 | 只有一個程式；直接操作使用者眼前的文件，畫面即時更新；MCP client 用網址連線即可 | Rust 要加 MCP SDK 與 HTTP server 依賴；前後端要多一條「請求 / 回應」的事件通道 |
| B. 獨立的 stdio 橋接程式 | MCP client 啟動一個小程式（stdio），它再用本機連線轉給執行中的 App | 支援只能用 stdio 的 MCP client | 多一個執行檔要打包與維護；App 端仍要開本機連線，等於 A 再加一層。**不能**讓 client 直接啟動主程式：single-instance 會讓第二個主程式立即結束 |
| C. 無頭模式 | 不開 App，Rust 直接讀寫專案檔、排版輸出 | 適合批次處理（例如 AI 產生整本雜誌再輸出 PDF / EPUB） | 繞過 reducer 與復原歷史；**換行由前端量測**（`measureTextLayout`），無頭模式量不到，EPUB 為主的方向下更需要瀏覽器引擎。是另一個產品方向，不在第一版 |

建議先做 **A**。B 等到真的需要支援只吃 stdio 的 client 時，再在 A 的前面加上。

> Rust 的 MCP SDK（例如官方的 `rmcp`）與傳輸方式的版本要在實作當時確認。這份文件不鎖定版本，比照 Typst 的做法：API 變動大就鎖定 `=` 版本。

## 5. 自動化指令層（第 0 階段，MCP 的前置工作）

放在 `src/lib/automation/`（不含 UI，寫測試），規則：

1. **每個指令有執行時的參數 schema**：驗證失敗回傳錯誤訊息（`Result`），不 dispatch。錯誤訊息要讓 AI 看得懂，例如「fontSize 必須是 1–999 之間的數字」。
2. **可以指定 `pageId`，不切換使用者目前的頁面**：reducer 加上指定頁面的 action，或讓現有 action 接受可選的 `pageId`。
3. **一次工具呼叫 = 一筆復原紀錄**：新增批次 action（例如 `batch`，內含多個子 action，只 commit 一次歷史）。多個操作可以一次呼叫，使用者按一次 Ctrl+Z 就能全部退回。
4. **查詢函式**：文件摘要、頁面清單、物件清單與單一物件。回傳精簡的 JSON；圖片只回傳資訊，不回傳內容。
5. **回傳新建物件的 id**：AI 需要它做後續操作。

選單與 UI 不一定要改成走這一層，但新功能優先放這裡，避免同一件事有兩種做法。

## 6. 第一批 MCP 工具（草案）

### 查詢（唯讀，風險低，最先開放）

| 工具 | 回傳 |
|---|---|
| `get_document` | 文件名稱、頁數、頁面尺寸、是否有未存檔變更 |
| `list_pages` | 每頁的 id、名稱、背景色、物件數 |
| `list_elements(pageId)` | 每個物件的 id、類型、位置尺寸、文字內容（截斷） |
| `get_element(id)` | 單一物件的完整欄位 |

### 編輯（每次呼叫算一筆復原紀錄）

| 工具 | 對應的 action |
|---|---|
| `add_text` / `add_shape`（rect / ellipse / polygon / star） | `element/add`（用 `element-factory` 補預設值） |
| `update_element(id, patch)` | `element/update` |
| `delete_element` / `reorder_element` | `element/delete` / `element/reorder` |
| `add_page` / `rename_page` / `delete_page` / `set_page_background` | `page/*` |
| `rename_document` | `document/rename` |
| `undo` / `redo` | `history/*` |
| `batch(operations[])` | 以上多個操作合併成一筆紀錄 |

### 之後再開放（需要先決定安全規則）

- `save`：已命名專案直接存檔；未命名專案會跳「另存」對話框。
- `export_pdf` / `export_epub`：是否一律跳對話框給使用者確認位置。
- `add_image`：來源只允許專案 `assets/` 裡已有的圖片，或內建相片；**不接受任意本機路徑**。
- `render_page(pageId)`：把頁面算成 PNG 給 AI 看排版結果，可以沿用 `RenderModel`。
- MCP resource：把目前文件 JSON 當作可讀取的資源。

## 7. 安全性

- **只綁定 `127.0.0.1`**，**預設關閉**，在「偏好設定」開啟，開啟時畫面上有明顯的狀態顯示。
- **本機連線也要驗證**：同一台電腦上的其他程式、瀏覽器裡的網頁都可能連到 localhost。建議：
  - 每次開啟時產生隨機 token，MCP client 設定時要帶上。
  - 檢查 `Origin` / `Host` 標頭，防止 DNS rebinding。
- **沿用「前端 / 外部不傳路徑」原則**：MCP 不能指定寫入路徑，檔案位置一律由 Rust 的對話框或既定規則決定。
- **破壞性操作**（刪除頁面、覆寫存檔、匯出）：第一版可以只開放可復原的編輯；之後再決定是否要在 App 內彈出確認。
- MCP 的參數與 IPC 參數一樣**視為不可信任**，驗證規則見第 5 節。

## 8. 分階段建議

| 階段 | 內容 | 前提 |
|---|---|---|
| 0 | 自動化指令層（第 5 節）：參數驗證、指定頁面、批次復原、查詢函式、測試 | 無，可以獨立進行，對現有功能也有好處（驗證更完整） |
| 1 | Rust 內嵌 MCP server + 唯讀工具 + 偏好設定開關 + token | 偏好設定頁面（目前是佔位） |
| 2 | 編輯工具（第 6 節） | 階段 0 |
| 3 | 存檔、匯出、圖片、`render_page` | 決定第 7 節的確認規則 |
| （選做） | 使用者腳本功能 | 在同一個指令層上加執行環境；安全性另外評估 |

## 9. 待決定的問題

1. MCP 的主要用途是什麼？這會決定工具的優先順序：
   - 對話式協助排版（「把第 2 頁的標題放大、置中」）
   - 大量產生內容（「用這份稿子排 8 頁」）
   - 檢查（「找出超出頁面的物件」）
2. AI 的修改是否要**讓使用者先預覽再套用**？還是直接套用、不滿意再 Ctrl+Z？
3. 要支援哪些 MCP client？Claude Code / Claude Desktop 可以用網址連 HTTP server，只支援 stdio 的 client 才需要選項 B。
4. 未命名專案也開放 MCP 操作嗎？
5. 將來是否需要**無頭模式**（選項 C）做批次輸出？如果需要，換行量測要改成在 Rust 端也能做，會影響 EPUB 的架構。
