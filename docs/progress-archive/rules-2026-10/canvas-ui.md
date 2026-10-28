<!-- 迭代 2（commit 8959b47）的 .claude/rules/canvas-ui.md 原文；迭代 4 精簡前封存，不再更新 -->

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

### 畫布捲動與縮放（`editor-canvas.tsx` + `viewport.ts`）

- Stage 只有視窗大小，放在 `sticky` 容器裡；外層 `overflow-scroll` 內放一個 `contentWidth × contentHeight` 的空 div 撐出捲軸。捲動時只改 Layer 位移，不建立超大 canvas。
- **Layer 座標是「跨頁座標」**：畫布畫 `canvasSheets()` 的每一頁（單頁模式只有目前頁、位移 0；雙頁模式是整個跨頁，見「單頁 / 雙頁」），每頁是 `CanvasSheet`（`canvas-sheet.tsx`）裡一個位移 `x` 的 Konva Group，**Group 裡才是頁面座標**。所以用到頁面座標的地方都要經過頁面位移：建立工具（`pageAt`，按下處的那一頁）、框選（`toPagePt`，目前頁）、文字編輯框（`sheetOrigin`）、捲到選取物件（`offsetBounds`）；格線吸附以物件所在頁的 Group（`node.getParent()`）為參考，不是 Layer。
- 內容範圍 = 每一頁 ∪ 該頁所有物件外框（加上頁面位移後的聯集），再加上 200px 邊距（`getContentBounds` + `offsetBounds` + `WORKSPACE_MARGIN_PX`），確保拖到遠處的物件仍可以捲過去。
- 換算公式：螢幕像素 = Layer 座標 × zoom + `layout.offset` − scroll（`screenToPt` 回傳 Layer 座標，再減掉頁面位移才是頁面座標）。縮放或內容範圍改變時，用錨點（Ctrl+滾輪時是游標，其他情況是畫面中心）重新計算 scroll，讓錨點下的內容保持不動。
- 「符合畫面」以 `view/fit` 遞增 `fitRequest` 觸發，因為只有 canvas 知道 viewport 大小；範圍是整個 `canvasSheets`（雙頁時以跨頁置中）。
- 兩個 `useLayoutEffect`（捲動校正 → fit）的**宣告順序不能對調**：fit 設定的錨點必須留到下一次 commit 才處理。
- 從圖層面板選取完全不在畫面內的物件時，會自動捲動到該物件（多選時看最後加入選取的物件）。

### 多選與框選（`editor-canvas.tsx` + `use-canvas-marquee.ts`）

計畫與決定：`docs/Plans/imp-muiti-select-move.md`。

- `EditorState.selectedIds` 依選取順序存放；`selectSelectedElements` 回傳整組（圖層順序），`selectSelectedElement` **只在剛好選一個時**回傳物件（屬性面板、「⋮」圖層順序靠它）。
- 選取 actions：`selection/set`（只選一個 / `null` 清空）、`selection/toggle`（Ctrl+點擊）、`selection/setMany { ids, additive }`（框選）。`element/delete` 收 `ids`、`element/duplicate` 收 `copies: { id, newId }[]`。
- 畫布：Ctrl（或 Cmd）+ 點物件 = 加入 / 移出；點**已選取**的物件不改選取（否則整組拖不動）；Ctrl + 點空白處不清空；按住 Ctrl 的雙擊不進入文字編輯（快速 Ctrl 點兩下會被 Konva 當成雙擊）。圖層面板的 Ctrl + 點列相同。
- **整組拖曳交給 Konva Transformer**：Transformer 掛所有選取的節點，拖曳其中一個時 Konva 會移動其他節點，而且**每個節點都會觸發 dragend**。`handleMoveEnd` 每次都從 `transformer.nodes()` 讀整組位置送 `element/updateMany`；之後幾次沒有變化，reducer 回傳同一個 state。
- 多選只能移動：Transformer 的 `enabledAnchors=[]`、`rotateEnabled=false`；屬性面板顯示「已選取 N 個物件」。
- Delete / Ctrl+D / 方向鍵 / Esc 與底部動作列的刪除、複製作用在整組，action 由 `lib/editor/selection-actions.ts` 產生（快捷鍵與動作列共用）。
- **框選**：Stage 的 mousedown 按在空白處 / 頁面背景時開始（手形、建立工具在 capture 階段攔下，不會到這裡）；被選取框**完全包住**的物件才選（`geometry.ts` 的 `elementsInBox`，含旋轉）；Ctrl 框選 = 加入；Esc 取消；不到 4px 是點擊。pointermove / pointerup 在**按下的當下**註冊到 `window`，不要改成 effect：快速點一下時 pointerup 可能比 effect 先到。

