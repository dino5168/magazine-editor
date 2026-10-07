# 「頁面」面板調整：分區收合與拖曳調整高度

- 任務檔：`docs/Plans/2026-10-07-Master頁面調整.md`（不 commit）；參考圖 `docs/Plans/Images/頁面調整-Master.png`
- 狀態：**五個步驟全部完成（2026-10-07）**，尚未 commit。決定見第 6 節，進度與和計畫不同的地方見第 7 節。
- 建立：2026-10-07；前置：主頁與動態變數（`imp-master-pages.md`，commit `b9ed0c3`）

---

## 1. 目標（照參考圖）

1. 「主頁」「頁面」兩區的標題列**各自有收合鈕**（▷ / ▽），可以分別收合；不是只有整個面板收合。
2. **按住「頁面」標題列上下拖曳**，調整兩區的高度分配（主頁區變高、頁面區就變矮，反之亦然）。

## 2. 現況

| 項目 | 現況 |
|---|---|
| 面板外框 | `DockPanel`：標題列（整個面板的收合 / 拖曳移動 / 關閉）+ 一個 `ScrollArea` 包住全部內容（內距 `p-4`） |
| 「頁面」面板 | `pages-panel.tsx`：`Section`（標題 + 新增 / 複製 / 刪除按鈕）× 2，上下接在一起，整個面板一起捲動；沒有分區收合、沒有高度分配 |
| 可以重用的 | `components/pointer-drag.ts` 的 `startPointerDrag`（4 px 門檻、Esc 取消、拖曳後吞掉 click、`grabbing` 游標，工具面板與頁籤拖曳已在用）；`DockPanel` 的收合圖示寫法（`ChevronDown` 旋轉 -90°）；`DockSplitter` 的「預覽用 local state、放開才寫回」與雙擊還原、方向鍵微調的做法；`dock-storage.ts` / `preferences-storage.ts` 的 localStorage 讀寫模式（`getBrowserStorage`、壞資料回預設） |

**為什麼不能只在 `pages-panel.tsx` 裡做**：兩區要「分掉面板的高度」並各自捲動，內容必須填滿面板高度；但 `DockPanel` 把內容包在一個會自己長高的 `ScrollArea` 裡，內容拿不到固定高度。所以 `DockPanel` 要能讓個別面板**自己處理捲動**。

## 3. 設計

### 3.1 版面狀態（`lib/dock/pages-panel-layout.ts`，純函式）

```ts
interface PagesPanelLayout {
  readonly mastersCollapsed: boolean;
  readonly pagesCollapsed: boolean;
  /** 兩區都展開時，主頁區佔「可分配高度」的比例（0–1）。 */
  readonly mastersRatio: number;
}
```

- 存**比例**不存 px：停靠區高度改變（視窗縮放、同側多了別的面板）時兩區照比例縮放。
- `resizeMastersRatio(startRatio, deltaY, availableHeight)`：拖曳換算成新比例，夾在「兩區內容各至少 `SECTION_MIN_PX`（建議 80 px）」之內；可分配高度太小時不調整。
- 收合 / 展開、雙擊還原預設比例（建議 0.35）、`parsePagesPanelLayout`（逐欄驗證，壞資料回預設）。
- 沒有變化時回傳同一個物件（和 `dock-layout.ts` 相同慣例）。

### 3.2 收合時的版面（參考 Affinity：收起來的區只剩標題列，展開的區吃掉剩下的高度）

| 主頁 | 頁面 | 結果 |
|---|---|---|
| 展開 | 展開 | 依 `mastersRatio` 分配；**可以拖曳「頁面」標題列** |
| 收合 | 展開 | 主頁只剩標題列；頁面區佔滿其餘高度；不能拖曳 |
| 展開 | 收合 | 主頁區佔滿；「頁面」標題列貼在面板底部；不能拖曳 |
| 收合 | 收合 | 兩個標題列靠上排列 |

