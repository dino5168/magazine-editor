# 匯出 PowerPoint（PPTX）— 實作計畫

任務檔：`03-匯出PowerPoint 檔案.md`（本機，不 commit）。狀態：**7 個步驟全部完成（2026-10-21）**；步驟 1–2 commit `c5df28a`、步驟 3–7 commit `d480b91`；桌面版從選單匯出待使用者人工確認。

## 需求整理

1. 「檔案 → 匯出為 → PowerPoint（PPTX）...」。
2. 只有文件的紙張是**簡報尺寸**（2026-10-21 加的「簡報（PPT）」四種：PPT 16:9 / 4:3 / 16:10、Google 簡報 16:9）時才能匯出，其他紙張不行。
3. 參考文件建議用 PDFium（`pdfium-render`）：先有 PDF，再把每頁算成圖片放進投影片。

## 設計

### 整體流程（和 PDF 共用排版）

```
前端 buildExportRequest（和 PDF 同一份 ExportRequest：換行、主頁、頁碼、線條、圖片框都已處理）
  → Rust build_render → Typst compile（render_pdf 拆出的共用部分）→ PagedDocument
  → 每頁點陣化成圖片（Q1：typst-render 或 PDFium）
  → 自己寫最小的 OOXML（PresentationML）＋ 既有的 zip crate 打包成 .pptx
```

- **一頁 = 一張投影片 = 一張滿版圖片**。投影片大小 = 頁面大小（1 pt = 12 700 EMU；PPT 16:9 的 960 × 540 pt 剛好是 PowerPoint 預設的 12 192 000 × 6 858 000）。
- 所以畫面、PDF、PPTX 是**同一份 Typst 排版的結果**，所見即所得不受影響；代價是**投影片裡的文字不能在 PowerPoint 裡編輯**（見 Q2 的補救）。
- 字型被畫成圖片，不嵌入字型檔：沒有字型授權的問題，匯出前不用問（不同於翻頁書）。

### 不重複造輪子

| 需要 | 用現成的 |
|---|---|
| 排版 | `export::render_pdf` 的前半段（`build_render` + `drop_undrawable_svgs` + `document_fonts::load` + `compile`），拆成共用函式 |
| 點陣化 | **建議 `typst-render =0.15.1`**（已在 dev-dependencies，疊圖比對一直在用；跟 typst 同版本鎖定）——見 Q1 |
| PNG / JPEG 編碼 | tiny-skia 的 `encode_png`（typst-render 帶的）／既有的 `image` crate（JPEG） |
| ZIP | 既有的 `zip` crate（EPUB 的 `epub/zip.rs` 是 EPUB 專用的 mimetype 開頭，PPTX 另寫一個 10 行的 `write_zip`，或把 mimetype 改成選用參數） |
| 兩步 command、原子寫入、成功 toast「開啟」 | `export_choose_path` / `ExportState.pending` / `write_atomic` / `export_open_last`、前端 `runExport` 的 `EXPORT_FORMATS` |
| 尺寸判斷 | `page-setup.ts` 的 `presetIdOf`（不分直橫）+ `PAGE_SIZE_PRESETS[id].group === "slides"` |

PPTX 本身沒有成熟的 Rust crate（`ppt-rs` 之類都很早期），而且只需要「圖片投影片」這一種，**OOXML 用固定模板 + `format!` 寫**（同 EPUB 的 `package.rs`），使用者的文字只出現在 XML 屬性與文字節點，一律經 `escape`。

### 為什麼建議 typst-render 而不是 PDFium（Q1）

| | typst-render（建議） | PDFium（`pdfium-render`） |
|---|---|---|
| 額外檔案 | 無（純 Rust、編進 exe） | 要附 `pdfium.dll`（5–6 MB）：`bundle.resources`、開發時的路徑、固定版本與 SHA-256（`bblanchon/pdfium-binaries`） |
| 執行緒 | 沒限制 | 非執行緒安全，要用 Mutex 序列化 |
| 流程 | `PagedDocument` 直接畫，不用先產生 PDF 再解析 | Typst → PDF bytes → PDFium 再解析一次 |
| 一致性 | 和疊圖比對用的是同一個 renderer（已知和畫布的差異：只有照片邊緣少了平滑） | 品質最好（反鋸齒、圖片內插） |
| 升級 | 跟 typst 一起鎖 `=` | 另一套版本要管 |

