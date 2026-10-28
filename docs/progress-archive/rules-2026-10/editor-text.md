<!-- 迭代 2（commit 8959b47）的 .claude/rules/editor-text.md 原文；迭代 3 精簡前封存，不再更新 -->

---
paths:
  - "src/lib/editor/text-*.ts"
  - "src/lib/editor/distributed-text.ts"
  - "src/lib/editor/indented-text.ts"
  - "src/lib/editor/editable-text.ts"
  - "src/lib/editor/style-sheet.ts"
  - "src/lib/editor/shape-label.ts"
  - "src/components/editor/style-controls.tsx"
  - "src/components/editor/text-*.tsx"
  - "src/components/editor/panels/styles-panel.tsx"
  - "src/components/editor/panels/text-panel.tsx"
  - "src/lib/export/text-layout.ts"
---

# 編輯器：文字（裝飾、行距字距、首尾置中、縮排、文字樣式）

### 文字裝飾（`lib/editor/text-style.ts` + `style-controls.tsx` + 匯出）

計畫與決定：`docs/Plans/imp-text-attribute.html`。

- **UI**：`TextStyleFields` 粗體旁的「斜體」「底線」「刪除線」，文字顏色下方的「陰影」開關（開啟時寫入 `DEFAULT_TEXT_SHADOW`：黑色 50%、偏移 2 / 2 pt；偏移限制 ±50 pt，`TEXT_SHADOW_OFFSET_MAX`）。屬性面板與頁碼對話框共用。文字背景 / 外框不做：用「圖形 + 圖形內文字」。
- **畫布**：一律經 `konvaTextStyle()` 轉成 Konva 屬性（文字物件、圖形內文字、頁碼、`measureTextLayout` 共用），每個 key 都給值，關掉陰影時節點才會真的移除；陰影透明度拆成 `shadowOpacity`，`shadowBlur` 固定 0（PDF 畫不出模糊）。斜體與線都不改字寬，換行不變。
- **斜體是模擬的**（沒有斜體字型檔）：瀏覽器以基線為軸斜切 1/4（實測五種字型都是 0.25）。PDF 用 Typst `skew`、EPUB 用每行 `skewX`，斜率是 Rust `render.rs` 的 `SYNTHETIC_ITALIC_SLANT`。EPUB **不用** `font-style: italic`（斜率會隨閱讀器而變）。
- **底線 / 刪除線**的位置照 Konva 10.5.0 的 `Text._sceneFunc`：基線 ± `round(字級 / 4)`、粗 `字級 / 15`、長 `round(該行寬)`，由 `render.rs` 的 `decoration_lines` 算好，PDF 畫 `line`、EPUB 畫絕對定位的 `span.d`（不用 CSS `text-decoration`，位置對不上）。行寬由 `TextLayout.lineWidths` 從前端傳來。**升級 Konva 時要重查這組公式。**
- **陰影方向以頁面為準**，不隨物件旋轉（Canvas 2D 的 shadow offset 不受旋轉影響）。匯出與文字編輯框在旋轉後的框裡畫，所以偏移要反向旋轉（TS `localShadowOffset`、Rust `render_shadow`）。陰影的透明度 = 陰影色 × 文字顏色的透明度。
- **有線又有陰影時，Konva 改用 buffer canvas**：整段文字畫好再投一個陰影在最底下（`RenderShadow.whole_block`）；沒有線時每行各自投陰影。PDF 照兩種情況畫；EPUB 的文字陰影是 `text-shadow`（不複製文字），線的陰影是 `z-index: -1` 的 `span.d.s`（`.t` 有 `z-index: 0`）。
- **已知限制**：半透明陰影在有線的文字上，重疊處 PDF / EPUB 比畫布深（Typst 沒有群組透明度）；EPUB 逐行畫文字陰影，行與行的陰影重疊時順序可能和畫布不同。

### 行距與字距（`lib/editor/text-style.ts` + `style-controls.tsx` + 匯出）

計畫、Konva 實測與決定：`docs/01-Plans-2026-10/12-新增文字屬性-行高與字距-實作.md`（2.6 節是 Konva 10.5.0 的實測）。

