# 多選與一起移動實作計畫

> 對應任務：`docs/Plans/2026-10-03.md`
> 狀態：**全部完成**（2026-10-03），尚未 commit；還沒有桌面版的人工驗證
> 撰寫日期：2026-10-03

## 1. 現況

### 1.1 選取只能有一個

- `EditorState.selectedId: ElementId | null`（`editor-reducer.ts`），是 UI 狀態，不進復原歷史。
- 選取的入口只有 `selection/set`（一個 id 或 null）：
  - 畫布：物件的 `onMouseDown` → `onSelect(id)`（`canvas-elements.tsx`），按在頁面背景 / Stage 空白處 → `null`（`editor-canvas.tsx` 的 `handleStageMouseDown`）。
  - 圖層面板：點一列 → 選取該物件。
  - 新增 / 複製物件後自動選取新物件；換頁、新增頁面、切到建立工具時清空。
- `selectSelectedElement(state)` 回傳那一個物件，屬性面板、底部動作列、快捷鍵、畫布的 Transformer 都靠它。

### 1.2 移動一次只動一個物件

- 每個物件節點 `draggable`，`onDragEnd` 送一次 `element/update`（`{ x, y }`）= 一筆復原。
- Transformer 只掛一個節點：`transformer.nodes(node ? [node] : [])`。
- 方向鍵微調、Delete、Ctrl+D 都只作用在 `selectedId`。

## 2. 設計

### 2.1 不重複造輪子：交給 Konva Transformer

Konva 的 `Transformer` 本來就支援多個節點（`transformer.nodes([a, b, c])`）：

- 控制框包住所有節點。
- **拖曳其中一個節點時，Transformer 會讓其他節點跟著移動同樣的距離**（Konva 內建行為）。
- 多個節點時也能一起縮放 / 旋轉（見 4. 的問題 1）。

所以「一起拖曳」不用自己寫 dragmove 同步，只需要：

1. 把所有選取的節點交給 Transformer。
2. 拖曳結束時讀回**每個選取節點**的位置，一次寫進文件。

> 步驟 2 會先實際驗證這個內建行為；如果和預期不同，回頭和使用者討論再改做法。

### 2.2 狀態：`selectedId` → `selectedIds`

```ts
readonly selectedIds: readonly ElementId[];   // 依選取順序；空陣列 = 沒有選取
```

- 換成陣列，不保留 `selectedId`（兩個欄位會互相矛盾）。
- 仍然**不進復原歷史**。
- `reconcileSelection` 改成濾掉已不存在的 id。

Selectors：

| 名稱 | 回傳 | 用途 |
|---|---|---|
| `selectSelectedElements(state)` | 選取的物件（依圖層順序） | 畫布、Delete、方向鍵 |
| `selectSelectedElement(state)`（保留） | **只選一個時**回傳它，否則 null | 屬性面板、單一物件才有意義的操作 |

`selectSelectedElement` 保留原本的名字與語意（「唯一被選取的物件」），既有的呼叫端大多不用改。

### 2.3 Actions

| Action | 說明 |
|---|---|
| `selection/set { id }` | 不變：只選這一個（`null` = 清空）。 |
| `selection/toggle { id }`（新增） | Ctrl+點擊：沒選就加入、已選就移出。 |
| `element/updateMany { patches }`（新增） | `{ id, patch }[]`，**一次 commit = 一筆復原**。多選拖曳結束、多選方向鍵使用。驗證規則和 `element/update` 共用同一段函式。 |
| `element/deleteMany { ids }` 或把 `element/delete` 改成收 `ids` | 多選 Delete（見問題 2）。 |

### 2.4 畫布操作規則

| 操作 | 結果 |
|---|---|
| 點物件（沒按 Ctrl） | 物件**已在選取中** → 保留整組選取（才能拖曳整組）；否則只選它 |
| Ctrl + 點物件 | 加入 / 移出選取（`selection/toggle`） |
| 拖曳選取中的物件 | 整組一起移動，放開時一次 `element/updateMany` |
| 拖曳沒選取的物件 | 先只選它，再拖曳（和現在一樣） |
| 點空白處 / 頁面背景 | 清空選取（不變） |
| Ctrl + 點空白處 | 不清空（避免 Ctrl 點歪就全部取消） |
| 雙擊文字 / 圖形 | 只選它並進入文字編輯（不變） |

- 「已在選取中就保留整組」是常見做法（PowerPoint、draw.io、tldraw 都是），否則按下去的瞬間就變單選，整組拖不動。
- 多選時 Transformer 的控制點依問題 1 的決定設定。

### 2.5 其他會受影響的地方