PDFium 的優勢只在畫質。步驟 2 會先用 typst-render 輸出幾張含照片、細線、小字的投影片給你看；**畫質不能接受才換 PDFium**（只換步驟 2 的點陣化函式，其他步驟不變）。

### 「能不能匯出」的規則（Q4）

- **所有頁面同一個尺寸**（PPTX 整份只有一個投影片大小），而且這個尺寸是 `slides` 群組的四種之一（直式、橫式都可以：PowerPoint 支援直式投影片）。主頁不算（不匯出）。
- 前端 `pptxExportProblem(document): string | null`（純函式、測試）決定選單的狀態與訊息；**Rust 再檢查一次**（`ExportRequest` 來自 WebView，不可信任）：尺寸比對容許 0.01 pt，不符回 `InvalidInput`「只有簡報尺寸（PPT 16:9…）的文件可以匯出 PowerPoint」。

### PPTX 的最小結構

```
[Content_Types].xml
_rels/.rels
docProps/core.xml、docProps/app.xml
ppt/presentation.xml（sldSz、notesSz、sldIdLst、sldMasterIdLst）
ppt/_rels/presentation.xml.rels
ppt/presProps.xml、viewProps.xml、tableStyles.xml
ppt/theme/theme1.xml
ppt/slideMasters/slideMaster1.xml（+ rels）
ppt/slideLayouts/slideLayout1.xml（空白版面配置，+ rels）
ppt/slides/slideN.xml（一個 p:pic 滿版）+ ppt/slides/_rels/slideN.xml.rels
ppt/media/imageN.png | .jpg
```

PowerPoint 對缺件很挑剔（會跳「修復」），所以驗證以**真的用 PowerPoint 開**為準（本機有 Office 16，可用 PowerShell COM 自動開檔、另存 PNG 比對）。

## 檢核：可能的問題

1. **檔案大小**：滿版 PNG，照片頁很大（1920 × 1080 一張照片頁約 3–4 MB）→ Q3。
2. **時間與記憶體**：一頁 3 px/pt 的 RGBA 是 2880 × 1620 × 4 ≈ 18 MB，逐頁畫、逐頁編碼、只保留壓縮後的位元組；200 頁的時間在步驟 2 量測，太慢再用 `std::thread::scope` 平行（typst-render 可以平行，PDFium 不行）。
3. **文字不能編輯、不能搜尋**：圖片投影片的本質。補救見 Q2。
4. **頁面尺寸不一致的文件**（頁面設定可以讓各頁不同）：規則裡擋掉，訊息說明要先到「頁面設定」統一。
5. **超出頁面的物件**：和 PDF 一樣被頁緣裁掉。
6. **選單停用要動態**：目前 `COMMANDS.disabledReason` 是靜態的。若選「停用並顯示原因」（Q4），`AppMenubar` 要多一個 `disabledReason(command)` 的 prop（同 `isChecked` 的做法），MCP 的 `run_command` 也要尊重它。
7. **副檔名**：輸出 `.pptx`（Office 2007 起的格式），不是舊的二進位 `.ppt`；選單文字寫「PowerPoint（PPTX）...」。
8. **Google 簡報 16:9**：Google 簡報與 PowerPoint 都能開任意大小的 pptx，照樣允許。

## 決定（2026-10-21，使用者）