- **模型**（v9）：`TextStyle.lineHeight` = 基線距離 ÷ 字級（倍數，0.5–3）；`letterSpacing` = 每個字後面多加的距離，**字級的 1/1000**（‰，InDesign 的「追蹤」，−200–1000）。兩者都跟著字級縮放。預設 `DEFAULT_TEXT_SPACING`（1.2 / 0 = 以前固定的值，舊檔與備份讀成這組）；內建「內文」行距 1.5（使用者決定）。範圍常數 `LINE_HEIGHT_MIN/MAX`、`LETTER_SPACING_MIN/MAX` 與 `DEFAULT_LINE_HEIGHT` 在 `text-style.ts`，Rust `format.rs` 同值。**頁碼沒有**這兩個欄位（直書頁碼每字一行），頁碼的圖形內文字用預設值。
- **畫布**：`konvaTextStyle()` 也帶 `lineHeight` 與 `letterSpacing`（`letterSpacingPt` 換成 pt），文字、圖形內文字、頁碼、`measureTextLayout` 都經過它，**不要在節點上另外寫 `lineHeight`**。高度估算（`estimateTextHeight`、`textBlockHeight`）讀物件的行距。文字編輯框用 `letter-spacing: ‰/1000 em`，有字距時 `font-kerning: none`。
- **Konva 10.5.0 的字距行為**（實測）：字距 ≠ 0 時**逐字畫**（每個字單獨量寬），kerning 與連字消失；行寬 = 有 kerning 的整行寬 + 字數 × 字距（含行尾字距），置中 / 靠右與換行都用這個寬。所以畫面上英文字距一不是 0 就會略寬、靠右的英文可能超出框一點（已知限制，匯出照畫面）。**升級 Konva 時要重測。**
- **匯出**（`render.rs` 的 `RenderText.letter_spacing` / `line_starts`）：字距 ≠ 0 時每行起點由 Rust 用前端量到的行寬依對齊算（`line_start`，和底線同一個函式），PDF / EPUB 都**靠左放在起點**，不交給 Typst / CSS 對齊（它們的行尾字距與 kerning 和 Konva 不同）。
  - PDF：每行拆成字元叢集（`str.clusters()`），中間放 `h(字距)`。**不用 Typst 的 `tracking`**：它在換字型處（拉丁 ↔ 中文）少加一個字距，中英混排會偏 2–5 pt。
  - EPUB：`.t` 加 `letter-spacing` + `font-kerning: none` + `font-variant-ligatures: none`，每行 `text-align: left; margin-left: <起點>`（起點可能是負的，不能用 padding）。CSS 沒有 tracking 的問題，文字不拆。
  - 疊圖比對（中英、正負字距、三種對齊、行距 2、底線＋粗體）：PDF、EPUB 和畫布都 ≤ 0.5 pt。
- **UI**：`TextStyleFields` 的可選 `spacing` prop（屬性面板、樣式對話框傳入；頁碼對話框不傳），字級下方「行距（倍，± 0.1）」「字距（‰，± 10）」；輸入值經 `clampLineHeight`（取到 0.01）/ `clampLetterSpacing`（取整數）。reducer 的 `isValidPatch` 擋範圍外的值。覆寫提示的欄位名是「行距」「字距」（`TEXT_STYLE_KEY_LABELS`）。

### 首尾置中（`lib/editor/text-distribute.ts` / `distributed-text.ts` + 匯出）

計畫、Konva 實測與決定：`docs/01-Plans-2026-10/13-文字對齊加入首尾置中-實作.md`（步驟 1 是 Konva 10.5.0 的實測）。

- **規則**（使用者決定）：`align: "distributed"`（v10）= Word 的分散對齊。**每一行（含最後一行）**第一個字貼左緣、最後一個字貼右緣，字與字平分剩下的空間；**英文也逐字元分**；單字行置中；行尾空白不算字；字比框寬時間距為負（重疊、仍塞進框）。換行和靠左相同（交給 Konva 時 `align: "left"`，`konvaAlign`）。間距 = (框寬 − 逐字字寬總和) ÷ (字數 − 1)，**和字距無關**（字距只影響換行）。按鈕「分散對齊（首尾置中）」，屬性面板、樣式對話框、MCP 都有；頁碼沒有。
- **畫布**：Konva 的 `justify` 只在空白處加距離、最後一行不分散，中文沒效果，不能用。改成照常用 `Konva.Text`（換行、命中、選取、Transformer、陰影都照 Konva），只傳自訂 `sceneFunc`（`drawDistributedText`）：每行用 `distributeText` 算出的位置，逐字設 `_partialText` / `_partialTextX` / `_partialTextY` 再 `fillStrokeShape`（和 Konva 自己逐字畫相同），底線在字前、刪除線在字後（Konva 的公式，長度 = 畫出的行寬）。有線＋陰影時 Konva 照樣走 buffer canvas。文字物件與圖形內文字都經 `konvaAlignAttrs`。**依賴 Konva 內部行為（`textArr`、`_partialText`、基線公式），升級 Konva 時重測。**
  - **字寬要逐字量**（`node.measureSize(字)`，依字型 + 字快取）：Konva 的 `textArr[].width` 是有 kerning 的整行寬，比逐字加總窄，用它最後一個字會超出框。