### 3.3 拖曳（重用 `startPointerDrag`）

- 在「頁面」標題列按下（按在收合鈕或新增 / 複製 / 刪除按鈕上不算）→ 移動超過 4 px 才開始拖曳，所以點一下不會誤改高度。
- 拖曳中只改面板的 local state（預覽），**放開才寫回**並存檔；Esc 取消回到原高度。
- 標題列 hover 顯示 `cursor: row-resize`；雙擊還原預設比例；標題列可聚焦，↑ / ↓ 每次調 16 px（同 `DockSplitter` 的鍵盤操作）。
- 拖曳只改面板 UI，不進復原歷史、不改文件、不標記未存檔。

### 3.4 `DockPanel` 讓面板自己捲動

- `PANEL_DEFINITIONS` 加一個可選欄位（例如 `scroll: "self"`），只有 `pages` 設定。`DockPanel` 對這種面板不包 `ScrollArea`、不加內距，改成 `flex-1 min-h-0` 的容器讓內容填滿；其他 9 個面板完全不變。
- 「頁面」面板兩區各自用 shadcn `ScrollArea` 捲動（沿用 `DockPanel` 修正 Radix `display: table` 撐寬的那個 class）。

### 3.5 記憶（見待討論 Q1）

- 建議存 localStorage `magazine-editor.pagesPanel.v1`（和工具面板版面、偏好設定同一類：存在這台電腦、不存進專案、不進復原歷史），讀取一律過 `parsePagesPanelLayout`。

## 4. 步驟

每一步做完停下來，等使用者說「繼續」。

| 步驟 | 內容 | 畫面變化 | 驗證 |
|---|---|---|---|
| **1. 版面純邏輯與記憶** | `lib/dock/pages-panel-layout.ts`（型別、預設、收合、拖曳換算與夾限、還原、parse）＋ localStorage 讀寫（照 `dock-storage.ts` 的模式，重用 `getBrowserStorage`） | 無 | vitest |
| **2. `DockPanel` 支援自己捲動的面板** | `PANEL_DEFINITIONS` 加 `scroll: "self"`（只有 `pages`）；`DockPanel` 依它決定要不要包 `ScrollArea`；`pages-panel.tsx` 暫時自己包一個 `ScrollArea`，外觀維持原樣 | 無（其他面板不變） | 無頭 Edge：各面板捲動與寬度照舊 |
| **3. 兩區各自收合、各自捲動** | 標題列加收合鈕（▷ / ▽，和面板標題同樣的 `ChevronDown` 旋轉）；兩區依 `mastersRatio` 分高度、各自 `ScrollArea`；收合規則照 3.2；狀態存 localStorage | 有 | 無頭 Edge |
| **4. 拖曳「頁面」標題列調整高度** | `startPointerDrag`、預覽 / 放開寫回、Esc 取消、雙擊還原、↑ / ↓、`row-resize` 游標、最小高度 | 有 | vitest（換算）＋ 無頭 Edge（拖曳、Esc、點按鈕不會拖、重新整理後保留） |
| **5. 文件同步** | `CLAUDE.md`「主頁與動態變數」與「工具面板」、`docs/01`、`progress.md`、這份計畫 | 無 | — |

## 5. 規劃檢核

