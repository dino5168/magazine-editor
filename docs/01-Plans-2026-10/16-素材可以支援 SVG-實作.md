# 16 素材可以支援 SVG 實作計畫

任務檔：`16-素材可以支援 SVG.md`（不 commit）；本計畫要 commit。

## 1. 需求理解

- 現在素材（素材庫、「檔案 → 匯入 → 圖片」、底部工具列的圖片鈕）只收 PNG / JPEG / WebP / GIF。
- 要能匯入 **SVG**，像其他圖片一樣分類、放到頁面、拖到畫布，並且匯出 PDF / EPUB。

## 2. 現況盤點（2026-10-12）

內建「相片」面板的範例圖本來就是 SVG，所以**後端大半已經支援**，擋住使用者的是前端的格式檢查：

| 位置 | 現況 | 要改？ |
|---|---|---|
| 前端 `validation.ts` `ALLOWED_IMAGE_TYPES` | 只有 png / jpeg / webp / gif（測試還明確要求 SVG 被拒） | **要**：加 `image/svg+xml` |
| 前端 `library-files.ts` `KIND_OF_EXTENSION` | 沒有 `svg` → 素材庫匯入說「不是支援的檔案」，`LIBRARY_ACCEPT` 也沒有 | **要**：加 `svg: "image"` |
| 前端 `image.ts` `pickImageFiles` | 用 `ALLOWED_IMAGE_TYPES` | 跟著上面自動改好 |
| 前端 `loadImageSize` | `<img>` 的 naturalWidth / Height | SVG 沒寫寬高時尺寸不對（見第 3 節實測），**要補** |
| Rust `assets.rs` `detect_extension` | **已經認得 SVG**（開頭是 `<`、前 4 KB 有 `<svg`），存成 `assets/images/<hash>.svg` | 判斷太寬鬆（`<html><svg>` 也算），建議改嚴格（見 4.2） |
| Rust `format.rs` 路徑驗證 | 只看 `assets/images/<檔名>`，不看副檔名 | 不用改 |
| 縮圖 `thumbnails.rs` / `thumbnails.ts` | **SVG 已經直接用原圖**（有測試） | 不用改 |
| 畫布（Konva `Image`） | `<img>` 載入後 `drawImage` | 不用改（實測放大仍是向量，見第 3 節） |
| 匯出 PDF（Typst `image()`） | 依副檔名判斷格式，**Typst 本身支援 SVG**（usvg 0.47） | 不用改；但 Typst 解析失敗時會讓**整份匯出失敗**，要先檢查（步驟 1、2） |
| 匯出 EPUB `epub/mod.rs` `image_type` | 只認 png / jpeg / gif / webp，**SVG 會被略過**（算進 `skippedImages`） | **要**：加 `image/svg+xml`（EPUB 3 的核心媒體類型） |
| MCP `place_library_item` | 讀素材庫的圖片 | 不用改 |
| CSP | 圖片走 `asset:`，`<img>` 載 SVG 沒問題 | 不用改 |

**沿用、不重複造輪子**：檔頭判斷、hash 命名去重、素材庫流程、縮圖略過 SVG、Typst 的 SVG 引擎都照用；新的解析只用專案已有的套件（roxmltree 已在 dev-dependencies、usvg 已由 typst 引入），不新增第三方套件。

## 3. 已做的實測（無頭 Edge，和 WebView2 同引擎）

| SVG 寫法 | `naturalWidth × naturalHeight` | 說明 |
|---|---|---|
| `width="40" height="20"` | 40 × 20 | 正確 |
| `width="50mm" height="25mm"` | 189 × 94 | 以 96 dpi 換成 px（App 把 px 當 pt，等於 50 mm 的圖放成約 66.7 mm） |
| 只有 `viewBox="0 0 100 300"` | **50 × 150** | 比例對，但高度固定 150（瀏覽器的預設），不是 viewBox 的 100 × 300 |
| `width="100%"` + viewBox | 50 × 150 | 同上 |
| `width="300"` + viewBox 1:3 | 300 × 900 | 依比例補高度，正確 |
| 都沒有 | 300 × 150 | 瀏覽器預設 |
| 壞掉的 XML | `onerror` | 現有的「無法讀取圖片內容」會擋下 |

