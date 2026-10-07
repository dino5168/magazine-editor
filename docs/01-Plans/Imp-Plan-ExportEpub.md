# 匯出 EPUB 實作計畫

> 對應任務：`docs/01-Plans/Task-Plan-ExportEpub.md`（`menu-structure.ts:48` 的 `file.exportEpub` 尚未實作）
> 狀態：**階段 1、2 已完成**（2026-09-30），**階段 3（封面）暫緩，待後續討論**（2026-09-30 使用者決定）。原第 8 節的四個待決事項已於 2026-09-23 回覆，併入第 2 節
> 撰寫日期：2026-09-23

---

## 1. 目標

把「檔案 → 匯出為 → EPUB...」接上實作，輸出 **EPUB 3 固定版面（Fixed Layout）**：一頁文件 = 一頁 EPUB，版面與編輯器畫布逐點對應，文字是真文字（可選取、搜尋、複製）。

這也是 `CLAUDE.md` 長期目標「排版與輸出以 EPUB 3 固定版面為主，PDF 為衍生輸出」的第一個實際產物。

**不在這次範圍**：重排版（reflowable）EPUB、EPUB 3 的多媒體與腳本、跨頁（spread）設定、文件中繼資料的 UI、匯出 PNG / JPEG。

---

## 2. 已與使用者確認的決定（2026-09-23）

| 問題 | 決定 | 理由 |
|---|---|---|
| 頁面內容形式 | **真文字 + CSS 絕對定位**（每頁一份 XHTML，形狀用 inline SVG，圖片用 `<img>`） | 文字可選取／搜尋，檔案小；閱讀器的排版引擎和 Konva 量測同源 |
| 字型 | **先全量內嵌**實際用到的家族，字型子集化列為後續優化 | 實作單純、風險最低；子集化不影響檔案格式，之後可獨立進行 |
| 與 `plan-epubv2` 階段 1 的關係 | **先抽出 `RenderModel`**，再做 EPUB | 避免 PDF / EPUB 各寫一份座標、旋轉、字型對應與圖片略過邏輯 |
| 中繼資料與封面 | **全自動，不加 UI**：標題＝文件名稱、語言 `zh-TW`、UUID、`dcterms:modified`＝匯出時間、作者留空；封面用 Typst 算第 1 頁的 PNG | 不需要動 `types.ts` / `format.rs` / `schemaVersion` |
| 工具列 | **不用下拉選單**，在「匯出 PDF」旁邊直接加一顆「匯出 EPUB」按鈕 | 兩個輸出都是一鍵可及，不用多一層互動 |
| 快捷鍵 | **不加**（EPUB 與 PDF 都沒有） | 選單與工具列按鈕已足夠 |
| 語言碼 | 這次固定 `zh-TW`，但**集中在單一常數**，後續要做多語系 | 文件模型還沒有語言欄位；集中定義才不用日後全域搜尋替換 |

使用者已確認階段切法：**先做 `RenderModel` 抽出，後續目標是把專案匯出成 EPUB**，與本文件第 5 節一致。（`0-Task/plan-epubv2.md` 不在這台機器上，這份計畫是從程式碼與 `docs/progress.md` 推導出來的。）

---

## 3. 現況（實作的起點）

- PDF 匯出已完整運作：`ExportRequest`（文件 + 每個文字物件的 `lines` / `baseline`）→ `build_data()` → `data.json` → `template.typ` → PDF。
- `file.exportEpub` 已存在於 `COMMANDS` 與 `MENUS`，目前落到 `createPlaceholderHandlers` 的佔位 handler（toast「『匯出為 EPUB』尚未實作」）。
- `fonts/` 的四個字型檔已由畫面（`index.css` 的 `@font-face`）與 Rust（`world.rs` 的 `include_bytes!`）共用。
- 相依樹裡**已經有** `flate2`、`subsetter`、`ttf-parser`、`roxmltree`、`quick-xml`（Typst 帶進來的），子集化與 XML 測試不需要新的供應鏈。
- **需要新增的相依套件只有 `zip`**（寫 EPUB 的 ZIP 容器）。`typst-render` 要從 `dev-dependencies` 升為正式相依（封面）。

