---
paths:
  - "src/components/editor/editor-canvas.tsx"
  - "src/components/editor/canvas-*.tsx"
  - "src/components/editor/use-canvas-*.ts"
  - "src/components/editor/element-*.ts"
  - "src/components/editor/element-*.tsx"
  - "src/components/editor/bottom-toolbar.tsx"
  - "src/components/editor/editor-top-bar.tsx"
  - "src/components/editor/view-toggle-buttons.tsx"
  - "src/components/editor/asset-src.tsx"
  - "src/lib/editor/viewport.ts"
  - "src/lib/editor/ruler.ts"
  - "src/lib/editor/tools.ts"
  - "src/lib/editor/use-editor-shortcuts.ts"
  - "src/lib/editor/layer-order.ts"
  - "src/lib/editor/content-align.ts"
  - "src/lib/editor/geometry.ts"
---

# 畫布 UI（捲動縮放、多選框選、右鍵、工具、尺規、快捷鍵）

精簡前的完整原文（操作細節、刻度規則、不做的項目）：`docs/progress-archive/rules-2026-10/canvas-ui.md`。計畫：`docs/Plans/imp-muiti-select-move.md`、`docs/02-Plans-操作/01-繪圖物件ContextMenu-實作.md`、`docs/01-Plans/imp-tldraw-bar.md`、`docs/Plans/imp-view-ruler.md`。

## 捲動與縮放（`editor-canvas.tsx` / `viewport.ts`）

- Stage 只有視窗大小（`sticky`），外層 `overflow-scroll` 用空 div 撐捲軸；捲動只改 Layer 位移，不建超大 canvas。
- **Layer 是跨頁座標**：每頁是 `CanvasSheet` 裡位移 `x` 的 Group（`canvasSheets()`），**Group 裡才是頁面座標**。用到頁面座標的地方都要扣頁面位移：`pageAt`、`toPagePt`、`sheetOrigin`、`offsetBounds`；格線吸附以物件所在頁的 Group（`node.getParent()`）為參考。
- 內容範圍 = 每頁 ∪ 物件外框 + `WORKSPACE_MARGIN_PX`（`getContentBounds`）。螢幕像素 = Layer × zoom + `layout.offset` − scroll（`screenToPt` 回傳 Layer 座標）。
- 「符合畫面」以 `view/fit` 遞增 `fitRequest` 觸發（只有 canvas 知道 viewport）。
- 兩個 `useLayoutEffect`（捲動校正 → fit）**宣告順序不能對調**：fit 的錨點要留到下一次 commit。

## 多選與框選（`use-canvas-marquee.ts`）

- `selectedIds` 依選取順序；`selectSelectedElement` **只在剛好選一個時**回傳物件。
- 點**已選取**的物件不改選取（否則整組拖不動）；按住 Ctrl 的雙擊不進文字編輯。
- **整組拖曳交給 Transformer**：每個節點都會觸發 dragend；`handleMoveEnd` 每次從 `transformer.nodes()` 讀整組送 `element/updateMany`（沒變化時 reducer 回傳同一 state）。多選只能移動。
- 整組的刪除 / 複製 / 方向鍵 action 由 `selection-actions.ts` 產生（快捷鍵與動作列共用）。
- 框選：完全包住才選（`elementsInBox`，含旋轉）；不到 4px 是點擊。pointermove / pointerup **在按下當下註冊到 `window`，不要改成 effect**（快速點擊時 pointerup 可能比 effect 先到）。

## 右鍵選單（`element-context-menu.tsx` / `element-arrange.ts` / `layer-order.ts`）

- 項目、icon、停用條件、patch 都來自 `element-arrange.ts`（屬性面板、底部 `⋮`、右鍵選單共用，**不要在其中一處另寫**）；`canReorder` 和 reducer 一致（測試守著）。
- `ContextMenuTrigger asChild` **只包 Stage**：文字編輯框在裡面右鍵仍是瀏覽器選單。
- Konva `mousedown` 不分按鍵，右鍵按下時已選取；所以只問 `canOpen`（ref 讀最新的 selectionSize），不開時 `preventDefault()`。不自己做命中判斷。
- **`modal={false}`**：modal 在 body 設 `pointer-events: none`，開著時右鍵另一個物件選不到。`onCloseAutoFocus` 取消預設（空白鍵平移要焦點在 body）。
- 只有單選有作用；填滿用 `defaultKeepRatio`。