- **Q1 點陣化引擎：typst-render**（`=0.15.1`，從 dev-dependencies 移到 dependencies）。畫質不能接受時才換 PDFium（只換步驟 2）。
- **Q2 圖片 + 替代文字**：每張投影片圖片的 `descr` 放該頁的文字（文字物件與圖形內文字，依圖層順序、以換行接起來；頁碼與主頁內容也算，因為畫面上看得到）。看不到，螢幕閱讀器與搜尋用。
- **Q3 3 px/pt、自動格式**：16:9 = 2880 × 1620。該頁有點陣照片（非 SVG 的圖片物件或圖片框照片）→ JPEG 品質 92；其他 → PNG（文字、線條邊緣無損）。
- **Q4 停用並顯示原因**：選單支援動態停用（`AppMenubar` 加 `disabledReason(command)`，MCP `run_command` 也照它回「目前無法使用：…」）。

## 步驟（一次一步，每步完成後停下來等確認）

1. **前端規則**：`lib/export/pptx-export.ts` 的 `pptxExportProblem`（四種簡報尺寸、直橫、所有頁同尺寸），vitest。
2. **Rust 點陣化**：`render_pdf` 拆出共用的 `compile_document`；`typst-render` 移到 `[dependencies]`；`export/pptx/raster.rs` 每頁 → 圖片位元組（Q3 的規則）；測試 + 給使用者看幾張樣張、量 200 頁的時間。
3. **Rust PPTX 封包**：`export/pptx/{mod,package}.rs` 的 `build_pptx(root, request, fonts) → PptxOutput { bytes, pages, skipped_images }`；尺寸檢查；測試（每個 rels 指到存在的 part、Content_Types 涵蓋每個副檔名、XML 都能被 roxmltree 解析、文字有 escape）。
4. **command**：`ExportFormat::Pptx`（`"pptx"`）、`export_pptx`（`spawn_blocking`、`write_atomic`）、註冊、`export_pptx_preview` 測試（`#[ignore]`，寫到 `EXPORT_PREVIEW_DIR`）。
5. **前端接線**：`file.exportPptx` 指令與選單位置、`EXPORT_FORMATS`、`projectApi.exportPptx`、`home-page.tsx` handler、Q4 的停用 / 提示；`menu-structure.test.ts`。
6. **驗證**：PowerShell COM 讓 PowerPoint 開檔（不能跳修復）、另存每張投影片 PNG 和 typst 的 PNG 比對；四種簡報尺寸 + 直式；桌面版人工試一次。
7. **文件**：`CLAUDE.md`（匯出一節、IPC commands、Tech Stack 的 typst-render）、`docs/progress.md`、本計畫的結果。

## 進度紀錄

