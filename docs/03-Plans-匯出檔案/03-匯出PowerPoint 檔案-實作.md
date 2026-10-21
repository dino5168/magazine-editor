# 匯出 PowerPoint（PPTX）— 實作計畫

任務檔：`03-匯出PowerPoint 檔案.md`（本機，不 commit）。狀態：**Q1–Q4 已決定（2026-10-21），等使用者說「開始」做步驟 1**。

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