---

## 4. 設計

### 4.1 EPUB 檔案結構

```
mimetype                          # 第一個 entry、Stored 不壓縮、無 extra field
META-INF/container.xml
OEBPS/content.opf                 # metadata / manifest / spine
OEBPS/nav.xhtml                   # EPUB 3 導覽（頁面名稱當目錄），不放進 spine
OEBPS/styles/page.css             # 共用的 reset 與 .page / .el 規則
OEBPS/fonts/Geist-Regular.ttf …   # 實際用到的家族（來源同 world.rs 的 BUNDLED_FONTS）
OEBPS/images/<hash>.<ext>         # 從專案 assets/images/ 複製，只複製有被引用的
OEBPS/images/cover.png            # Typst 算出的第 1 頁縮圖
OEBPS/pages/page-1.xhtml …        # 一頁一份，順序即 spine 順序
```

- `mimetype` 的內容固定是 `application/epub+zip`，其餘 entry 用 Deflate；路徑一律 `/`、UTF-8。
- manifest 的 `properties`：`nav.xhtml` → `nav`；`cover.png` → `cover-image`；**含 inline SVG 的頁面 → `svg`**（有 polygon / star 的頁面才加）。
- package 宣告 `prefix="rendition: http://www.idpf.org/vocab/rendition/#"`，metadata 內：
  `rendition:layout = pre-paginated`、`rendition:orientation = auto`、`rendition:spread = auto`。

### 4.2 單位：pt → CSS px，數值 1:1

編輯器 zoom 1 時 1 pt = 1 CSS px，所以 EPUB 直接沿用同一個數值：頁面 595×842 pt → `<meta name="viewport" content="width=595, height=842">`，字級 16 pt → `font-size:16px`。固定版面由閱讀器自行縮放到螢幕，比例不變。**每頁各自宣告自己的 viewport**（文件允許各頁尺寸不同）。

### 4.3 文字：為什麼不需要額外的基線校正

`text-layout.ts` 算出的基線是

```
baseline = (ascent − descent) / 2 + L / 2        // L = fontSize × TEXT_LINE_HEIGHT
```

CSS 單行行框（`line-height: L`）的基線位置是 half-leading 加 ascent：

```
(L − (ascent + descent)) / 2 + ascent = (L + ascent − descent) / 2
```

兩式代數上完全相同。因此只要**把第 i 行的行框上緣放在 `y + i × L`**，基線就會落在和 PDF 模板逐行 `place` 一樣的位置，不必自己算 `dy`。

文字物件的 HTML：

```html
<div class="el t" style="left:72px;top:120px;width:300px;line-height:19.2px;
     font-family:'Noto Sans TC';font-size:16px;color:#111827;text-align:center">
  <div>第一行（由 Konva 決定的斷行）</div>
  <div>第二行</div>
</div>
```

- 每行一個 `<div>`，`white-space: pre`：**永遠不再換行**，也保留行首尾空白。即使閱讀器量出的行寬差一點點，也不會重新斷行而毀掉版面。
- `ExportRequest.baseline` 在 EPUB 路徑不直接使用，但保留作為自動檢查（見 6.1）。

`page.css` 的必要 reset：

```css
html, body { margin: 0; padding: 0; }
.page { position: relative; overflow: hidden; }   /* 超出頁面的物件被頁緣裁掉，與 PDF 一致 */
.el { position: absolute; margin: 0; padding: 0; }
.t > div { white-space: pre; }
.t { text-spacing-trim: space-all; font-kerning: normal; -epub-hyphens: none; }
img.el { display: block; }
```

`text-spacing-trim: space-all` 是關鍵：部分排版引擎預設會壓縮中文標點的寬度，canvas 量測不會，不關掉會讓中文標點附近的位置對不上。

### 4.4 各物件類型的對應

| 物件 | 產生的節點 | 定位 | `transform-origin` |
|---|---|---|---|
| `text` | `div.t` + 每行一個 `div` | `left:x, top:y, width:w` | `0 0` |
| `rect` | `div` | `left:x, top:y, width, height, border-radius` | `0 0` |
| `image` | `img` | `left:x, top:y, width, height` | `0 0` |
| `ellipse` | `div`（`border-radius:50%`） | `left:x−rx, top:y−ry, 2rx × 2ry` | `50% 50%` |
| `polygon` / `star` | inline `<svg><polygon/></svg>` | `left:x−rx, top:y−ry, 2rx × 2ry`，`viewBox="0 0 2rx 2ry"` | `50% 50%` |