- **向量清晰**：2 × 2 px 的 SVG 畫到 400 × 400 的 canvas，邊界兩側是純黑 / 純白（沒有點陣放大的模糊）→ 畫布縮放時 SVG 仍清晰，不需要另外處理。

## 4. 設計建議與要確認的事

**使用者 2026-10-12 決定**（四項都照建議）：只有 viewBox 時用 viewBox 的寬高（4.1）；原檔照存、Rust 用 XML 解析確認根元素是 `<svg>`，不拒絕含 script 的檔案（4.2）；SVG 內的文字字型列為已知限制、只在文件說明（4.3）；素材卡片顯示「SVG」標籤（4.5）。

### 4.1 SVG 的大小（只寫 viewBox 時）

建議：**有寫寬高就照瀏覽器的 natural size；寬高都沒寫（或是 %）時，改用 viewBox 的寬高**（例如 viewBox `0 0 100 300` → 100 × 300 pt）。用瀏覽器內建的 `DOMParser` 讀根元素的屬性，不自己寫解析器。之後放到頁面照舊「最多佔頁面的一半，只縮不放」（`createImageElement`）。

### 4.2 安全：SVG 可以帶 `<script>`

- App 裡 SVG 只透過 `<img>` / canvas 顯示，**`<img>` 裡的 SVG 不執行 script、不載外部資源**；EPUB 也用 `<img>` 引用；Typst 不執行 script，讀檔仍受 `ExportWorld` 沙箱限制（只能讀 `assets/images/*`）。
- 建議：**原檔照存、不改內容**（hash 去重才穩定），但 Rust 的判斷改成「用 XML 解析，根元素必須是 `<svg>`」，取代現在的字串比對。
- 可選：拒絕含 `<script>` 的 SVG（多一層保險；代價是某些從網頁存下來的圖會被拒）。

### 4.3 SVG 內的文字字型

- 畫布（瀏覽器）畫 SVG 裡的 `<text>` 用的是**這台電腦的系統字型**；PDF（Typst）只有 App 內嵌的字型（`fonts/`）→ 含文字的 SVG，**畫面和 PDF 的字可能不同**。EPUB 由閱讀器決定。
- 建議：列為**已知限制**，文件中說明「含文字的 SVG 建議先在繪圖軟體把文字轉成外框」。不做文字轉路徑（要自己處理字型，太大）。

### 4.4 Typst 讀不懂的 SVG

Typst 的 SVG 引擎（usvg）和瀏覽器支援的範圍不同；一張解析失敗的 SVG 會讓**整份 PDF 匯出失敗**。建議：匯出前用 Typst 自己的 SVG 解析先檢查，失敗的照「圖片遺失」的做法略過並回報 `skippedImages`（不讓整份匯出失敗）。步驟 1 先實測失敗時的行為。

### 4.5 其他

- 不支援 `.svgz`（壓縮的 SVG）。
- 建議素材卡片右下角顯示「SVG」格式標籤（`kindBadge` 目前只給非圖片），讓使用者分得出向量圖。
- 大小上限沿用圖片的 20 MB。

## 5. 步驟（一次一步，每步停下等確認）

### 步驟 1：實測 Typst 與 EPUB（不改程式）
- 用 `export_preview`（`#[ignore]`）+ 臨時測試資料：一般 SVG、只有 viewBox、mm 單位、含 `<text>`、含外部 `<image href>`、Typst 讀不懂的 SVG。看 PDF 的大小 / 比例是否和畫布一致、失敗時是整份失敗還是只少一張。
- EPUB：手動把 SVG 放進 EPUB 的 `<img>`，在 Edge 開啟確認顯示。
- 結果決定步驟 2 的略過邏輯要不要做。

**結果（2026-10-12 完成；暫時的 `#[ignore]` 測試把 14 種 SVG 放進 400 × 200 的圖片物件跑 `render_pdf` + `typst_render`，跑完已移除；`<img>` 用無頭 Edge 截圖）**：

