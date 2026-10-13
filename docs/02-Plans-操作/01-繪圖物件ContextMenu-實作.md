# 01 繪圖物件 Context Menu 實作計畫

任務檔：`01-繪圖物件ContextMenu.md`。本計畫依任務檔要求輸出到同一個目錄，檔名加 `-實作`。

## 1. 需求理解

- 在畫布上對物件按**滑鼠右鍵**，在游標位置彈出選單（Context Menu）。
- 選單內容 = 屬性面板「調整」分頁裡已有的兩組功能：
  - **圖層順序**：移到最上層 / 移到最下層 / 上移一層 / 下移一層（`element/reorder`）。
  - **對齊內容區**：填滿寬度 / 填滿高度、靠左 / 水平置中 / 靠右 / 靠上 / 垂直置中 / 靠下（`content-align.ts`，計畫 `docs/01-Plans-2026-10/14-物件屬性增加填滿寬度、高度-實作.md`）。
- 是屬性面板的**另一個入口**：結果、規則、復原（一次 = 一筆）都和按屬性面板的按鈕一樣，不新增 reducer action、不改檔案格式、不改 Rust。

## 2. 現況調查（右鍵目前發生什麼事）

| 情況 | 現在的行為 | 位置 |
|---|---|---|
| 右鍵按在目前頁的物件上 | Konva 的 `mousedown` 不分按鍵，**已經會選取它**（已選取的整組保留） | `canvas-elements.tsx:268` `onMouseDown → onSelect`、`editor-canvas.tsx` `handleSelect` |
| 右鍵按在空白處 / 頁面背景 | 清空選取；框選只接受左鍵，不會開始框選 | `handleStageMouseDown`、`use-canvas-marquee.ts:65` |
| 右鍵按在對頁的物件 / 跨過書背的複本 | 切到那一頁並選取它 | `canvas-sheet.tsx` `activate`、`onPickElsewhere` |
| 右鍵按在主頁內容、頁碼 | 不攔事件，落到頁面背景 → 清空選取 | `StaticElement` / `StaticShape` |
| 拖曳 | 只有左鍵（Konva `dragButtons` 預設 `[0]`），右鍵不會拖動物件 | — |
| 平移 / 建立工具 | 只攔中鍵與左鍵，右鍵照樣傳到 Konva | `use-canvas-pan.ts:73`、`use-canvas-create.ts:136` |
| `contextmenu` 事件 | 畫布沒有處理，WebView2 顯示瀏覽器的預設選單 | — |

結論：**「右鍵 = 先選取」已經是現有行為**，只要在 `contextmenu` 時「有選取就開選單」即可；不用自己做命中判斷。

## 3. 可以沿用的東西（不重複造輪子）

| 需要的 | 已經有的 |
|---|---|
| 在游標位置開選單、鍵盤操作、碰到視窗邊緣自動翻轉、子選單 | Radix `ContextMenu`（`radix-ui` 單一套件已含）；用 `npx shadcn@4.21.0 add context-menu` 產生 `components/ui/context-menu.tsx`，樣式和現有 `dropdown-menu.tsx` 一致 |
| 圖層順序 | `element/reorder { id, direction }`；按鈕的 icon / 文字 / 停用條件寫在 `ArrangeTab`（`properties-panel.tsx:385`），底部動作列的 `⋮` 也有一份上移 / 下移（`bottom-toolbar.tsx:124`） |
| 對齊內容區 | `content-align.ts` 的 `contentArea` / `fillContentPatch` / `alignContentPatch` / `fillContentDisabledReason`；文字高度（換變數 + `measureTextLayout` + `textBlockHeight`）寫在 `ContentAlignSection`（`properties-panel.tsx:334`）；六個對齊的 label / icon 是 `ALIGN_EDGES` |
| 選單裡不觸發編輯器快捷鍵 | `use-editor-shortcuts.ts` 的 `isEditableTarget` 已排除 `[role="menu"]`（Radix 選單內容就是 `role="menu"`） |

所以**第一步是把屬性面板裡的這兩組邏輯抽成共用**（面板與右鍵選單同一份），而不是在選單裡再寫一次。

## 4. 使用者決定（2026-10-14）

- ★ Q1：**圖形、文字、圖片都要**（文字沒有「填滿高度」）。
- ★ Q2：**只做單選**；多選時選單照樣打開，顯示「已選取 N 個物件」，項目停用。
- ★ Q3：限制寬高比**照面板的預設**（圖片保持比例、其他不保持）。
- ★ Q4：**全部攤平**（B）：圖層順序 4 項 ─ 填滿 2 項 ─ 對齊 6 項，用分隔線分組。第 5、6 節的「子選單」一律改成這個結構。
- ★ Q5：手形 / 文字 / 圖形工具下右鍵物件**也開選單**。

