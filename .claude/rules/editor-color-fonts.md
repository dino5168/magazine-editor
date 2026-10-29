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

精簡前的完整原文（範圍決定、實測數字、各對話框的操作）：`docs/progress-archive/rules-2026-10/editor-color-fonts.md`。計畫：`docs/01-Plans/imp-color-picker.md`、`docs/01-Plans-2026-10/17-文件色票-實作.md`、`docs/05-Plans-字型/01-專案字型-實作.md`、`02-字型管理問題-實作.md`。

## 調色板（`color-picker.tsx` / `palette.ts`）

- 兩區：文件色票（只在 `DocumentSwatchesProvider` 裡）+ Tailwind v4 原色庫。**沒有 hex 輸入**：自訂顏色先建成色票。
- `onCommit(color, swatchId)`：點色票 = `swatchColor`（色票 RGB + 目前透明度）並連結；點 Tailwind / 黑白 = `null`；拖不透明度 = 保留連結。
- `palette.ts` 抄 Tailwind 的 oklch，載入時 `oklchToHex`；**模型只存 hex**（Rust 不認識 oklch）。
- **顏色格式**：物件 `#rrggbb` 或 `#rrggbbaa`（不透明時一律 6 位，`withAlpha`）；頁面背景只能 `#rrggbb`。TS `isElementColor` / `isHexColor` ↔ Rust `require_element_color` / `require_background_color` 一致。
- `ColorPalette` 是本體（背景面板 `allowAlpha={false}`）；`ColorPicker` = 按鈕 + 受控 Popover（`role="dialog"`，快捷鍵不觸發）。按「管理色票...」先關 Popover（`onManageStart`），否則對話框關掉後點不開。

## 文件色票（`swatches.ts` / `swatch-draft.ts` / `document-swatches.tsx` / `settings/swatches-dialog.tsx`）

- 只做具名 sRGB；**色票不透明**，透明度存在使用處（`swatchColor`）。名稱上限 `SWATCH_NAME_MAX_LENGTH`（`validation.ts` / `format/mod.rs`）。格線 / 參考線偏好不能連色票。
- 檔案驗證（`isSwatchList` / Rust `validate_swatches`、`require_swatch`）只查格式與引用存在；reducer 另要求連結的 RGB = 色票（`hasValidSwatchLinks`）。
- **`mapColorSlots(document, update)` 是唯一走過所有顏色欄位的地方**（`swatchUsage`、`applySwatchEdits` 建在它上面）：**新增帶顏色的欄位要在這裡補**（fixture 的連結數測試守著）。
- 改色票 = 所有連結處一起變（一筆復原）；刪除時換成另一個色票或取消連結。
- 文字樣式：`fill` + `fillSwatchId` 當**一個欄位**比較（`sameStyleValue`）。
- 預設：新文件帶 `BUILT_IN_SWATCH_IDS`（`swatch-text` / `swatch-black` / `swatch-white`），內建文字樣式連到「文字」。**舊檔讀成沒有色票**；`defaultTextStyles()` / `default-text-styles.json` 不連（升級用）；`createTextElement`（MCP、素材文字檔）不連。
- 頁碼管理、文字樣式對話框裡 `manage={false}`（不顯示「管理色票...」）：它們有自己的草稿，在下面改色票會讓草稿過期、被 reducer 擋下。
- 「色票...」對話框：草稿（`swatch-draft.ts`）、「確定」一次 `swatch/applyEdits`；`parseSwatchHex` 存小寫。連鎖刪除後草稿必須仍能被 `applySwatchEdits` 接受。
- 匯出、畫布、量測不讀色票（只讀 hex）。

## 專案字型（`project-fonts.ts` / `font-draft.ts` / `fonts.ts` / `use-fonts-ready.ts` / Rust `project/fonts.rs`、`export/document_fonts.rs`）

