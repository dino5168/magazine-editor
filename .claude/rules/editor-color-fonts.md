---
paths:
  - "src/lib/editor/palette.ts"
  - "src/lib/editor/swatch*.ts"
  - "src/lib/editor/*font*.ts"
  - "src/lib/editor/use-fonts-ready.ts"
  - "src/components/editor/color-picker.tsx"
  - "src/components/editor/document-swatches.tsx"
  - "src/components/editor/manage-fonts.tsx"
  - "src/components/app/settings/*font*.tsx"
  - "src/components/app/settings/collection-face-dialog.tsx"
  - "src/components/app/settings/swatches-dialog.tsx"
  - "src/components/app/font-license-dialog.tsx"
  - "src-tauri/src/project/*font*.rs"
  - "src-tauri/src/export/document_fonts.rs"
  - "src-tauri/src/commands/fonts.rs"
  - "src-tauri/fonts-catalog.json"
  - "fonts/README.md"
  - "src/index.css"
---

# 編輯器：調色板、文件色票、專案字型

### 調色板（`color-picker.tsx` + `lib/editor/palette.ts`）

計畫與決定：`docs/01-Plans/imp-color-picker.md`；文件色票區：`docs/01-Plans-2026-10/17-文件色票-實作.md`。

- 調色板有兩區：上面是**文件色票**（見「文件色票」，只在 `DocumentSwatchesProvider` 裡顯示），下面是 **Tailwind v4 原色庫**（經典 22 個色系 × 11 階深淺 + 黑、白）。**調色板沒有 hex 輸入**：自訂顏色一律先在「設定 → 文件 → 色票...」建成有名字的色票（2026-10-12 起，取代 2026-09-30「只能從 Tailwind 選」）。不在 Tailwind 色票裡的顏色照常顯示與匯出，只是不會標示位置。
- `onCommit(color, swatchId)`：點色票 = `swatchColor(目前顏色, 色票)`（色票 RGB + 目前的透明度）並連結；點 Tailwind / 黑白 = 取消連結（`null`）；拖不透明度 = 保留連結。連到色票時標題顯示色票名稱、只標示色票的格子。
- `palette.ts` 的資料照抄 Tailwind 的 oklch，載入時用 `oklchToHex` 換成 hex；**模型只存 hex**，Rust 驗證與匯出不認識 oklch。超出 sRGB 的顏色以「保持明度與色相、降低彩度」處理，少數飽和色和 Tailwind 官方 hex 差幾個數值。
- **顏色格式**：物件的 `fill` 是 `#rrggbb` 或 `#rrggbbaa`（完全不透明時一律寫 6 位，`withAlpha` 負責）；頁面背景只能是 `#rrggbb`。TS `isElementColor` / `isHexColor` 與 Rust `require_element_color` / `require_background_color` 規則必須一致。
- `ColorPalette` 是本體（背景面板直接內嵌，`allowAlpha={false}`）；`ColorPicker` 是按鈕 + 受控 Popover（屬性面板的填色、邊框、文字顏色）。Popover 內容是 `role="dialog"`，編輯器快捷鍵不會在裡面觸發。按「管理色票...」時先關 Popover（`onManageStart`），否則對話框關掉後調色板點不開。

### 文件色票（`lib/editor/swatches.ts` / `swatch-draft.ts` + `document-swatches.tsx` / `settings/swatches-dialog.tsx`）

計畫與決定：`docs/01-Plans-2026-10/17-文件色票-實作.md`（評估與 Q1–Q8：`docs/Plans-Color-System/Color-System.html`）。參考 InDesign 的色票。