- **文字編輯框 / 樣式預覽**：`cssTextAlign` → `text-align: justify; text-align-last: justify`。Chrome 對英文只分在空白、單字靠左，**編輯中和畫布略不同**（已知限制）。
- **匯出**：`measureTextLayout` 對首尾置中帶 `lineWidths`（畫出的寬：兩字以上 = 框寬）與 **`lineGaps`**（每行的間距），Rust 不自己算。`render.rs`：`RenderText.line_gaps`、首尾置中一律有 `line_starts`（`line_start` 的 `Distributed` = `(框寬 − 行寬) / 2`：0 或單字置中）。PDF：`template.typ` 的 `line-content` 逐字元叢集放 `h(這行的間距)`；EPUB：每行 `letter-spacing:<這行的間距>px`（行尾多的那個字距在不換行的行尾，看不到），`.t` 關 kerning / 連字。
  - **一行不能被格式再折斷**：首尾置中的行剛好等於框寬，Typst / 閱讀器量的字寬稍寬就會把最後一個字折到下一行（疊圖比對抓到的）。有 `lineStarts` 的行，PDF 的 `box` 寬度給框寬 + 1000 pt（`no-wrap-width`）、EPUB 每行 `white-space:nowrap`；**字距的行也一樣**。
  - 疊圖比對（中文單 / 多行、英文、中英混排、字距 ±、單字、粗體＋線、斜體、明體、行距 2，共 72 字）：PDF、EPUB 左右都 ≤ 0.5 pt。
- 之後另排：左右對齊（justify，最後一行靠左）。可以重用每行間距的機制，「段落最後一行」用 Konva `textArr[].lastInParagraph`。

### 段落縮排（`lib/editor/text-indent.ts` / `indented-text.ts` + `style-controls.tsx` + 匯出）

計畫、Konva 實測與決定：`docs/07-Plans-物件屬性與事件/01-新增文字框屬性-實作.md`。

- **模型**（v16，使用者決定）：InDesign 的三個數字，單位是「字」（字級的倍數，跟著字級縮放）。每個 `\n` 開始一段；每段第一行的左緣 = `indentLeft + indentFirstLine`、其他行 = `indentLeft`，右緣 = 框寬 − `indentRight`。首行負值 = 首行突排，**不可比框左緣更左**（≥ −`indentLeft`）；左 / 右 0–20、首行 −左–20（`TEXT_INDENT_MAX`，TS `hasValidTextIndent` / Rust `validate_text_indent`）。reducer 檢查**套用後**的文字（patch 可能只給首行）。新文字、內建樣式、頁碼都是 0；v15 之前的檔案讀成 0。一行至少留一個字級寬（`indentedLineBox`）。
- **換行**：Konva 只能用一個寬度換整段，所以 `layoutIndentedText` **每段換兩次**：第一行用首行的寬度，剩下的文字（`slice(第一行.length).trimStart()`，Konva 會吃掉換行處的空白）用其他行的寬度；換行規則仍是 Konva 的（`indented-text.ts` 的共用離畫面節點）。實測和 Konva 直接換整段 156 / 156 相同。**縮排全為 0 時完全不走這條路**。
- **畫布**：`indentAttrs` 給節點**預先換好的文字**（`\n` 接起來）+ `wrap: "none"` + `align: "left"` + 自訂屬性 `lineBoxes` / `indentAlign` + `sceneFunc`：`drawIndentedText` 每行 `translate(alignedLineStart(...))`、`textArr` 暫時只留這一行、呼叫 Konva 自己的 `Text.prototype._sceneFunc`（底線、字距、陰影、buffer canvas 都照 Konva；位移 0 時逐像素相同）；首尾置中用 `drawDistributedText`（`distributedTextLines` 讀 `lineBoxes`）。`textAttrs` / `ShapeLabelText` 在 `konvaAlignAttrs` 之後展開它；文字的 `onTransform` 拖寬度時也重新換行。**畫布節點的 `text` 和文件的原文不同**（多了換行字元），文字編輯框編輯的是原文。依賴 Konva 內部（`textArr`、`_sceneFunc`），**升級 Konva 時重測**。
- **對齊**：在「這一行的行框」裡對齊（`alignedLineStart` = 行框起點 + 在行框寬度裡的位移，Rust `layout_line_start` 同公式）。
- **匯出**：`measureTextLayout` 用同樣的 `indentAttrs`，`TextLayout` 多 `lineBoxes`（每行 `{ start, width }`）。Rust 有行框時**一律帶 `line_starts`**（各格式不能自己對齊整個框），PDF 模板與 EPUB / 翻頁書標記不用改。疊圖比對：PDF 40 行 ≤ 0.5 pt、EPUB 左右差 0。
- **UI**：`TextStyleFields` 的可選 `indent` prop（屬性面板、樣式對話框；頁碼不傳）：Word 式「左 / 右 / 首行（無 / 首行縮排 / 首行突排）/ 位移」（`indentFields` / `indentFromFields`：左 = 最左邊那一行；從「無」換過去位移 2 字），換算後一定合法。覆寫提示的名稱是「左縮排 / 右縮排 / 首行縮排」。
- **文字編輯框**：textarea 不支援 `text-indent … each-line`（編輯中只有第一段的首行縮排 / 突排，使用者測試時誤以為「放開後縮排消失」），2026-10-19 改成 `contenteditable="plaintext-only"`（計畫 `02-文字編輯框改成contenteditable-實作.md`），每段都正確。Chrome 在結尾換行後多放一個 `\n` 佔位：`editable-text.ts` 的 `toEditableText` / `fromEditableText` 放進去時補、讀出來時去。
- **已知限制**：Konva 的 `word` 換行放不下時退回最後一個空白（中文也是：「1. 中文…」首行只剩「1.」）、沒有避頭點，這是既有行為，建議另開任務處理中文換行。
- 之後另排：段前 / 段後距（每行的 y）、左右對齊（justify）、項目符號 / 編號清單（建在首行突排上）。