## 工具（`bottom-toolbar.tsx` / `tools.ts`）

- `tool` / `shapeKind` 是 UI 狀態，不進復原。`tools.ts` 是工具與工具快捷鍵的單一資料來源。圖片按鈕直接開選檔（同 `home-page.tsx` 的 `importImage`）。
- 平移（`use-canvas-pan`）與建立（`use-canvas-create`）在捲動容器的 **capture 階段**攔 `pointerdown`（`preventDefault` + `stopPropagation`），不會到 Konva；平移優先。只攔左鍵與中鍵。
- 建立只在放開時 dispatch 一次 `element/add`；預覽框直接改 DOM style。不到 4px 是點擊。
- **文字工具的新文字是草稿**（`draftText`），輸入完成才 `element/add`。
- `element/duplicate` 的新 id 由呼叫端帶入。

## 尺規（`ruler.ts` / `canvas-ruler.tsx`）

- `view.rulers`，**沒有快捷鍵**（Ctrl+R 是 WebView 重新整理）；偏好 `showRulers`。單位 mm，0 在目前頁（或主頁）左上角。
- 尺規在**捲動容器外**（2×2 grid），由 `ResizeObserver` 更新 viewport；關掉時是 `false` 佔位，捲動容器一直是同一個元素（`scrollRef` / ResizeObserver 不失效）。
- 一般 2D `<canvas>`（不是 Konva），依 `devicePixelRatio`；顏色讀 CSS tokens。分隔線用 inset shadow（border 會蓋住刻度）。
- 滑鼠標示線直接改 DOM（`moveRulerMarker`），**不 setState**（否則每次移動重畫整個畫布）。選取範圍 `selectionSpans` 只在放開後更新。

## 其他

- **canvas 必須等字型載入後才建 Stage**（Konva 不會重新量測）。`use-fonts-ready.ts`：預設字型 + 文件用到的字型都載入才畫；換字型時先 `loadFontOption` 再寫入。
- 文字編輯 overlay 用 `compositionstart/end` 與 `isComposing` 忽略選字期間的 Enter / Esc。
- 快捷鍵（`use-editor-shortcuts.ts`，`window` bubble 階段）焦點在 input、textarea、dialog、menu 內時不觸發。工具鍵與 Ctrl+D 以 **`event.code`** 比對，工具鍵不帶修飾鍵、按住只觸發一次。空白鍵（暫時手形）只在焦點在 `document.body` 時生效。瀏覽器分頁收不到 Ctrl+Shift+PageUp / PageDown。
- 匯入圖片：PNG / JPEG / WebP / GIF / SVG、≤ 20 MB、必須能解碼。瀏覽器模式用 `blob:` URL，**不 revoke**（undo 可能讓圖片回來）。
- `editor-canvas.tsx` 裡的 `document` 是編輯中的文件；DOM API 要寫 `window.document`。
- 瀏覽器模式（`npm run dev`）只載入 `createSampleDocument()`，檔案指令提示「僅在桌面版可用」。

## 檔案

- `canvas-elements.tsx`：物件 → Konva 節點、`bakeTransform()`、`snapAbsoluteToGrid()`、`StaticElement` / `StaticShape`（主頁內容、頁碼、對頁物件）。
- `canvas-sheet.tsx`：一頁的 Group（背景、格線、主頁、物件、頁碼、參考線）；雙頁時書背側裁切。
- `canvas-drop.tsx`：`CanvasDropProvider`（視窗座標 → 頁面座標，素材拖到畫布）。`asset-src.tsx`：`AssetSrcProvider`（文件範本縮圖讀範本資料夾）。
- `content-align.ts`：`fillContentPatch` / `alignContentPatch`（屬性面板的「對齊內容區」）。