| SVG | PDF（Typst 0.15.1） | `<img>`（畫布 / EPUB） |
|---|---|---|
| 一般（寬高）、mm 單位、`<filter>` 模糊、沒有 `xmlns`、含 `<script>` | 正常；填滿物件外框（`fit: "stretch"`，和 Konva `drawImage` 相同） | 正常；script 不執行 |
| 只有 viewBox（1:3 放進 2:1 的框） | 拉伸填滿外框 | 同樣拉伸（第 3 節的實測） |
| data URI 內嵌圖片 | 正常 | 正常 |
| `<text font-family="Arial">` | **文字消失**：Typst 只找內嵌字型，找不到就退回「SVG 所在位置的字型」，模板沒有設預設字型所以什麼都沒畫 | 用系統的 Arial |
| `<text font-family="Noto Sans TC">` | 正常 | 正常 |
| 連到相對路徑的圖片（`href="other.png"`） | 經 `ExportWorld` 讀到 `assets/images/other.png` 並畫出 | **不載入**（`<img>` 裡的 SVG 不讀外部資源） |
| 連到 `../../secret.png` | **整份匯出失敗**（access denied，沙箱有效） | 不載入 |
| 連到絕對路徑（`file:///C:/…`，Inkscape「連結」圖片常見） | **整份匯出失敗**（absolute paths are not allowed） | 不載入 |
| 寬高為 0 | **整份匯出失敗**（width, height, or viewbox is invalid） | — |
| XML 壞掉 | **整份匯出失敗** | `onerror`，匯入時就擋下 |

**結論**：
1. **要做略過**：Typst 讀不了的 SVG 會讓整份 PDF 失敗。步驟 2 在排版前用 Typst 自己的 `SvgImage::with_fonts_images`（`image()` 用的同一個函式、同一個 `ExportWorld`）逐張檢查，失敗的不畫、算進 `skippedImages`，和找不到檔案相同。
2. **SVG 文字要有退回字型**：模板畫圖片時包在 `text(font: ("Geist", "Noto Sans TC"))` 裡（App 的預設黑體）。實測 Arial 的文字因此畫成黑體。和畫布用的系統字型仍不同（已知限制，4.3）。
3. 連到其他 `assets/images/` 檔案的 SVG：PDF 會畫、畫布不畫。專案裡的檔名是 hash，實際上碰不到，列為已知限制、不處理。
4. EPUB 用 `<img>`，和畫布同一個引擎，行為一致；步驟 2 只要把 SVG 加進 `image_type`。

### 步驟 2：Rust（匯入判斷、EPUB、PDF 保護）
- `assets.rs`：`detect_extension` 的 SVG 判斷改成 XML 解析、根元素是 `svg`（`roxmltree` 從 dev-dependencies 移到 dependencies）。
- `epub/mod.rs`：`image_type` 加 SVG（`image/svg+xml`, `svg`）。
- `pdf.rs`：排版前用 `SvgImage::with_fonts_images` 檢查每張 SVG，失敗 → 從 render model 拿掉、算進 `skippedImages`。
- `template.typ`：圖片包在預設字型裡（SVG 文字的退回字型）。
- 測試：判斷真假 SVG、EPUB 收錄 SVG（manifest 的 media-type）、PDF 匯出含 SVG 成功、壞 SVG / 絕對路徑連結只略過、Arial 文字有畫出來。