- 2026-10-21：讀過任務檔與現有的匯出程式，寫出本計畫；使用者決定 Q1–Q4（都照建議）。
- 2026-10-21 **步驟 1 完成**：`src/lib/export/pptx-export.ts`——`isSlideSize(size)`（`presetIdOf` 不分直橫 + `group === "slides"`）、`pptxExportProblem(document)`：第一頁不是簡報尺寸 →「需要簡報尺寸」、其他頁和第一頁差超過 0.5 pt（同 preset 比對的容許值）→「各頁尺寸不同」、可以匯出 → `null`；訊息短，直接放在選單項目旁的括號裡（`PPTX_PROBLEMS`）。主頁不檢查（不匯出）。測試 `__tests__/pptx-export.test.ts` 6 項：四種簡報尺寸直橫都收、其他 14 種紙張與自訂尺寸不收、16:9 = 960 × 540、混合尺寸（含同一種簡報的直 + 橫）不收；`tsc` 通過。
- 2026-10-21 **步驟 2 完成**：
  - `export/pdf.rs`：`render_pdf` 的前半段拆成 `compile_document(root, request, fonts) → CompiledDocument { render, pages, skipped_images }`（PDF 與 PowerPoint 共用；`render` 給替代文字與 JPEG 判斷用）。
  - `Cargo.toml`：`typst-render =0.15.1` 從 dev-dependencies 移到 dependencies；開發版也最佳化 `typst-render` / `tiny-skia` / `tiny-skia-path`（同圖片解碼套件的做法）。
  - `export/pptx/raster.rs`：`PIXELS_PER_PT = 3`、`JPEG_QUALITY = 92`；`has_raster_photo(page)`（非 SVG 的圖片物件或圖片框照片 → JPEG）；`rasterize(page, format)`（typst-render → 丟掉 alpha 成 RGB（背景一定不透明）→ `image` 的 PNG / JPEG 編碼器，PNG 也是 RGB）；`rasterize_pages(compiled)` 以 `std::thread::scope` 分給 CPU 核心數的執行緒，順序不變。模組還沒有呼叫端，`export/mod.rs` 暫時 `#[expect(dead_code)]`（步驟 4 移除）。
  - 測試 3 項：照片 / SVG 判斷、每頁 3 px/pt 而且格式對（照片頁 JPEG、照片位置的顏色對）、PNG 頁是不透明 RGB 且顏色無損；`slides_preview`（`#[ignore]`）寫樣張到 `<EXPORT_PREVIEW_DIR>/slides/` 並印出時間（可用 `EXPORT_REQUEST_JSON` / `EXPORT_PROJECT_DIR` / `FLIPBOOK_PAGES`）。cargo 245 全過、沒有 warning。
  - **量測**（8 核心，fixture 複製 200 頁、A4、每頁一張照片）：release 設定 **4.4 秒**、開發版 21 秒；一頁 release 約 0.1 秒（render 39 ms + JPEG 65 ms）。開發版的 JPEG 編碼慢（`JpegEncoder<W>` 是泛型，在我們的 crate 以 opt-level 0 展開），安裝版不受影響。200 頁照片頁共 44 MB（一頁約 0.2 MB）。轉 RGB 原本自己寫迴圈，開發版一頁多 0.2 秒，改用 `DynamicImage::to_rgb8`。
  - **畫質**（16:9 樣張：真照片、28 / 11 / 8 / 6 pt 文字、0.5 pt 框、0.25 pt 線、0.25 pt 虛線框）：6 pt 中英文都清楚、0.25 pt 線看得到、照片沒有明顯鋸齒；照片頁 JPEG 0.56 MB。結論：**不需要換 PDFium**。
  - 步驟 1–2 commit `c5df28a`（沒有 push）。
- 2026-10-21 **步驟 3 完成**：
  - `export/archive.rs`（新）：`write_zip(entries, format_name)`，每個項目 `Packing::Stored` / `Deflated`；EPUB 的 `write_container` 改用它（mimetype 原樣、其他壓縮，EPUB 測試照過）。PPTX 的圖片原樣存（本來就壓縮過）、XML 壓縮。
  - `export/pptx/package.rs`（新）：`pptx_package(meta, slides)` 寫最小的 PresentationML：`[Content_Types].xml`、`_rels/.rels`、`docProps/core.xml`（標題、建立時間）/ `app.xml`、`ppt/presentation.xml`（`sldSz` = 頁面 × 12 700 EMU）與 rels、`presProps` / `viewProps` / `tableStyles`、`theme1`（Office 預設色彩與字型，看不到）、一個母片與一個空白版面配置、每頁 `slideN.xml`（一個 `p:pic` 滿版，`name` = 頁名、`descr` = 替代文字）+ rels、`ppt/media/imageN.png|jpeg`。使用者文字經 `escape`；屬性多一層 `escape_attribute`，換行寫成 `&#10;`（否則讀回來變空白）。
  - `export/pptx/mod.rs`：`SLIDE_SIZES_PT`（四種，橫式；直式也收，容許 0.5 pt，同前端）、`slide_size(request)`（Rust 再檢查一次：不是簡報尺寸 / 各頁不同 → `InvalidInput` 中文訊息，**排版前**就擋）、`page_text(page)`（每個文字框（含圖形內文字；主頁內容與頁碼由前端展開成頁面物件）的行，去掉空行，以換行接起來）、`build_pptx(root, request, fonts) → ExportOutput`。`pptx_preview`（`#[ignore]`）寫 `<EXPORT_PREVIEW_DIR>/preview.pptx`。
  - 測試 11 項（封包 6：每個 XML 都能解析、每個 relationship 指到存在的 part 且 id 不重複、Content_Types 涵蓋每個 part、投影片順序與 16:9 = 12 192 000 × 6 858 000 EMU、文字 escape 與替代文字的換行、圖片 stored / XML deflated；流程 5：四種尺寸直橫都收、A4 / 自訂 / 混合尺寸拒絕、尺寸和前端 preset 一致、整份 fixture 匯出（2880 × 1620 的 JPEG、替代文字有頁面文字）、紙張文件在排版前就拒絕）。cargo 256 全過、沒有 warning。
  - **PowerPoint 實測**（Office 16，PowerShell COM 以 `Presentations.Open(..., WithWindow = 0)` 開檔）：fixture 與真照片樣本都**直接開啟、沒有修復提示**；投影片 960 × 540 pt、每張一個圖片（type 13）在 0,0 960 × 540、名稱是頁名、替代文字有換行；PowerPoint 另存的 PNG 和 typst-render 的圖一樣。注意：COM 的 `Quit()` 之後 PowerPoint 行程沒有退出（沒有視窗），驗證後要自己結束（步驟 6 的腳本要處理）。