- 旋轉一律 `transform: rotate(<rotation>deg)`，和 Konva 同為順時針。
- 頂點沿用既有的 `regular_points()`（polygon 與 star 共用，與 PDF 完全相同的數字）。
- inline SVG 在 XHTML 裡必須帶 `xmlns="http://www.w3.org/2000/svg"`。
- `<img>` 預設 `object-fit: fill`，等同 Typst 模板的 `fit: "stretch"`。

### 4.5 字型

- 沿用 `world.rs` 的 `BUNDLED_FONTS`（同一組位元組，執行檔不會變大）。
- 只放進**文件實際引用到的家族**（經 `font_families()` 正規化後的集合，含 `LEGACY_FAMILIES` 對應）；兩個字重都放，因為 `fontStyle` 可能在任一頁切換。
- `page.css` 為每個家族寫兩條 `@font-face`（400 / 700），`src: url("../fonts/…")`。
- 媒體型別：`.ttf` → `font/ttf`、`.otf` → `font/otf`（兩者都是 EPUB 3 允許的字型型別）。
- 中文全量內嵌會讓 EPUB 多約 11.5 MB。子集化（用相依樹裡已有的 `subsetter` + `ttf-parser`）列為後續優化，**前提是子集化後 `hmtx` 與 cmap 對應不變，行寬必須完全一致**。

### 4.6 中繼資料、導覽、封面

- `dc:title` = 文件名稱、`dc:language` = `zh-TW`、`dc:identifier` = `urn:uuid:<每次匯出新產生>`、`meta property="dcterms:modified"` = 匯出當下的 UTC（`time` crate，格式 `YYYY-MM-DDThh:mm:ssZ`）。
- **語言碼集中在一個常數**（`epub/package.rs` 的 `DEFAULT_LANGUAGE: &str = "zh-TW"`），同時供 `dc:language` 與每頁 XHTML 的 `lang` / `xml:lang` 使用。後續做多語系時，只要把這個常數換成「文件模型或偏好設定傳進來的值」一處即可（見第 8 節）。
- `nav.xhtml`：`<nav epub:type="toc" hidden="">` + 每頁一個 `<li><a href="pages/page-N.xhtml">頁面名稱</a></li>`（`Page.name`）。
- 封面：用**既有的 Typst 管線**把第 1 頁算成 PNG（`typst-render`，縮放到長邊約 1600 px），存成 `images/cover.png`，manifest 標 `cover-image`。封面由 Typst 畫、內文由閱讀器畫，兩者字距可能有微小差異，但封面只是書櫃縮圖，可以接受。

### 4.7 安全性

延續 PDF 的三條原則：

1. **使用者文字永遠是資料**：所有文字與屬性值經過 XML 跳脫（`&`、`<`、`>`、`"`、`'`），並濾掉 XML 1.0 不允許的控制字元。對應 PDF 的 `user_text_is_data_not_typst_code`，EPUB 也要有同名等級的測試。
2. **路徑不進前端**：沿用兩步 command，路徑只存在 Rust 端。
3. **圖片只讀專案內的 `assets/images/<檔名>`**，重用 `validate_asset_path()`；檔案不存在就略過並回報 `skippedImages`（和畫布顯示灰框、PDF 略過一致）。

顏色與資產路徑在 `validate_content()` 已驗證（`#rrggbb`、`assets/images/<plain>`），可以安全寫進 CSS 與 `src`。不需要改 CSP 或 `capabilities/default.json`（沿用既有的 dialog / opener 權限）。

---

## 5. 實作階段

每個階段結束時 `cargo test` / `cargo clippy --all-targets` / `npm test` / `npm run build` 都必須通過，並且是一個可獨立 commit 的單位。

### 階段 1：抽出 `RenderModel`（PDF 行為不變）

**新增** `src-tauri/src/export/render.rs`：

