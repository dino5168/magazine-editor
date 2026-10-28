<!-- 迭代 2（commit 8959b47）的 .claude/rules/editor-model.md 原文；迭代 3 精簡前封存，不再更新 -->

---
paths:
  - "src/lib/editor/types.ts"
  - "src/lib/editor/editor-reducer.ts"
  - "src/lib/editor/editor-context.tsx"
  - "src/lib/editor/element-factory.ts"
  - "src/lib/editor/validation.ts"
  - "src/lib/editor/geometry.ts"
  - "src/lib/editor/properties.ts"
  - "src/lib/editor/selection-actions.ts"
  - "src/lib/editor/__tests__/**"
  - "src-tauri/src/project/format.rs"
  - "tests/fixtures/**"
  - "docs-website/types.html"
---

# 編輯器：文件模型與狀態

### 文件模型（`lib/editor/types.ts`）

- **長度單位一律是 pt（1/72 inch）**，和 Typst 一致。座標原點是頁面左上角；zoom 1 時 1pt = 1 CSS px。
- 物件有四種：`text` / `shape` / `image` / `line`（v15，線條以點定義，見下面的「線條」）。**每種物件的 `x` / `y` 都是外框（旋轉前）的左上角**，旋轉也繞這一點（2026-10-01 起；舊檔的橢圓 / 多邊形 / 星形以中心定位，開檔時由 Rust 換算）。
- **線條 = `LineElement`**（v15，計畫 `docs/06-Plans-繪圖/03-自由繪圖-實作.md`）：`points`（2–500 個，相對於 x / y；x / y = 點的外接框左上角，`line-geometry.ts` 的 `normalizeLinePoints` 負責）、`path`（`straight` / `smooth`）、`compound`（`single` / `double`）、`stroke`（**不可 null**）、`start` / `end`（`LineEnd`：`arrowhead` `none` / `open` / `triangle`、`scale` 0.5–5）。沒有 width / height（水平線外框高 0）。reducer 的 `element/add` 與 `element/update` 對線條檢查**套用後的整條線**（`isValidLine`）。Rust 的匯出不畫線條（`build_render` 遇到就回 `InvalidInput`）：編輯器匯出前會換成路徑圖形。畫布、工具、屬性面板、MCP 見下面的「線條」。
- **圖形 = `ShapeElement`**（計畫與決定：`docs/Plans/imp-refactory-types.md`）：
  - 外框 `width` / `height` + `geometry`（`rect` 圓角 / `ellipse` / `polygon` 邊數 / `star` 角數與 `innerRatio`）+ `fill` + `stroke: Stroke | null` + `label: ShapeLabel | null`。
  - **圓角**（`CornerRadius`，計畫 `docs/01-Plans-2026-10/15-屬性-樣式-圓角-實作.md`）：四個角一樣存**一個數字**，不同才存 `[左上, 右上, 右下, 左下]`（Konva 的順序，v11）；`normalizeCornerRadius` 負責「一樣就存數字」，舊檔不用升級。畫的時候**每個角各自限制在短邊的一半**（Konva 10.5.0 實測，不是 CSS 的等比例縮小）：Rust render model 先限制好（`RenderRect.corner_radii`），PDF 有邊框與 EPUB 有邊框且四角不同時都畫 `render.rs` 的 `rounded_rect_path`（起點 (左上, 0)、順時針，同 Konva，虛線位置才一樣），PDF 無邊框用 Typst `radius` 字典、EPUB 無邊框用 CSS `border-radius` 四值。屬性面板：「圓角」一個欄位 + 切換鈕（`Scan`）展開成照角的位置排的 2 × 2 四欄位，四角不同時直接展開、收起時顯示「混合」（`CornerRadiusFields`）。
  - 多邊形與星形的頂點拉伸到碰到外框四邊（`shape-geometry.ts` 與 Rust `project/shape.rs` 同公式），所以每種圖形都能自由拉伸。
  - **圖片框**（v17）：`image: ShapeImage | null` = 裁在外形裡的照片（見「圖片框（圖形照片）」）。
  - **圖形庫的圖形**（v14）：`{ kind: "preset"; preset; params }`，只存圖形庫 id 與具名參數，路徑由前端的公式算（見「圖形庫」）。**新增框型圖形（箭頭、對話框…）= 在 `SHAPE_LIBRARY` 加一筆定義**，不改 `ShapeGeometry`、檔案格式與 Rust。
