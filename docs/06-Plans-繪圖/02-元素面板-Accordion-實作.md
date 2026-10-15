# 元素面板改成 Accordion（單一展開）實作計畫

> 來源：使用者需求（2026-10-15）「目前的元素分類是整個展開的，修正為 Accordion Menu，單一展開」。沒有任務檔。
> 前一個任務：`01-繪圖-實作.md`（圖形庫，commit `6537598`）。做法照往例：一步一步做，每一步做完停下來等「繼續」；commit 只在使用者要求時做。

---

## 1. 現況

- 「元素」面板（`components/editor/panels/elements-panel.tsx`）把 `SHAPE_OPTION_GROUPS` 的四個分類（基本 13、方塊與流程 10、箭頭 4、標註與旗幟 5）**全部展開**，一個分類一個標題 + 4 欄格子；面板高度不夠時整個面板捲動（停靠區的共用捲動區）。
- 圖形一多，要找後面分類的圖形得一直往下捲。

## 2. 目標

- 四個分類變成 **Accordion**：每個分類一列標題（可點），**同時只展開一個**；點另一個分類 = 收起目前的、展開那一個。
- 展開的內容和現在相同（4 欄格子、圖示 + 名稱、點一下放到頁面中央）。

## 3. 設計

### 3.1 不重複造輪子：用 shadcn 的 Accordion

- `npx shadcn@4.21.0 add accordion`（和 scaffold 同版本；底層是 `radix-ui` 單一套件裡的 Accordion，專案已經在用 `radix-ui`，**不新增 npm 套件**）。產生的 `components/ui/accordion.tsx` 當 vendor code，不修改；需要的樣式在外層包。
- `type="single"`：Radix 本身就保證同時只有一個展開；鍵盤操作（Tab 到標題、Enter / Space 切換、↑ ↓ Home End 在標題間移動）、`aria-expanded` / `aria-controls` 都由 Radix 處理，不用自己寫。
- 展開 / 收起的動畫用 shadcn 預設（`tw-animate-css` 的 accordion 高度動畫，專案已經有 `tw-animate-css`）。

### 3.2 狀態

- 受控 `value`（目前展開的分類 id，或 `""` = 全部收起，見 §5 Q2）。
- **要不要記住上次展開的分類**見 §5 Q1。要記住時：比照「頁面」面板的 `pages-panel-layout.ts`，新增 `lib/dock/elements-panel-layout.ts`（純函式 `parseElementsPanelLayout` + localStorage 讀寫，key `magazine-editor.elementsPanel.v1`；讀到不認得的分類 id 回預設）。App 偏好：不進復原歷史、不存進專案。

### 3.3 標題列

- 分類名稱 + 圖形數量（例如「方塊與流程　10」），右邊是 shadcn 的展開箭頭。見 §5 Q3。
- 面板頂端原本的說明文字（「點擊加入頁面中央；也可以在下方工具列…」）保留。

### 3.4 不改的地方

- `SHAPE_OPTION_GROUPS`（`shape-options.ts`）、建立圖形的邏輯、底部工具列與屬性面板都不動（工具列選單見 §5 Q4）。
- 面板仍由停靠區的共用捲動區包（`PANEL_DEFINITIONS` 不用 `scroll: "self"`）：一次只展開一個分類，最多 13 個圖形，通常不用捲動。

## 4. 步驟

| 步驟 | 內容 | 驗收 |
|---|---|---|
| 1 | `npx shadcn@4.21.0 add accordion`，檢查產生的檔案（只有 `components/ui/accordion.tsx`、沒有新增 npm 套件、動畫 class 在 `tw-animate-css` 裡） | `npm run build` |
| 2 | （Q1 選「記住」時）`lib/dock/elements-panel-layout.ts`：預設值、`parseElementsPanelLayout`、讀寫 localStorage | vitest：預設、壞掉的值、不認得的分類 id |
| 3 | `elements-panel.tsx` 改成 `Accordion type="single"`，標題列（名稱 + 數量），內容沿用現在的格子 | 無頭 Edge：一次只展開一個、點另一個切換、（Q2）可以全部收起、（Q1）重新整理後記得、鍵盤 Enter / ↓ 可操作、點圖形照樣加入；截圖目測 |
| 4 | 文件：`CLAUDE.md`（目錄結構的元素面板、`components/ui/` 多了 accordion）、`docs/progress.md`、本文件的結果紀錄 | — |

## 5. 使用者決定（2026-10-15，都照建議）

| # | 問題 | 決定 |
|---|---|---|
| Q1 | 打開面板時展開哪一個 | **記住上次展開的分類**（存這台電腦）；第一次是「基本」→ 做步驟 2 |
| Q2 | 可以全部收起嗎 | **可以**（Radix `collapsible`；收起的狀態也記住） |
| Q3 | 標題列顯示圖形數量 | **要**（右側淡色數字） |
| Q4 | 底部工具列「更多圖形」選單 | **不改** |