```rust
pub struct RenderDocument { pub title: String, pub pages: Vec<RenderPage> }
pub struct RenderPage { pub name: String, pub width: f64, pub height: f64,
                        pub background: String, pub elements: Vec<RenderElement> }
pub struct RenderElement { pub x: f64, pub y: f64, pub rotation: f64,
                           pub anchor: Anchor, pub kind: RenderKind }
pub enum Anchor { TopLeft, Center }
pub enum RenderKind { Text(RenderText), Rect(RenderRect), Ellipse(RenderEllipse),
                      Polygon(RenderPolygon), Image(RenderImage) }
```

- `RenderText` 內含 `lines` / `baseline` / `line_height` / `width` / `size` / `fonts`(已正規化) / `bold` / `align` / `fill`。
- `RenderPolygon` 內含 `rx` / `ry` / 以中心為原點的 `points` / `fill`（polygon 與 star 合流，和現在的 `kind: "polygon"` 相同）。
- `RenderImage` 內含 `width` / `height` / `src`。
- `pub fn build_render(root, &ExportRequest) -> AppResult<(RenderDocument, usize)>`：現有 `build_data()` 的內容搬過來，保留 `validate_content()`、缺 layout 的退回路徑、圖片略過計數。

實作時的三點調整（2026-09-23）：

- `RenderImage` **不放 `media_type`**：媒體型別是 EPUB 打包的事（只有 manifest 需要），而且是 `src` 的純函式，放進共用模型會把格式細節漏進來。改由階段 2 的 `epub/package.rs` 自行推導。
- `RenderPage.name`（EPUB 目錄用）與 `Anchor`（CSS `transform-origin` 用）**延到階段 2 再加**：階段 1 沒有消費者，加了會是 `cargo clippy` 的 dead code 警告。
- `ExportOutput.pdf` 改名為 **`ExportOutput.bytes`**，讓 EPUB 能共用同一個回傳型別。

**改動**：
- `export/mod.rs` → 拆成 `mod.rs`（共用型別 + `render_pdf` 對外介面）、`render.rs`、`pdf.rs`。`pdf.rs` 只剩 `RenderDocument → serde_json::Value`，`template.typ` **完全不動**。
- 既有測試搬到對應模組，`renders_every_element_type_to_pdf` 等驗收行為不變。

**驗收**：PDF 匯出結果與重構前逐位元組相同（用 `export_preview` 的 PNG 或 PDF 位元組比對確認一次）。

> ✅ **階段 1 已完成（2026-09-23）**：`cargo test` 43 passed（+1 ignored）、`npm test` 65 passed、`npm run build` 與 `cargo clippy --all-targets` 通過（只剩 `recovery.rs:113` 一個既有的 `unnecessary_sort_by` 警告，與這次改動無關）。以 `export_preview` 在重構前後各算一次頁面點陣圖，SHA-256 相同（`2C2A8F9D…`）。

### 階段 2：EPUB 產生器（純函式，不接 UI）

**新增** `src-tauri/src/export/epub/`：

| 檔案 | 內容 |
|---|---|
| `mod.rs` | `render_epub(root, &ExportRequest, fonts) -> AppResult<ExportOutput>`；組裝所有檔案後交給 `zip.rs` |
| `xhtml.rs` | `RenderPage` → 頁面 XHTML；XML 跳脫；inline SVG |
| `package.rs` | `container.xml`、`content.opf`、`nav.xhtml` |
| `css.rs` | `page.css`（reset + `@font-face`） |
| `zip.rs` | EPUB 容器：`mimetype` 為第一個 Stored entry，其餘 Deflate |

**相依**：`Cargo.toml` 加 `zip`（只要 deflate 功能，版本在實作時以 `cargo add` 決定）；`typst-render` 從 `dev-dependencies` 移到 `dependencies`。

**驗收**：單元測試產生的 EPUB 通過 6.1 的所有檢查。

