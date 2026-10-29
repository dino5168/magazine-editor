---
paths:
  - "src/lib/editor/types.ts"
  - "src/lib/editor/editor-reducer.ts"
  - "src/lib/editor/reducer/**"
  - "src/lib/editor/editor-context.tsx"
  - "src/lib/editor/element-factory.ts"
  - "src/lib/editor/validation.ts"
  - "src/lib/editor/geometry.ts"
  - "src/lib/editor/properties.ts"
  - "src/lib/editor/selection-actions.ts"
  - "src/lib/editor/__tests__/**"
  - "src-tauri/src/project/format/**"
  - "tests/fixtures/**"
  - "docs-website/types.html"
---

# 編輯器：文件模型與狀態

精簡前的完整原文（歷史、理由）：`docs/progress-archive/rules-2026-10/editor-model.md`。

## 文件模型（`types.ts`）

- 單位一律 **pt**，原點是頁面左上角。每種物件的 `x` / `y` 都是外框（旋轉前）左上角，旋轉也繞這一點。
- 物件 `text` / `shape` / `image` / `line`；`Page.elements[0]` 是最底層（圖層面板反向顯示）。
- 線條沒有 width / height，`points` 相對於 x / y（`normalizeLinePoints`），`stroke` 不可 null；reducer 檢查**套用後**的整條線（`isValidLine`）。Rust 不認識線條，匯出前由前端換成路徑圖形。見 `editor-shapes-lines.md`。
- 圖形 = 外框 + `geometry` + `fill` + `stroke | null` + `label | null` + `image | null`。**新增框型圖形 = 在 `SHAPE_LIBRARY` 加一筆**，不改 `ShapeGeometry`、檔案格式、Rust。
- `element-factory.ts` 的 `ShapeKind` 是 UI 的圖形選項（`SHAPE_PRESETS` 對應 geometry）；文件存的是 `GeometryKind`。
- 圓角 `CornerRadius`：四角一樣存一個數字、不同才存 `[左上, 右上, 右下, 左下]`（`normalizeCornerRadius`）；每角各自限制在短邊一半（不是 CSS 的等比例縮小）。
- 圖形內文字排在外框內縮 `LABEL_PADDING_PT` 的框裡；它的 Konva `Text` 的 `getClientRect` 回報空外框，否則超出的文字撐大 Transformer、縮放換算錯。清空文字 = `label: null`。
- 邊框畫在外框線中心；Transformer 設 `ignoreStroke`。
- **模型不存 scale**：`bakeTransform()` 把 scale 換進 width / height 再把節點 scale 設回 1；文字只改 width，不改字級。
- 文字樣式與色票都**照存實際值**，`styleId` / `*SwatchId` 只記連結；畫布、量測、匯出（含 Rust）不讀樣式表與色票表。見 `editor-text.md`、`editor-color-fonts.md`。
- `stroke` / `label` / `geometry` / `shadow` / `image` 是物件，`element/update` 的 patch **整個取代**：要展開原值（`{ stroke: { ...stroke, color } }`）。
- 物件可以超出頁面、不裁切（頁面 Group 不設 clip）。
- `margins` 只畫參考線，**匯出不讀**；檔案只驗證每邊 0–`MARGIN_MAX_PT`，「左 + 右 < 頁寬」只在對話框檢查。
- 頁碼由 `pageNumberRules` 算出、不是物件；`masters` 和 `pages` 分開存，頁面與主頁 id 全文件不重複。見 `editor-pages.md`。

## 新增物件類型 / geometry 要改的地方