### 原本的問題與建議（留著做紀錄）

- **Q1 物件範圍**：「繪圖物件」只指圖形，還是文字、圖片也要？
  （建議：**三種都要**。屬性面板「調整」分頁三種物件都有這兩組功能；文字沒有「填滿高度」，照面板的做法不顯示。）
- **Q2 多選**時右鍵怎麼辦？屬性面板多選時沒有這兩組功能。
  （建議：**這次只做單選**。多選時選單仍打開，但只有一行說明「已選取 N 個物件」＋項目停用，讓使用者知道右鍵有作用；多選的對齊 / 圖層順序另開任務，見設計建議 2。）
- **Q3 「限制寬高比」**：屬性面板的開關是面板自己的暫時狀態（圖片預設開、其他關），右鍵選單讀不到。
  （建議：**選單照同一個預設規則**：圖片保持比例、其他不保持。不把開關提升成共用狀態，避免為了選單改動面板的狀態管理。）
- **Q4 選單結構**：
  - A（建議）：**兩個子選單**「圖層順序 ▸」「對齊內容區 ▸」。第一層短，之後加「複製 / 刪除」等項目不會擠；Affinity、InDesign 都是這樣。
  - B：全部攤平在第一層，用分隔線分組（4 + 2 + 6 = 12 項，少點一次但很長）。
- **Q5 工具模式**：手形 / 文字 / 圖形工具下右鍵物件也開選單嗎？
  （建議：**開**。右鍵在這些工具下本來就會選取物件，開選單和選取工具一致；選單動作不改目前的工具。）

## 5. 設計（以建議方案寫，確認後再調整）

- **觸發**：用 `ContextMenuTrigger asChild` 包住 `<Stage>` 外面一層 `div`（只包 Stage，**不包**文字編輯框）。文字編輯框（`TextEditorOverlay`）和 Stage 是兄弟元素，所以在編輯框裡右鍵照樣是瀏覽器的剪下 / 複製 / 貼上選單。
- **開或不開**：Trigger 的 `onContextMenu` 先執行（Radix `composeEventHandlers`）。右鍵的 `mousedown` 已經在 Konva 裡改好選取（`contextmenu` 在放開之後才來，React 已重畫），所以判斷規則只有一條：
  - 目前有選取 → 讓 Radix 開選單。
  - 沒有選取（按在空白、頁面背景、主頁內容、頁碼）→ `event.preventDefault()`：Radix 不開，瀏覽器的預設選單也不出現。
  - 判斷用 `latest` ref 取最新的 `selectedIds`，不靠 render 時的閉包。
- **選單內容**：新元件 `components/editor/element-context-menu.tsx`，只在選單打開時 render（Radix 關閉時卸載內容），讀 `selectSelectedElement` 與目前 sheet；項目、icon、停用條件全部來自步驟 1 抽出來的共用定義。
- **焦點**：選單關閉後焦點回到 `document.body`（空白鍵暫時手形只在焦點在 body 時生效），步驟 3 驗證。

## 6. 步驟（一次一步，每步停下等確認）

### 步驟 1：抽出共用邏輯（畫面不變）
- `lib/editor/` 新增純函式 `layerOrderState(elements, id)` → `{ isTop, isBottom }`（`ArrangeTab` 與底部動作列 `⋮` 現在各算一次 index），補 vitest。
- 新檔 `components/editor/element-arrange.ts`（只放資料與 hook，不放 JSX 元件）：
  - `REORDER_ACTIONS`：四個 `{ direction, label, icon, disabled(state) }`。
  - `ALIGN_EDGES`：從 `properties-panel.tsx` 搬過來。
  - `useContentAlign(element)`：回傳 `area`、量到的高度、可填滿的軸、`fillDisabledReason(axis)`、`fillPatch(axis, keepRatio)`、`alignPatch(edge)`（就是 `ContentAlignSection` 現在函式本體裡的那段）。
  - `defaultKeepRatio(element)`（圖片 = true）：面板的 `useState` 初值與右鍵選單共用。
- `properties-panel.tsx` 的 `ArrangeTab` / `ContentAlignSection`、`bottom-toolbar.tsx` 的 `⋮` 改用它們，**行為不變**。
- 驗收：vitest、`npm run build` 通過；無頭 Edge 確認屬性面板與 `⋮` 照舊。