- 存在專案的 `assets/fonts/`。只收靜態 TTF / OTF（可變、`.woff(2)` 拒絕；`.ttc` 拆一個）；`fsType` 禁止嵌入 / 只能點陣拒絕。MCP 只能查詢與選用，不能匯入。
- **家族名稱一律 `project-font-<id>`**（Rust `project_font_family`），不管檔內名稱。文字存 `"project-font-<id>", <同類內建中文字型>, <generic>`（`projectFontOption`）；**只比第一個家族名稱**（`usesProjectFont` / `findFontOption(family, fonts)`）。
- **沒有粗體檔時一般檔也登記成 700**（`FontFace` 與 Typst FontBook 都是）：只登記 400 時 Chromium 模擬加粗、Typst 不會，畫面和 PDF 不一樣。
- 基線：匯入時記畫布的 ascent / descent（`USE_TYPO_METRICS` 時 typo，否則 win），`FontFace` 與 EPUB / 翻頁書 `@font-face` 寫 `ascent-override` / `descent-override`。Safari 不支援 override → `appleBaselineShift` 提示（已知限制，不改字型檔）。
- 載入：`loadFontOption` 先 `new FontFace(...)`（`projectFontDescriptors`）加進 `document.fonts` 再 `load`。asset URL 由 `setFontUrlResolver`（`ProjectProvider` **在 render 裡**設定：子元件的 effect 先跑）。`useFontsReady` / `loadFontFamily` 要傳 `document.fonts`。CSP `font-src` 有 asset protocol。
- **`mapFontFamilies` 是唯一走過所有字型欄位的地方**（文字、圖形內文字、文字樣式、頁碼）：新增帶字型的欄位要補。刪除使用中的字型要指定替代；名稱不可和內建字型同名（`fontNameError`）。
- 字型選單的「管理字型...」（`ManageFontsProvider`）在頁碼管理、文字樣式對話框裡沒有（理由同色票）。
- 匯入（Rust `font_import`，raw body；`.ttc` 的索引放 header `x-font-index`）：`analyze` 檢查；**Typst 讀不了的也拒絕**（否則 PDF 整段沒字）；上限 64 MB；匯入時就寫進 `assets/fonts/`，取消的檔案下次開檔清理。
- `.ttc`：`prepare` 重組成單一 sfnt，並**清掉簡單字形旗標的 bit 7**（所有 TrueType 都做）：否則 Chrome 的 OTS 整個拒絕（新細明體）。
- 系統字型：`system_fonts_list` 掃 `%WINDIR%\Fonts` 與使用者字型資料夾，快取 `system-fonts.json`；前端只拿 id（`font_import_system(regular, bold)`）；配對 `groupSystemFonts` / `pairFaces` / `pairImportedFonts`。
- 下載免費字型：`src-tauri/fonts-catalog.json`（Rust `include_str!` 與 `font-catalog.ts` 共用；增減見 `fonts/README.md`）。`font_catalog_download(id)`：網址只來自清單、檔案要符合 SHA-256 與大小，快取 `font-cache/<SHA-256>.<ext>`；名稱用清單的。
- 加入前用丟棄式 `FontFace` 試載（`checkFontFileLoads`）。
- 授權提醒：翻頁書匯出前，用到**不在精選清單**的專案字型時先問（`fontsToCheckBeforePublishing`、`useFontLicenseDialog`，不阻擋）。清單字型由存進專案的檔名（雜湊）認出（`catalogFontOfFile`），**所以必須原樣保存**。
- 匯出只收文字用到的字型；檔案不見時那套略過、用後備（不讓匯出失敗）。
- 不做：子集化、網頁 / 可變字型、App 字型庫、Google Fonts、MCP 匯入字型。

## 檔案

- `fonts.ts`：`FONT_OPTIONS`（第一個是預設）、`projectFontOption`、`findFontOption`、`projectFontDescriptors`。
- `font-catalog.ts`：精選清單、`catalogFontOfFile`、`fontsToCheckBeforePublishing`。`system-fonts.ts`：分組、`pairByWeight`。
- Rust：`project/fonts.rs`（`prepare` / `analyze` / `import_font` / `collection_faces`）、`font_collection.rs`、`system_fonts.rs`、`font_catalog.rs`（不碰網路）。