### 文字樣式（`lib/editor/style-sheet.ts` + `styles-panel.tsx` / `text-style-link.tsx` / `text-style-dialog.tsx`）

計畫與決定：`docs/01-Plans-2026-10/09-樣式系統-實作.md`（方向見 `08-設計方式總結.md`：先做樣式，之後欄格線 → 範本 → 富文字）。

- **模型**：見「文件模型」的文字樣式。只有一種「文字樣式」（整個文字框一種）；字元樣式等富文字再做。欄位 = `TextStyle` 全部欄位（`TEXT_STYLE_KEYS`，mapped type 守著），2026-10-11 起含行距 / 字距，2026-10-19 起含段落縮排。
- **覆寫由比對得出**（使用者決定）：`styleOverrides(文字, 樣式)` = 值不同的欄位。改樣式時 `restyle` 只改「和舊樣式相同」的欄位；「以目前設定更新樣式」= `textStyle/update` 傳入文字目前的值（被覆寫的欄位剛好等於新值，覆寫自然消失）。代價：覆寫成剛好等於樣式的值會被當成沒覆寫。
- **內建樣式**：「標題」32 pt 粗置中、「副標題」20 pt 置中、「內文」11 pt **靠左**，固定 id `text-style-heading` / `-subheading` / `-body`（`BUILT_IN_TEXT_STYLE_IDS`；Rust 升級舊檔時用同一組）。新文件帶這三個；`TEXT_PRESETS` 只剩預設文字與寬度，字型數值來自內建樣式（`builtInTextStyle`）。
- **建立文字**：「文字」面板列出文件的樣式，新文字連到該樣式（`createStyledText`；文件沒有樣式時顯示原本三個按鈕、不連結）。文字工具（T）連到「內文」（以固定 id 找，改名不影響；沒有就用內建值、不連結）。`createTextElement(preset)` = 內建值、不連結（MCP 沒帶 `style`、素材庫的文字檔）。
- **UI**：
  - 屬性面板「文字」分頁最上面的「文字樣式」區塊（`TextStyleLink`）：下拉（「不使用樣式」的值是 `__none__`，Radix Select 不收空字串）、有覆寫時名稱加「＋」並列出欄位（`TEXT_STYLE_KEY_LABELS`）、清除覆寫 / 以目前設定更新樣式 / 以目前設定建立新樣式（`InlineNameInput`）。下方的字型欄位照舊 `element/update`，自然成為覆寫。
  - 「樣式」工具面板（`styles`，**不在預設版面**，從「工具面板 → 樣式」打開）：點一列 = 套用到選取裡有文字的物件；選取都連到同一個樣式時標示該列；雙擊改名；編輯（對話框）/ 複製（`copyTextStyleName`）/ 刪除（有人用時先確認）。
  - 對話框（`TextStyleDialog`）：名稱 + `TextStyleFields` + 預覽，「確定」才寫入（編輯 = 一次 `textStyle/update` 含新名稱）。**`<form>` 只包名稱欄**：shadcn `Button` 沒有預設 `type="button"`，`NumberField` 的 −／＋ 放進表單時 Enter 會「按下」它而不是送出。
