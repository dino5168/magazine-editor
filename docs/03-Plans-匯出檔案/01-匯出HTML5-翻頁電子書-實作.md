# 匯出 HTML5 翻頁電子書（Flip Book）實作計畫

> 任務檔：`01-匯出HTML5-翻頁電子書.md`（同目錄）
> 狀態：**全部步驟完成（2026-10-14）；commit `65cfc1f`（已推送）；桌面版人工驗證完成（2026-10-14，Firefox 未測）**
> 撰寫日期：2026-10-14

---

## 1. 目標與範圍

「檔案 → 匯出為 → 翻頁電子書（HTML5）...」輸出一個**資料夾**，用瀏覽器開啟 `index.html`（本機 `file://` 或上傳到任何靜態網站空間）就能像雜誌一樣翻頁閱讀。

- 一頁文件 = 翻頁書的一頁；版面、換行、字型和畫布 / PDF / EPUB 一致。
- 跨頁配對和編輯器的雙頁模式相同：**第 1 頁（封面）單獨在右**，之後 2–3、4–5…（`spreads.ts` 的規則）。
- 輸出自給自足：不引用 CDN、不需要伺服器端程式、離線可看（同 `docs-website/` 的原則）。

**不在這次範圍**：EPUB 匯出的接線（`Imp-Plan-ExportEpub.md` 階段 3、4 仍暫緩）、匯出 PNG / JPEG、上傳到網站 / 雲端、翻頁音效、背景音樂、連結與互動元件、字型子集化。

---

## 2. 現況（可以重用的部分）

| 已有的東西 | 位置 | 在翻頁書裡的用途 |
|---|---|---|
| 匯出請求（含主頁展開、頁碼、對頁跨書背複本、Konva 量好的換行） | `lib/export/export-request.ts`、`text-layout.ts` | **原封不動**沿用，前端不用重寫量測 |
| `RenderDocument`（文件 → 可繪製元素） | `src-tauri/src/export/render.rs` | 原封不動沿用 |
| 每頁的 HTML 標記（真文字 + CSS 絕對定位、inline SVG、底線 / 陰影 / 斜體 / 字距 / 首尾置中，疊圖 ≤ 0.5 pt） | `export/epub/xhtml.rs` 的 `page()` / `element_markup()` | 翻頁書每一頁的內容**就是 EPUB 的頁面標記** |
| `@font-face` + reset、圖片收集與改名、用到的字型 | `epub/css.rs`、`epub/mod.rs` 的 `collect_images` / `used_fonts` | 同樣的資料夾結構（`styles/` `fonts/` `images/`） |
| 兩步 command（Rust 開對話框、路徑留在 Rust）、`.tmp` → rename、「開啟」按鈕 | `commands/export.rs`、`use-project-commands.ts` | 依 EPUB 階段 4 原本規劃的 `ExportFormat` 一般化，翻頁書是第一個用到的新格式 |
| 「資料夾已存在而且不是空的」檢查、資料夾名稱清理 | `project/io.rs` 的 `create_project_dir` 邏輯、`sanitize_folder_name` | 決定輸出資料夾 |
| 選單「匯出為」子選單 | `lib/menu/menu-structure.ts` | 加一個項目 |
| 疊圖比對流程（`epub_preview` + 無頭 Edge） | 測試與 memory 記錄的 CDP 腳本 | 驗證翻頁書每頁和畫布一致 |

所以這個功能的**新程式只有三塊**：Rust 的「翻頁書打包器」、翻頁的 viewer（HTML / CSS / 少量 JS）、command 與選單接線。

---

## 3. 對任務檔「參考文件 / 名詞定義」的檢核

1. **「Flip Book 基本上都是 HTML5」**：正確。但「Flip Book Viewer」有兩種意思，**需要確認**（第 6 節 Q1）：
   - (a) 匯出的資料夾本身就帶 viewer，用瀏覽器開 `index.html` 閱讀（參考文件描述的就是這種）；
   - (b) 某個特定的第三方閱讀軟體 / 平台（例如 FlipHTML5、Issuu 之類）。這類多半是**匯入 PDF** 再由平台轉成翻頁書，不讀我們的 HTML 資料夾；若是這個意思，現有的「匯出 PDF」就能用，不需要這個功能。
2. **「EPUB 的骨幹就是 HTML5」**：大致正確，補充兩點：
   - EPUB 3 的內容檔是 **XHTML**（HTML5 的 XML 寫法），翻頁書是一般 HTML5；我們的頁面標記兩邊都能用（`<img/>`、inline SVG 在 HTML5 解析器也合法），這正是能重用的原因。
   - 但 **EPUB ≠ 翻頁書**：EPUB 是封裝成單一檔案、交給閱讀器（Apple Books、Kobo…）呈現，翻頁效果由閱讀器決定；翻頁書是自己帶 viewer 的網頁。兩者共用「每頁的排版」，打包與呈現不同。
3. **「JavaScript / CSS 資源資料夾（例如 `turn.js`）」**：turn.js 目前的版本（4）**是商業授權**、而且依賴 jQuery；舊的 3 版雖然是 BSD 但已多年未維護。建議改用 **StPageFlip（npm `page-flip`，MIT、沒有相依套件、支援以 HTML 元素當頁面）**，見第 5 節。
4. **「設定書籍架構的設定檔（JSON 或 XML）」**：用 `file://` 開啟時，瀏覽器會**擋掉 `fetch()` 讀本機 JSON**。所以書的結構（頁數、尺寸、標題）直接寫在 `index.html` 裡，不另外放 JSON 檔，才能雙擊就開。
5. **「內含每一頁的圖片或 SVG、縮圖」**：商業產品多半把每頁轉成圖片。建議我們沿用 EPUB 的**真文字**（可選取、搜尋、檔案小、放大不糊），見第 6 節 Q3。