> ✅ **階段 2 已完成（2026-09-30）**：`cargo test` 59 passed（+2 ignored）、`npm test` 98 passed、`npm run build` 通過、`cargo clippy --all-targets` 只剩既有的 `recovery.rs:113`。另以 headless Edge 把 EPUB 頁面算成 2 px/pt 的圖，和 `export_preview` 的 PDF 頁面比對：只有標題文字區 0.075% 的像素因反鋸齒不同，文字墨水外框位置相差 ≤ 1 device px（0.5 pt），**基線不需校正**。
>
> 實作時和原計畫不同的地方：
>
> | 原計畫 | 實際 | 原因 |
> |---|---|---|
> | 沿用 `world.rs` 的 `BUNDLED_FONTS`（只有位元組） | 抽成 `export/fonts.rs`：每個字型帶 `family` / `bold` / `file` / `data`，`world.rs` 與 EPUB 共用 | EPUB 需要知道檔名與字族才能寫 manifest 與 `@font-face` |
> | `typst-render` 這個階段升為正式相依 | 仍是 dev-dependency，**階段 3（封面）才升** | 這個階段沒有用到，先加只會多編譯 |
> | `zip` 用 `deflate` feature | `zip` 8.6，`default-features = false, features = ["deflate-flate2"]` | `deflate` 會多帶 `zopfli`（慢速極限壓縮，用不到）；現在只新增 `zip` 與 `typed-path` 兩個 crate，flate2 沿用相依樹裡已有的 |
> | package 宣告 `prefix="rendition: …"` | **不宣告** | `rendition` 是 EPUB 3 的保留前綴，重複宣告是 epubcheck 警告 |
> | `RenderElement` 加 `Anchor` 欄位 | 不加；`xhtml.rs` 依物件類型決定，中心點旋轉的物件加 `class="c"`（`transform-origin: 50% 50%`） | 錨點是物件類型的函數，放進模型是重複資訊 |
> | 語言碼常數在 `epub/package.rs`（`DEFAULT_LANGUAGE`） | `epub/mod.rs` 的 `LANGUAGE` | `package.rs` 與 `xhtml.rs` 都要用，放在上一層 |
> | 圖片沿用專案檔名，媒體型別看副檔名 | EPUB 內改名 `images/image-<n>.<ext>`，媒體型別看**檔頭** | 專案檔名只保證是單純檔名，仍可能含 `#`、`%` 等在 URL 裡有意義的字元；讀不到或不是 PNG / JPEG / GIF / WebP 的圖片略過並計入 `skippedImages` |
> | CSS `font-family` 寫文件裡的字族清單 | **只寫內嵌字型的正式名稱** + `sans-serif` | `fontFamily` 是使用者可控的字串，不讓它進 CSS；非內嵌字族在 PDF 裡本來就不會生效 |
> | viewport = 頁面尺寸 | viewport 取**整數**（無條件進位），頁面 div 維持精確尺寸，`body` 背景同頁面色 | A4 是 595.28 × 841.89，整數 viewport 最保險；多出的不到 1 px 看不出來 |
> | — | 空行輸出明確高度的 `<div>` | 沒有文字的行不產生行框，高度會塌成 0，後面的行會往上移 |
> | `render_epub(root, request, fonts)` | `render_epub(root, request)`；`build_epub(…, &EpubMeta)` 讓測試注入固定的 UUID 與時間 | 這個階段不用 Typst 字型（封面在階段 3 才需要）；`render_epub` 在階段 4 接上 command 之前以 `#[expect(dead_code)]` 標示 |
> | `baseline_matches_css_line_box` 驗證兩個公式等值 | 改為檢查每個內嵌字型的 `hhea` 等於 Windows 引擎實際採用的 `OS/2` 度量（USE_TYPO_METRICS ? typo : win） | 兩個公式在代數上必然相等，測它沒有意義；真正的風險是不同閱讀器讀不同的度量表（第 7 節）。實測：Geist 的 win 度量和 `hhea` 不同，但它設了 USE_TYPO_METRICS，typo 與 `hhea` 相同；Noto Sans TC 相反。兩者都安全 |
>
> 手動檢查用：`EXPORT_PREVIEW_DIR=<dir> cargo test epub_preview -- --ignored` 產生 `preview.epub`（可以再設 `EXPORT_REQUEST_JSON`，同 `export_preview`）。

### 階段 3：封面