- 新物件類型：`types.ts` 的 union、`geometry.localBounds`、`canvas-elements`（renderer + `StaticElement` + `bakeTransform`）、`editor-canvas` 的 `TRANSFORMER_OPTIONS`、`describeElement`、`layers-panel` 的 `elementIcon`、`properties-panel` 的 `tabsOf` / `elementName`；Rust `format/elements.rs` 的 `Element`、`export/render.rs` 的 `build_render`；`template.typ` 的 `draw`、`export/html/markup.rs` 的 `element_markup`。**`template.typ` 漏改只會靜默不畫**，其他漏改會編譯失敗。
- 新 geometry（圖形庫的圖形不用）：`ShapeGeometry`、`shape-geometry.ts` 的 `unitVertices`、`canvas-elements` 的 `ShapeBody`、`describeShape`、`shapeChoiceOf`、`layers-panel` 的 `GEOMETRY_ICONS`、`properties-panel` 的 `GeometryFields`、`validation.ts` 的 `isShapeGeometry`；Rust `format/elements.rs` 的 `ShapeGeometry` / `format/validate.rs` 的 `validate_geometry`、`render.rs` 的 `shape_kind`。
- 舊檔升級在 Rust（例如 `upgrade_shapes_to_v3`）。`recovery::read` 也要呼叫：備份檔沒有版本號，可能是舊格式。提升版本的完整步驟：skill `bump-file-format`。

## 狀態（`editor-reducer.ts` + `reducer/`）

- `useReducer` + 兩個 Context（state / dispatch 分開），不用 zustand / redux。`HANDLERS` 是 mapped type `HandlerMap`，由 `reducer/` 的 `element-` / `page-`（含主頁）/ `style-`（文字樣式、色票、字型）/ `document-handlers.ts`（文件、歷史、選取、檢視、工具）組成：新增 action 必須在對應的檔加 handler（各檔 `satisfies Partial<HandlerMap>`，漏了入口編譯失敗）。共用的 `commit`、`updateSheet`、patch 驗證在 `reducer/helpers.ts`。
- 進復原：`history.present`（上限 `HISTORY_LIMIT` 100）。不進：`activePageId`（可以是主頁 id）、`lastPageId`、`selectedIds`、`view`、`tool` / `shapeKind`、`savedDocument`。素材在 `LibraryProvider`；`dockLayout` 在 `home-page.tsx`；App 偏好在 `PreferencesProvider`。
- `selectActivePage` 回傳 `Sheet`：`element/*`、`page/rename`、`page/setBackground` 對頁面與主頁都有效；只要頁面的地方自己查 `pages`。
- 新 id 一律由呼叫端帶入。`element/*` 可帶 `pageId`：改那一頁而不切頁、不改選取；未知 `pageId` = no-op。
- **沒有變化時回傳同一個 state 參考**（測試有檢查）。非法輸入 no-op，UI 的錯誤訊息用 sonner `toast`。
- 一筆復原的整批 action：`element/updateMany`（一個 patch 不合法就整批不做）、`page/addMany`、`page/reorder`（必須剛好是現有頁面的排列）、`document/setPageSetup`、`document/setPageNumbering`、`swatch/applyEdits`、`element/moveToPage`、`element/replace`（同 id 換物件，圖層與選取不變）、`history/batch`（MCP）。
- 帶 `styleId`（含 `label.styleId`）必須存在（同 Rust `require_style`）；帶顏色的 action 要過 `hasValidSwatchLinks`（色票存在且 RGB 相等）；只給 `fill` 沒給 `fillSwatchId` = 取消連結。
- 拖曳 / 縮放中**不要 dispatch**，只在 dragend / transformend / 屬性確定時送；slider 用 `onValueCommit`。
- undo / redo 後由 `reconcileSelection` 校正失效的頁面與選取。

## 檔案

- `selection-actions.ts`：整組選取的刪除 / 複製 / 方向鍵（快捷鍵與底部動作列共用）。`properties.ts`：屬性面板的數字換算與限制。
- `tests/fixtures/sample.magproj`：Rust 與 vitest 共用，每版新增的欄位都要放一個例子（含每種色票連結）。**第 1 頁要和 `sample-v2.magproj`（v2 格式的同一份內容）逐一比對**，新內容放主頁；主頁 A 色帶的照片是唯一引用，守著開檔清理。`default-text-styles.json`：TS `defaultTextStyles` 與 Rust `default_text_styles` 都和它比對。