---

## 4. 輸出結構（草案）

```text
<使用者輸入的名稱>/
  index.html              入口：書的結構、每頁的標記、工具列；不放使用者可控的 <script> 內容
  viewer/
    page-flip.browser.js  StPageFlip（原樣，固定版本）
    page-flip.LICENSE     MIT 授權全文（散布時要附）
    viewer.js             我們的初始化：縮放、工具列、鍵盤、跳頁、全螢幕
    viewer.css            工具列與版面
  styles/page.css         和 EPUB 相同：@font-face + 頁面 reset（只作用在 .page 裡面）
  fonts/<file>            用到的內嵌字型（同 EPUB 的 used_fonts）
  images/image-<n>.<ext>  專案圖片改名（同 EPUB 的 collect_images）
```

- **每頁**是一個固定 pt 尺寸的 `.page` div（EPUB 的標記），外層用 CSS `transform: scale()` 縮放到翻頁區的大小；文字仍是向量，放大不糊。
- 使用者文字只透過 `escape()` 進入 HTML（EPUB 已有測試守著）；頁名 / 書名不寫進 `<script>`。
- 寫入：先寫到 `<名稱>.tmp/` 再 rename 成 `<名稱>/`；目標已存在而且不是空的 → 拒絕（同另存新檔）。

---

## 5. 設計建議

| 項目 | 建議 | 理由 |
|---|---|---|
| 翻頁引擎 | **StPageFlip `page-flip`（MIT），vendor 進 repo**（`src-tauri/src/export/flipbook/vendor/`，`include_bytes!` 打包進 exe），不從 CDN 載入 | 不重造輪子；離線可用；版本固定、匯出結果每台機器一樣。它的 `showCover: true` 剛好是「封面單獨在右」；窄螢幕自動改單頁（portrait） |
| 頁面內容 | **重用 EPUB 的頁面標記（真文字）**，不轉圖片 | 已經疊圖驗證過和畫布一致；不需要點陣化（`typst-render` 現在只是 dev-dependency）；檔案小、可搜尋 |
| 共用程式 | 步驟 1 先把 `epub/` 裡和格式無關的部分（頁面標記、圖片收集、字型清單、CSS）抽到 `export/html/`，EPUB 與翻頁書共用；**EPUB 輸出位元組不變**（測試比對） | 一份排版、兩種打包；之後修頁面標記兩邊一起好 |
| 頁面尺寸不一致 | 以**第 1 頁的尺寸**為書的尺寸，其他尺寸不同的頁面等比例縮小置中（不裁切） | StPageFlip 只支援單一頁面尺寸；頁面設定本來就會統一尺寸，不一致是少數情況 |
| command | 照 EPUB 階段 4 原本的規劃一般化：`ExportFormat`、`export_choose_path(format, …)`、`ExportState.pending` 記格式；先只有 `Pdf` / `Flipbook`，EPUB 之後直接加一個成員 | 不再複製一套 PDF 的 command；EPUB 接線時不用再重構 |
| 匯出後 | toast「開啟」用系統預設瀏覽器開 `index.html`（沿用 `export_open_last`） | 和 PDF 一致 |
| 字型大小 | 先全量內嵌（同 EPUB 的決定），一份用到中文黑體的書約 +11 MB；**子集化之後和 EPUB 一起做** | 上傳網站時體積會被注意到，列為已知限制 |

---

## 6. 需要和使用者確認的問題

2026-10-14 使用者回覆：

| 問題 | 決定 |
|---|---|
| Q1 Flip Book Viewer 指的是？ | **匯出的資料夾自帶 viewer**，用瀏覽器開 `index.html` 閱讀 |
| Q2 輸出形式？ | **資料夾**（不做 ZIP） |
| Q3 頁面內容？ | **真文字，重用 EPUB 的頁面標記**（不轉圖片） |
| Q4 第一版 viewer 的功能？ | 基本款（點 / 拖曳頁角 / ← → 翻頁、上一頁 / 下一頁、頁碼與跳頁、全螢幕、窄螢幕自動單頁）**＋縮圖列＋放大檢視＋目錄 / 搜尋**。拆成步驟 3、3a、3b、3c，每個功能各自驗證 |

細節（實作時再確認）：
- 縮圖：不另外產生圖片，用同一份頁面標記縮小顯示（捲進畫面才建立，200 頁不會一次建 200 份 DOM）。
- 目錄：依頁面名稱；文件裡頁名多半是「Page-3」這類預設名稱，是否只列「改過名的頁面」步驟 3c 再討論。
- 搜尋：搜尋頁面上的文字（真文字才做得到），結果列出頁碼與前後文，點了跳頁並標示。

---

## 7. 步驟（一步一步做，每步完成後停下等「繼續」）

### 步驟 0：實測（不改產品程式）

在 scratchpad 用手寫的 `index.html` + 一份 `epub_preview` 產生的頁面標記 + `page-flip` 驗證：
1. `file://` 開啟時字型（`@font-face` 相對路徑）、圖片、inline SVG 都能載入（Edge / Chrome；Firefox 對 `file://` 字型限制較嚴，記錄結果）。
2. `transform: scale()` 後的頁面和不縮放時位置一致（疊圖 ≤ 0.5 pt），翻頁動畫中文字不閃、不跳。
3. `showCover` 的配對和編輯器一致（1 ／ 2–3 ／ …、偶數頁數時最後一頁單獨在左）。
4. 確認 `page-flip` 的版本、授權、`dist` 檔名與 API（HTML 模式 `loadFromHTML`）。

產出：在本計畫記錄實測結果與調整（例如字型無法以 `file://` 載入時的替代方案）。