- **名稱**：`element-factory.ts` 的 `ShapeKind`（rect / roundedRect / ellipse / triangle / star）是元素面板與底部工具列的**圖形選項**，由 `SHAPE_PRESETS` 對應到 geometry；`types.ts` 的 `GeometryKind` 才是文件裡存的種類。
- **圖形內文字**（`ShapeLabel extends TextStyle`）：
  - 排在外框往內縮 `LABEL_PADDING_PT`（4 pt）的文字框裡，依 `verticalAlign` 上 / 中 / 下對齊，超出照常顯示，隨圖形旋轉。
  - 畫布上是圖形 Group 裡的 Konva `Text`。它的 `getClientRect` 被改成回報空的外框（`excludeFromBounds`），否則超出的文字會撐大 Transformer 的控制框，縮放換算就錯。
  - 雙擊圖形編輯（`TextEditorOverlay` 的 `frame` 模式）。清空文字 = `label: null`。
- **邊框**（`Stroke`）畫在外框線的**中心**（Konva / Typst / SVG 都是）；Transformer 設 `ignoreStroke`，控制框不含邊線。
- **模型不存 scale**。Transformer 縮放結束時由 `bakeTransform()` 把 scale 換算進 `width` / `height`，再把節點 scale 重設為 1。文字只調整 `width`（換行寬度），不改字級。
- **文字樣式**（`TextStyle`，文字物件、圖形內文字、頁碼共用）：`fontStyle`（`normal` / `bold`，選字型檔）之外還有 `italic` / `underline` / `strikethrough`（boolean）與 `shadow: TextShadow | null`（v6 起；舊檔讀成全部關閉）。怎麼畫見「文字裝飾」。v9 起還有 `lineHeight`（行距倍數）/ `letterSpacing`（字距，字級的 1/1000），頁碼（`PageNumberStyle`）沒有這兩個欄位，見「行距與字距」。`align` 是 `TextAlign`（`left` / `center` / `right`，v10 起還有 `distributed` 首尾置中），見「首尾置中」。v16 起還有段落縮排 `indentLeft` / `indentRight` / `indentFirstLine`（字級的倍數，首行負值 = 首行突排；頁碼沒有），見「段落縮排」。
- **文字樣式（樣式表，v8 起）**：`EditorDocument.textStyles: TextStyleDef[]`（id、名稱都不重複）；文字物件與圖形內文字 extends `StyledText`（`TextStyle` + `styleId: string | null`）。**物件照存完整的實際值**，`styleId` 只記連到哪個樣式；覆寫不另外存（和樣式不同的欄位 = 覆寫）。所以畫布、量測、匯出（含 Rust）都不讀樣式表。見「文字樣式」。
- **文件色票（v12 起）**：`EditorDocument.swatches: Swatch[]`（id、名稱不重複，`color` 是小寫 `#rrggbb`，不透明）；每個顏色欄位旁邊有連結欄位（`string | null`）：`TextStyle.fillSwatchId`（文字、圖形內文字、文字樣式、頁碼）、`TextShadow.swatchId`、`Stroke.swatchId`、`ShapeElement.fillSwatchId`、`Sheet.backgroundSwatchId`。和文字樣式一樣**照存實際值**（含使用處自己的透明度），畫布與匯出不讀色票表。見「文件色票」。
- `stroke` / `label` / `geometry` / `shadow` 是物件，`element/update` 的 patch 會**整個取代**，修改時要展開原本的值（`{ stroke: { ...stroke, color } }`）。
- `Page.elements` 的 index 0 是最底層。圖層面板反向顯示，最上層在最前。
- 物件**可以超出頁面，而且不裁切**（使用者需求）：頁面 Group 不設 clip、拖曳不限制在頁面內（`dragBoundFunc` 只在開啟「吸附格線」時用來對齊格線，見「偏好設定」）；頁緣線畫在物件上方。匯出 PDF 時超出部分會被紙張邊界裁掉。
- **邊界**：`EditorDocument.margins`（`Margins`，pt，所有頁面共用一組）只在畫布畫參考線，**匯出不讀它**。檔案驗證只檢查每一邊 0–2000 mm（`MARGIN_MAX_PT`），「左 + 右 < 頁寬」只在對話框檢查，縮小紙張不會讓檔案變成不合法。新文件預設四邊 15 mm（`DEFAULT_MARGINS`），v4 之前的檔案讀成全 0（不畫）。
- **頁碼**：`EditorDocument.pageNumberRules`（依 `from` 排序、範圍不重疊）存的是**規則**，頁碼本身**不是物件**：不在 `Page.elements`、圖層面板與選取裡，畫布與匯出時才算出來（見「頁碼管理」）。v5 之前的檔案讀成空陣列。
- **主頁**（v7 起）：`EditorDocument.masters: MasterPage[]` 和 `pages` 分開存；`Page` 與 `MasterPage` 都 extends `Sheet`（id / name / 尺寸 / 背景 / elements）。`Page.masterId` 指套用的主頁、`MasterPage.parentId` 指以哪個主頁為基礎（`null` = 沒有）；頁面與主頁的 id 在整份文件中不重複。見「主頁與動態變數」。v7 之前的檔案讀成沒有主頁。
- 新增物件類型（不是框的東西，例如之後的自由繪圖 `path`）時要改的地方：
  - 前端：`types.ts` 的 union，以及 `geometry.localBounds`、`canvas-elements`（renderer + `StaticElement` + `bakeTransform`）、`editor-canvas` 的 `TRANSFORMER_OPTIONS`、`describeElement`、`layers-panel` 的 `elementIcon`、`properties-panel` 的 `tabsOf` / `elementName`。這些都有 exhaustive switch 或 mapped type，漏改會編譯失敗。
  - 匯出端：`format.rs` 的 `Element`、`export/render.rs` 的 `build_render`（exhaustive match，漏改會編譯失敗），以及 `template.typ` 的 `draw` 與 EPUB / 翻頁書共用的 `export/html/markup.rs` 的 `element_markup`。`template.typ` 是 Typst 腳本，漏改只會**靜默不畫**，要自己記得。