**完成（2026-10-14）**：
- 新檔 `src/lib/editor/layer-order.ts`：`REORDER_DIRECTIONS`、`ReorderDirection`（`element/reorder` 的 `direction` 改用它）、`canReorder(elements, id, direction)`（取代計畫裡的 `layerOrderState`：選單與按鈕都是逐項問「這個方向能不能動」，回傳 boolean 比較直接）。`__tests__/layer-order.test.ts` 4 個，含「`canReorder` 和 reducer 有沒有改變 state 一致」。
- 新檔 `src/components/editor/element-arrange.ts`：`REORDER_ITEMS` / `REORDER_ITEM_BY_DIRECTION`、`FILL_ITEMS`、`ALIGN_EDGES`（從屬性面板搬來）、`defaultKeepRatio`、`useContentAlign(element)`（回傳 `area`、`axes`、`fillDisabledReason`、`fillPatch`、`alignPatch`；文字高度的量測從 `ContentAlignSection` 搬來）。
- `properties-panel.tsx`：`ArrangeTab` 的四個按鈕改由 `REORDER_ITEMS` 產生、停用用 `canReorder`；`ContentAlignSection` 改用 `useContentAlign` 與 `FILL_ITEMS`；`keepRatio` 初值用 `defaultKeepRatio`。
- `bottom-toolbar.tsx`：`⋮` 的上移 / 下移改用 `REORDER_ITEM_BY_DIRECTION` 與 `canReorder`。
- 圖層面板每一列的上移 / 下移按鈕沒有改：它用自己列出的 index 判斷，和這次的選單無關。
- vitest 657、`npm run build` 通過。無頭 Edge：圖層順序四個按鈕的停用與結果（最上層 / 最下層兩端）、靠左 / 靠上 = 邊界 42.52 pt、填滿寬度 = 510.24 pt（A4 減兩邊邊界）、`⋮` 兩項（最上層時上移停用、下移有效）、文字只有「填滿寬度」。畫面不變。

### 步驟 2：加入右鍵選單
- `npx shadcn@4.21.0 add context-menu`（vendor code，不修改）。
- `element-context-menu.tsx`：攤平的一層選單：圖層順序四項 ─ 填滿寬度 / 高度 ─ 六個對齊（分隔線分組，項目帶 icon）；停用的填滿項目以 `title` 或第二行說明原因；多選時只顯示「已選取 N 個物件」（依 Q2）。
- `editor-canvas.tsx`：`ContextMenu` + `ContextMenuTrigger asChild` 包住 Stage 的外層 div；`onContextMenu` 依第 5 節判斷。
- 驗收：vitest、`npm run build`。

**完成（2026-10-14）**：
- `npx shadcn@4.21.0 add context-menu` → `src/components/ui/context-menu.tsx`（vendor，未修改；Trigger 自帶 `select-none`）。
- 新檔 `src/components/editor/element-context-menu.tsx`：`ElementContextMenu({ canOpen, children })`。
  - Trigger 的 `onContextMenu`：`canOpen()` 為 false 時 `preventDefault()`（Radix 不開、瀏覽器選單也不出現）。
  - **`modal={false}`**（計畫外的決定）：modal 選單會在 body 設 `pointer-events: none`，選單開著時右鍵另一個物件，事件到不了 Konva、選不到它。
  - `onCloseAutoFocus` 取消預設：關閉後焦點不回到先前的元素（可能是面板按鈕），留在 body，空白鍵平移、Delete 照常。
  - 單選：圖層順序 4 ─ 填滿（文字只有寬度；內容區太小時停用並多一行「無法填滿：…」）─ 對齊 6，都用步驟 1 的共用定義；填滿用 `defaultKeepRatio`。多選：一行「已選取 N 個物件（只能對單一物件使用）」＋ 12 項停用。
  - 旋轉的提示（「填滿時會把旋轉歸零」）沒有放進選單，屬性面板照舊顯示。
- `editor-canvas.tsx`：Stage 外包一層 `<div>` 當 Trigger（只包 Stage，文字編輯框不在裡面）；`latest` ref 加 `selectionSize`，`canOpen = selectionSize > 0`。
- vitest 657、`npm run build` 通過。無頭 Edge 冒煙測試 11 項：右鍵物件 → 選取並開選單（12 項，最上層時兩項停用）、瀏覽器選單被擋、Esc 關閉且選取保留、空白處不開選單並清空選取（也沒有瀏覽器選單）、「移到最下層」有效且關閉選單、關閉後焦點在 body；截圖確認外觀（三組分隔線、icon、選單開在游標旁）。