- **範圍**（使用者決定）：只做文件裡的具名 sRGB 顏色；PANTONE / 專色、CMYK、ICC、色票匯入匯出、群組、別名、跨專案色票庫、「色票」工具面板、即時預覽都不做。格線 / 參考線（App 偏好）不能連色票。
- **模型**：見「文件模型」的文件色票。**色票不透明**（`#rrggbb`），透明度存在使用處：連到色票的欄位實際值 = 色票 RGB + 自己的透明度（`swatchColor`）。陣列順序 = 顯示順序；可以兩個色票同色、數量不設上限。名稱上限 `SWATCH_NAME_MAX_LENGTH`（50，`validation.ts` / `format.rs`）。
- **規則與驗證**：檔案驗證（TS `isSwatchList` / Rust `validate_swatches`、`require_swatch`）只檢查格式與**引用存在**；reducer 另外要求連結的 RGB = 色票（`hasValidSwatchLinks`），所以連結的顏色永遠對得上。
- **`mapColorSlots(document, update)` 是唯一走過所有顏色欄位的地方**：頁面與主頁的物件（文字 fill / shadow、圖形 fill / stroke / label fill / label shadow）、頁面與主頁背景、文字樣式的 fill / shadow、頁碼規則的 fill / shadow / stroke。`swatchUsage`、`applySwatchEdits`（改色 / 刪除）都建在它上面，**新增帶顏色的欄位時要在這裡補**（測試以 fixture 的連結數守著）。
- **改色票 = 所有連結處一起變**（一筆復原，保留各自的透明度）；刪除時換成另一個色票或「不替換」（保留顏色、取消連結）。
- **文字樣式**：`fill` 與 `fillSwatchId` 當成**一個欄位**比較（`sameStyleValue`）：同色但連結不同 = 「顏色」覆寫；`restyle` 兩者一起跟。改色票時樣式與連到它的文字一起變，不會多出覆寫。
- **預設**：新文件（`createBlankDocument` / `createSampleDocument` 的 `newDocumentStyles`）帶「文字」`#171717` / 「黑」/ 「白」（固定 id `swatch-text` / `swatch-black` / `swatch-white`，`BUILT_IN_SWATCH_IDS`），內建三個文字樣式連到「文字」；頁面背景不連。**舊檔讀成沒有色票**；`defaultTextStyles()` 與 `default-text-styles.json` 不連（舊檔升級用）。文字面板與文字工具建立的文字照樣式連到色票，`createTextElement`（MCP 沒給樣式、素材庫文字檔）不連。
- **UI**：
  - 調色板的「文件色票」區（見「調色板」）：色票來自 `DocumentSwatchesProvider`（屬性面板、背景面板、頁碼管理與文字樣式對話框包著）；「格線與參考線」偏好對話框沒包，所以沒有這一區。文件沒有色票時顯示「這份文件還沒有色票。」。
  - 「管理色票...」按鈕由 `ManageSwatchesProvider`（`home-page.tsx`）開「色票...」對話框。**頁碼管理、文字樣式對話框裡不顯示**（`manage={false}`）：它們有自己的草稿，在下面改色票會讓草稿顏色過期、「確定」時被 reducer 擋下。
  - 「設定 → 文件 → 色票...」（`settings.swatches`）：所有修改都是草稿（`swatch-draft.ts`），「確定」一次 `swatch/applyEdits`、「取消」/ Esc 放棄。hex 輸入 Enter / 失焦才讀（`parseSwatchHex`：`#` 可省略、大小寫、3 位數展開，存小寫）；名稱重複或空白時停用「確定」；把手拖曳或 ↑ / ↓ 排序；刪除有人用的色票先問替換（草稿裡 A 換成 B、B 又被刪時 A 跟著改，草稿永遠能被 `applySwatchEdits` 接受）。使用數 = 文件裡的使用數 + 草稿換過來的。
- **匯出、畫布、量測都不用改**：它們只讀實際的 hex。

### 專案字型（`lib/editor/project-fonts.ts` / `font-draft.ts` / `fonts.ts` + `settings/fonts-dialog.tsx` + Rust `project/fonts.rs`、`export/document_fonts.rs`）