- 新增 geometry 種類時要改的地方（圖形庫的圖形不用，見上）：`ShapeGeometry`，以及 `shape-geometry.ts` 的 `unitVertices`、`canvas-elements` 的 `ShapeBody`、`describeShape`、`shapeChoiceOf`、`layers-panel` 的 `GEOMETRY_ICONS`、`properties-panel` 的 `GeometryFields`、`validation.ts` 的 `isShapeGeometry`；Rust `format.rs` 的 `ShapeGeometry` / `validate_geometry`、`render.rs` 的 `shape_kind`（都有 exhaustive switch / match）。
- **檔案格式升級**：`format.rs` 的 `upgrade_shapes_to_v3` 把 v1 / v2 的 rect / ellipse / polygon / star 改寫成 shape。`recovery::read` 也會呼叫它，因為備份檔沒有版本號，舊版 App 當機留下的備份可能還是舊格式。

### 狀態（`lib/editor/editor-reducer.ts`）

- 用 `useReducer` + 兩個 Context（state / dispatch 分開），不使用 zustand 或 redux。
- `HANDLERS` 是 `{ [T in EditorAction["type"]]: handler }` 的 dispatch map，新增 action 時必須同時加 handler。
- **會進入 undo 歷史的**：`history.present`（EditorDocument）的變更，上限 100 筆（`HISTORY_LIMIT`）。
- **不進歷史的 UI 狀態**：`activePageId`（也可以是主頁的 id：正在編輯主頁）、`lastPageId`（最後顯示的頁面，「回到頁面」用；`editorReducer` 每次切到頁面時記下）、`selectedIds`（可多選，見「多選與框選」）、`view`（zoom / fitRequest）、`tool` / `shapeKind`（底部工具列的目前工具與圖形，定義在 `lib/editor/tools.ts`）、`savedDocument`（上次存檔的文件）。專案的素材（圖片、文字、音訊）不在這裡，在 `LibraryProvider`（見「素材管理」）。工具面板版面（`dockLayout`）放在 `home-page.tsx` 的 local state，並存進 `localStorage`（見「工具面板」）；格線等 App 偏好放在 `PreferencesProvider`（見「偏好設定」）。
- `selectActivePage` 回傳 `Sheet`（頁面或主頁）：`element/*` 不分頁面或主頁，編輯主頁不需要另一套 action。`page/rename`、`page/setBackground` 也對兩者都有效。只需要頁面的地方（頁序、頁碼）自己查 `pages`。
- 主頁與多頁新增的 action（新 id 一律由呼叫端帶入）：`page/addMany { pages, index }`、`page/duplicate` / `master/duplicate { id, newId, elementIds }`、`page/setMaster { ids, masterId }`、`master/add { master }`、`master/setParent`（會循環或太深時 no-op）、`master/delete`（套用它的頁面與子主頁接到它的父主頁）。見「主頁與動態變數」。`element/replace { element, pageId? }`：同 id 換成另一個物件（圖片轉成圖片框），圖層位置與選取不變、一筆復原。`element/moveToPage { moves, pageId, dx }`：拖過書背放下時，一筆復原裡改位置、換到對頁座標、搬到對頁最上層並切頁選取（見「單頁 / 雙頁」）。
- `element/add` / `update` / `updateMany` / `delete` 可帶 `pageId`：改那一頁（或主頁）而不切換使用者正在看的頁面（MCP 用）；加到別頁時不改選取；未知的 `pageId` 是 no-op。不帶時照舊作用在目前頁。
- 文字樣式：`textStyle/add { style, link? }`（`link` = 同一筆復原裡讓選取的文字連到新樣式）、`textStyle/update { id, style, name? }`（連到它的文字只改沒覆寫的欄位，頁面與主頁都走過）、`textStyle/rename`、`textStyle/delete`（文字外觀不變、取消連結）、`element/applyTextStyle { ids, styleId | null, pageId? }`（取樣式的值並清除覆寫；null = 只取消連結）。`element/add` / `update` 帶進來的 `styleId`（含 `label.styleId`）必須存在，否則 no-op（同 Rust `require_style`）。見「文字樣式」。
- 文件色票：`swatch/add { swatch }`、`swatch/update { id, name?, color? }`（連到它的顏色換 RGB、保留透明度）、`swatch/delete { id, replaceWith }`（換成另一個色票或 `null` = 保留顏色、取消連結）、`swatch/applyEdits { swatches, deletions }`（「色票」對話框一次送出）。帶顏色進來的 action（`element/*`、`page/addMany`、`page/setBackground`（可選 `swatchId`）、`master/add`、`textStyle/*`、`document/setPageNumbering`）要過 `hasValidSwatchLinks`：連到的色票存在、**RGB 等於色票**，否則 no-op。`element/update` 只給 `fill` 沒給 `fillSwatchId` = 取消連結。見「文件色票」。
- 專案字型（`lib/editor/project-fonts.ts`，計畫 `docs/05-Plans-字型/01-專案字型-實作.md`）：`font/add { font }`、`font/update { id, change: { name?, generic?, bold? } }`、`font/delete { id, replaceWith }`，各一筆復原。名稱不可和其他專案字型或**內建字型的名稱**重複（`fontNameError`）。所有字型欄位（文字、圖形內文字、文字樣式、頁碼）由 `mapFontFamilies` 走過：改後備種類（`generic`）時把用到它的字串都換成新的 `projectFontOption(...).family`；刪除時換成 `replaceWith`（選單裡的字型，不可是自己）。`fontUsage` 算使用數。
- 頁面順序由 `page/reorder { order }` 一次改完（完整的新順序，必須剛好是現有頁面的排列，否則 no-op；順序沒變回傳同一個 state；目前頁與選取跟著頁面走，不調整）。見「頁面排序」。
- 紙張尺寸與邊界由 `document/setPageSetup { size, margins }` 一次改完（所有頁面與主頁 + 邊界 = 一筆復原；物件位置不動；沒變的部分保留原參考）。
- 頁碼規則由 `document/setPageNumbering { rules }` 整份取代（一筆復原；依 `from` 排序後存；內容相同時回傳同一個 state；重疊或不合法時 no-op）。
- `history/batch { actions }`（MCP `batch`）：依序套用多個 action、只留一筆歷史，見「MCP」。
- undo/redo 後由 `reconcileSelection` 校正已經失效的頁面或選取 id。
- 沒有變化時必須回傳**同一個 state 參考**（測試有檢查），避免多餘的 render 和空的歷史紀錄。
- `element/update`（多個物件用 `element/updateMany`，一次 = 一筆復原；有一個 patch 不合法就整批不做）只在 dragend / transformend / 屬性確定時送出。拖曳過程中不要 dispatch。調色板（`ColorPalette`）點選色票寫入一次，不透明度 slider 拖曳時只改預覽、放開（`onValueCommit`）才寫入。
- reducer 內部會驗證名稱與顏色，非法輸入直接 no-op；UI 端的錯誤訊息用 sonner `toast`。

