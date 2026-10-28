<!-- 迭代 2（commit 8959b47）的 .claude/rules/export.md 原文；迭代 5 精簡前封存，不再更新 -->

---
paths:
  - "src/lib/export/**"
  - "src-tauri/src/export/**"
  - "src-tauri/src/commands/export.rs"
  - "fonts/**"
---

# 匯出（PDF、翻頁電子書、PowerPoint；EPUB 共用）

## 匯出 PDF（`lib/export` + `src-tauri/src/export`）

- **Typst 以 crate 形式內嵌**（沒有外部執行檔、沒有 sidecar）：`typst` + `typst-layout` + `typst-pdf`，版本鎖 `=0.15.1`。升級時三個要一起改，而且 `World` trait 與 `RootedPath` / `VirtualRoot` 這些 API 每版都會變動。
- **換行由編輯器決定，Typst 只負責定位**（所見即所得的關鍵）：`measureTextLayout()` 用離畫面的 `Konva.Text`（屬性和 `canvas-elements.tsx` 畫的節點完全相同）取得 `lines`、`baseline` 與 `lineWidths`（底線 / 刪除線的長度），`buildExportRequest()` 把每個 text 物件的結果放進 `ExportRequest.textLayouts`（以 element id 為 key）。模板逐行 `place`，不讓 Typst 再斷行（有 `lineStarts` 的行連 `box` 的寬度都不受文字框限制，見「首尾置中」）。
  - 因此 `measureTextLayout` **必須在字型載入後**呼叫（編輯器已顯示即符合），否則量出來的行寬是錯的。

  - **前端與 Rust 各有一份、改一邊要改兩邊的常數**：清單在 `.claude/rules/cross-language.md`。
  - 圖形內文字也由畫布量測：`textLayouts` 的 key 是 `<id>#label`，Rust 的 `shape_label` 把它變成一般的文字元素，緊接在圖形之後。
  - Rust 端缺 layout 時會退回「以 `\n` 分行 + 估算基線」，只是保險，正常路徑不該走到。