> **暫緩，待後續討論**（2026-09-30 使用者決定）。重新開始前先和使用者討論封面的做法，不要照下方原計畫直接實作。

- `pdf.rs` 旁新增 `cover.rs`：重用階段 1 的 `RenderDocument` → Typst → `typst-render` 算出第 1 頁 PNG。
- 只在有頁面時產生；失敗時**不讓整份匯出失敗**，改為略過封面（回報在結果裡）。

### 階段 4：command 與前端接線

**Rust**（`commands/export.rs`）：
- 新增 `ExportFormat { Pdf, Epub }`（serde `lowercase`）。
- `export_pdf_choose_path` → 改名 **`export_choose_path(format, suggestedName)`**：依格式設定對話框標題、副檔名與 filter；`ExportState.pending` 改存 `Option<(ExportFormat, PathBuf)>`。
- 新增 `export_epub(request) -> ExportResult`：取出 pending（格式不符視為未選位置）、`spawn_blocking` 產生、`.epub.tmp` → rename 寫入。
- `export_open_last` 不變（已經是通用的）。
- `lib.rs` 的 `generate_handler!` 註冊新 command。

**前端**：
- `project-types.ts`：`export type ExportFormat = "pdf" | "epub"`。
- `project-api.ts`：`chooseExportPath(format, suggestedName)`、`exportEpub(request)`。
- `use-project-commands.ts`：把 `exportImpl` 抽成共用的 `runExport(format, label)`，`ProjectCommands` 加 `exportEpub`。toast 文案沿用 PDF 的形式（`已匯出「xxx.epub」（N 頁）` + 「開啟」按鈕 + 略過圖片的警告）。
- `home-page.tsx`：`"file.exportEpub": () => void project.exportEpub()`。
- `commands.ts` / `menu-structure.ts` **不需要改**（項目已存在且沒有 `disabledReason`，也不加快捷鍵）。
- `editor-top-bar.tsx`：`EditorTopBarProps` 加 `onExportEpub`，在現有「匯出 PDF」按鈕**旁邊**再放一顆「匯出 EPUB」（不做下拉選單）。圖示用 lucide 的 `BookDown`（已確認存在於 lucide-react 1.x）。主要輸出是 EPUB，所以 EPUB 用 `Button` 預設樣式、PDF 改成 `variant="outline"`，兩顆按鈕並排時主次分明。
- `home-page.tsx`：`<EditorTopBar>` 補上 `onExportEpub={() => void project.exportEpub()}`。

### 階段 5：文件同步

- `CLAUDE.md`：「匯出 PDF」改寫為「匯出（EPUB / PDF）」，補 EPUB 的規則、新的 command 名稱、`RenderModel` 的角色；Tech Stack 加 `zip`；目錄結構加 `export/render.rs`、`export/epub/`。
- `docs/progress.md`：進度表、決定表（本文件第 2 節的四項）、待辦（手動驗證項目）。
- `fonts/README.md`：「未來還有 EPUB 匯出」改成已實作。
- `docs-website/`：`types.ts` 沒有變更，`types.html` 不用動。

---

## 6. 測試計畫

### 6.1 Rust 單元測試（沿用 `tests/fixtures/sample.magproj`）

| 測試 | 檢查什麼 |
|---|---|
| `epub_zip_layout` | `mimetype` 是第一個 entry、Stored、內容正確；`META-INF/container.xml` 存在 |
| `opf_lists_every_file` | manifest 涵蓋所有 entry（除 `mimetype` / `container.xml`），spine 順序等於頁面順序，`rendition:layout` = `pre-paginated` |
| `pages_are_well_formed_xml` | 每份 XHTML 用 `roxmltree` 解析成功（dev-dependency，已在相依樹中） |
| `user_text_is_data_not_markup` | 文字含 `<script>alert(1)</script> & "q"` 時原樣呈現、文件仍可解析（對應 PDF 的同名測試） |
| `renders_every_element_type` | 六種物件都產生對應節點；polygon / star 的頂點與 PDF 相同 |
| `missing_images_are_skipped_not_fatal` | 與 PDF 行為一致，回報 `skippedImages` |
| `embeds_only_used_font_families` | 只有被引用的家族進 EPUB，`@font-face` 與 manifest 一致 |
| `baseline_matches_css_line_box` | 用 `ttf-parser` 讀字型 ascent / descent，驗證 4.3 的兩個公式等值（守住「不需要額外校正」這個前提） |
| `svg_property_marks_pages_with_shapes` | 只有含 inline SVG 的頁面帶 `properties="svg"` |

