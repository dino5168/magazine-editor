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

精簡前的完整原文（Konva 實測、疊圖比對數字）：`docs/progress-archive/rules-2026-10/editor-text.md`。

## 共通

- 畫布的文字屬性一律經 `konvaTextStyle()`（文字、圖形內文字、頁碼、`measureTextLayout` 共用）；**不要在節點上另外寫 `lineHeight` 等屬性**。每個 key 都給值，關掉陰影時才會真的移除。
- 首尾置中、段落縮排、底線位置**依賴 Konva 10.5.0 內部**（`textArr`、`_partialText`、`_sceneFunc`、基線公式）：**升級 Konva 時重測**。
- 行寬、行框、每行間距由前端量好放進 `TextLayout`（`lineWidths` / `lineGaps` / `lineBoxes`），Rust 不自己量；有 `line_starts` 的行，PDF / EPUB 都靠左放在起點，不交給 Typst / CSS 對齊。
- 有 `lineStarts` 的行**不能被格式再折斷**：PDF 的 `box` 寬度給框寬 + 1000 pt（`no-wrap-width`）、EPUB 每行 `white-space:nowrap`。
- **換行是自己做的，不是 Konva `word`**（避頭點，`docs/05-Plans-字型/04-避頭點換行-實作.md`）：規則在 `text-wrap.ts`（`canBreakBefore`：中日韓字元之間可斷、行首禁則「，。」）…」、行尾禁則「（「“」、`……` / `——` 不拆、英文在空白與 `-` 斷；放不下就**推出**，不懸掛、不推入）。`indentAttrs` 對**每個**文字（含圖形內文字、`measureTextLayout`）都給預先換好的 `text` + `wrap: "none"`，所以**節點的 `text` ≠ 文件原文**，呼叫端不要自己再給 `text`。量字用離畫面的 `Konva.Text`（`textArr[0].width`，含字距）。改禁則字集 = 舊文件重新換行，要重做疊圖比對。
- 套用 / 新增樣式的文字前先 `loadFontFamily`，否則畫布用替代字型量換行。
- **全形標點一律不擠**（三端一致，`docs/05-Plans-字型/03-全形標點擠壓-實作.md`）：`index.css` 的 `html { text-spacing-trim: space-all }`。canvas 只吃 **DOM 裡**的 computed style，所以 `main.tsx` 一開始呼叫 `attachKonvaMeasureCanvas()`（`konva-measure-canvas.ts`）把 Konva 的量字 canvas 放進隱藏容器。依賴 Konva 10.5.0 內部（量字 canvas 由 `Util.createCanvasElement` 建立、全 App 共用）：**升級 Konva 時重測**（console 的 `[text]` 警告）。
- `stage.toDataURL()` / `toCanvas()` / `node.cache()` 在**不在 DOM** 的 canvas 重畫，那裡又會擠標點（字疊在一起）：做「匯出 PNG」時要處理（見計畫 03 步驟 3）。

## 文字裝飾（`text-style.ts`）

- 斜體是模擬的：PDF 用 Typst `skew`、EPUB 每行 `skewX`，斜率 Rust `SYNTHETIC_ITALIC_SLANT`。EPUB **不用** `font-style: italic`。
- 底線 / 刪除線照 Konva 公式（基線 ± `round(字級/4)`、粗 `字級/15`、長 `round(行寬)`），由 `render.rs` 的 `decoration_lines` 算；EPUB 用絕對定位的 `span.d`，不用 CSS `text-decoration`。
- 陰影：`shadowBlur` 固定 0（PDF 畫不出模糊）；方向以頁面為準，旋轉後的框裡要反向旋轉偏移（TS `localShadowOffset`、Rust `render_shadow`）。有線又有陰影時 Konva 整段投一個陰影（`RenderShadow.whole_block`），否則每行各投。
- 文字背景 / 外框不做：用「圖形 + 圖形內文字」。

## 行距與字距

- `lineHeight` = 基線距離 ÷ 字級；`letterSpacing` = 字級的 1/1000。範圍常數在 `text-style.ts`，**Rust `format/mod.rs` 同值**。頁碼沒有這兩個欄位。
- 字距 ≠ 0 時 Konva 逐字畫（kerning / 連字消失），行寬 = 整行寬 + 字數 × 字距（含行尾）。
- PDF 每行拆成字元叢集中間放 `h(字距)`；**不用 Typst `tracking`**（換字型處少加一個字距）。EPUB 用 `letter-spacing` + 關 kerning / 連字，每行 `margin-left` 定位（起點可能是負的，不能用 padding）。

## 首尾置中（`text-distribute.ts` / `distributed-text.ts`）

- `align: "distributed"`：每一行（含最後一行）首尾貼邊、字間平分，英文也逐字元分，單字行置中；間距和字距無關。交給 Konva 時當 `left`（`konvaAlign`）。
- 畫布不能用 Konva `justify`：照常用 `Konva.Text`，只換 `sceneFunc`（`drawDistributedText`，經 `konvaAlignAttrs`）。字寬要逐字量（`node.measureSize`），`textArr[].width` 偏窄。
- 文字編輯框 / 預覽用 `cssTextAlign`（`justify` 近似，英文和畫布略不同：已知限制）。

## 段落縮排（`text-indent.ts` / `indented-text.ts`）

- 三個數字（字級的倍數）：`indentLeft` / `indentRight` / `indentFirstLine`；首行 ≥ −左（`hasValidTextIndent` / Rust `validate_text_indent`）。reducer 檢查**套用後**的文字（patch 可能只給首行）。
- 首行寬度不同，所以 `layoutIndentedText` 每段換兩次；縮排全 0 時不走這條路（`wrappedTextLines`，沒有 `lineBoxes`，Konva 自己對齊）。
- 有縮排時每行由 `sceneFunc` 畫在自己的行框裡（`alignedLineStart`，Rust `layout_line_start` 同公式）；文字編輯框編輯原文。
- 文字編輯框是 `contenteditable="plaintext-only"`（textarea 不支援每段首行縮排）；Chrome 結尾換行的佔位 `\n` 由 `toEditableText` / `fromEditableText` 處理。
## 文字樣式（`style-sheet.ts` / `styles-panel.tsx` / `text-style-link.tsx` / `text-style-dialog.tsx`）

- 欄位 = `TEXT_STYLE_KEYS`（mapped type 守著）。**覆寫由比對得出**（`styleOverrides`），不另外存；改樣式時 `restyle` 只改「和舊樣式相同」的欄位。
- 內建樣式固定 id `text-style-heading` / `-subheading` / `-body`（`BUILT_IN_TEXT_STYLE_IDS`，Rust 升級舊檔用同一組）。文字工具（T）以固定 id 連「內文」；`createTextElement(preset)` = 內建值、不連結。
- 下拉「不使用樣式」的值是 `__none__`（Radix Select 不收空字串）。
- `TextStyleDialog` 的 **`<form>` 只包名稱欄**：shadcn `Button` 沒有預設 `type="button"`，`NumberField` 的 −／＋ 在表單裡會被 Enter 按下。
- 「樣式」面板 id `styles`，不在預設版面。
- 不做：字元樣式、樣式繼承、樣式群組、頁碼連到樣式。