**結果（2026-10-14，完成）**：用 fixture 的 `epub_preview` 頁面標記複製成 6 頁 / 7 頁的手寫翻頁書，無頭 Edge 與 Chrome 各 13 項全過。

| 項目 | 結果 |
|---|---|
| 套件 | `page-flip` **2.0.7**（最新版，2022 年後沒有更新；MIT，作者 Nodlik）。`dist/js/page-flip.browser.js` 44 KB、沒有相依套件，全域 `St.PageFlip`，**自己注入 CSS**（不用另附 css 檔）。API：`loadFromHTML`、`flipNext` / `flipPrev` / `flip(n)` / `turnToPage(n)`、`getCurrentPageIndex`、`getPageCount`、`getOrientation`、`getBoundsRect`；事件 `flip` / `changeOrientation` / `changeState` / `init` / `update`。**沒有鍵盤操作**（由 `viewer.js` 做） |
| `file://` 載入 | 字型（Geist / Noto Sans TC 各 400、700）、圖片、inline SVG 在 Edge、Chrome 都載入成功，沒有 console 錯誤。Firefox 這台沒有裝，**未實測**（Firefox 允許讀同資料夾以下的 `file://` 字型，`fonts/` 在 `index.html` 底下，預期可以；列入桌面版人工驗證） |
| 縮放後的位置 | 外層 `transform: scale(var(--s))`，`--s` = `getBoundsRect().pageWidth ÷ 頁寬 pt`，在初始化、`resize`、`changeOrientation`、`update` 時重算。文字框 / SVG / 圖片換回 pt 後和原值相差 ≤ 0.01 pt；1400×900、1400×600、600×900 三種視窗整頁都在畫面內 |
| 跨頁配對 | `showCover: true` 和編輯器完全相同：7 頁 = 1 ／ 2–3 ／ 4–5 ／ 6–7；6 頁 = 1 ／ 2–3 ／ 4–5 ／ 6（單獨在左）。封面與最後一頁是「硬頁」（整頁轉過去），中間頁是軟頁（捲角） |
| 單頁模式 | 只有在翻頁區寬度 < 2 × `minWidth` 時才切單頁；`minWidth: 300` → 寬度不到 600 px 時單頁 |

**實測發現、要調整的地方**：
1. **圖片路徑**：EPUB 標記寫 `../images/…`（相對於 `pages/`），翻頁書的頁面在 `index.html` 裡，要寫 `images/…`。步驟 1 抽共用時，圖片的 href 前綴由呼叫端給（EPUB `../`、翻頁書空字串）。
2. **頁面外層的 style 會被覆蓋**：page-flip 每次繪製都改寫頁面元素的 `style.cssText`，所以結構是 `.fb-page`（交給 page-flip）> `.fb-scale`（我們的縮放）> `.page`（EPUB 標記）。
3. **`#book` 要有明確的寬高**（`width/height: 100%`）：沒有時 page-flip 量不到高度，頁面下半會超出視窗。
4. **翻頁區不能選取文字**：page-flip 在 `mousedown` 時 `preventDefault`。步驟 3b 的放大檢視改成**另一層覆蓋**（顯示同一頁的複本，可以捲動、可以選取文字），不在翻頁區裡縮放，也不用動態關掉 page-flip 的滑鼠事件。
5. 軟頁翻動時 page-flip 會**暫時複製整頁 DOM**（動畫結束就移除），頁面標記很大時翻頁會多一點負擔；200 頁的效能在步驟 6 量測。

實測用的檔案在 scratchpad（不進 repo）。

### 步驟 1：抽出共用的 HTML 頁面（Rust 重構，輸出不變）

- `export/epub/` 的 `element_markup` / 頁面 body、`collect_images`（`EpubImages` → `PageImages`）、`used_fonts`、`css::stylesheet` 移到 `export/html/`；EPUB 改用它們。
- CSS reset 裡 `html, body { overflow: hidden }` 這類「整份文件」的規則留在 EPUB 自己的部分，共用的規則只作用在 `.page` 裡（翻頁書的 body 是 viewer）。
- 圖片的 href 前綴由呼叫端給（EPUB `../images/`、翻頁書 `images/`，步驟 0 發現）。

**結果（2026-10-14，完成）**：
- `epub/xhtml.rs` 以 `git mv` 移成 **`export/html/markup.rs`**（保留歷史）：`escape` / `num` / 顏色 / `element_markup` / `has_svg` 與原本的單元測試都在這裡；新增 `page_div(page, images, image_prefix)` 只產生 `.page` 方塊。新的 `epub/xhtml.rs` 只剩 XHTML 文件外框，呼叫 `page_div(…, "../")`。
- **`export/html/mod.rs`**：`LANGUAGE`、`PageImages`（原 `EpubImages`，多了 `iter()` 給 manifest 用）、`collect_images`、`used_fonts`（從 `epub/mod.rs` 搬來）。
- **`export/html/css.rs`**：`font_faces(fonts)` 與 `PAGE_RULES`（只作用在 `.page` 裡）；`epub/css.rs` 的 `stylesheet` = `font_faces` + EPUB 自己的 `html, body` 規則 + `PAGE_RULES`。
- 驗收：用暫時的測試以固定 `EpubMeta` 匯出 fixture（含文字、各種圖形、圖片），重構前後 EPUB 的 SHA-256 **完全相同**（`7A3FD755…`），暫時的測試已刪除。cargo 162 個通過；clippy 沒有新警告（4 個都是既有的）。
- `CLAUDE.md` 兩處 `epub/xhtml.rs` 的路徑改成 `export/html/markup.rs`（其餘文件在步驟 7）。
- 驗收：既有 cargo 測試全過；`epub_preview` 前後的 EPUB 位元組相同（固定 `EpubMeta`）。

### 步驟 2：翻頁書打包器（Rust，還沒接 UI）