## 6. 結果紀錄

### 步驟 1：完成（2026-10-15）

- `npx shadcn@4.21.0 add accordion --yes`：只新增 `src/components/ui/accordion.tsx`；`package.json` / `package-lock.json` 沒變（用的是已經裝好的 `radix-ui` 的 `Accordion`、`lucide-react` 的箭頭、專案的 `cn`）。
- 產生的元件（vendor code，不改）：`Accordion`（`flex w-full flex-col`）、`AccordionItem`（除了最後一個都有下框線）、`AccordionTrigger`（`Header` 包 `Trigger`，右側 `ChevronDown` / 展開時 `ChevronUp`，**預設 `hover:underline`**）、`AccordionContent`（`data-open:animate-accordion-down` / `data-closed:animate-accordion-up`，內層高度 `--radix-accordion-content-height`）。
- 給步驟 3 的注意：專案的 `cn` 不合併衝突的 class，要蓋掉 `hover:underline` 不能只在外面加 `hover:no-underline`（CSS 順序不保證），步驟 3 再決定（例如標題文字不受 underline 影響的寫法，或接受底線）；動畫 class 是否真的有產生（`tw-animate-css` 的 accordion keyframes）在步驟 3 的瀏覽器實測確認（`dist/` 這裡讀不到）。
- `npm run build` 通過。

### 步驟 2：完成（2026-10-15）

- `src/lib/dock/elements-panel-layout.ts`（照 `pages-panel-layout.ts` 的寫法）：`ElementsPanelLayout { openCategory: ShapeCategoryId | null }`（null = 全部收起）、`DEFAULT_ELEMENTS_PANEL_LAYOUT`（「基本」）、`parseElementsPanelLayout`（認得的分類照用；存的 `null` 保留；其他（壞掉、不是物件、不認得的分類 id，例如之後改名或移除的分類）→ 預設，不會因為意外打開成全部收起）、`accordionValue` / `layoutFromAccordion`（Radix 單一 accordion 以 `""` 表示全部收起；不認得的值 → 全部收起）、`load` / `saveElementsPanelLayout`（localStorage key `magazine-editor.elementsPanel.v1`；讀寫失敗不影響編輯）。分類 id 的清單來自 `SHAPE_CATEGORIES`，不另寫一份。
- 測試 `__tests__/elements-panel-layout.test.ts`（5 個）：parse 的保留與退回預設、accordion 值互轉、存取（含全部收起）與壞掉 / 不能用的 storage。vitest `src/lib/dock` 65 個通過、型別檢查通過。

### 步驟 3：完成（2026-10-15）

- `components/editor/panels/elements-panel.tsx`：`Accordion type="single" collapsible`，受控 `value = accordionValue(layout)`；`onValueChange` → `layoutFromAccordion` → state + `saveElementsPanelLayout`。版面在面板掛載時讀一次（`useState` 初始值；背景頁籤不掛載，切回來時重新讀）。每個分類一個 `AccordionItem`：標題 = 名稱 + 右側淡色數量（`tabular-nums`）＋ shadcn 的箭頭；內容 = 原本的 4 欄格子。
- 沒有在 `AccordionTrigger` 上加 class：它已經有 `py-2.5`，專案的 `cn` 不合併衝突的 class（例如加 `py-2` 結果不確定）。
- **滑過標題有底線**：shadcn 預設 `hover:underline`，保留（要拿掉得改 vendor 的 `accordion.tsx` 或在外層加不確定會贏的 class；之後要改再說）。
- 瀏覽器實測（無頭 Edge，10 項全過）：四個標題「基本 13 / 方塊與流程 10 / 箭頭 4 / 標註與旗幟 5」；第一次只展開基本（13 個按鈕）；點「箭頭」→ 只剩箭頭展開、存 `{"openCategory":"arrows"}`；展開動畫 `animation-name: accordion-down`（keyframes 來自 `tw-animate-css`，用 `--radix-accordion-content-height`）；再點一下 → 全部收起、存 `null`；展開「標註與旗幟」後重新載入 → 還是它；鍵盤在標題上 ↑ 移到「箭頭」、Enter 展開並收起另一個；點「粗箭頭」照樣加入頁面。截圖目測：展開、全部收起、滑過。
- 測試時踩到的：停靠區裡下面的標題可能被「頁面」群組蓋住，腳本要先 `scrollIntoView` 再點（使用者自己會捲動）。
- vitest 965、`npm run build` 通過。

### 步驟 4：完成（2026-10-15）

- `CLAUDE.md`：`docs/06-Plans-繪圖/` 加本計畫；目錄結構的 `elements-panel` 說明（Accordion、單一展開、可全部收起、記住、數量）與 `lib/dock/elements-panel-layout.ts`。`components/ui/` 本來就說明「shadcn 產生的元件」，不逐一列出，`accordion.tsx` 不另外寫。
- `docs/progress.md`：摘要與 commit 範圍。