**完成（2026-10-12）**：
- `Cargo.toml`：`roxmltree 0.21` 從 dev-dependencies 移到 dependencies；新增 `comemo 0.5.1`（typst 0.15.1 用的同一版，`SvgImage::with_fonts_images` 要 `Tracked<dyn World>`，typst 沒有 re-export）。
- `project/assets.rs`：`is_svg`（UTF-8、可有 BOM、`allow_dtd`（舊版 Illustrator 的 `<!DOCTYPE svg …>`）、根元素是 SVG namespace 的 `<svg>`；沒有 namespace 的瀏覽器不顯示，所以也不收）；`detect_extension` 改成 `pub(crate)`，拿掉前 4 KB 字串比對。XML 宣告前面有空白是不合法的 XML，照樣拒絕。
- `export/epub/mod.rs`：`image_type` 改用 `detect_extension` 再對應 media type（加 `image/svg+xml`），不再重複寫一份檔頭判斷。
- `export/pdf.rs`：`drop_undrawable_svgs` 在排版前用 Typst 的 `SvgImage::with_fonts_images`（和 `image()` 同一個函式、同一個沙箱 `ExportWorld`；同一張只檢查一次）檢查每個 SVG 圖片物件，讀不了的從 render model 拿掉、算進 `skippedImages`；`SVG_FALLBACK_FONTS`（`Geist`、`Noto Sans TC`）以 `data.svgFonts` 傳給模板。`world.rs` 的 `file_id` 改成 `pub(super)`。
- `template.typ`：圖片包在 `text(font: data.svgFonts, …)` 裡。
- 前端：匯出後的提示改成「有 N 張圖片找不到檔案或無法輸出（例如 SVG 連結了外部檔案），已略過」（`ExportOutput.skipped_images` 的說明一起改）。
- 測試（新增 5 個）：`detects_svg_by_its_root_element`、EPUB `svg_images_are_included`、PDF `svg_images_typst_cannot_draw_are_skipped_not_fatal`（寬高 0、絕對路徑、`../`、壞 XML、同一張壞圖用兩次 → 略過 5 個、好的照畫）、`svg_images_are_drawn_and_their_text_falls_back_to_the_default_font`（只有 viewBox 的 SVG 填滿外框；Arial 文字有畫出來）、`bundled_sample_photos_are_svg_typst_can_draw`（內建六張相片）。`cargo test` 160 個通過（另 3 個 ignored），clippy 沒有新增警告，`npm run build` 通過。

### 步驟 3：前端（接受 SVG、尺寸）
- `validation.ts`：`ALLOWED_IMAGE_TYPES` 加 `image/svg+xml`、錯誤訊息加 SVG；改掉「SVG 被拒」的測試。
- `library-files.ts`：`svg: "image"`（`LIBRARY_ACCEPT` 自動帶上）。
- `image.ts`：SVG 尺寸（4.1）的純函式（解析 SVG 文字 → 寬高或 null）+ vitest；`use-library-import.ts` 匯入 SVG 時使用。
- （4.5）`kindBadge` 對 SVG 回傳「SVG」。

**完成（2026-10-12）**：
- `validation.ts`：`ALLOWED_IMAGE_TYPES` 加 `image/svg+xml`（「檔案 → 匯入 → 圖片」與底部工具列的選檔對話框 `pickImageFiles` 跟著接受），錯誤訊息列出 SVG。
- `library-files.ts`：`svg: "image"`（`LIBRARY_ACCEPT` 跟著帶上）。
- `image.ts`：`svgViewBoxSize`（純函式：寬、高都不是絕對長度（沒寫、`%`、`auto`）時回傳 viewBox 的寬高，否則 null = 用瀏覽器的值）與 `svgIntrinsicSize`（用瀏覽器的 `DOMParser` 讀根元素的屬性）。`use-library-import.ts` 匯入 `.svg` 時用它覆蓋 natural size（素材庫的 `width` / `height`、放到頁面的大小都跟著對）。內建相片都有寫寬高，`importBundled` 不用改。
- `library-card.tsx`：`kindBadge` 對 SVG 圖片回傳「SVG」（桌面版看 `src`，瀏覽器模式看名稱，同文字 / 音訊的做法）。
- 測試：新檔 `image.test.ts`（3 個：用 viewBox、有寬高時照瀏覽器、viewBox 不能用）；`validation.test.ts` 改成 SVG 被接受、`.svgz` 被拒；`kindOfFile` 加 `.SVG` / `.svgz`。vitest 604、`npm run build` 通過。

### 步驟 4：畫面驗證（瀏覽器模式腳本 + 桌面版）
- 素材面板 / 管理視窗匯入 SVG、從檔案總管拖進來、放到頁面、拖到畫布、縮放清晰度、「檔案 → 匯入 → 圖片」。
- 桌面版：存檔、重開、縮圖（用原圖）、匯出 PDF / EPUB 疊圖比對。