- `export/flipbook/mod.rs`：`build_flipbook(root, request) -> FlipbookOutput { files: Vec<(相對路徑, bytes)>, pages, skipped_images }`，產生第 4 節的結構；vendor `page-flip.browser.js` 與 LICENSE。
- `index.html` 的骨架與 `viewer.js` / `viewer.css` 先放最小可翻頁的版本（工具列在步驟 3）。
- 測試：檔案清單完整（每個 `src` / `href` 都有對應檔案）、沒有外部 URL、使用者文字不變成標記、頁數、略過圖片計數、頁面尺寸不一致時的縮放。另加 `#[ignore]` 的 `flipbook_preview`（同 `epub_preview`，寫到 `EXPORT_PREVIEW_DIR`）。

**結果（2026-10-14，完成）**：
- `src-tauri/src/export/flipbook/`：`mod.rs`（`build_flipbook(root, request) -> FlipbookOutput { files, pages, skipped_images }`）、`tests.rs`、`viewer/viewer.js` / `viewer.css`（最小版：啟動 page-flip、依翻頁區縮放、`showCover`、寬度 < 600 px 單頁）、`vendor/`（`page-flip.browser.js` 原檔、`page-flip.LICENSE`、`README.md` 記版本 / 來源 / SHA-256 / 升級方式）。全部以 `include_str!` 打包進 exe。
- `index.html`：書的尺寸寫在 `#book` 的 `data-width` / `data-height`（pt），每頁 `<div class="fb-page" data-name="頁名">`（`data-name` 給步驟 3c 的目錄）`<div class="fb-scale">` + `page_div(…, "")`。沒有 inline script；頁名、書名都經 `escape`。
- **加了 CSP**（`<meta http-equiv>`：`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'`）：只能載入書裡的檔案，網站空間上也一樣。`file://` 下實測沒有擋到任何東西。
- 尺寸不同的頁面：`.fb-scale` 多一段 `translate(…) scale(k)`，等比例縮進書的頁面框並置中（`fit_transform`）。
- `UNTITLED_DOCUMENT` / `non_empty_or` 從 `epub/mod.rs` 移到 `html/mod.rs` 共用。
- 測試 9 個（另 1 個 ignored 的 `flipbook_preview`，可用 `FLIPBOOK_PAGES` 指定頁數）：檔案結構、所有 `src` / `href` / `url()` 都指到書裡的檔案、沒有外部 URL 且有 CSP、使用者文字不變成標記、每頁一個頁框且順序正確、圖片只放一份、第 1 頁決定書的尺寸與其他尺寸的縮放、缺圖略過、沒有頁面時錯誤、vendor 檔的 SHA-256。cargo 171；clippy 沒有新警告。
- 無頭 Edge（`flipbook_preview` 7 頁、`file://`）10 項：字型與圖片載入、page-flip 啟動、CSP 沒有擋東西、縮放後位置 ≤ 0.01 pt、點擊翻頁的配對 1 ／ 2–3 ／ 4–5 ／ 6–7、整頁在畫面內。附註：按在**頁角**是拖曳翻頁（按下立刻放開不算點擊），點頁面中間才是點擊翻頁。
- 沒做（照計畫）：工具列與鍵盤（步驟 3）、尺寸不同頁面的實際畫面（單元測試驗了數字，畫面在步驟 6 用真實匯出內容看）。

### 步驟 3：viewer（工具列與操作）

- 依 Q4 確定的功能做 `viewer.js` / `viewer.css`：上一頁 / 下一頁、頁碼「2–3 / 24」與跳頁輸入、全螢幕、← → / Home / End、視窗縮放時重算頁面大小、窄螢幕單頁。
- 以 `flipbook_preview` 產生的資料夾，用無頭 Edge（`file://`）驗證翻頁、鍵盤、跳頁、縮放、疊圖。

**結果（2026-10-14，完成）**：只改 `viewer/viewer.js` 與 `viewer.css`（Rust 不用改）。
- 工具列由 `viewer.js` 用 DOM API 建立（不用 `innerHTML`），浮在畫面下方中央的圓角深色列：第一頁 ／ 上一頁 ／ 頁碼 ／ 下一頁 ／ 最後一頁 ｜ 全螢幕（瀏覽器不支援全螢幕時不顯示）。icon 是手寫的 inline SVG 線條（不引用外部資源），按鈕有 `aria-label` 與 tooltip（含快捷鍵）。`#stage` 下方留 72 px 給工具列。
- **頁碼**：平常顯示目前看到的頁「2–3 / 7」（單頁模式一個數字），按下變成輸入框：Enter 跳頁（只取數字、夾在 1–總頁數）、Esc / 離開取消並還原顯示。目前看到的頁由 page-flip 的頁 index 依「封面單獨、之後 2–3…」推算（`visibleRange`）。
- **跳頁**：距離 2 頁以內用翻頁動畫（`flip`），更遠直接跳（`turnToPage`，一頁一頁翻太久）；已經看得到的頁不動。
- **鍵盤**：← / PageUp 上一頁、→ / PageDown 下一頁、Home / End；焦點在頁碼輸入框時不攔（← → 移動游標），帶 Ctrl / Alt / Meta 的不攔。
- 到頭 / 到尾時對應的按鈕停用。
- 無頭 Edge：7 頁 20 項（鍵盤、四個按鈕、輸入跳頁含遠距 / 超出 / 非數字、輸入框裡的 ← 不翻頁、Esc、工具列不蓋到書、420 px 寬單頁與翻頁）＋ 1 頁（按鈕全停用）＋ 2 頁（第 2 頁單獨在左）全過，沒有 console 錯誤。cargo flipbook 9 個通過。
- **全螢幕只確認按鈕存在**：無頭瀏覽器無法實際進入全螢幕，列入桌面版人工驗證。