- **字型**：套用 / 新增樣式的文字前先 `loadFontFamily`（`use-fonts-ready.ts`），畫布才不會用替代字型量換行。
- **MCP**：見「MCP」的目前的工具。
- 不做（之後另排）：字元樣式、樣式繼承（based on）、樣式群組、從其他專案匯入樣式、頁碼連到樣式。

## 檔案（原 CLAUDE.md「目錄結構」）

```
      text-style-link.tsx         # 屬性面板「文字樣式」區塊：樣式下拉、覆寫提示（＋）、清除覆寫 / 以目前設定更新樣式 / 以目前設定建立新樣式（文字物件與圖形內文字共用）
      text-style-dialog.tsx       # 編輯 / 新增文字樣式的對話框（名稱 + TextStyleFields + 預覽，確定才寫入；表單只包名稱欄，見「文字樣式」）
      text-editor-overlay.tsx     # 雙擊文字 / 圖形（或文字工具新建）時疊在畫布上的純文字編輯框：`contenteditable="plaintext-only"` 的 div（不是 textarea：textarea 不支援 `text-indent … each-line`，見「段落縮排」）；內容不受 React 控制、結束時才讀；處理輸入法選字；圖形內文字用 frame 垂直對齊
      style-controls.tsx          # 文字樣式（TextStyleFields：字體 / 字級 / 粗體・斜體・底線・刪除線 / 可選的對齊（ALIGN_BUTTONS，依 TEXT_ALIGNS）/ 顏色 / 陰影；按鈕分組 ButtonGroup，放不下時整組換行）與邊框（StrokeFields）控制項，屬性面板與頁碼管理共用；線條的顏色 / 粗細 / 樣式是 LineStyleFields（粗細欄位由 LineWidthField 設定），格線與參考線對話框也用它
      style-sheet.ts              # 文字樣式（樣式表）的純邏輯：內建樣式 defaultTextStyles、覆寫比對 styleOverrides、套用 / 跟著樣式改（applyTextStyle / restyle / restyleDocument / linkTextStyle）、走過所有文字 mapStyledTexts、使用數 textStyleUsage、名稱檢查與驗證（和 Rust 同規則）
      text-style.ts               # 文字裝飾與行距 / 字距：預設值（PLAIN_TEXT_DECORATION、DEFAULT_TEXT_SPACING、DEFAULT_LINE_HEIGHT、DEFAULT_TEXT_FILL、DEFAULT_TEXT_SHADOW）、範圍與驗證 / 夾值（hasValidTextSpacing、clampLineHeight、clampLetterSpacing）、轉成 Konva 屬性（konvaTextStyle、letterSpacingPt）、陰影偏移換成物件座標（localShadowOffset）；對齊（TEXT_ALIGNS、isTextAlign、konvaAlign：首尾置中交給 Konva 時當靠左、cssTextAlign：HTML 用 justify 近似）
      text-distribute.ts          # 首尾置中的純邏輯：splitGraphemes（Intl.Segmenter）、distributeLine / distributeText（每個字的 x、行寬、間距；單字置中、去行尾空白）
      distributed-text.ts         # 首尾置中在 Konva 上：drawDistributedText（自訂 sceneFunc）、distributedTextLines（textArr 每行 → distributeText，有 lineBoxes 時在每行的行框裡分散；measureTextLayout 也用）、firstBaseline、konvaAlignAttrs（{ align, sceneFunc }）
      text-indent.ts              # 段落縮排的純邏輯：NO_TEXT_INDENT、TEXT_INDENT_MAX、hasTextIndent / hasValidTextIndent / clampTextIndent、indentedLineBox（首行 / 其他行的行框）、layoutIndentedText（每段換兩次，wrap 由呼叫端注入）、alignedLineStart（行框起點 + 對齊，同 Rust）、屬性面板 Word 式欄位的換算（indentFields / indentFromFields / withFirstLineMode）
      editable-text.ts            # 文字編輯框（contenteditable）與文件文字的換算：toEditableText / fromEditableText（Chrome 結尾換行的佔位 \n）
      indented-text.ts            # 段落縮排在 Konva 上：indentedTextLayout（Konva 換一段 + WeakMap 快取）、indentAttrs（預先換好的文字、wrap none、lineBoxes / indentAlign、sceneFunc）、drawIndentedText（每行平移後交給 Konva 的 _sceneFunc）、lineBoxesOf
```