1. **不能只改 `pages-panel.tsx`**：兩區分高度需要固定高度的容器，`DockPanel` 的共用 `ScrollArea` 給不了 → 步驟 2 讓面板可以自己處理捲動，並確認其他面板不受影響。
2. **拖曳和點擊衝突**：「頁面」標題列上有收合鈕與三個按鈕 → 按在 `button` 上不開始拖曳（同頁籤拖曳的做法）；`startPointerDrag` 的 4 px 門檻與「拖曳後吞掉 click」避免放開時誤觸。
3. **和整個面板的拖曳移動衝突**：面板外框的標題列（「頁面」兩個字 + 圖示那一列）仍是移動面板用；這次拖的是面板**內容裡**的「頁面」區標題列，兩者是不同元素，事件不會互相觸發（內容區的 pointerdown 不會冒泡到外框標題列的 handler）。
4. **停靠區很矮時**：可分配高度 < 兩個最小高度 → 不調整、維持比例，內容各自捲動，不會出現負高度。
5. **縮圖的延遲建立**：縮圖用 `IntersectionObserver`（root 是 viewport），換成各區自己的 `ScrollArea` 後仍然有效（被祖先裁掉的部分不算可見）；收合時縮圖卸載、展開時重建，屬於預期。
6. **不重複造輪子**：拖曳流程用 `startPointerDrag`、記憶用 `getBrowserStorage` + 既有的 parse / 回預設模式、收合圖示沿用 `DockPanel` 的寫法、捲動用 shadcn `ScrollArea`；不另外引入 resizable 套件（例如 shadcn `resizable` / `react-resizable-panels`），因為只有一條分隔線，而且要「拖標題列」而不是拖一條獨立的分隔線。

## 6. 待討論

| # | 問題 | 建議 |
|---|---|---|
| Q1 | 兩區的收合狀態與高度要不要記住（重開 App 後還原）？ | 記在這台電腦（localStorage），和工具面板版面一樣 |
| Q2 | 「頁面」區收合時，它的標題列放哪裡？ | 貼在面板底部，主頁區佔滿其餘高度（Affinity 的做法） |

**使用者決定（2026-10-07）：兩題都採用建議。** Q1 記在這台電腦（localStorage）；Q2 收合的「頁面」標題列貼在面板底部。

## 7. 進度

### 步驟 1（2026-10-07，完成）

- `src/lib/dock/pages-panel-layout.ts`：`PagesPanelLayout`（`mastersCollapsed` / `pagesCollapsed` / `mastersRatio`）、`DEFAULT_PAGES_PANEL_LAYOUT`（兩區展開、主頁 0.35）、`toggleSection`、`canResizeSections`（兩區都展開才可拖曳）、`resizeMastersRatio`（兩區內容各至少 80 px `PAGES_SECTION_MIN_PX`，放不下時不調整）、`setMastersRatio`（不合法或沒變回傳同一個物件）、`sectionHeights`、`parsePagesPanelLayout`（逐欄驗證）、`loadPagesPanelLayout` / `savePagesPanelLayout`（key `magazine-editor.pagesPanel.v1`，壞資料回預設、寫入失敗忽略）。
- **和計畫不同**：讀寫 localStorage 放在同一個檔案（只有兩個小函式，不另開 `*-storage.ts`）；「還原預設」直接用 `setMastersRatio(layout, MASTERS_RATIO_DEFAULT)`，不另寫函式。
- 測試：vitest 334 個（新增 10 個）。畫面沒有變化。

### 步驟 2（2026-10-07，完成）

- `lib/dock/panels.ts`：`PanelDefinition` 加可選的 `scroll?: "self"`，只有 `pages` 設定；`panelScrollsItself(id)`。
- `components/dock/dock-panel.tsx`：自己捲動的面板，內容放在 `flex-1 min-h-0` 的容器裡（不包 `ScrollArea`、不加內距）；其他面板照舊。原本的 `ScrollArea` + Radix `display: table` 修正抽成匯出的 `DockScrollArea`，讓「頁面」面板重用同一個修正。
- `pages-panel.tsx`：暫時自己包一個 `DockScrollArea` + 原本的內距，外觀不變（步驟 3 改成兩區各自捲動）。
- 驗證：vitest 334 個；無頭 Edge 9 項（範本 / 屬性 / 圖層仍是一個捲動區且有原本的內距、「頁面」外觀與內距不變且捲動區填滿面板、頁數多時可以捲動、整個面板收合照常、console 沒有錯誤）。
- 注意：驗證時 1420 埠已經有另一個 dev server（使用者自己啟動的），測試是對它跑的（Vite 提供的是目前的原始檔，結果有效）；沒有關掉它。