### 步驟 3a：縮圖列

- 底部可收合的縮圖列（跨頁配對顯示），點縮圖跳頁、目前頁標示；縮圖是頁面標記縮小（`IntersectionObserver` 捲進畫面才建立）。

**結果（2026-10-14，完成）**：只改 `viewer.js` / `viewer.css`。
- 工具列多一個「頁面縮圖」切換鈕（全螢幕左邊，`aria-pressed`、`aria-controls="thumbs"`），**預設收起**（書比較大）；打開時縮圖列在工具列上方，翻頁區讓出高度，送一個 `resize` 事件讓 page-flip 與縮放重算。不記憶開關（每次開啟都收起）。
- 縮圖依跨頁分組（1 ／ 2–3 ／ 4–5…，和翻頁相同），單頁模式也是跨頁；每組下面是頁碼。點縮圖 = 跳到那組的第一頁（沿用工具列的 `goTo`）。
- 縮圖內容 = 原本頁面的 `.fb-scale` 複製一份（`aria-hidden`），在格子上把 `--s` 設成縮圖比例（96 px 高）；尺寸不同的頁面沿用它自己的 `translate / scale`，所以一樣置中。**從初始化前留下的頁面複製**（page-flip 翻頁時會暫時複製頁面）。
- 捲進縮圖列（前後 400 px）才建立縮圖（`IntersectionObserver`）；目前的跨頁有外框與 `aria-current`，翻頁時跟著換並平滑捲到看得到的地方。滾輪上下轉成左右捲動。縮圖少時置中。
- 無頭 Edge：7 頁 15 項（預設收起、分組、標示、書縮小後位置仍 ≤ 0.01 pt、縮圖尺寸、點縮圖翻頁、翻頁時標示跟著換、收起後恢復大小、420 px 寬）、60 頁 4 項（一開始只建立 12 / 31 組、捲動後增加、按 End 時標示並捲到最後一組）；步驟 3 的 20 項重跑全過；沒有 console 錯誤。截圖後把縮圖列加高 8 px（窄螢幕的橫向捲軸原本蓋到頁碼）。

### 步驟 3b：放大檢視

- 放大鈕 / 雙擊頁面進入放大：**另一層覆蓋**顯示目前頁（或跨頁）的複本，可捲動、可選取文字、可再放大縮小；Esc 或關閉鈕回到翻頁（步驟 0 發現翻頁區會擋選取文字）。真文字放大不糊。

**結果（2026-10-14，完成）**：只改 `viewer.js` / `viewer.css`。和計畫不同處：
- **不用雙擊進入**：page-flip 把雙擊當成兩次點擊，書會連翻兩頁。改成工具列的「放大檢視」按鈕（縮圖鈕左邊）與 **Z** 鍵。
- **不做拖曳移動**：拖曳和選取文字衝突，以選取文字為主；移動用捲軸 / 滾輪 / 觸控捲動。

內容：
- 全畫面的 `role="dialog"`（`aria-modal`）深色層，上方浮動列：上一頁 ／ 「2–3 / 7」／ 下一頁 ｜ 縮小 ／ 百分比 ／ 放大 ／ 符合寬度 ｜ 關閉。
- 放大的內容 = 目前看到的頁（單頁或跨頁）的 `.fb-scale` 複本（從初始化前留下的頁面複製），`--s` 就是倍率（px / pt）；關閉時清掉。尺寸不同的頁面一樣置中。
- 倍率：一開始**符合寬度**；最小 = 整個跨頁放得進畫面、最大 400%，每次 × 1.25。放大 / 縮小鈕、`+` `-` `0`（符合寬度）、**Ctrl + 滾輪以游標為中心**（不讓瀏覽器縮放整頁）；以錨點換算捲動位置，錨點下的內容不動。
- 方向鍵捲動放大區（不翻書）；PageUp / PageDown 與列上的上一頁 / 下一頁換跨頁，書也直接翻過去（不播動畫）、倍率不變。
- Esc 或關閉鈕回到翻頁，焦點回到「放大檢視」按鈕。Tab 只在放大檢視裡循環；按著的按鈕停用（到 400%、最後一頁）時焦點放回捲動區。`color-scheme: dark` 讓捲軸是深色。
- 無頭 Edge 25 項（Z 開啟、符合寬度、放大後位置 ≤ 0.01 pt、雙擊選取文字、按鈕與 `+` `-` `0`、最小 / 最大與停用、Ctrl+滾輪錨點、方向鍵捲動不翻書、上一頁 / 下一頁 / PageUp / PageDown、Tab 不跑出去、Esc 與焦點、關閉後清掉複本、關閉後方向鍵照常、420 px 寬）全過；步驟 3、3a 重跑全過；沒有 console 錯誤。
- 已知：一開始「符合寬度」對雙頁跨頁只比翻頁時大一點（1400×900 視窗約 112%），要看清楚再按放大。

### 步驟 3c：目錄與搜尋

- 側邊面板兩個分頁：目錄（頁名，點了跳頁）、搜尋（頁面文字，`Intl.Segmenter` 不需要；用每頁 `.t` 的文字做不分大小寫比對，列出頁碼與前後文，點了跳頁並標示命中的文字框）。
- 搜尋資料直接讀 DOM 裡的頁面文字，不另外產生索引檔（`file://` 讀不了 JSON）。