計畫、實測與決定：`docs/05-Plans-字型/01-專案字型-實作.md`；字型集合、系統字型、下載免費字型：`02-字型管理問題-實作.md`。內建四套字型（`fonts/`）不變；專案字型是使用者加入**這個專案**的 TTF / OTF，存在 `assets/fonts/`，跟著專案資料夾走。

- **範圍**（使用者決定）：一般檔必要、粗體檔可選（任何字重）；只收靜態字型（可變字型、`.woff(2)` 拒絕；`.ttc` 選一個拆成單一字型，2026-10-21）；授權 `fsType` 禁止嵌入 / 只能嵌入點陣圖拒絕，「預覽與列印」「可編輯」可以匯入但提醒；「設定 → 文件 → 字型...」對話框；MCP 能查詢與選用，不能匯入。
- **模型**：見「文件模型」的 v13 與 `docs-website/types.html`。**家族名稱由程式決定**：一律 `project-font-<id>`，不管檔案自己叫什麼（Typst 依檔案名稱分組造成的問題——找不到粗體、讀到中文名稱——都不會發生，也不用改字型檔）。文字照舊存 CSS 字串 `"project-font-<id>", "Noto Sans TC" / "Noto Serif TC", <generic>`（`projectFontOption`；後備是同類的內建中文字型），**只比第一個家族名稱**認字型（`usesProjectFont` / `findFontOption(family, fonts)`）。
- **粗體**：沒有粗體檔時，一般檔也登記成 700（瀏覽器 `FontFace` 與 Typst 的 FontBook 都是）。**不能省**：只登記 400 時 Chromium 會模擬加粗（實測墨水多 41%），Typst 不會，畫面和 PDF 就不一樣。
- **基線**：匯入時記下畫布（Windows 引擎）用的 ascent / descent（`USE_TYPO_METRICS` 時 typo，否則 win），`FontFace` 與 EPUB / 翻頁書的 `@font-face` 都寫成 `ascent-override` / `descent-override`（值 = 畫布的，所以畫布不變）。**Safari / Apple Books 不支援 override**：`hhea` 和 Windows 度量不同的字型在 Apple 裝置的 EPUB / 翻頁書基線會偏（`appleBaselineShift`，對話框提示；PDF 不受影響）。這是已知限制（使用者決定不改字型檔）。
- **載入**（`use-fonts-ready.ts`）：專案字型是多一種 `FontOption`（`project` 欄位）；`loadFontOption` 先 `new FontFace(family, url(asset URL), projectFontDescriptors(...))` 加進 `document.fonts` 再 `load`。asset URL 由 `setFontUrlResolver`（`ProjectProvider` **在 render 裡**設定：子元件的 effect 先跑）。CSP `font-src` 有 asset protocol。呼叫 `useFontsReady` / `loadFontFamily` 時要傳 `document.fonts`。
- **編輯**：`font/applyEdits`（對話框的草稿一次寫入）與 `font/add` / `update` / `delete`，各一筆復原。`mapFontFamilies` 是唯一走過所有字型欄位（文字、圖形內文字、文字樣式、頁碼）的地方，**新增帶字型的欄位時要在這裡補**。刪除使用中的字型要指定替代（內建或另一套）；改後備種類時所有使用處的字串一起換。名稱不可和內建字型（黑體…）相同。
- **字型選單**（`FontFamilySelect`）：有專案字型時分「內建 / 專案字型」兩區，最下面「管理字型...」（`ManageFontsProvider`；頁碼管理、文字樣式對話框裡沒有：它們有自己的草稿）。粗體按鈕在沒有粗體檔時提示。
- **匯入**（Rust `font_import`，raw body；`.ttc` 的第幾個放 header `x-font-index`）：`project/fonts.rs` 的 `analyze` 檢查並讀出名稱、字重、授權、度量；**Typst 讀不了的字型也拒絕**（否則 PDF 整段沒字）。上限 64 MB。匯入時就寫進 `assets/fonts/`（同檔只存一份）；對話框取消時檔案留著，下次開檔清理。
- **匯出**：見「匯出 PDF」的字型。只收錄文字用到的；字型檔不見時那套略過、文字用後備（不讓匯出失敗）。
- **三種加入方式**（2026-10-21，使用者決定；結果都是一般的專案字型，檔案格式不變）：
  - **匯入字型檔**：可多選、可從檔案總管拖進「字型」對話框（`SettingsDialog` 的 `onDropFiles`）；同家族的檔案配成一般 + 粗體（`pairImportedFonts`，規則同系統字型），斜體與其他字重各自一套。
  - **字型集合（.ttc）**：前端看檔頭 → `font_collection_faces`（只做可變 / 授權的快速檢查）→ 兩個以上能用時問用哪一個 → `font_import` 帶 header `x-font-index`。Rust `prepare` 把那一個字型重組成單一 sfnt（表格原樣、重算檢查碼），並**清掉簡單字形旗標的保留位元 bit 7**（所有 TrueType 字型都做）：新細明體設了它，Chrome 的 OTS 會整個拒絕。
  - **從系統字型加入**：`system_fonts_list` 掃 `%WINDIR%\Fonts` 與 `%LOCALAPPDATA%\Microsoft\Windows\Fonts`（只讀需要的表格；快取 `system-fonts.json`，393 個字型冷 2.2 秒 / 快取 30 ms），前端只拿 id；`font_import_system(regular, bold)`。前端 `groupSystemFonts` / `pairFaces` 自動配對（微軟正黑體 = msjh.ttc + msjhbd.ttc）。
  - **下載免費字型**：`src-tauri/fonts-catalog.json` 的精選清單（11 套 SIL OFL，見 `fonts/README.md`）；`font_catalog_download(id)`：網址只來自清單（固定版本），下載檔與字型檔都要符合 SHA-256 與大小，存在本機快取 `font-cache/<SHA-256>.<ext>`（其他專案不必再下載），進度 `font-catalog://progress`、`font_catalog_cancel`、`font_catalog_cached`。名稱用清單的（檔案裡的可能是「源樣黑體月」）。
  - 加入前前端先用丟棄式的 `FontFace` 試載（`checkFontFileLoads`），瀏覽器拒絕就不加入。