**瀏覽器模式完成（2026-10-12，無頭 Edge + CDP 腳本，12 項全過）**：
- 拖四個檔案到素材面板（viewBox-only、有寬高、`<html>` 假 SVG、壞 XML）：只收兩張真的；假的與壞的各一則「無法讀取圖片內容」；兩張卡片都有「SVG」標籤。
- 點卡片放到頁面中央：viewBox `0 0 100 300` → **100 × 300**（瀏覽器的 natural size 是 50 × 150）；`width="200" height="100"` → 200 × 100。
- 清晰度：200 px 的 SVG 以 Konva `toCanvas({ pixelRatio: 8 })`（實際放大 6.3 倍）畫，黑白交界的過渡像素 0 個 → 畫布縮放時仍是向量。
- 底部工具列「圖片」（和「檔案 → 匯入 → 圖片」同一個 `importImage`）：選檔對話框的 `accept` 含 `image/svg+xml`，viewBox `0 0 50 40` → 50 × 40。
- 素材面板「匯入...」：`accept` 含 `.svg`；`64mm × 32mm` 拖到畫布 → 242 × 121（瀏覽器以 96 dpi 換成 px，App 再當 pt，比例 2:1 正確）。

**桌面版待使用者驗證**（瀏覽器模式不經過 Rust、沒有存檔與匯出）：匯入 SVG（Rust 的 `is_svg`）、存檔重開、素材卡片用原圖（不做縮圖）、匯出 PDF / EPUB 的外觀（Rust 測試已確認：SVG 填滿外框、沒內嵌字型的 SVG 文字畫成預設黑體、讀不了的 SVG 只略過並提示）。

### 步驟 5：文件
- `CLAUDE.md`（「匯入的圖片只接受 PNG / JPEG / WebP / GIF」等處）、`docs/progress.md`、本計畫的結果與已知限制（4.3）。

**完成（2026-10-12）**：`CLAUDE.md`（目前階段、Tech Stack 的 Backend、「其他注意事項」的圖片格式、「素材管理」新增 SVG 一項與匯入的檢查、「匯出 PDF」新增 SVG 圖片一項）、`docs/01-overview.md`（加入圖片的格式與 SVG 文字的提醒）、`docs/progress.md`。`docs/02-architecture.md` 沒有提到圖片格式、`types.ts` 沒改，不用更新。

## 7. 已知限制（總整理）

- SVG 裡的文字：畫布用系統字型，PDF 用內嵌字型（找不到就用預設黑體），字形可能不同；EPUB 由閱讀器決定。建議在繪圖軟體先把文字轉外框。
- SVG 連到另一個 `assets/images/` 檔案時，PDF 會畫、畫布與 EPUB 不畫（專案的檔名是 hash，實際碰不到）。
- 連到絕對路徑或專案外圖片的 SVG：畫布上那張連結的圖不顯示，PDF 略過整張 SVG（並提示）。
- 不支援 `.svgz`。
- 用 mm / in 寫寬高的 SVG：瀏覽器以 96 dpi 換成 px，App 再當成 pt，放到頁面時是原尺寸的 4/3（和點陣圖「1 px = 1 pt」的規則一致）。

## 6. 檢核

- 前端兩處白名單（MIME 與副檔名）要一起改，否則「檔案 → 匯入 → 圖片」與素材庫的行為不一致 → 步驟 3 一起改。
- SVG 的 MIME 由瀏覽器依副檔名給（`image/svg+xml`），真偽由 Rust 檢查，和其他格式相同。
- 已存在的專案不受影響：檔案格式（`schemaVersion`、`library.json`）**都不用改**，`src` 本來就允許 `.svg`。
- 舊版 App 開啟含 SVG 的專案：本來就能顯示（範例相片就是 SVG），沒有相容問題。
- 開檔清理、去重、垃圾桶都以 `src` 為準，SVG 和其他圖片相同。