**結果（2026-10-14，完成）**：使用者決定**目錄只列改過名的頁面**。
- Rust（`flipbook/mod.rs`）：`is_default_page_name` = 空白或 `Page-<數字>`（編輯器 `nextPageNames` 的格式，`element-factory.ts`；改那邊的命名要一起改）；不是預設名稱的頁面加 `data-toc`。測試 `only_named_pages_go_into_the_table_of_contents`（`Page-1 副本`、`page-1`、全形數字都算改過名）。`flipbook_preview` 改成第 1、4 頁有名稱、每頁標題多一行「第N頁 Unique」。
- 工具列多一個「目錄與搜尋」切換鈕（最左邊的那組，`aria-pressed`）。左側面板 320 px，翻頁區與縮圖列讓出寬度；寬度 ≤ 720 px 時面板全寬蓋住書。兩個分頁（`role="tablist"`，← → 切換）+ 關閉鈕；Esc 關閉、焦點回到按鈕。面板裡的按鍵不翻書。
- **目錄**：頁名 + 頁碼，點了翻過去。沒有改過名的頁面時顯示說明，並預設開「搜尋」分頁。
- **搜尋**：**Ctrl+F** 直接打開搜尋（瀏覽器的尋找找不到沒顯示的頁；放大檢視開著時不攔，瀏覽器尋找可以找放大的那頁）。輸入停 150 ms 後搜尋；比對文字做 NFKC（全形半形）＋不分大小寫＋連續空白當一個，**行與行直接接起來**（中文換行不是空白，跨行的詞也找得到；英文在換行處少一個空白是已知限制）。每個文字框（文字、圖形內文字、頁碼）是一筆，第一次搜尋時才建立。結果依頁序，顯示前後 18 字與 `<mark>`（DOM API，使用者文字不會變成標記），最多列 300 處。點結果或 **Enter / Shift+Enter** 跳到下一個 / 上一個，並把書裡那個文字框標成黃底橘框（`.fb-hit`）；關閉面板時清掉。
- 無頭 Edge 22 項（目錄內容與翻頁、面板裡 → 不翻頁、Ctrl+F、搜尋與 Enter / Shift+Enter、大小寫 / 全形 / 空白 / 跨行、找不到與 `<b>` 不變成標記、標示與清除、Esc、420 px 全寬）全過；步驟 2、3、3a、3b 重跑全過；cargo 172。
- 已知：標示框畫在文字框上，文字框上面若疊了別的物件（例如半透明圖形）會蓋住一部分標示。

### 步驟 4：command（Rust）

- `commands/export.rs`：`ExportFormat { Pdf, Flipbook }`、`export_choose_path(format, suggestedName)`（翻頁書：存檔對話框輸入名稱 = 資料夾名稱，同另存新檔；預設位置同 PDF）、`export_flipbook(request)`（`spawn_blocking`、`.tmp` 資料夾 → rename、不是空的資料夾拒絕）、`export_open_last` 開 `index.html`。
- PDF 的行為不變；前端的 `export_pdf_choose_path` 呼叫改成新 command。
- `lib.rs` 註冊；cargo 測試（資料夾寫入、已存在拒絕、`.tmp` 失敗時清除）。

**結果（2026-10-14，完成）**：
- `commands/export.rs`：`ExportFormat { Pdf, Flipbook }`（serde lowercase；EPUB 接線時加一個成員）；`export_pdf_choose_path` 改名 **`export_choose_path(format, suggestedName)`**；`ExportState.pending` 存 `(格式, 路徑)`，`take_pending(format)` 格式不符時視為沒選位置（而且用掉，不能拿 PDF 的位置去寫翻頁書）；新增 **`export_flipbook(request)`**（`spawn_blocking` 裡 `build_flipbook` + `write_folder`）；`last_export` 是 PDF 或翻頁書的 `index.html`，`export_open_last` 的訊息改成通用的「檔案」。`lib.rs` 註冊。
- 翻頁書的對話框：標題「匯出翻頁電子書（輸入資料夾名稱）」、預設名稱「<文件名稱> 翻頁書」、不加 filter（資料夾沒有副檔名）；使用者打了 `.html` / `.htm` 時去掉（`flipbook_folder`）。選完立刻 `check_target`：資料夾已存在且不是空的、或同名的是檔案 → 直接顯示錯誤，不用等排版完。
- `export/flipbook/mod.rs`：`check_target` 與 **`write_folder`**：先寫到旁邊的隱藏暫存資料夾 `.<名稱>.<uuid>.tmp`（每次不同的名稱，不會碰到使用者的資料夾）→ 再檢查一次 → 目標是空資料夾時先移除（Windows 不能改名蓋過資料夾）→ rename；失敗時刪掉暫存資料夾。**絕不覆蓋或刪除有內容的資料夾。**
- 前端只改到 PDF 照常能用：`project-types.ts` 的 `ExportFormat`、`project-api.ts` 的 `chooseExportPath(format, suggestedName)` 與 `exportFlipbook`、`use-project-commands.ts` 的 PDF 呼叫帶 `"pdf"`。選單在步驟 5。
- `CLAUDE.md` 的兩步 command 與 command 清單改成新名稱。
- 測試：cargo 179（新 7 個：寫出資料夾且沒有留下暫存、空資料夾可用、有內容的資料夾與同名檔案拒絕且不動原內容、寫到一半失敗不留東西、`ExportFormat` 的 JSON 名稱、pending 只給同一格式、去掉 `.html`）；clippy 沒有新警告；vitest 661；`npm run build` 通過。
- **桌面版人工驗證**（步驟 6 一起做）：匯出 PDF 照常（改了 command 名稱）、翻頁書的存檔對話框行為。

### 步驟 5：前端接線

- `COMMANDS` 加 `file.exportFlipbook`（「翻頁電子書（HTML5）...」），放進 `MENUS` 的「匯出為」（PDF 與 EPUB 之間）；`project-api.ts` / `project-types.ts` 加 `ExportFormat`；`use-project-commands.ts` 把 `exportImpl` 抽成共用的 `runExport(format)`（toast 沿用 PDF 的形式）。
- MCP：`run_command` 自動多一個指令 → 重產 `mcp-tools.json`、重編橋接程式。
- vitest（`menu-structure.test.ts` 會檢查指令都在選單裡）、`npm run build`；瀏覽器模式顯示「僅在桌面版可用」。