- 2026-10-21 **步驟 4 完成**（`commands/export.rs`、`lib.rs`）：
  - `ExportFormat::Pptx`（前端傳 `"pptx"`）；存檔對話框標題「匯出 PowerPoint」、預設檔名 `<文件名稱>.pptx`、篩選「PowerPoint 簡報（*.pptx）」。
  - `export_pptx(request)`：取 `Pptx` 的待用路徑 → `spawn_blocking(build_pptx)` → `write_atomic` → 記成最後一次匯出（成功 toast 的「開啟」用預設程式開 `.pptx`）。在 `lib.rs` 註冊。
  - 副檔名：抽出 `with_extension(picked, ext)`（PDF / PPTX 共用）：沒打副檔名才補上（大小寫都算）。**順便修正 PDF 的小問題**：原本用 `set_extension`，檔名 `v1.2` 會變成 `v1.pdf`，現在是 `v1.2.pdf`。
  - `write_atomic` 的暫存檔改成「原檔名 + `.tmp`」（原本固定 `.pdf.tmp`，給 PPTX 用會變成 `簡報.pdf.tmp`）。
  - 拿掉 `export/mod.rs` 的 `#[expect(dead_code)]`；`SlideImage` 的像素寬高只有測試用，刪掉欄位（測試改成解碼後比對）。
  - 測試 +2（副檔名、原子寫入不留暫存檔），`ExportFormat` 的名稱測試加 `pptx`；cargo 258 全過、沒有 warning。
- 2026-10-21 **步驟 5 完成**（前端接線）：
  - 指令 `file.exportPptx`「PowerPoint（PPTX）...」（訊息用「匯出為 PowerPoint」），放在「匯出為」的翻頁電子書與 EPUB 之間；沒有快捷鍵。
  - **動態停用**：`lib/menu/command-availability.ts` 的 `commandDisabledReason(id, document)`（固定的 `COMMANDS.disabledReason` 之外，`file.exportPptx` 問 `pptxExportProblem`）；`AppMenubar` 多一個 `disabledReason` prop（項目與勾選項目都用它、原因顯示在括號裡），MCP 的 `CommandAccess.disabledReason`（可選，沒給時只看固定原因）讓 `list_commands` / `run_command` 和選單一致。`home-page.tsx` 的函式在呼叫當下讀 `useProject().getSnapshot()` 的文件：Radix 選單打開時才掛上項目，所以**版面不用訂閱編輯器狀態**（`EditorLayout` 刻意不訂閱）。快捷鍵不看動態原因（目前沒有動態停用的指令有快捷鍵）。
  - `ExportFormat` 加 `"pptx"`、`projectApi.exportPptx`、`useProjectCommands().exportPptx`（`EXPORT_FORMATS.pptx` = 「PowerPoint」）；`runExport` 對 pptx 在選存檔位置之前再檢查一次（MCP 等其他入口），不行就 toast「無法匯出 PowerPoint：需要簡報尺寸（設定 → 文件 → 頁面設定）」。
  - MCP：`mcp-tools.json` 的指令 enum 多 `file.exportPptx`（`vitest -u`）、Python SDK `_tools.py` 重新產生（pytest 16）、橋接程式重編（**Claude Code 要 `/mcp` 重新連線**才看得到）、`MCP-工具清單.md`。
  - 測試：`command-availability.test.ts` 2 項（只有簡報尺寸能用、其他指令只看固定原因）、MCP `commands.test.ts` +1（動態停用時 `list_commands` 回報原因、`run_command` 不執行）；`tsc` 通過、vitest 1132 全過。
  - 無頭 Edge（瀏覽器模式，示範文件 A4）：「匯出為」依序 PDF / 翻頁電子書 / PowerPoint / EPUB；A4 時是「PowerPoint（PPTX）...（需要簡報尺寸）」且 `aria-disabled`；`document/setPageSetup` 成 960 × 540 後可以點，點了提示「檔案功能僅在桌面版可用」。