## 檔案（原 CLAUDE.md「目錄結構」）

```
    editor/                       # 不含 UI 的編輯器核心，新增邏輯優先放這裡並補測試
      types.ts                    # 文件模型（CanvasElement discriminated union）
      editor-reducer.ts           # 純 reducer + selectors + undo/redo
      selection-actions.ts        # 整組選取的刪除 / 複製 / 方向鍵移動 action（快捷鍵與底部動作列共用）
      editor-context.tsx          # EditorProvider、useEditorState / useEditorDispatch / useActivePage
      element-factory.ts          # 建立物件/頁面/範例文件、拖曳建立（createShapeInBox / createToolText）、describeElement
      geometry.ts                 # 物件外框（含旋轉；rotatedBoxBounds：任一外框旋轉後的外接框）、內容範圍、框選判斷（elementsInBox）、文字高度估算、MIN_ELEMENT_SIZE_PT、格線吸附 / 抽稀、邊界框
      properties.ts               # 屬性面板的數字換算（解析輸入、大小 / 旋轉 / 圓角 / 邊數的限制）
      validation.ts               # Result type、上傳檔案/名稱/字級/顏色驗證，以及 stroke / label / geometry 的執行時驗證（規則和 Rust format.rs 相同）
      __tests__/                  # vitest
tests/fixtures/sample.magproj     # Rust 與 vitest 共用的專案檔 fixture（v13：兩套專案字型（一套有粗體檔、一套沒有，檔案不存在）；六個色票，九種顏色欄位都有連結（頁面 / 主頁背景、主頁文字、圖形填色、邊框、圖形內文字、文字樣式、頁碼的文字 / 陰影 / 框線；頁碼文字是靛藍 50%）；封面的圓角矩形四角不同 [12, 12, 0, 4]；「標題」樣式是首尾置中（沒有文字連到它）；封面標題行距 1.4 / 字距 −20‰、頁尾 1.2 / 50‰；三個文字樣式（主頁頁尾連「頁尾」無覆寫、橢圓內文字連「內文」覆寫字級、封面標題不連結）；文字、四種 geometry 的圖形、圖片；有 / 沒有邊框與圖形內文字；兩層主頁，第 1 頁套用子主頁，主頁上有只在主頁用到的圖片；v14：Master B 有一個圖形庫的六角形 `el-master-hexagon`（放主頁：第 1 頁要和 sample-v2 逐一比對）；v15：六角形有點劃線邊框（不連色票）、一條三個點的箭頭線 `el-master-arrow`（虛線、連「靛藍」色票、終點實心三角；放主頁 B）；v16：封面標題首行縮排 2 + 右縮排 1，「頁尾」樣式與連到它的主頁頁尾首行突排（左 2、首行 −2，沒有覆寫）；v17：每個圖形都有 `image`，主頁 A 的色帶有照片 `assets/images/abcdef….jpg`（只有它引用，守著開檔清理））
tests/fixtures/default-text-styles.json  # 內建三個文字樣式：TS defaultTextStyles 與 Rust default_text_styles（舊檔升級時加上）都和它比對；fillSwatchId 是 null（舊檔沒有色票，新文件的連結在 createBlankDocument 才加）
tests/fixtures/sample-v2.magproj  # 同一份內容的 v2 格式，測試舊檔升級
tests/fixtures/sample-library.json  # Rust 與 vitest 共用的素材庫 fixture（兩層資料夾、未分類、文字、音訊、來自已刪除資料夾的垃圾桶素材）
```