| 位置 | 多選時的行為（建議） |
|---|---|
| 屬性面板 | 顯示「已選取 N 個物件」，不顯示樣式欄位（共同屬性編輯之後再做） |
| 圖層面板 | 選取中的列都標示；Ctrl + 點列也能加入 / 移出（見問題 3） |
| 底部動作列 刪除 / 複製 | 依問題 2 |
| 方向鍵微調 | 整組一起移動，一次 = 一筆復原 |
| Esc | 清空選取（不變） |
| 自動捲到畫面外的物件 | 只看最後一個加入選取的物件 |

### 2.6 框選（使用者決定這次一起做）

- 選取工具下，在**空白處或頁面背景**按下拖曳 → 畫出選取框，放開時選取框**完全包住**的物件被選取（PowerPoint、draw.io 的規則；只碰到一角不算）。
- 按住 Ctrl 框選 = 加入到目前的選取；沒按 Ctrl = 取代目前的選取。
- 拖曳不到 4 px 視為點擊 → 清空選取（和現在一樣）。
- 判斷用既有的 `geometry.ts` `getElementBounds`（已含旋轉）；「哪些物件在框內」寫成 `lib/editor` 的純函式並補測試。
- 預覽框和建立工具一樣直接改 DOM style，放開才 dispatch 一次，拖曳過程不重畫畫布。
- 手形工具 / 空白鍵 / 中鍵仍是平移，優先於框選。

### 2.7 不改的東西

- 文件模型 `types.ts`、Rust `format.rs`、檔案格式、`SCHEMA_VERSION`：選取是 UI 狀態，**都不用改**（`docs-website/types.html` 也不用改）。
- Ctrl 和現有快捷鍵不衝突：Ctrl+滾輪縮放是滾輪事件；選單快捷鍵是鍵盤事件。

## 3. 步驟

每一步完成後停下來，等使用者說「繼續」。

| 步驟 | 內容 | 驗證 | 狀態 |
|---|---|---|---|
| 1 | **reducer**：`selectedIds`、`selection/toggle`、`element/updateMany`（＋多選刪除，依問題 2）、`selectSelectedElements`、`reconcileSelection`；所有呼叫端改用新欄位。**畫面行為不變**（還沒有入口能多選）。 | vitest：toggle、updateMany 一筆復原、刪除後選取校正、沒變化回傳同一個參考 | **完成**（2026-10-03，見下方） |
| 2 | **畫布**：Ctrl + 點擊多選、Transformer 掛多個節點、拖曳結束一次寫入；多選時的控制點（依問題 1）。 | 無頭 Edge + CDP：Ctrl 點兩個物件 → 拖曳 → 兩個都移動、Ctrl+Z 一次全部回去 | **完成**（2026-10-03，見下方） |
| 3 | **框選**：空白處拖曳出選取框、完全包住才選、Ctrl 框選加入。 | vitest（框內判斷含旋轉物件）+ 無頭 Edge | **完成**（2026-10-03，見下方） |
| 4 | **其他操作**：方向鍵、Delete、Ctrl+D 作用在整組，屬性面板「已選取 N 個」、圖層面板標示與 Ctrl + 點擊、底部動作列。 | vitest + 無頭 Edge | **完成**（2026-10-03，見下方） |
| 5 | **文件**：`CLAUDE.md`（狀態、畫布、快捷鍵）、`docs/02-architecture.md` 的 `EditorState`、`docs/progress.md`。 | — | **完成**（2026-10-03）：另外更新 `docs-website/types.html` 的 `EditorState`（圖與說明卡）與 `docs/01-overview.md` 的功能表 |

### 步驟 1 實作紀錄（2026-10-03）

- `EditorState.selectedId` → `selectedIds: readonly ElementId[]`（清空時共用常數 `NO_SELECTION`）。
- `element/delete` 改收 `ids`、`element/duplicate` 改收 `copies: { id, newId }[]`（每個複本在各自原物件上方一層，之後選取這組複本；新 id 重複或原物件不存在時整批不做）。沒有另外新增 `deleteMany` / `duplicateMany`，一個 action 同時涵蓋單選與多選。
- 新增 `element/updateMany`、`selection/toggle`、`selectSelectedElements`；`element/update` 與 `updateMany` 共用 `isValidPatch` / `applyPatch`，批次裡**有一個 patch 不合法就整批不做**。
- 呼叫端（底部動作列、快捷鍵、圖層 / 屬性面板、畫布）暫時都傳單一物件，畫面行為不變；畫布「捲到畫面外的物件」改看最後加入選取的物件。
- vitest 197 個通過（新增 7 個），`tsc --noEmit` 通過。