**結果（2026-10-14，完成）**：
- `lib/menu/commands.ts` 加 `file.exportFlipbook`（「翻頁電子書（HTML5）...」、title「匯出為翻頁電子書」），`menu-structure.ts` 放在「匯出為」的 PDF 與 EPUB 之間；`home-page.tsx` 的 handler 呼叫 `project.exportFlipbook()`。沒有快捷鍵（匯出一律沒有，2026-09-23 的決定）。上方工具列的「匯出 PDF」按鈕不變。
- `use-project-commands.ts`：`exportImpl` 改成共用的 `runExport(format)`，格式的顯示名稱與 command 在 `EXPORT_FORMATS`（`satisfies Record<ExportFormat, …>`，EPUB 接線時加一筆）；toast 照舊（「正在匯出…」→「已匯出「名稱」（N 頁）」＋「開啟」、略過圖片的警告），失敗訊息帶格式名稱。`ProjectCommands` 多 `exportFlipbook`。「開啟」失敗時改成顯示錯誤 toast（原本靜默）。
- MCP：`run_command` 多一個指令，`npx vitest run mcp-tools -u` 重產 `src-tauri/mcp-tools.json`（+1 行）；橋接程式被佔用，先改名成 `magazine-mcp.old-*.exe` 再重編（**要在 Claude Code `/mcp` 重新連線**才看得到）。
- 驗證：vitest 661、`npm run build` 通過；瀏覽器模式（Vite :1430）無頭 Edge 5 項：「檔案 → 匯出為」是 PNG / JPEG / PDF / 翻頁電子書（HTML5） / EPUB，點翻頁電子書顯示「檔案功能僅在桌面版可用」，沒有錯誤。

### 步驟 6：驗證

- 用瀏覽器擷取的真實 `ExportRequest`（含主頁、頁碼、跨書背物件、首尾置中、SVG 圖片）跑 `flipbook_preview`，無頭 Edge 疊圖比對每頁和畫布（≤ 0.5 pt）、翻頁與工具列。
- 桌面版人工驗證項目寫進 `progress.md`「待辦 → 使用者」：選單匯出、資料夾已存在、「開啟」、把資料夾放到網站空間。

**結果（2026-10-14，完成；桌面版人工驗證待做）**：
- **真實匯出內容**：在瀏覽器模式（Vite）用編輯器自己的模組建一份 7 頁文件：主頁（色帶 + `{文件名稱} · 第 {頁碼} 頁` 頁尾）、頁碼規則（2–7 頁）、首尾置中、斜體＋底線、字距 50‰＋行距 1.6、陰影、刪除線、旋轉 15°、明體、四角不同的圓角、跨書背的矩形、最後一頁橫式；`buildExportRequest` + `measureTextLayout`（Konva 量測）產生 `ExportRequest`（24 個文字排版），再用 `EXPORT_REQUEST_JSON` 跑 `flipbook_preview` 與 `epub_preview`。
- **和 EPUB 比對**（EPUB 已和畫布疊圖驗證 ≤ 0.5 pt，翻頁書用同一份標記）：
  - 每頁標記放在翻頁書的 CSS（`page.css` + `viewer.css`）裡、1 px/pt，和 EPUB 頁面各截 2 px/pt：**7 頁都 0 個不同像素**（含橫式頁）。
  - 翻到每一頁時，書裡每個物件的外框換回 pt 和 EPUB 比：前 6 頁 ≤ 0.0001 pt，橫式頁（縮成 0.707、置中）≤ 0.027 pt。
  - 截圖確認：跨書背的矩形在 2–3 頁接起來、主頁頁尾與頁碼每頁正確、橫式頁縮小置中。
- **200 頁效能**（`FLIPBOOK_PAGES=200`，fixture 頁面）：`index.html` 658 KB、DOMContentLoaded 0.47 秒；翻頁時最長一格 28 ms（p95 7 ms）、跳到最後 8 ms、打開縮圖列 28 ms、搜尋 200 頁（含建立索引）15 ms；JS heap 1.6 MB、DOM 1.2 萬個節點；沒有 console 錯誤。附註：縮圖列從頭平滑捲到最後一組時會經過所有縮圖，所以會建立大部分（94 / 101）。
- 書的大小：這份文件用到黑體＋明體，共 26.8 MB（字型全量內嵌，子集化之後和 EPUB 一起做）。
- 測試時發現（不是 bug）：翻頁書的 CSP（`img-src 'self'`）擋下 `data:` 圖片，比對腳本改在空白頁做。
- **留白改成淺灰（2026-10-14 使用者決定）**：尺寸不同的頁面縮小置中後，四周留白原本也是白色、看不出那一頁的邊界。Rust 對這種頁面加 `fb-fitted` class（同尺寸的頁面不加，避免邊緣出現灰線），`viewer.css` 的 `.fb-fitted` 背景 `#e4e4e7`；縮圖與放大檢視複製時帶上同一個 class。測試加在 `book_takes_the_first_page_size_and_fits_other_sizes`；無頭 Edge 4 項（書裡 / 縮圖 / 放大檢視都只有橫式頁是淺灰）。

### 步驟 7：文件

- `CLAUDE.md` 新增「匯出翻頁電子書」一節（輸出結構、共用 `export/html/`、vendor 套件與升級方式、已知限制），更新目前階段、目錄結構、IPC command 清單。
- `docs/01`、`docs/02`、`progress.md`、本計畫的進度紀錄。