### 步驟 3（2026-10-07，完成）

- `pages-panel.tsx`：兩區的標題列與內容區是**同一層的 flex 子元素**（`Section` 回傳 header + 內容，不包外層），內容區用 `flex: <比例> 1 0px` 分配兩個標題列以外的高度，所以**不用量測高度**；收起一區時另一區 `flex-grow: 1` 佔滿，收起的「頁面」標題列自然貼在底部；兩區都收起時標題列靠上。
- 標題列：收合鈕（`ChevronDown`，收起時轉 -90°，`aria-expanded` / `aria-controls`）+ 標題 + 原本的新增 / 複製 / 刪除；內容區 `role="region"`，各自用 `DockScrollArea` 捲動。
- 狀態：`useState(loadPagesPanelLayout(getBrowserStorage()))`，變更時 `savePagesPanelLayout`。
- **和計畫不同**：步驟 1 的 `sectionHeights` 用不到（flex-grow 直接分配），已刪除（連同測試）。
- 驗證：vitest 333 個；無頭 Edge 12 項（預設兩區展開且各自捲動、主頁約 35%、填滿面板、頁面區自己捲動、收合主頁 / 收合頁面（標題列貼底）/ 兩區都收合的位置、重新整理後保留、標題列按鈕照常、console 沒有錯誤）。這次用自己開的 1421 埠，沒有動使用者的 1420。

### 步驟 4（2026-10-07，完成）

- `components/editor/panels/use-section-resize.ts`：`useSectionResize`。按在「頁面」標題列（不是按鈕）→ `startPointerDrag`（4 px 門檻、Esc 取消、拖曳後吞掉 click）；拖曳中**直接改兩個內容區的 `style.flex`**（不觸發 React render，縮圖不重畫），放開才 `setMastersRatio` 寫回並存檔，Esc 改回原比例；雙擊還原 0.35；分隔線上 ↑ / ↓ 每次 16 px。換算與最小高度用步驟 1 的 `resizeMastersRatio`。
- `components/pointer-drag.ts`：`startPointerDrag` 多一個可選的 `cursor`（預設仍是 `grabbing`，工具面板與頁籤拖曳不變）；這裡用 `row-resize`。
- `pages-panel.tsx`：只有兩區都展開時「頁面」標題列可以拖曳（`cursor-row-resize`、`title` 提示），上緣有 `role="separator"` 的分隔線（可聚焦、`aria-valuenow`，hover / 拖曳時亮起，樣式同 `DockSplitter`）。
- **和計畫不同（實作時發現）**：步驟 3 的收合鈕包住了箭頭與標題、幾乎佔滿整條標題列，而按在按鈕上不會開始拖曳，等於抓不到「頁面」。改成**只有箭頭是收合鈕**（`aria-label` 收合 / 展開），標題是一般文字，按住標題就能拖曳。
- 驗證：vitest 333 個；無頭 Edge 16 項（往下拖 60 px 主頁就高 60 px、拖曳中即時預覽與 `row-resize` 游標、放開存檔、不進復原歷史、上下極限各 80 px、Esc 復原且不存檔、雙擊還原 35%、單擊不變、按在收合鈕上不會拖、↓ 鍵 16 px、收合時不能拖、重新整理後保留、console 沒有錯誤），步驟 3 的 12 項重跑仍全部通過。

### 步驟 5（2026-10-07，完成）

- `CLAUDE.md`：「主頁與動態變數」的「頁面」面板補上兩區收合、flex 分配高度、拖曳、記憶；「工具面板」補 `DockScrollArea` 與 `scroll: "self"`；目錄結構補 `pages-panel-layout.ts`、`use-section-resize.ts`、`dock-panel.tsx` / `pointer-drag.ts` 的說明。
- `docs/01-overview.md`：主頁功能列補兩區收合與拖曳調高度。
- `docs/progress.md`：完成紀錄。