### 右鍵選單（`element-context-menu.tsx` + `element-arrange.ts` + `lib/editor/layer-order.ts`）

計畫與決定：`docs/02-Plans-操作/01-繪圖物件ContextMenu-實作.md`。

- **內容**＝屬性面板「調整」分頁的「圖層順序」與「對齊內容區」，一層攤平：圖層順序 4 ─ 填滿寬度 / 高度 ─ 六個對齊（使用者決定）。文字沒有「填滿高度」。項目、icon、停用條件與 patch 都來自 `element-arrange.ts`（屬性面板、底部 `⋮`、右鍵選單三處共用，**不要在其中一處另寫**）；停用判斷 `canReorder` 和 reducer 一致（測試守著）。結果與復原同屬性面板（`element/reorder` / `element/update`，各一筆）。
- **觸發**：shadcn `ContextMenu`（`components/ui/context-menu.tsx`），`ContextMenuTrigger asChild` 包 Stage 外層的 `<div>`，**只包 Stage**：文字編輯框是兄弟元素，在裡面右鍵仍是瀏覽器的剪下 / 複製 / 貼上。
- **開不開**：Konva 的 `mousedown` 不分按鍵，右鍵按下時已經選取物件（點已選取的不改整組；空白 / 頁面背景 / 主頁內容 / 頁碼清空選取；對頁物件與跨書背的複本先切頁再選），`contextmenu` 在放開後才來。所以只問 `canOpen`（`latest.current.selectionSize > 0`，用 ref 讀最新值）；不開時 `preventDefault()`，瀏覽器選單也不出現。不自己做命中判斷。手形 / 建立工具只攔左鍵與中鍵，右鍵照樣選取並開選單。
- **`modal={false}`**：modal 選單在 body 設 `pointer-events: none`，選單開著時右鍵另一個物件到不了 Konva、選不到它。
- `onCloseAutoFocus` 取消預設：焦點留在 body（空白鍵平移只在焦點在 body 時生效）。選單內是 `role="menu"`，編輯器快捷鍵不觸發。
- **單選**才有作用；多選時顯示「已選取 N 個物件」＋ 12 項停用。填滿用 `defaultKeepRatio`（圖片保持比例；選單沒有「限制寬高比」開關，面板的開關是面板自己的暫時狀態）。
- 不做（之後另排）：多選的對齊 / 圖層順序、剪下 / 複製 / 刪除等項目、上移 / 下移快捷鍵、鍵盤開選單（Shift+F10）、圖層面板的右鍵。

### 底部工具列與畫布工具（`bottom-toolbar.tsx` + `lib/editor/tools.ts`）

參考 tldraw 的**工具模式**：先選工具，再到畫布上點擊或拖曳建立，建立後回到選取工具。計畫與決定：`docs/01-Plans/imp-tldraw-bar.md`。

- `EditorState.tool`（`select` / `hand` / `text` / `shape`）與 `shapeKind`（`ShapeChoice`：基本 5 種或 `preset:<id>`；圖形工具建立的圖形，也是按鈕上顯示的「最近用過的圖形」）是 UI 狀態，不進復原歷史。圖片不是工具模式：按鈕直接開選檔對話框（和「檔案 → 匯入 → 圖片」共用 `home-page.tsx` 的 `importImage`）。
- 工具列疊在畫布上（`absolute`），不佔版面，不影響畫布尺寸計算。
- 平移（`use-canvas-pan`）與建立（`use-canvas-create`）都在捲動容器的 **capture 階段**攔下 `pointerdown`（`preventDefault` + `stopPropagation`），事件不會到達 Konva：手形 / 建立工具下按在物件上不會選取或拖曳物件。平移優先；平移攔下的事件建立工具不處理。
- 建立：移動不到 4px 視為點擊（預設大小、以點擊處為中心）；拖曳時圖形填滿拖曳框。只在放開時 dispatch 一次 `element/add`；預覽框直接改 DOM style。
- **文字工具的新文字是草稿**（`editor-canvas` 的 `draftText`），不在文件裡；輸入完成才 `element/add`，所以復原一次就撤銷，沒輸入就不建立。
- `element/duplicate` 的新 id 由呼叫端帶入（`copies[].newId`），reducer 保持純函式。
- 可平移的範圍 = 捲軸的範圍（內容範圍 + 200px），不是無限畫布。

### 尺規（`lib/editor/ruler.ts` + `canvas-ruler.tsx`）

計畫與決定：`docs/Plans/imp-view-ruler.md`。參考 Affinity Publisher。

