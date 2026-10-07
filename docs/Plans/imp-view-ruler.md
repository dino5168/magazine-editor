# 視圖 → 尺規 實作計畫

任務檔：`docs/Plans/2026-10-07-Ruler-尺規.md`（不 commit）。參考圖：`Images/Affinity-Ruler.png`、`Images/系統增加Menu-01.png`。

## 目標

1. 選單列加「視圖(V)」，放在「檔案(F)」與「設定(S)」之間，裡面一個勾選項目「尺規」。
2. 畫布上方與左方顯示尺規（參考 Affinity Publisher）：
   - 左上角落顯示單位（`mm`）。
   - 主刻度附數字（例如每 20 mm 一個數字），中間有細刻度；**0 在目前頁的左上角**，往左 / 往上是負數。
   - 跟著捲動與縮放即時更新；縮放時自動換刻度間距，數字不會擠在一起。
   - 垂直尺規的數字轉 90°（Affinity 的做法）。
   - 參考圖上的藍線：滑鼠在畫布上的位置標示在尺規上（見「待討論」）。

## 現況與可以重用的東西（不重複造輪子）

| 需要的東西 | 現有的程式 |
|---|---|
| 選單、勾選項目、Alt 助記鍵、快捷鍵 | `lib/menu`：`COMMANDS` / `MENUS` 的 `checkbox` 節點、`AppMenubar` 的 `isChecked`、`findMenuByMnemonic`（加一個 `MenuDefinition` 就有 Alt+V）、`menu-structure.test.ts` 的完整性檢查 |
| 開關狀態存這台電腦 | `Preferences`（`parsePreferences` 逐欄驗證、`PreferencesProvider`、localStorage），和 `showMargins` / `pageView` 同一套 |
| pt ↔ 螢幕像素 | `viewport.ts` 的 `ViewportLayout` / `screenToPt`：螢幕 x = (Layer x) × zoom + `layout.offsetX` − scroll.x；目前頁的 Layer 位移是 `editor-canvas` 的 `activeX`（`canvasSheets`） |
| mm ↔ pt | `units.ts` 的 `mmToPt` / `ptToMm` |
| 畫布尺寸跟著外框變 | `EditorCanvas` 已有 `ResizeObserver`（量捲動容器）：尺規佔掉的寬高會自動反映到 Stage 尺寸，不用改縮放 / 捲動邏輯 |
| 顏色 | design tokens（`--muted`、`--border`、`--muted-foreground`、`--primary`），用 `getComputedStyle` 讀給 2D canvas |

**不新增套件**。尺規用一般的 HTML `<canvas>`（2D context）畫，不用 Konva：它不是可編輯的內容，也不需要事件。

## 設計

- **純邏輯** `lib/editor/ruler.ts`（vitest）：
  - `rulerStep(zoom)`：依縮放選「好看」的主刻度間距（mm：1、2、5、10、20、50、100、200…），讓兩個數字至少相距 ~60 px；每個主刻度分成 10 或 5 個細刻度（細刻度太密時減少，最小 ~4 px）。
  - `rulerTicks({ startPx, lengthPx, originPx, zoom, step })`：在可見範圍內產生刻度（螢幕位置、是否主刻度、數字），水平和垂直共用。
  - 原點換算：`originPx = layout.offset − scroll + activeX × zoom`（水平）／`layout.offsetY − scroll.y`（垂直），和 `sheetOrigin` 同一個公式。
- **元件** `components/editor/canvas-ruler.tsx`：`<CanvasRuler orientation originPx zoom lengthPx />`，一個 canvas，依 `devicePixelRatio` 調整解析度，props 改變時重畫。
- **版面**：`EditorCanvas` 外層改成 2×2 grid：`角落 | 上尺規 / 左尺規 | 捲動容器`（尺規約 20 px）。尺規在捲動容器**外面**，捲軸與 Stage 不受影響；關掉尺規時就是原本的版面。
  - `MasterEditBanner`（`absolute top-3`）疊在畫布上方，開尺規時要往下移，否則蓋住尺規。
- **偏好**：`Preferences.showRulers: boolean`（預設 `true`），`parsePreferences` 缺欄位時用預設。
- **選單**：`MENUS` 加 `{ id: "view", label: "視圖", mnemonic: { code: "KeyV", letter: "V" }, items: [{ kind: "checkbox", command: "view.rulers" }] }`；`COMMANDS` 加 `"view.rulers": { label: "尺規" }`；`home-page.tsx` 的 handler 切換偏好、`isChecked` 讀偏好。
- **滑鼠位置標示**：pointermove 時**直接改 DOM**（一條絕對定位的線，或重畫一個疊加的小 canvas），不 setState —— 否則每次移動都重畫整個畫布（和拖曳時不 dispatch 同一原則）。

## 步驟（每步做完停下，等「繼續」）