- 2026-10-21 **步驟 6 完成（自動化的部分；桌面版從選單匯出待使用者人工確認）**：
  - **真前端的請求**：瀏覽器模式（無頭 Edge）以示範文件做五種投影片（PPT 16:9 / 4:3 / 16:10、Google 16:9 橫式，PPT 16:9 直式）：`presetSize` 改尺寸、加第 2 頁「第二頁」（一張真照片 → JPEG 頁 + 三個文字）、套 fixture 的頁碼規則；`buildExportRequest(document, measureTextLayout, measureLineWidth)` 產生 JSON（Konva 量的換行、線條換成路徑、頁碼展開）；`pptxExportProblem` 五種都是 `null`。再以 `pptx_preview`（`EXPORT_REQUEST_JSON` + `EXPORT_PROJECT_DIR`）做出五個 `.pptx`（0.38–0.55 MB）。
  - **PowerPoint**（COM、`WithWindow = 0`，腳本記下原本的 PowerPoint 行程、結束時只關自己開的）：五個都**直接開啟、沒有修復提示**；投影片 720 × 450 / 960 × 540 / 540 × 960 / 720 × 540 / 720 × 405 pt 都對；每張一個圖片（type 13）在 0,0 滿版；名稱是頁名（封面 / 第二頁）；替代文字是該頁的文字 + 頁碼（第 1 頁「1」、第 2 頁「2」）。
  - **逐像素**：PowerPoint 另存的投影片（2 px/pt）和 `.pptx` 裡的圖片（縮到同大小）平均差 0.06–0.13 / 255、差超過 15 的像素 ≤ 0.01%（只有縮放內插）——PowerPoint 顯示的就是 typst-render 畫的圖。目視：中英文、圓角矩形、線條、圖形、照片、奇偶頁頁碼位置都正確。
  - 錯誤一次：fixture 的頁碼規則連到示範文件沒有的色票 → Rust `InvalidProject`（測試資料的問題，清掉連結後正常；表示 Rust 的驗證有作用）。
  - **待使用者**：`npm run tauri dev` 以簡報尺寸的文件從「檔案 → 匯出為 → PowerPoint（PPTX）...」匯出（原生存檔對話框自動化點不到）：預設檔名、成功提示的「開啟」、用 PowerPoint 開；A4 文件時選單停用。
- 2026-10-21 **步驟 7 完成**（文件）：`CLAUDE.md` 新增「匯出 PowerPoint」一節；Tech Stack 的 PDF 排版列加 `typst-render`（測試列拿掉）；Commands 加 `pptx_preview` / `slides_preview`；目錄結構加 `lib/export/pptx-export.ts`、`lib/menu/command-availability.ts`、`src/export/archive.rs`、`src/export/pptx/`、`compile_document`；匯出 PDF 的兩步 command 加 `pptx` 與 `with_extension`；選單列與指令加「動態停用」；IPC commands 加 `export_pptx`。`docs/01-overview.md` 功能表加「匯出 PowerPoint」、`docs/02-architecture.md` 的 export / commands 說明。