- **授權提醒**：匯出翻頁書前，文字 / 圖形內文字 / 頁碼用到的專案字型裡有**不是精選清單**的檔案（系統字型、自己的檔）時，選存檔位置之前先問（`fontsToCheckBeforePublishing`、`useFontLicenseDialog`，不阻擋）。清單字型由存進專案的檔名（內容雜湊前 32 碼）認出來，所以清單字型必須原樣保存。PDF / EPUB 照嵌入規則，不問。
- 不做（之後另排）：字型子集化（和 EPUB 一起）、網頁字型 / 可變字型、App 自己的字型庫、增加內建字型、Google Fonts、安裝到 Windows、macOS 的系統字型、MCP 匯入字型。

## 檔案（原 CLAUDE.md「目錄結構」）

```
    app/font-license-dialog.tsx   # 匯出翻頁書前「請確認字型授權」（用到不是精選清單的專案字型時；Promise 形式，取消 / 繼續匯出）
      fonts-dialog.tsx            # 「字型」：專案字型列表（預覽、一般 / 粗體、使用數、刪除）、三種加入方式（從系統字型加入 / 下載免費字型 / 匯入字型檔：可多選、同家族配成一般 + 粗體、拖放到對話框、.ttc 選字型）、名稱 / 缺字用的後備 / 粗體檔「選擇檔案...」、授權與 Apple 基線提醒；草稿在 font-draft.ts，「確定」一次 font/applyEdits，刪除使用中的字型先問換成哪一套
      system-font-picker.tsx      # 「從系統字型加入」：依家族的清單（搜尋、只看中文、系統字型名稱畫預覽）、自動配對的一般 / 粗體可改
      font-catalog-picker.tsx     # 「下載免費字型」：精選清單（分類、大小 / 已下載 / 已加入）、官方網站、下載進度與取消
      collection-face-dialog.tsx  # 匯入 .ttc 時「選擇字型」（集合裡兩個以上能用時才問）
      swatches-dialog.tsx         # 「色票」：列表（把手排序、使用數、刪除）、新增、名稱 / hex / Tailwind 改色、刪除使用中的色票先問替換；草稿在 swatch-draft.ts，「確定」一次 swatch/applyEdits（見「文件色票」）
      color-picker.tsx            # 調色板：ColorPalette（文件色票區（在 DocumentSwatchesProvider 裡才有）+ Tailwind 色系 / 深淺 / 不透明度；onCommit(color, swatchId)）與 ColorPicker（按鈕 + 受控 Popover）
      manage-fonts.tsx            # ManageFontsProvider（home-page 接到「字型...」對話框；頁碼管理、文字樣式對話框包一個沒有 handler 的，不顯示「管理字型...」）、useManageFonts
      document-swatches.tsx       # DocumentSwatchesProvider（調色板顯示文件色票；manage={false} 不顯示「管理色票...」）、ManageSwatchesProvider（home-page 接到「色票...」對話框）、useDocumentSwatches
      palette.ts                  # Tailwind 色票（oklch → hex）、findPaletteColor、colorAlpha / withAlpha
      swatches.ts                 # 文件色票的純邏輯：內建色票（BUILT_IN_SWATCH_IDS / defaultSwatches）、名稱 / hex（swatchNameError、nextSwatchName、parseSwatchHex）、走過每個顏色欄位 mapColorSlots、swatchUsage、swatchColor（色票 RGB + 使用處透明度）、hasValidSwatchLinks、applySwatchEdits / updateSwatch / deleteSwatch
      system-fonts.ts             # 系統字型清單的純邏輯：依家族分組（中文名稱在前）、pairByWeight（一般 ≈ 400、粗體 ≥ 600 且 ≈ 700；匯入多個檔案時也用）、搜尋
      font-catalog.ts             # 精選清單（import src-tauri/fonts-catalog.json）：分類、下載大小、由存進專案的檔名認出清單字型（catalogFontOfFile）、清單的名稱與後備、fontsToCheckBeforePublishing（翻頁書的授權提醒）
      project-fonts.ts            # 專案字型的純邏輯：名稱（fontNameError：也不可和內建字型同名）、defaultFontName、mapFontFamilies（唯一走過所有字型欄位的地方）、fontUsage、add / update / delete / applyFontEdits
      font-draft.ts               # 「字型」對話框的草稿（同 swatch-draft.ts：匯入、改名、後備、粗體、刪除含連鎖替換、草稿使用數、名稱錯誤）
      swatch-draft.ts             # 「色票」對話框的草稿（新增 / 改名改色 / 排序 / 刪除含連鎖替換、草稿使用數、名稱錯誤）
      fonts.ts                    # FONT_OPTIONS（可選的字型）、專案字型的選項（projectFontOption：`"project-font-<id>", <同類內建中文字型>, <generic>`；findFontOption 只比第一個家族名稱）、文件用到的字型、載入參數、projectFontDescriptors（FontFace 的 weight 與 ascent / descent override）
      use-fonts-ready.ts          # 字型用到才載入：loadFontOption（專案字型先用 FontFace API 登記：一般 = 400、粗體檔或一般檔 = 700）、useFontsReady（畫布等字型）、setFontUrlResolver（ProjectProvider 在 render 裡設定 asset URL）
  fonts-catalog.json              # 「下載免費字型」的精選清單（Rust include_str!、前端 font-catalog.ts 共用；固定版本的網址 + SHA-256；增減見 fonts/README.md 的「精選清單」）
```