### 步驟 3：驗證（無頭 Edge + 截圖）
- 右鍵：未選取的物件（先選取再開）、已選取的物件、空白處 / 頁面背景（不開、也沒有瀏覽器選單）、主頁內容與頁碼（不開）。
- 每個項目的結果 = 屬性面板同一個按鈕；Ctrl+Z 一次還原；已在最上層時「移到最上層 / 上移一層」停用。
- 文字（沒有填滿高度、靠下用實際高度）、圖片（保持比例）、旋轉的物件（填滿歸零、對齊用外接框）。
- 雙頁：右鍵對頁的物件 / 跨過書背的複本 → 切頁、選取並開選單，對齊用那一頁的內容區；編輯主頁時用主頁的內容區。
- 文字編輯中右鍵編輯框 → 瀏覽器原生選單；Esc 關選單不會清空選取；關閉後空白鍵平移、Delete 照常。
- 選單靠近畫布右下角時自動翻轉、不超出視窗。

**完成（2026-10-14）**：無頭 Edge 兩份腳本，**51 項全部通過**；程式沒有修改（中途的失敗都是測試腳本的問題，見下面）。
- A（32 項）：
  - 圖形：右鍵選取、12 項；靠右 = 內容區右緣 552.76、填滿高度（y 42.52、高 756.85）；Ctrl+Z 各一次還原。
  - 文字：11 項（沒有填滿高度）、靠下用 Konva 實際高度（下緣 799.37）、填滿寬度 = 行寬 510.24。
  - 圖片：填滿寬度保持比例（1.333 → 1.333）。
  - 旋轉 30°：靠左用旋轉後外框且旋轉不變、填滿寬度把旋轉歸零、Ctrl+Z 一次回到 30°。
  - 多選：選取保留 2 個、「已選取 2 個物件」＋ 12 項停用。
  - 選單開著時右鍵另一個物件 → 換選取並重開（`modal={false}` 的效果）。
  - 頁面背景：不開、清空選取、沒有瀏覽器選單。
  - 手形 / 文字 / 矩形工具下右鍵物件照樣開選單。
  - 關閉後焦點在 body、Delete 照常；刪除後復原的物件右鍵照常。
  - 右下角開選單：Radix 自動往上 / 左翻，選單在視窗內。
  - 雙擊文字的編輯框裡右鍵：不開我們的選單、不擋瀏覽器原生選單。
- B（19 項）：
  - 編輯主頁：主頁上的物件右鍵開選單，靠上 = 主頁內容區。
  - 套用主頁的頁面：右鍵主頁內容 → 不開、沒有選取、沒有瀏覽器選單。
  - 雙頁（2–3 並排）：在第 2 頁時右鍵第 3 頁的物件 → 切到第 3 頁、選取、開選單；靠左 = 第 3 頁自己的內容區（42.52）。
  - 跨過書背的物件（第 2 頁、X = 頁寬 − 20）：在第 3 頁時右鍵第 3 頁上的複本 → 回到第 2 頁、選取原物件、開選單；靠右 = 第 2 頁內容區右緣 552.76。
- 測試腳本修正（不是程式問題）：放大的圖片蓋住星形，右鍵點到圖片；刪除再復原的物件是新的 Konva 節點；兩頁並排比畫布寬（899 px），第 3 頁只看得到左邊約 290 pt，原本點在畫面外。
- **沒測到**：頁碼（`StaticShape listening={false}`，和主頁內容同一條路：右鍵落到頁面背景，不開選單），以及真的 WebView2 右鍵（無頭 Edge 是以合成事件模擬）→ 步驟 4 的桌面版人工驗證。

### 步驟 4：文件
- `CLAUDE.md`（目前階段、目錄結構加 `element-arrange.ts` / `element-context-menu.tsx`、「多選與框選」或屬性面板一節補右鍵選單）、`docs/01-overview.md`（功能表）、`docs/02-architecture.md`（檔案對照表）、`docs/progress.md`、本計畫的進度紀錄。
- 桌面版人工驗證（WebView2 的右鍵行為和無頭 Edge 可能不同）。