**結果（2026-10-14，完成）**：`CLAUDE.md` 新增「匯出翻頁電子書」一節（輸出結構、共用 `export/html/`、`index.html` 的結構、CSP、page-flip 的行為與限制、viewer 四塊功能、寫入規則、驗證工具、效能、已知限制、之後另排），同步目前階段、`docs/03-Plans-匯出檔案/`、Tech Stack（vendor 的 page-flip）、Commands（`flipbook_preview`）、目錄結構（`export/` 的 `html/`、`epub/`、`flipbook/`）、選單 handler；`docs/01`（目前狀態、功能表多一列）、`docs/02`（模組圖、`commands/`、`export/`）。`docs-website` 沒有提到匯出，不用改。

---

## 8. 規劃檢核（風險與對策）

| 風險 | 對策 |
|---|---|
| `file://` 下字型被瀏覽器擋（Firefox 較嚴） | 步驟 0 先實測；不行時評估把用到的字型 base64 內嵌進 CSS（檔案會很大）或在說明裡建議用網站空間 / 本機伺服器開啟 |
| StPageFlip 在 HTML 模式翻頁時對頁面做 3D transform，可能讓文字模糊或位置偏移 | 步驟 0 實測；必要時翻頁動畫中用低解析、停下後恢復（StPageFlip 的事件） |
| 抽共用程式時不小心改到 EPUB 輸出 | 步驟 1 以固定 meta 比對位元組，確認輸出完全相同 |
| 第三方 JS 的授權與安全 | MIT，附 LICENSE；vendor 固定版本、不從網路下載；我們的 `viewer.js` 不 `eval`、不讀網址參數以外的輸入 |
| 頁數很多時 `index.html` 很大、開啟慢 | 第一版全部頁面放在同一檔（200 頁約數 MB 文字標記，可接受）；之後需要時改成延遲建立頁面 DOM |
| 「Flip Book Viewer」其實是指第三方平台 | 第 6 節 Q1 先確認，若是 PDF 匯入型平台則不需要這個功能 |

---

## 9. 進度紀錄

| 日期 | 內容 |
|---|---|
| 2026-10-14 | 計畫草稿；使用者確認 Q1–Q4（資料夾自帶 viewer、資料夾、真文字、基本款＋縮圖＋放大＋目錄 / 搜尋），viewer 拆成步驟 3 / 3a / 3b / 3c |
| 2026-10-14 | 步驟 0 完成：`page-flip` 2.0.7 在 Edge / Chrome 的 `file://` 下字型、圖片、SVG 都載入，縮放後位置 ≤ 0.01 pt，配對和編輯器相同；調整步驟 1（圖片 href 前綴）、步驟 3b（放大改成覆蓋層） |
| 2026-10-14 | 步驟 1 完成：`export/html/`（`markup.rs`、`css.rs`、`mod.rs`）由 EPUB 與翻頁書共用；EPUB 輸出位元組不變；cargo 162 |
| 2026-10-14 | 步驟 2 完成：`export/flipbook/`（打包器、最小 viewer、vendor page-flip 2.0.7）、CSP、9 個測試；cargo 171；無頭 Edge 10 項 |
| 2026-10-14 | 步驟 3 完成：工具列（第一頁 / 上一頁 / 頁碼與跳頁 / 下一頁 / 最後一頁 / 全螢幕）與鍵盤；無頭 Edge 7 頁 20 項 + 1 頁 / 2 頁 |
| 2026-10-14 | 步驟 3a 完成：縮圖列（跨頁分組、捲進才建立、標示目前跨頁）；無頭 Edge 7 頁 15 項、60 頁 4 項 |
| 2026-10-14 | 步驟 3b 完成：放大檢視（覆蓋層、可選取文字、符合寬度～400%、Ctrl+滾輪、換跨頁）；改成按鈕 / Z 鍵進入（雙擊會翻兩頁）、不做拖曳移動；無頭 Edge 25 項 |
| 2026-10-14 | 步驟 3c 完成：目錄（只列改過名的頁面，使用者決定；Rust 標 `data-toc`）與搜尋（Ctrl+F、NFKC / 大小寫 / 跨行、Enter 下一個、標示文字框）；cargo 172；無頭 Edge 22 項 |
| 2026-10-14 | 步驟 4 完成：`export_choose_path(format, …)`、`export_flipbook`、`write_folder`（暫存資料夾 → rename，不覆蓋有內容的資料夾）；前端 PDF 改呼叫新 command；cargo 179、vitest 661 |
| 2026-10-14 | 步驟 5 完成：選單「匯出為 → 翻頁電子書（HTML5）...」、共用的 `runExport(format)`、`mcp-tools.json` 重產與橋接程式重編；瀏覽器模式無頭 Edge 5 項 |
| 2026-10-14 | 步驟 6 完成：真實匯出內容（7 頁，主頁 / 頁碼 / 跨書背 / 首尾置中 / 橫式頁）和 EPUB 逐像素相同、書裡位置 ≤ 0.027 pt；200 頁效能（載入 0.47 秒、翻頁最長一格 28 ms、搜尋 15 ms）；桌面版人工驗證項目寫進 `progress.md` |
| 2026-10-14 | 尺寸不同頁面的留白改成淺灰（使用者決定，`fb-fitted`）；步驟 7 完成：`CLAUDE.md`「匯出翻頁電子書」一節與各處同步、`docs/01` / `docs/02`；cargo 179、vitest 661、build 通過 |
| 2026-10-14 | commit `65cfc1f`（vendor 的 page-flip 在 `.gitattributes` 固定 LF，checkout 成 CRLF 時 SHA-256 測試才不會失敗）並推送 |
| 2026-10-14 | 使用者完成桌面版人工驗證：匯出 PDF 照常、翻頁書的存檔對話框與資料夾、「開啟」、有內容的資料夾拒絕、圖片、全螢幕。Firefox 與網站空間未測（選做） |