- **使用者文字絕不進入 Typst 程式碼**：模板 `template.typ` 是固定的，資料以 `data.json`（`export/pdf.rs` 的 `to_data()` 產生）傳入，用 `json()` 讀取。`#`、`$`、`[`、`\` 這些字元會原樣輸出（有測試 `user_text_is_data_not_typst_code` 守著）。**不要改成用字串拼接組出 .typ**。
- **`ExportWorld` 是沙箱**：只有 `main.typ`（內嵌模板）、`data.json` 與 `assets/images/*` 可讀，其他路徑一律 `AccessDenied`，圖片路徑還要過 `validate_asset_path`（和專案檔同一個檢查，擋 `../` 與絕對路徑）。
- **字型**：畫面、PDF、EPUB **共用 `fonts/` 底下的同一批檔案**，換行位置才會一致。**專案字型**（使用者加入，`assets/fonts/`）由 `export/document_fonts.rs` 的 `load` 每次匯出讀進來（只讀文字用到的；檔案不見就略過，文字用後面的內建後備字型）：PDF 的 `world.rs` `font_book` 把每個檔案以 `project-font-<id>` 與 400 / 700 登記（不管檔案自己的名稱，沒有粗體檔時一般檔也登記成 700）；EPUB / 翻頁書收錄成 `fonts/project-font-<n>.<ext>`（產生的檔名，同一個檔只放一份），`@font-face` 帶 `ascent-override` / `descent-override`（畫布的度量），`markup.rs` 的 `font-family` 只放內建與符合 `project-font-[A-Za-z0-9_-]+` 的名稱（`is_project_family`）。疊圖比對（Calibri：hhea 與 Windows 度量差很多）：PDF、翻頁書和畫布每行墨水的上下緣與左緣 ≤ 0.5 pt。前端用 `src/index.css` 的 `@font-face` 與 `lib/editor/fonts.ts` 的 `FONT_OPTIONS`（字體選單），Rust 用 `export/fonts.rs` 的 `BUNDLED_FONTS`（`include_bytes!`），**改一處就要改其他處**。新增字型的步驟、修改過的字型檔與 `patch_font.py` 見 `fonts/README.md`。
  - Typst 讀到的家族名稱不一定等於 CSS 名稱（霞鶩文楷是「霞鶩文楷 TC」）：`BUNDLED_FONTS.typst_family` 記錄它，`pdf.rs` 用 `typst_family()` 轉換。測試 `typst_sees_the_declared_family_and_weight` 守著。
  - 霞鶩文楷沒有 Bold，粗體用 Medium（CSS 宣告為 700、`bold: true`）。
  - 只放**靜態**字重（Geist / Noto Sans TC 各 Regular + Bold），不要換成可變字型：模型的 `fontStyle` 只有 `normal` / `bold`，而可變字型與靜態實例的度量可能不同，混用會讓畫面與輸出對不上。沒有斜體字型檔：`italic` 是模擬斜切（見「文字裝飾」），加入真的斜體字型會讓畫面與輸出的斜體不一致。
  - 不讀系統字型，所以 `load_fonts()` 不會失敗，匯出結果在每台機器上都一樣。字型在第一次匯出時解析並快取在 `ExportState` 的 `OnceLock`。
  - CSS 的 `font-family` 由 `font_families()` 轉成 Typst 家族名：去掉 `serif` / `sans-serif` 等泛用名稱，再套 `LEGACY_FAMILIES`（`"Geist Variable"` → `"Geist"`、`"Microsoft JhengHei"` → `"Noto Sans TC"`）。**這個對應表不能刪**：內嵌字型之前存檔的專案仍然帶著舊名稱，而且沒有 schema 遷移會改寫它。
  - `font-display` 用 `block`：讓瀏覽器先以 fallback 畫再換字，會讓 Konva 已經量好的行寬失效。
- **兩步 command**：`export_choose_path(format, suggestedName)`（`ExportFormat` 是 `pdf` / `flipbook` / `pptx`；開儲存對話框，路徑與格式存進 `ExportState.pending`，只回傳檔名；檔案格式沒打副檔名才補上：`with_extension`）→ `export_pdf` / `export_flipbook` / `export_pptx`（取出**同一格式**的路徑、排版、寫檔；格式不符視為沒選位置）。延續「前端不傳路徑給 Rust」的原則，同時讓前端只在排版期間顯示 loading toast。`export_open_last` 用 opener 開啟最後一次匯出的檔案（PDF / PowerPoint，或翻頁書的 `index.html`；成功 toast 的「開啟」按鈕）。
- 排版是 CPU 密集工作，`export_pdf` 用 `spawn_blocking` 執行，不要在 async runtime 上直接跑。PDF 一樣先寫 `.pdf.tmp` 再 rename。
- 匯出的是**目前畫面上的內容（含未存檔的修改）**，不要求先存檔；圖片檔在專案資料夾中不存在時略過該張並回報 `skippedImages`（和畫布顯示灰框一致，不讓整份匯出失敗）。
- **SVG 圖片**：Typst 本身會畫 SVG（usvg），但一張讀不了的 SVG（壞 XML、寬高 0、連到絕對路徑或 `assets/images/` 以外的圖片）會讓**整份**排版失敗。所以 `pdf.rs` 的 `drop_undrawable_svgs` 在排版前用 Typst 的 `SvgImage::with_fonts_images`（模板 `image()` 用的同一個函式、同一個 `ExportWorld`；所以要直接依賴 `comemo`，版本跟 typst）逐張檢查，失敗的同樣算進 `skippedImages`。SVG 文字的字型沒內嵌時 Typst 退回「圖片所在位置的字型」，模板沒有預設字型就一個字都不畫：圖片包在 `text(font: data.svgFonts)` 裡（`SVG_FALLBACK_FONTS` = 預設黑體）。EPUB 收錄成 `image/svg+xml`（`image_type` 沿用匯入的 `detect_extension`）。已知限制：SVG 連到另一個 `assets/images/` 檔案時 PDF 會畫、畫布不畫（檔名是 hash，實際碰不到）。
- 座標定義與 Konva 相同（pt、原點左上、y 向下、順時針旋轉）。render model 的每個元素都以外框左上角定位，旋轉也繞這一點。
- 多邊形與星形由 `project/shape.rs` 算出頂點後以 Typst `polygon` 繪製，兩者在模板裡是同一個 `kind: "polygon"`。
- **圖形庫的圖形：前端算路徑，Rust 只畫**（不用兩邊各寫一份公式）。`buildExportRequest` 在展開主頁 / 跨頁之後為每個 preset 圖形放 `ExportRequest.shapePaths[id] = { outline, details, detailStroke }`（同畫布的 `presetPath` / `detailStroke`）；Rust `render.rs` 的 `render_path` 驗證（路徑來自 WebView：每條 ≤ 2000 個指令、M 開頭、座標有限且 |v| ≤ 1e6、外框不可為空、細節線樣式過 `validate_stroke_look`，不合 → `InvalidInput`）後畫成 `RenderKind::Path`；沒有路徑的 preset 略過。`PathSegment` 有 `Close`：`Move` 開始子路徑、`Close` 封閉，沒有 `Close` 的不封閉；PDF 模板的 `"z"` = `curve.close`、細節線是第二個不填色的 `curve`；EPUB / 翻頁書是 inline SVG 的兩個 `<path>`（細節線 `fill="none"`）。疊圖比對：EPUB 和畫布逐像素相同（例外見已知限制）、PDF 外形相同。
- **線條：匯出前換成路徑圖形**（同頁碼，只在匯出的副本；`lib/export/line-export.ts` 的 `exportedLinePieces`）。每條線 = 線本身（`preset: "x-line"`、透明填色、線的 stroke；開放箭頭是它的實線細節線）＋ 實心箭頭（`x-line-heads`，id `<線的 id>#heads`，填線的顏色、沒有邊框），路徑都是畫布的 `linePaths`。這兩個 id 不在 `SHAPE_LIBRARY`，`skippedShapeCount` 不會算到。**Rust render / Typst 模板 / EPUB 標記都不認識線條**（`build_render` 遇到線條回 `InvalidInput`）。疊圖比對（9 條：三種箭頭、四種線型、0.5–8 pt、旋轉、半透明、折線、箭頭蓋住整條線）：PDF、EPUB 容許 0.5 pt 時和畫布差異 0。
- **邊框的虛線位置由路徑起點決定**：Typst 內建 `rect` / `ellipse` 的起點和 Konva 不同。所以有邊框的矩形與橢圓在 PDF 裡改畫成 `kind: "path"`（矩形是 `render.rs` 的 `rounded_rect_path`（四個角各自的半徑）經 `pdf.rs` 的 `rect_path` 轉成模板的路徑，橢圓是 `ellipse_path`；起點與方向和 Konva、SVG 相同），沒有邊框的照舊（矩形的四個圓角用 Typst `radius` 字典）。
- EPUB 中有邊框的矩形 / 橢圓輸出成 inline SVG，因為 CSS border 畫在框內，位置會差半個線寬。四個圓角不同的矩形 SVG `<rect>` 做不到，改畫 `<path>`（和 PDF 同一條 `rounded_rect_path`）；沒有邊框時 CSS `border-radius` 四值。
- 半透明顏色：PDF 直接交給 Typst 的 `rgb("#rrggbbaa")`；**EPUB 輸出前轉換**（`export/html/markup.rs` 的 `css_color` / `svg_fill`，翻頁書共用），CSS 用 `rgba()`、SVG 用 `fill-opacity`，不讓 8 位 hex 進入 EPUB（SVG 1.1 不允許，舊閱讀引擎也不支援）。
- 預設儲存位置：已存檔的專案用專案資料夾，未命名專案用「文件\雜誌編輯軟體」（暫存資料夾不適合放成品）。
- **已知限制**：曲線上的虛線 / 點線在 PDF 可能沿路徑偏約 1 pt（Typst 與瀏覽器算曲線長度的方式不同，起點相同；直線不會）；EPUB 有邊框的 inline SVG 在小數座標的外框邊緣可能少一排反鋸齒像素（≤ 0.5 pt）。所見即所得只保證換行位置，字距由 Typst 的字型引擎計算，置中 / 靠右可能差零點幾 pt；顏色是 RGB（可含透明度），沒有出血、裁切線與 CMYK；內嵌字型沒有的字元（含 emoji）會是缺字方塊，瀏覽器則可能用系統字型補上。
- **調校方式**：`export_preview` 測試（`#[ignore]`）把每頁算成 2 px/pt 的 PNG 和畫布疊圖比對；設 `EXPORT_REQUEST_JSON` 可以改用從編輯器擷取的真實 `ExportRequest`。

## 匯出翻頁電子書（`src-tauri/src/export/flipbook` + `export/html`）

計畫、實測與每一步的決定：`docs/03-Plans-匯出檔案/01-匯出HTML5-翻頁電子書-實作.md`。

- **是什麼**：「檔案 → 匯出為 → 翻頁電子書（HTML5）...」輸出一個**資料夾**（自帶 viewer），用瀏覽器開 `index.html`（`file://` 或任何靜態網站空間）像雜誌一樣翻頁。不做 ZIP（使用者決定）。結構：`index.html`、`viewer/`（`page-flip.browser.js` + `page-flip.LICENSE` + `viewer.js` + `viewer.css`）、`styles/page.css`、`fonts/`、`images/`。
- **頁面 = EPUB 的頁面標記**（真文字，使用者決定，不轉圖片）：`export/html/` 是 EPUB 與翻頁書共用的部分（`markup::page_div(page, images, image_prefix)`：EPUB 傳 `../`、翻頁書傳空字串；`css::font_faces` + `PAGE_RULES` 只作用在 `.page` 裡，`html, body` 的規則各格式自己寫）。改頁面標記兩邊一起變；抽出時以固定 `EpubMeta` 比對過 EPUB 位元組不變。實測：每頁在翻頁書的 CSS 裡和 EPUB **逐像素相同**，書裡縮放後的位置 ≤ 0.03 pt。
- **書的結構寫在 `index.html` 裡**（不另放 JSON：`file://` 擋 `fetch()`）：`#book` 的 `data-width` / `data-height`（pt，**第 1 頁的尺寸**）；每頁 `<div class="fb-page" data-name="頁名" [data-toc]>` > `<div class="fb-scale">` > `.page`。**沒有 inline script**，頁名 / 書名都經 `escape`。
  - `.fb-page` 的 style 每次繪製都被 page-flip 改寫，所以縮放放在裡面的 `.fb-scale`（`transform: scale(var(--s))`，`--s` = 翻頁區頁寬 ÷ 頁寬 pt）。
  - 尺寸和第 1 頁不同的頁面：`.fb-scale` 多 `translate(…) scale(k)` 等比例縮進並置中（`fit_transform`），`.fb-page` 加 `fb-fitted`，留白是淺灰（使用者決定）。
  - `data-toc`：頁名不是空白、也不是 `Page-<數字>`（`is_default_page_name`，**和編輯器 `nextPageNames` 的預設名稱同規則，改一邊要改另一邊**）的頁面才進目錄（使用者決定）。
- **CSP**（`<meta http-equiv>`）：`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'`：只能載入書裡的檔案（`data:` 圖片也不行）。`file://` 下實測不擋任何東西。測試只檢查有 CSP、沒有外部 URL、每個 `src` / `href` / `url()` 都指到書裡的檔案。
- **翻頁引擎是 vendor 的 StPageFlip**（見 Tech Stack）：`showCover: true` = 第 1 頁單獨在右、之後 2–3、4–5…（和編輯器的雙頁模式相同）；翻頁區寬度 < 600 px（`minWidth: 300` × 2）改單頁。**`#book` 必須剛好是書的大小**（修正 01，計畫 `docs/03-Plans-匯出檔案/02-匯出HTML5-翻頁電子書-修正01-實作.md`）：page-flip 畫硬頁（封面 / 最後一頁）時用 `top: 0`、往左翻的那面用 `translate3d(0, …)`，`flipNext` / `flipPrev` 的起點是 y = 1、x = 10，都假設書在翻頁區左上角；翻頁區比書大時直式封面翻到左邊會離開書背、橫式書翻封面會先往上跳。所以 `viewer.js` 的 `layoutBook()` 自己算書的大小（雙頁 = 書寬 ≥ 2 × 300 + 1 px，取整數）並置中，`resize` 處理在建立 PageFlip **之前**註冊（它也聽 resize，要先讓它讀到新大小）；`loadFromHTML` 會在 `#book` 寫上 `min-width` / `min-height`（300 px）與 `width: 100%`（`autoSize`），載入後要清掉再 `layoutBook()` + `flip.update()`。page-flip 在 `mousedown` 時 `preventDefault`，**翻頁區不能選取文字**（所以放大檢視是另一層）；**按頁角是拖曳翻頁、點頁面中間是點擊翻頁**；雙擊會被當成兩次點擊。沒有鍵盤操作（由 `viewer.js` 做）。升級 page-flip 時重跑計畫裡的瀏覽器驗證。
- **viewer（`viewer/viewer.js`，DOM API、不用 `innerHTML`、不讀網址）**：
  - 工具列（下方浮動）：第一頁 / 上一頁 / 頁碼「2–3 / 7」（按下可輸入跳頁）/ 下一頁 / 最後一頁 ｜ 目錄與搜尋 / 放大檢視 / 頁面縮圖 / 全螢幕。鍵盤 ← → PageUp PageDown Home End、Z（放大）、Ctrl+F（搜尋）。**滾輪翻頁**（只在 `#stage`）：取絕對值大的那一軸，往下 / 觸控板往左滑 = 下一頁；累積 60 px 才翻、一次手勢只翻一頁（翻過後忽略到停止捲動 200 ms，含觸控板慣性）、翻頁中忽略；Ctrl+滾輪交給瀏覽器；`deltaMode` 行 = 40 px。跳 2 頁以內播動畫，更遠直接跳。目前看到的頁由 page-flip 的 index 依配對規則推算（`visibleRange`）。
  - 縮圖列：預設收起；依跨頁分組；縮圖是**原本頁面 `.fb-scale` 的複本**（`--s` 換成縮圖比例），捲進縮圖列才建立（`IntersectionObserver`）。複本都從**初始化前留下的頁面**複製（page-flip 翻頁時會暫時複製頁面）。
  - 放大檢視：`role="dialog"` 覆蓋層，目前跨頁的複本可捲動、**可選取文字**；符合寬度～400%、`+` `-` `0`、Ctrl+滾輪以游標為中心；方向鍵捲動不翻書；不做拖曳移動（和選取文字衝突）。
  - 目錄與搜尋：左側面板（≤ 720 px 時全寬）。搜尋 NFKC + 不分大小寫 + 連續空白當一個，**行與行直接接起來**（英文在換行處少一個空白是已知限制），每個文字框一筆、第一次搜尋才建索引；Enter / Shift+Enter 換結果並標示文字框（`.fb-hit`）。
  - 開關狀態都不記憶（沒有 localStorage）。
- **寫入**（`flipbook::write_folder`）：先寫到旁邊的隱藏暫存資料夾 `.<名稱>.<uuid>.tmp` → 再檢查目標 → rename；失敗時刪掉暫存資料夾。目標只能是不存在或**空的**資料夾，**絕不覆蓋或刪除有內容的資料夾**（`check_target`，選完位置時先檢查一次）。對話框輸入的名稱就是資料夾名稱（打了 `.html` / `.htm` 會去掉）。
- **command**：見「匯出 PDF」的兩步 command（`export_choose_path("flipbook", …)` → `export_flipbook`）；「開啟」用預設瀏覽器開 `index.html`。
- **驗證工具**：`EXPORT_PREVIEW_DIR=<dir> [EXPORT_REQUEST_JSON=<file>] [FLIPBOOK_PAGES=<n>] cargo test flipbook_preview -- --ignored` 寫出 `<dir>/flipbook/`（沒給請求時是 fixture 複製成 n 頁，第 1、4 頁有名稱、每頁一行「第N頁 Unique」）。
- **效能**（200 頁）：`index.html` 658 KB、載入 0.47 秒、翻頁最長一格 28 ms、搜尋 15 ms。
- **已知限制**：字型全量內嵌（黑體＋明體約 27 MB，子集化之後和 EPUB 一起做；用到不是精選清單的專案字型時，匯出前先提醒授權，見「專案字型」）；Firefox 的 `file://` 字型未實測；全螢幕只在桌面版人工確認；搜尋標示框可能被疊在上面的物件蓋住一部分；硬頁（封面 / 最後一頁）3D 翻轉時透視會讓它上下超出書，翻封面時可能短暫蓋到工具列（page-flip 的效果）。
- 之後另排：EPUB 接線（`ExportFormat` 加 `Epub`、`EXPORT_FORMATS` 加一筆）、字型子集化、翻頁音效、連結 / 互動元件、記住上次看到的頁。

## 匯出 PowerPoint（`lib/export/pptx-export.ts` + `src-tauri/src/export/pptx`）

計畫、實測與每一步的決定：`docs/03-Plans-匯出檔案/03-匯出PowerPoint 檔案-實作.md`。

- **是什麼**：「檔案 → 匯出為 → PowerPoint（PPTX）...」輸出一個 `.pptx`：**一頁 = 一張投影片 = 一張滿版圖片**（同一份 Typst 排版畫成的圖，所以和 PDF、畫面一致）。代價：文字在 PowerPoint 裡**不能編輯**。圖片的替代文字（`descr`）放該頁的文字（螢幕閱讀器、搜尋用），名稱是頁名。字型畫成圖片、不嵌入，匯出前不問授權。
- **只給簡報尺寸**（使用者決定）：每一頁同一個尺寸（PPTX 整份只有一個投影片大小），而且是「簡報（PPT）」四種之一（直、橫都可）；容許 0.5 pt（同 preset 比對）。前端 `pptxExportProblem`（選單停用並顯示「（需要簡報尺寸）」/「（各頁尺寸不同）」，見「選單列與指令」的動態停用；`runExport` 選位置前再查一次）、Rust `pptx::slide_size`（`SLIDE_SIZES_PT`，排版前就擋，`InvalidInput` 中文訊息）**規則相同、改一邊要改另一邊**。投影片大小 = 第 1 頁 × 12 700 EMU / pt（16:9 = PowerPoint 預設的 12 192 000 × 6 858 000）。
- **點陣化**（`raster.rs`，使用者決定用 typst-render，不用 PDFium：不用附 DLL、可以平行、和疊圖比對同一個 renderer）：`PIXELS_PER_PT = 3`（16:9 = 2880 × 1620）；有非 SVG 的照片（圖片物件或圖片框）的頁 → JPEG 品質 92，其他 → PNG（RGB，文字與細線無損）。背景一定不透明，直接丟掉 alpha（`DynamicImage::to_rgb8`：在已最佳化的 `image` crate 裡）。`rasterize_pages` 以 `std::thread::scope` 分給每個 CPU 核心。開發版也最佳化 `typst-render` / `tiny-skia`（`Cargo.toml`）。
- **封包**（`package.rs`）：固定的 XML 模板（沒有成熟的 Rust PPTX crate；同 EPUB 的 `package.rs`），使用者文字經 `escape`、屬性再經 `escape_attribute`（換行寫成 `&#10;`，否則讀回來變空白）。最小的 part 集合（PowerPoint 少了會跳「修復」）：`[Content_Types].xml`、rels、`docProps`、`presentation.xml`、`presProps` / `viewProps` / `tableStyles`、theme（Office 預設，看不到）、一個母片 + 一個空白版面配置、每頁 `slideN.xml`（一個 `p:pic`）、`ppt/media/imageN.png|jpeg`。圖片原樣存、XML 壓縮（`archive.rs` 的 `Packing`）。**改這裡要用 PowerPoint 實際開檔**（測試只檢查結構）。
- **驗證**：PowerShell COM（`PowerPoint.Application`、`Presentations.Open(path, -1, 0, 0)`）開檔不出錯 = 沒有修復提示；`Slide.Export` 另存 PNG 和檔案內的圖片逐像素比對（五種大小含直式：平均差 ≤ 0.13 / 255）。COM 的 `Quit()` 之後行程不一定退出，腳本要結束**自己開的** POWERPNT。
- **效能**（8 核心、200 頁、每頁一張照片）：release 4.4 秒、開發版約 21 秒（開發版的 JPEG 編碼器是泛型，在我們的 crate 以 opt-level 0 展開）；一頁照片約 0.2–0.6 MB。
- 之後另排：可編輯的投影片（原生文字方塊與圖形，等於另一個排版引擎，所見即所得要重做）、備忘稿、投影片轉場、解析度選項。

## 檔案（原 CLAUDE.md「目錄結構」）

```
    export/                       # 匯出（PDF / 翻頁電子書 / EPUB / PowerPoint 共用）的前端部分
      pptx-export.ts              # pptxExportProblem / isSlideSize：能不能匯出 PowerPoint（每頁同一個簡報尺寸，直橫都可）
      export-request.ts           # ExportRequest / TextLayout 型別、buildExportRequest（對應 Rust；匯出前把頁碼加成每頁最上層的圖形）
      line-export.ts              # exportedLinePieces：匯出前把線條換成 x-line / x-line-heads 路徑圖形（Rust 不認識線條）
      text-layout.ts              # measureTextLayout：用離畫面的 Konva.Text 取得分行、基線與每行寬度；measureLineWidth：單行寬度（頁碼外框）
      __tests__/
  src/export/                     # 匯出：mod.rs（ExportRequest / TextLayout）、document_fonts.rs（這次匯出要用的專案字型）、render.rs（文件 → RenderDocument，所有格式共用）、pdf.rs（→ data.json、compile_document（PDF 與 PowerPoint 共用的 Typst 排版）、render_pdf）、archive.rs（write_zip：EPUB 與 PowerPoint 共用，每個項目壓縮或原樣）、world.rs（typst::World、載入 fonts/ 的字型）、template.typ（Typst 模板）、fonts.rs（內嵌字型清單）
    html/                         # HTML 系列格式共用（EPUB、翻頁書）：markup.rs（一頁的 .page 標記：真文字 + 絕對定位、inline SVG、escape）、css.rs（@font-face + .page 裡的規則）、mod.rs（PageImages 圖片改名、collect_images、used_fonts、LANGUAGE）
    epub/                         # EPUB 3 固定版面（還沒接 UI）：mod.rs（build_epub）、xhtml.rs（XHTML 外框）、css.rs、package.rs（OPF / nav）、zip.rs
    pptx/                         # PowerPoint：mod.rs（SLIDE_SIZES_PT、slide_size 尺寸檢查、page_text 替代文字、build_pptx）、raster.rs（typst-render 每頁 3 px/pt → PNG / JPEG，多執行緒）、package.rs（最小的 PresentationML：一個母片、一個空白版面配置、每頁一張滿版圖片）
    flipbook/                     # HTML5 翻頁電子書：mod.rs（build_flipbook、check_target、write_folder）、viewer/（viewer.js / viewer.css：工具列、縮圖、放大、目錄與搜尋）、vendor/（page-flip，見 README.md）、tests.rs
fonts/                            # 畫面與匯出共用的字型檔（見 fonts/README.md）；**不要只改一邊的引用**
```