**完成（2026-10-14）**：
- `CLAUDE.md`：目前階段；文件目錄加 `docs/02-Plans-操作/`；目錄結構加 `element-context-menu.tsx`、`element-arrange.ts`、`layer-order.ts`；「編輯器架構」新增「右鍵選單」一節（內容、觸發、開不開的規則、`modal={false}`、焦點、單選、不做的項目）。
- `docs/01-overview.md`：功能表加「右鍵選單」。
- `docs/02-architecture.md`：檔案對照表加三個檔案。
- `docs/progress.md`：目前階段一筆、「待辦 → 使用者」加桌面版人工驗證清單。
- **要 commit 的範圍**：`src/lib/editor/layer-order.ts`、`__tests__/layer-order.test.ts`、`editor-reducer.ts`、`src/components/editor/element-arrange.ts`、`element-context-menu.tsx`、`src/components/ui/context-menu.tsx`、`editor-canvas.tsx`、`panels/properties-panel.tsx`、`bottom-toolbar.tsx`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、本計畫；任務檔 `01-繪圖物件ContextMenu.md` 是否 commit 待使用者決定。
- 桌面版人工驗證待做（清單在 `docs/progress.md`「待辦 → 使用者」）。

## 7. 設計建議

1. **右鍵選單之後的擴充**：剪下 / 複製 / 貼上、複製一份（Ctrl+D）、刪除、套用文字樣式 ▸、群組。有了這個選單，這些都只是加項目；項目變多時，再把「對齊內容區」收成子選單（Q4 原本的 A 方案）。
2. **多選**：對齊整組外框（或各自對齊）、整組上移 / 下移。需要新的批次 patch（`element/updateMany` 已有）與圖層順序的多物件 action，建議另開任務，連同屬性面板的多選區一起做。
3. **快捷鍵**：InDesign / Affinity 的 Ctrl+] / Ctrl+[（上移 / 下移一層）、Ctrl+Shift+] / [（最上 / 最下）。可以在選單項目旁顯示，但要先檢查和 `menu-structure.test.ts` 的快捷鍵衝突檢查。
4. **鍵盤開選單**（Shift+F10 / Menu 鍵）：Radix `ContextMenu` 只接受指標事件，要支援得另外以選取物件的位置開啟，先不做。
5. **圖層面板的列也可以右鍵**：同一個 `element-context-menu.tsx` 的內容可以直接重用（它只讀選取），成本很低，可以順手做，但不在這次任務範圍，等你決定。

## 8. 檢核

- **不重複**：選單和屬性面板共用步驟 1 抽出的定義與 hook；選單本身用 shadcn / Radix，不自己算位置。
- **不改模型、reducer、Rust、檔案格式**：只是另一個 dispatch 既有 action 的入口；每個項目 = 一筆復原（`element/reorder` / `element/update`）。
- **選取規則不變**：沿用「右鍵 mousedown 已經選取」的現有行為；選單只讀選取，不自己改選取。
- **事件衝突**：右鍵不會拖曳物件（`dragButtons`）、不會框選（只接受左鍵）、平移與建立工具不攔右鍵；Trigger 只包 Stage，文字編輯框的原生選單不受影響。
- **快捷鍵**：選單內是 `role="menu"`，Delete / 方向鍵不會作用到畫布物件。
- **風險**：
  - 依賴「`contextmenu` 在 `mousedown` 之後、React 已更新選取」的事件順序（Windows 上 `contextmenu` 在放開時才觸發，順序固定）；用 ref 讀最新選取，避免閉包過期。
  - Radix `ContextMenuTrigger` 外層 div 會成為 Stage 的父元素，要確認 `sticky` 容器、ResizeObserver、Stage 尺寸不受影響（div 不加版面相關的樣式）。
  - 對頁物件的右鍵：`page/select` 之後才 `selection/set`，選單打開時讀到的是新頁 → 步驟 3 驗證。

## 9. 進度紀錄

- 2026-10-14：計畫建立。使用者確認 Q1–Q5（三種物件、只做單選、預設寬高比、選單攤平、所有工具都開）。下一步：步驟 1 抽出共用邏輯。
- 2026-10-14：步驟 1 完成（`layer-order.ts` + 4 個測試、`element-arrange.ts`；屬性面板與 `⋮` 改用，vitest 657）。下一步：步驟 2 加入右鍵選單。
- 2026-10-14：步驟 2 完成（shadcn `context-menu`、`element-context-menu.tsx`（`modal={false}`）、畫布接上；無頭 Edge 冒煙 11 項）。下一步：步驟 3 完整驗證。
- 2026-10-14：步驟 3 完成（無頭 Edge 51 項全過，程式未修改）。下一步：步驟 4 文件與桌面版人工驗證。
- 2026-10-14：步驟 4 完成（`CLAUDE.md`、`docs/01`/`02`/`progress.md`）。**全部步驟完成**；尚未 commit；桌面版人工驗證待做。
