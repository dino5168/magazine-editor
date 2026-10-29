---
paths:
  - "src/lib/export/**"
  - "src-tauri/src/export/**"
  - "src-tauri/src/commands/export.rs"
  - "fonts/**"
---

# 匯出（PDF、翻頁電子書、PowerPoint；EPUB 共用）

精簡前的完整原文（viewer 操作、實測數字、效能、已知限制、之後另排）：`docs/progress-archive/rules-2026-10/export.md`。計畫：`docs/03-Plans-匯出檔案/`（翻頁書 01、修正 02、PowerPoint 03）、`docs/01-Plans/Imp-Plan-ExportEpub.md`、`docs/05-Plans-字型/`。TS ↔ Rust 要一致的常數：`cross-language.md`。

## 共通：排版資料怎麼來

- **換行由編輯器決定，Typst 只定位**：`measureTextLayout()` 用離畫面的 `Konva.Text`（屬性和 `canvas-elements.tsx` 的節點完全相同）量 `lines` / `baseline` / `lineWidths`，放進 `ExportRequest.textLayouts`（key = element id；圖形內文字是 `<id>#label`，Rust `shape_label` 轉成一般文字元素）。模板逐行 `place`，不讓 Typst 再斷行。**必須在字型載入後呼叫**。Rust 缺 layout 時的退回只是保險。
- **全形標點不擠**：Typst（`lang: zh`）會擠行首的開括號 / 行尾的結束標點，沒有開關 → `template.typ` 的 `line-content` 每行前後放寬 0 的 `edge-guard` box（Typst 只在行的第一個 / 最後一個項目是文字時擠；`h(0pt)` 會被丟掉）。EPUB / 翻頁書是 `css.rs` 的 `text-spacing-trim: space-all`。升級 typst 時重跑 `full_width_punctuation_at_line_edges_keeps_its_width`。
- **使用者文字絕不進 Typst 程式碼**：模板 `template.typ` 固定，資料走 `data.json`（`pdf.rs` 的 `to_data()`）+ `json()`。不要改成字串拼接 .typ（測試 `user_text_is_data_not_typst_code`）。
- **`ExportWorld` 是沙箱**：只能讀 `main.typ`、`data.json`、`assets/images/*`（再過 `validate_asset_path`），其他一律 `AccessDenied`。
- **圖形內文字框也由前端算**：`labelFrames[id] = labelFrame(shape)`（有文字的圖形才放）；`shape_label` 驗證（有限、寬 > 0、高 ≥ 0），缺的退回外框內縮。
- **圖形庫：前端算路徑，Rust 只畫**：`buildExportRequest` 放 `shapePaths[id] = { outline, details, detailStroke }`；`render.rs` 的 `render_path` 驗證（來自 WebView：≤ 2000 指令、M 開頭、|v| ≤ 1e6…不合 → `InvalidInput`）。不要在 Rust 再寫一份公式。
- **線條：匯出前換成路徑圖形**（`line-export.ts` 的 `exportedLinePieces`：`x-line` + `x-line-heads`，不在 `SHAPE_LIBRARY`）。Rust render / 模板 / EPUB 都不認識線條（`build_render` 遇到回 `InvalidInput`）。
- **有邊框的矩形 / 橢圓畫成路徑**（PDF：`rounded_rect_path` / `ellipse_path`；EPUB：inline SVG）：虛線位置由路徑起點決定，要和 Konva 相同；CSS border 畫在框內會差半個線寬。沒有邊框的照舊。
- **半透明**：EPUB / 翻頁書輸出前轉換（`markup.rs` 的 `css_color` / `svg_fill`），8 位 hex 不能進 EPUB（SVG 1.1 不允許）。
- **SVG 圖片**：一張壞 SVG 會讓**整份** Typst 排版失敗 → `drop_undrawable_svgs` 先用 `SvgImage::with_fonts_images` 逐張檢查（所以直接依賴 `comemo`，版本跟 typst）；圖片包在 `text(font: data.svgFonts)` 裡，否則沒內嵌字型的 SVG 文字一個字都不畫。
- 缺圖 / 壞圖略過並回報 `skippedImages`，不讓整份失敗。匯出目前畫面（含未存檔），不要求先存檔。
- 座標同 Konva（pt、左上原點、順時針）；render model 以外框左上角定位，旋轉也繞這點。多邊形 / 星形頂點由 `project/shape.rs` 算，模板 `kind: "polygon"`。

## 字型