1. **純邏輯**：`lib/editor/ruler.ts`（間距選擇、刻度產生、負數 / 小數處理）+ vitest。畫面不變。
2. **偏好與選單**：`Preferences.showRulers` + parse 測試；「視圖(V) → 尺規」勾選項目（`view.rulers`）、handler、`isChecked`；更新 `menu-structure.test.ts`。這一步勾選只會切換偏好，畫面還沒有尺規。
3. **畫尺規**：`canvas-ruler.tsx`、`EditorCanvas` 的 2×2 版面、角落單位、`MasterEditBanner` 位置。無頭 Edge 驗證：0 對齊頁面左上角（單頁、雙頁右頁、編輯主頁）、縮放 / 捲動後刻度跟著動、關掉尺規版面還原、建立 / 框選 / 文字編輯框位置不受影響（回歸）。
4. **滑鼠位置標示與選取範圍標示**：
   - 滑鼠位置：直接改 DOM，不 render 畫布；游標離開畫布時隱藏。
   - 選取範圍：選取物件外框的聯集（`geometry.ts` 的 `getElementBounds` + `unionBounds`，含旋轉）在尺規上畫淡色帶。範圍來自文件模型，所以**拖曳 / 縮放中不跟著動，放開後才更新**（拖曳中不 dispatch 的原則；要即時跟著得讀 Konva 節點，先不做）。
   - 無頭 Edge 驗證。
5. **文件**：`CLAUDE.md`（選單「視圖」、偏好 `showRulers`、目錄結構、快捷鍵表）、`docs/progress.md`、`docs/01`（若有對應段落）。

## 檢核（可能的問題）

- **Stage 尺寸**：尺規放在捲動容器外，容器變小 → `ResizeObserver` 更新 `viewport` → 既有的錨點邏輯保持畫面中心不動。開關尺規時畫面會位移 20 px 以內，可接受。
- **座標**：建立工具、框選、文字編輯框都以捲動容器左上角為原點（`getBoundingClientRect`），尺規在容器外不影響；步驟 3 用回歸測試確認。
- **雙頁**：0 在**目前頁**左上角（換頁時原點跟著跳），和屬性面板的 X / Y（頁面座標）一致。
- **重畫頻率**：捲動時 `EditorCanvas` 已經會 setScroll 重新 render，尺規只是多畫兩個小 canvas（只畫可見範圍的刻度），成本很低。
- **主題**：尺規顏色用 design tokens；之後做深色模式時跟著換（canvas 要在主題切換時重畫，目前沒有切換入口，先不處理）。
- **快捷鍵**：不加（Ctrl+R 是 WebView 的重新整理，不佔用）。
- **選單測試**：「每個指令恰好出現一次」「助記鍵不重複」會自動涵蓋新選單。

## 不做（之後另排）

- 從尺規拖出參考線（Affinity 的 guides）。
- 拖曳角落改變原點、點角落切換單位。
- 深色主題下的尺規配色切換（跟著整個 App 的主題一起做）。

## 決定

2026-10-07 與使用者確認：

1. **單位固定 mm**（和參考圖、對話框一致），不提供切換。
2. **原點 = 目前頁的左上角**，雙頁模式切到對頁時原點跟著跳（和屬性面板的 X / Y 一致）。
3. 這次一起做 **滑鼠位置標示** 與 **選取範圍標示**；**不加快捷鍵**（不佔用 Ctrl+R）。
4. **預設顯示**，配色跟 App 的淺色主題（design tokens）。

## 進度

| 步驟 | 狀態 |
|---|---|
| 1 純邏輯 | 完成：`lib/editor/ruler.ts`（`rulerScale` / `rulerTicks` / `rulerOrigin`），數字間距至少 50 px、細刻度至少 4 px；vitest 364 個 |
| 2 偏好與選單 | 完成：`Preferences.showRulers`（預設 `true`）、「視圖(V) → 尺規」（`view.rulers`，勾選狀態讀偏好）；vitest 366 個，無頭 Edge 7 項（選單順序、Alt+V、預設勾選、切換寫入 localStorage、重新整理後保留） |
| 3 畫尺規 | 完成：`components/editor/canvas-ruler.tsx`（`CanvasRuler` 2D canvas、`RulerCorner`；分隔線用 inset shadow，不佔尺規的 20 px）；`EditorCanvas` 外層改 grid，捲動容器保持同一個元素；主頁橫幅開尺規時 `top-8`。無頭 Edge 19 項（0 對齊：單頁 / 縮放 200% + 捲動 / 雙頁左右頁 / 主頁；關掉尺規可視區 +20 px、Stage 跟上；建立、框選、文字編輯框位置回歸） |
| 4 滑鼠位置與選取範圍標示 | 完成：`selectionSpans`（`ruler.ts`，外框聯集含旋轉）、`moveRulerMarker`（直接改 DOM）；色帶與標示線用選取框的靛藍色（主題的 primary 近黑色，看起來像灰色）。vitest 369 個，無頭 Edge 15 項（標示線跟著游標、離開隱藏、不改 state；單選 / 多選色帶；拖曳中不動、放開後跟上；關掉尺規不出錯） |
| 5 文件 | 完成：`CLAUDE.md`（目前階段、目錄結構、偏好 `showRulers`、新的「尺規」一節、選單「視圖」、助記鍵 Alt+V）、`docs/01-overview.md`（功能表、畫面對應圖）、`docs/progress.md` |