- **開關**：選單「視圖(V) → 尺規」（`view.rulers` 勾選項目，沒有快捷鍵：Ctrl+R 是 WebView 的重新整理）。狀態是 App 偏好 `Preferences.showRulers`（預設開，舊紀錄缺欄位讀成開）。
- **刻度**：單位固定 mm；**0 在目前頁的左上角**（和屬性面板 X / Y 同一套頁面座標；雙頁切到對頁時原點跟著跳；編輯主頁時是主頁的左上角）。主刻度從 1–2–5 級數（1 … 2000 mm）選，數字間距至少 50 px（`RULER_LABEL_MIN_GAP_PX`）、細刻度至少 4 px；100% 時每 20 mm 一個數字、2 mm 一格。數字畫在刻度之後，垂直尺規轉 90°；可見範圍前多算一個數字間距，捲出去一半的數字仍畫得出來。
- **版面**：`EditorCanvas` 外層是 2×2 grid（角落｜上尺規 / 左尺規｜捲動容器），尺規 20 px（`RULER_SIZE_PX`）、在**捲動容器外**：容器變小由既有的 `ResizeObserver` 更新 viewport，縮放、捲動、座標換算都不用改。關掉的尺規是 `false` 佔位，捲動容器一直是同一個元素（`scrollRef` 與 ResizeObserver 不會失效）。編輯主頁的橫幅（`MasterEditBanner`）開尺規時改 `top-8`。
- **畫法**：一般 HTML `<canvas>`（2D，不用 Konva），依 `devicePixelRatio` 設解析度；顏色與字型讀元素的 CSS（design tokens）。靠畫布那一邊的分隔線是 inset shadow（CSS border 會佔掉 1 px、蓋住刻度底端）。
- **標示**：
  - 滑鼠位置：捲動容器的 pointermove 直接改尺規上標示線的 `transform`（`moveRulerMarker`），**不 setState**（否則每次移動都重畫整個畫布）；pointerleave 隱藏。
  - 選取範圍：`selectionSpans`（選取物件外框的聯集，含旋轉）畫成色帶，在 canvas 之下。來自文件模型，所以**拖曳 / 縮放中不動，放開後才更新**。
  - 兩者都用選取框（Transformer）的靛藍色：主題的 `primary` 是近黑色，畫在尺規上像灰色。
- 不做（之後另排）：從尺規拖出參考線、改原點、切換單位、深色主題的尺規配色（canvas 要在主題切換時重畫）。

### 其他注意事項

- 字型：canvas 必須等字型載入後才建立 Stage，否則換行寬度會算錯（Konva 不會在字型載入後重新量測）。
  - 可選的字型是 `lib/editor/fonts.ts` 的 `FONT_OPTIONS`（屬性面板的下拉選單與字型載入的單一資料來源）；第一個是預設（黑體 `"Geist", "Noto Sans TC", sans-serif`）。文件的 `fontFamily` 存 `family` 字串，不在清單中的照常顯示，選單顯示「其他字型」。
  - **用到才載入**（`use-fonts-ready.ts`）：畫布等「預設字型 + 文件所有頁面用到的字型」都載入才畫；屬性面板換字型時先 `loadFontOption` 再寫入，畫布不會閃。中文字型也要等，一份中文雜誌的換行幾乎都由中文字型決定。
- 文字編輯 overlay 會用 `compositionstart/end` 和 `isComposing` 忽略選字期間的 Enter / Esc。
- 快捷鍵（Delete / Ctrl+Z / Ctrl+Y / Ctrl+D / Esc / 方向鍵 / 工具鍵 V・H・T・R・O・L（線條）・P（鉛筆） / 換頁 PageUp・PageDown・Ctrl+Home・Ctrl+End / 移動目前頁面 Ctrl+Shift+PageUp・PageDown）焦點在 input、textarea、dialog、menu 內時不觸發。
  - 一般瀏覽器分頁（`npm run dev`）會自己攔下 Ctrl+Shift+PageUp / PageDown（移動瀏覽器分頁），網頁收不到；桌面版沒有這個問題。
  - 工具鍵與 Ctrl+D 以 **`event.code`** 比對；工具鍵只接受不帶修飾鍵的按鍵（不會和選單快捷鍵衝突），按住不放只觸發一次。沒有選取時 Esc 回到選取工具。
  - 空白鍵（暫時手形）只在焦點在 `document.body` 時生效：輸入框照常打空白，按鈕照常用空白鍵觸發。