- 畫面、PDF、EPUB **共用 `fonts/` 同一批檔案**：`src/index.css` 的 `@font-face`、`fonts.ts` 的 `FONT_OPTIONS`、`export/fonts.rs` 的 `BUNDLED_FONTS`（`include_bytes!`）**改一處就改其他處**。步驟與 `patch_font.py`：`fonts/README.md`。
- Typst 家族名 ≠ CSS 名（霞鶩文楷 TC）：`BUNDLED_FONTS.typst_family` + `typst_family()`（測試 `typst_sees_the_declared_family_and_weight`）。
- 只放**靜態**字重，不換可變字型、不加真斜體（`italic` 是模擬斜切）；霞鶩文楷粗體用 Medium。不讀系統字型（匯出每台機器一樣）。
- `LEGACY_FAMILIES`（`"Geist Variable"`、`"Microsoft JhengHei"` → 內建名）**不能刪**：舊專案帶舊名稱，沒有遷移。
- `font-display: block`：fallback 先畫會讓 Konva 量好的行寬失效。
- 專案字型（`document_fonts.rs` 的 `load`，只讀用到的，檔案不見就略過）：PDF 以 `project-font-<id>` 登記 400 / 700；EPUB / 翻頁書收成 `fonts/project-font-<n>.<ext>`，`@font-face` 帶畫布的 `ascent-override` / `descent-override`；`markup.rs` 的 `font-family` 只放內建與 `is_project_family` 符合的名稱。

## Command 與寫檔

- **兩步 command**：`export_choose_path(format, suggestedName)`（存進 `ExportState.pending`，只回傳檔名）→ `export_pdf` / `export_flipbook` / `export_flipbook_zip` / `export_pptx`（只取**同一格式**的路徑，不符視為沒選）。前端不傳路徑給 Rust。新格式（例如 EPUB）要加 Rust 的 `ExportFormat` 與前端的 `EXPORT_FORMATS`。
- 排版 CPU 密集，用 `spawn_blocking`；PDF 先寫 `.pdf.tmp` 再 rename。
- PDF：`typst` / `typst-layout` / `typst-pdf` / `typst-render` 版本一起改（`World`、`RootedPath`、`VirtualRoot` 每版都變）。`compile_document` 是 PDF 與 PowerPoint 共用的排版；`archive.rs` 的 `write_zip` 是 EPUB、PowerPoint 與翻頁書 zip 共用。EPUB（`export/epub`）還沒接 UI。

## 翻頁電子書（`export/flipbook` + `export/html`）

- **頁面 = EPUB 的頁面標記**：`export/html/` 共用（`markup::page_div(page, images, image_prefix)`、`css::font_faces` + `PAGE_RULES`），改標記兩邊一起變。
- 書的結構寫在 `index.html`（`file://` 擋 `fetch()`，不另放 JSON）；**沒有 inline script**，頁名 / 書名經 `escape`；CSP meta 只允許書裡的檔案（`data:` 也不行）。
- `.fb-page` 的 style 每次繪製被 page-flip 改寫 → 縮放放在裡面的 `.fb-scale`。
- `data-toc` 用 `is_default_page_name`，和編輯器 `nextPageNames` 的預設名稱**同規則**。
- **page-flip（vendor）陷阱**：`#book` 必須剛好是書的大小（硬頁與 `flipNext` 假設書在左上角）→ `viewer.js` 的 `layoutBook()` 自己算並置中，`resize` 處理要在建立 PageFlip **之前**註冊；`loadFromHTML` 寫上的 `min-width` / `width: 100%` 要清掉再 `layoutBook()` + `flip.update()`。翻頁區 `mousedown` 被 `preventDefault`，不能選文字（放大檢視是另一層）。升級 page-flip 要重跑計畫裡的瀏覽器驗證。
- `viewer.js`：DOM API、不用 `innerHTML`、不讀網址、不用 localStorage；縮圖 / 放大的複本從**初始化前留下的頁面**複製（page-flip 翻頁時會暫時複製頁面）。
- **Zip**（`zip_book`）：`index.html` 在根目錄、PNG / JPEG / GIF / WebP / woff2 不再壓縮。「翻頁電子書（Zip）」匯出與上傳網站（`upload/package.rs`）**共用同一個函式**，兩邊送出的內容相同。授權檔是 `viewer/page-flip.LICENSE.txt`：沒有副檔名的檔案會被網站略過。新增檔案類型時對照 `upload::package::ALLOWED_EXTENSIONS`（= web-magazine 的白名單）。
- **寫入**（`write_folder`）：隱藏暫存資料夾 → rename；目標只能不存在或是空資料夾，**絕不覆蓋或刪除有內容的資料夾**（`check_target`）。

## PowerPoint（`pptx-export.ts` + `export/pptx`）

- 一頁 = 一張滿版圖片（同一份 Typst 排版經 typst-render 點陣化，`PIXELS_PER_PT = 3`；上傳的封面 `export/cover.rs` 也用 `rasterize_at`，只排第一頁、寬 600 px；有照片的頁 JPEG、其他 PNG），文字不能編輯；`rasterize_pages` 用 `std::thread::scope` 平行。
- 只給簡報尺寸、每頁同一尺寸：前端 `pptxExportProblem` / Rust `pptx::slide_size`（`SLIDE_SIZES_PT`）**規則相同**。
- `package.rs` 是固定 XML 模板：使用者文字經 `escape`，屬性再經 `escape_attribute`（換行寫成 `&#10;`）。少任何一個 part PowerPoint 就跳「修復」，**改這裡要用 PowerPoint 實際開檔**（COM `Presentations.Open(path, -1, 0, 0)`；腳本要結束自己開的 POWERPNT）。