### 步驟 2 實作紀錄（2026-10-03）

- **確認 Konva 的內建行為**：Transformer 掛多個節點時，拖曳其中一個，其他節點會跟著移動，而且**每個節點都會觸發 dragend**。所以 `handleMoveEnd` 每次都從 `transformer.nodes()` 讀整組位置送 `element/updateMany`；第一次之後的寫入沒有變化，reducer 回傳同一個 state，不會多出復原紀錄。
- `ElementNode`：`onSelect(id, additive)`（Ctrl / Cmd = additive）、新增 `onMoveEnd(id, node)`；`isAdditive()` 匯出共用。
- 畫布：點已選取的物件不改選取（才拖得動整組）；Ctrl + 點空白處不清空；Transformer 掛所有選取的節點，多選時 `enabledAnchors=[]`、`rotateEnabled=false`。
- **計畫外的修正**：同一個物件快速 Ctrl + 點兩下會被 Konva 當成雙擊而進入文字編輯（整組選取被換掉）。改成按住 Ctrl 的雙擊不進入編輯。
- 驗證：無頭 Edge + CDP 15 項（Ctrl 加入 / 移出、多選隱藏控制點、整組拖曳位移相同、沒選的不動、Ctrl+Z 一次全部回去、Ctrl+Y、Ctrl + 點空白不清空、拖曳沒選取的物件只動它、點空白清空）＋ 單選回歸 4 項（拖曳、一次復原、拉控制點縮放、雙擊文字編輯）全部通過；vitest 197 個通過。

### 步驟 3 實作紀錄（2026-10-03）

- `geometry.ts`：`boundsContain`、`elementsInBox`（用 `getElementBounds`，含旋轉；完全包住才算，貼齊邊算在內）。
- reducer：`selection/setMany { ids, additive }`（additive 時合併到目前選取、不重複）。
- `components/editor/use-canvas-marquee.ts`：畫布在 Stage 的 mousedown 判斷按在空白處 / 頁面背景時呼叫 `start`；pointermove / pointerup / Esc / 視窗失焦在**按下的當下**註冊到 `window`（不等 effect，否則快速點一下時 pointerup 可能比 listener 先到，下一次點擊會被當成框選結束）。選取框是實線半透明框（和建立工具的虛線預覽區分）。
- 不拖曳（< 4 px）只是點擊：沒按 Ctrl 清空選取（和以前一樣）。手形 / 建立工具在 capture 階段攔下事件，不會開始框選。
- 驗證：vitest 200 個通過（新增 3 個）；無頭 Edge 9 項（從頁面背景框選、只框到一部分不選、Ctrl 框選加入、預覽框、Esc 取消、點空白清空、框選後整組拖曳、工作區小拖曳、手形工具不框選），步驟 2 的 19 項重跑也全部通過。

### 步驟 4 實作紀錄（2026-10-03）

- 新增 `lib/editor/selection-actions.ts`：`deleteSelection` / `duplicateSelection` / `nudgeSelection`，快捷鍵與底部動作列共用（每個都是一筆復原）。
- 快捷鍵：Delete / Backspace、Ctrl+D、方向鍵（Shift = 10 pt）、Esc 都作用在整組選取。
- 底部動作列：刪除、複製作用在整組；「⋮」圖層順序**只在選取一個物件時可用**（多選的圖層順序不在這次範圍）。
- 屬性面板：多選時顯示「已選取 N 個物件」與可做的操作；沒有選取時的提示加上多選方式。
- 圖層面板：選取中的列都標示（步驟 1 已改）；Ctrl + 點列 = 加入 / 移出選取。
- 驗證：vitest 202 個通過（新增 2 個）；無頭 Edge 13 項（屬性面板數量、方向鍵 1 / 10 pt、一次復原、Ctrl+D、Delete、動作列複製 / 刪除、Esc、圖層面板 Ctrl + 點擊加入 / 標示 / 移出、單選時屬性面板照常），步驟 2、3 的 28 項重跑全部通過。

## 4. 決定紀錄（2026-10-03，使用者確認）

| 問題 | 決定 |
|---|---|
| 多選時能不能一起縮放 / 旋轉？ | **只做移動**：多選時隱藏縮放與旋轉控制點 |
| 多選時 Delete / Ctrl+D？ | **全部都作用**：Delete、方向鍵、Ctrl+D 都作用在整組；複製後選取新的那一組（各自位移 10 pt） |
| 圖層面板 Ctrl + 點擊多選？ | **可以** |
| 框選？ | **這次一起做**（步驟 3）；規則見 2.6（完全包住才選、Ctrl 加入），是建議值，使用者可再調整 |