`render.rs` 另外補 `build_render` 的測試（階段 1 由現有 PDF 測試改寫而來）。

### 6.2 vitest

前端改動很薄（多一個格式參數、多一個 handler），沒有值得新增的純邏輯測試；`buildExportRequest` 的既有測試已涵蓋 payload 組裝。若 `runExport` 抽出可測的純函式（例如格式 → 檔名／文案對應），再補一個測試檔。

### 6.3 手動驗證（Claude 無法代勞，列進 `progress.md` 的「待辦 → 使用者」）

1. **epubcheck**（Java 工具）跑一次匯出結果，必須 0 error。
2. 在 **Thorium Reader** 或 **Apple Books**、**Calibre** 開啟：頁面是固定版面、比例正確、不會被重排。
3. 文字**可選取、可複製、可搜尋中文**；字型是內嵌的 Noto Sans TC（不是閱讀器的預設字型）。
4. 與畫布**逐頁疊圖比對**：斷行位置一致；置中／靠右的文字沒有明顯偏移；旋轉物件、超出頁面的物件（應被頁緣裁掉）、多頁文件都正確。
5. 匯出到**中文路徑**；未命名專案匯出時預設位置是「文件\雜誌編輯軟體」。
6. 檔案大小與開啟速度在可接受範圍（決定要不要排子集化）。

---

## 7. 風險與已知限制

| 風險 | 影響 | 對策 |
|---|---|---|
| 閱讀器的行框基線與 canvas 量測有差異（`hhea` vs `OS/2` 度量來源不同） | 文字整體上下偏移零點幾 px | 6.1 的 `baseline_matches_css_line_box` 守住公式；手動疊圖比對確認；必要時在 `.t` 上加一次性的 `--baseline-fix` 位移 |
| 排版引擎對中文標點的處理（`text-spacing-trim`） | 標點附近位置偏移 | CSS 明確關閉；驗證時特別看標點密集的段落 |
| 舊閱讀器不支援 WebP（EPUB 3.3 才列為核心型別） | 圖片不顯示 | 列為已知限制；之後可在匯出時把 WebP 轉成 PNG |
| 中文字型讓 EPUB 多約 11.5 MB | 檔案大、開啟慢 | 先接受，再視 6.3 第 6 項決定是否做子集化 |
| `zip` 是新的相依套件 | 供應鏈與打包體積 | 只用 deflate；若評估後不想加，可用相依樹裡已有的 `flate2` 自寫約 120 行的 ZIP writer（EPUB 只需要 Stored + Deflate） |
| 封面由 Typst 畫、內文由閱讀器畫 | 兩者字距可能略有不同 | 封面只當縮圖使用 |
| 無出血、裁切線、CMYK | 不適合送印 | 與 PDF 相同的既有限制 |

---

## 8. 後續（不在這次範圍）

- **多語系**：語言碼目前是 `epub/package.rs` 的單一常數 `zh-TW`。要做多語系時，需要在文件模型或偏好設定加語言欄位，再往下傳給 `dc:language` 與 XHTML 的 `lang` / `xml:lang`；若之後允許「同一份文件混用語言」，還要能逐物件標記。
- 字型子集化（`subsetter` + `ttf-parser`），目標把中文字型降到數十 KB。
- 跨頁顯示：`rendition:spread` 與每頁的 `page-spread-left` / `page-spread-right`。
- 文件中繼資料 UI（作者、出版社、識別碼、語言）→ 需要動 `types.ts` / `format.rs` / `SCHEMA_VERSION`。
- 匯出 PNG / JPEG（`file.exportPng` / `file.exportJpeg` 仍是佔位）。
- PDF 改由同一份 `RenderModel` 走「EPUB → PDF」的衍生路徑（若 `plan-epubv2` 後續階段有此規劃）。