- 匯入的圖片只接受 PNG / JPEG / WebP / GIF / SVG、單檔 ≤ 20 MB，而且必須能實際解碼（SVG 見「素材管理」的 SVG）；桌面版會複製進專案（見「檔案系統」與「素材管理」）。瀏覽器模式才使用 `blob:` URL，而且不 revoke（undo 可能讓刪除的圖片回來）。
- `tauri.conf.json` 設定 `dragDropEnabled: false`：Tauri 預設會攔截檔案拖放，HTML5 drop 事件在 Windows 上收不到，「素材」面板與素材管理視窗從檔案總管拖檔案進來需要這個設定。**不可移除**。
- 桌面版啟動時開啟上次的專案，沒有就建立空白 A4 的未命名專案；瀏覽器模式（`npm run dev`）沒有檔案存取，只載入 `createSampleDocument()` 的示範內容，檔案指令會提示「僅在桌面版可用」。

## 檔案（原 CLAUDE.md「目錄結構」）

```
    editor/
      editor-canvas.tsx           # Stage、捲動工作區、zoom/fit、Transformer、選取、文字編輯 overlay；Layer 是跨頁座標（canvasSheets）；外層 grid 放尺規
      element-context-menu.tsx    # ElementContextMenu：畫布物件的右鍵選單（包住 Stage；有選取才開、modal={false}；單選 12 項、多選停用，見「右鍵選單」）
      element-arrange.ts          # 「圖層順序」「對齊內容區」的項目（REORDER_ITEMS / FILL_ITEMS / ALIGN_EDGES）、defaultKeepRatio、useContentAlign（文字高度用 Konva 量測）；屬性面板、底部 ⋮、右鍵選單共用
      canvas-drop.tsx             # CanvasDropProvider / useCanvasDrop：畫布登記「視窗座標 → 那一頁與頁面座標」（沿用 pageAt），素材面板拖到畫布時用
      canvas-ruler.tsx            # 尺規：CanvasRuler（2D canvas 刻度 + 選取範圍色帶 + 滑鼠標示線）、RulerCorner（角落 mm）、moveRulerMarker（直接改 DOM）
      canvas-sheet.tsx            # CanvasSheet：一頁畫在位移 x 的 Group 裡（背景、格線、主頁內容、對頁跨過書背的複本、物件、頁碼、參考線、頁緣）；雙頁時書背側裁切；對頁畫成靜態、按下切頁；SpreadSpine 書背線
      asset-src.tsx               # AssetSrcProvider / useResolveSrc：覆寫圖片節點從哪個資料夾讀檔（文件範本的縮圖），沒有 provider 時用目前專案
      canvas-elements.tsx         # 物件 → Konva 節點的 renderer；bakeTransform()；snapAbsoluteToGrid()；StaticElement / StaticShape（主頁內容、頁碼、對頁物件：不能編輯的節點，預設不攔事件）
      use-canvas-pan.ts           # 手形工具 / 空白鍵 / 中鍵拖曳平移（只改捲動位置）
      use-canvas-create.ts        # 文字 / 圖形工具在畫布上點擊或拖曳建立（預覽框）
      use-canvas-marquee.ts       # 選取工具在空白處拖曳框選（選取框、Ctrl 加入、Esc 取消）
      bottom-toolbar.tsx          # tldraw 風格底部工具列：工具 + 動作列（復原 / 重做 / 刪除 / 複製 / ⋮）
      editor-top-bar.tsx          # 系統控制項：文件名稱、格線開關（ViewToggleButtons）、縮放、匯出 PDF（復原 / 重做在底部動作列）；`@container`，窄時「匯出 PDF」只剩 icon
      view-toggle-buttons.tsx     # TopBar 的格線 / 內容區對齊線 / 邊界參考線 / 吸附格線切換鈕（VIEW_TOGGLES）+ 間距 Popover（MmField、「更多設定...」）
      icon-button.tsx · inline-name-input.tsx   # 共用小元件
      layer-order.ts              # 圖層順序：REORDER_DIRECTIONS / ReorderDirection（element/reorder 的方向）、canReorder（停用判斷，和 reducer 一致，測試守著）
      content-align.ts            # 對齊內容區：contentArea（= contentGuides().area）、fillContentPatch（填滿寬 / 高，旋轉歸零、照限制寬高比）、alignContentPatch（旋轉後外框對齊邊 / 中線）、fillContentDisabledReason
      viewport.ts                 # 縮放、捲動版面與錨點換算（pt ↔ 螢幕像素）
      ruler.ts                    # 尺規的純邏輯：rulerScale（依縮放選 1–2–5 主刻度與細分）、rulerTicks（可見刻度）、rulerOrigin（目前頁左上角的螢幕位置）、selectionSpans（選取範圍）
      tools.ts                    # 畫布工具（select / hand / text / shape / line / pencil）與工具快捷鍵的單一資料來源
      use-editor-shortcuts.ts     # 全域快捷鍵
```
