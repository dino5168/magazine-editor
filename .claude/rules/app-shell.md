---
paths:
  - "src/pages/**"
  - "src/App.tsx"
  - "src/lib/menu/**"
  - "src/lib/dock/**"
  - "src/lib/preferences/**"
  - "src/components/dock/**"
  - "src/components/pointer-drag.ts"
  - "src/components/drag-ghost.tsx"
  - "src/components/app/app-menubar.tsx"
  - "src/components/app/paper-preset-grid.tsx"
  - "src/components/app/settings/**"
  - "src/components/editor/panels/**"
  - "src/components/editor/page-guides.tsx"
  - "src/components/editor/view-toggle-buttons.tsx"
  - "src/lib/editor/page-setup.ts"
  - "src/lib/editor/units.ts"
---

# App 外框（設定對話框、偏好、選單列、工具面板）

精簡前的完整原文（選單結構、外觀細節、使用者決定）：`docs/progress-archive/rules-2026-10/app-shell.md`。計畫：`docs/Plans/imp-偏好設定調整.html`、`docs/Plans/imp-settings.html`、`docs/01-Plans-2026-10/02-視圖-實作.md`、`03-增加格線邊界線的設定-實作.md`、`06-畫面調整-工具面板停靠區-實作.md`、`docs/02-Plans-操作/02-工具面板-重構-實作.md`。

## 設定對話框（`settings-pages.ts` / `components/app/settings/`）

- 「設定 → 文件」= 存進專案、可復原；「設定 → 偏好設定」= 這台電腦的 App 偏好。一項一個對話框，各自取消 / 確定。
- **單一資料來源** `SETTINGS_PAGES` / `SETTINGS_GROUPS`：指令 `settings.<id>`（`settingsCommandId`）、子選單、handler 都由它推導。**新增設定頁** = 加一筆 → 寫 `({ open, onOpenChange }: SettingsDialogProps)` 對話框（`SettingsDialog` + `SettingsDialogFooter`）→ 登記到 `SETTINGS_DIALOGS`（`satisfies Record`，漏了編譯失敗）。
- `home-page.tsx` 只有 `openSettings: SettingsPageId | null`。Radix 關閉時卸載內容，草稿每次開啟重來。
- `PageSetupFields` 頁面設定與新增文件共用。

## 偏好與頁面設定（`lib/preferences` / `page-guides.tsx`）

- **兩種資料分開**：文件設定（紙張、邊界）在 `history.present`；App 偏好（`Preferences`）在 localStorage `magazine-editor.preferences.v1`，讀取一律過 `parsePreferences`（壞欄位回預設），不進復原、不存進專案。
- 頁面設定：**沒有改動時「確定」不 dispatch `document/setPageSetup`**（否則尺寸不一的文件被統一、多一筆復原）。錯誤檢查 `validatePageSetup`。
- 紙張 `PAGE_SIZE_PRESETS` 一律直式存，依 `PAGE_SIZE_GROUPS` 分組；簡報 preset 有 `orientation: "landscape"`。選紙張一律走 `selectPresetSize(id, 目前尺寸)`。**兩個 preset 不可同尺寸**（`presetIdOf` 會認錯，測試守著）；**id 不要改名**（「範本」面板以 id 引用）。紙張清單只在前端。
- 「格線與參考線」**即時預覽**：`PreferencesProvider` 的不存檔預覽值（`useSetPreviewPreferences`），草稿變更就設、卸載時清除，所以任何關閉方式都會還原；`savePreferences` 只存正式值。不要改成「邊改邊存、取消時寫回」（視窗關掉會留下沒確定的修改）。
- `seeThrough` 對話框的透明遮罩規則在 `index.css`（`[data-slot="dialog-overlay"]:has(+ [data-see-through])`，**不放在 `@layer`** 才蓋得過 utilities）：shadcn `DialogContent` 自己畫遮罩，`components/ui/` 不改。
- 「設為預設」立即存 `lineStyleDefaults` **並寫進草稿**（否則按確定會用舊預設蓋回）。原廠 `FACTORY_LINE_STYLES`。
- 線條樣式 `GuideLineStyle` 的 `width` 是**螢幕 px**；畫的時候用 `guideLineAttrs(style, zoom, emphasis?)`（÷ zoom）。舊紀錄沒有 `showContentGuides` 時讀成 `grid.visible`。
- **視圖開關**只寫在 `view-toggles.ts` 的 `VIEW_TOGGLES`（選單 `view.<id>`、`isChecked`、TopBar 按鈕都讀它），按下立即寫入偏好。新增 = 加一筆 + 放進 `MENUS` 的「視圖」+ 需要時加到 TopBar 的 `BUTTONS`。吸附格線獨立於格線顯示。
- 格線 / 對齊線 / 邊界線都 `listening={false}`、不算進內容範圍、不匯出；對齊線不吸附。線距 < `MIN_GRID_GAP_PX` 時只畫每 N 條（`drawnGridSpacing`），仍落在吸附格線上。
- **吸附格線**：多選時 Konva 讓每個節點各自呼叫 `dragBoundFunc`，Transformer 在主節點第一次 dragmove 後才拖其他節點，所以**不能各自吸附**：第一個呼叫的是 lead，每次從滑鼠位置推回 lead 原位置再吸附，所有節點 = 自己的起點 + lead 的位移；`handleMoveEnd` 清空。參考座標是物件所在頁的 Group。縮放只在單選且旋轉 0° 時吸附（`anchorDragBoundFunc`）。方向鍵與屬性面板輸入不吸附。

## 選單列與指令（`lib/menu`）

- 自訂 HTML（shadcn `Menubar`），**不用 Tauri 原生選單**。
- **指令是單一資料來源**：`COMMANDS`（label / shortcut / disabledReason）、`MENUS`（結構）、`CommandHandlers`（mapped type，漏 handler 編譯失敗）。handlers 在 `home-page.tsx`；未實作的用 `createPlaceholderHandlers`。新增 = `COMMANDS` → `MENUS` → handler；`menu-structure.test.ts` 檢查每個指令恰好出現一次、快捷鍵不重複不衝突。
- 快捷鍵用 **`event.code`**（注音時 `key` 可能是 `Process`）；`metaKey` 視同 Ctrl。`use-menu-shortcuts` 在 `window` capture 階段、輸入框裡也生效並 `preventDefault()`（擋 WebView2 預設）；`isComposing` 或焦點在 dialog / alertdialog 時不觸發。
- 助記鍵 Alt+F / P / S / V / W 以 Menubar 受控 `value` 開啟；**不要 `stopPropagation`**（Radix 靠 document keydown 才會聚焦第一項）。
- checkbox 的勾選由 `isChecked(commandId)` 讀外部狀態，不接 `onCheckedChange`。「外觀」單選暫時固定「跟隨系統」。
- **動態停用** `commandDisabledReason(id, document)`（`command-availability.ts`，選單與 MCP 共用；目前只有 `file.exportPptx`），在**呼叫當下**讀 `getSnapshot()`。快捷鍵只看固定原因：**有快捷鍵的指令不要做成動態停用**。
- 「工具面板」選單由 `PANEL_DEFINITIONS` 產生 `panel.<id>`，依 `PANEL_CATEGORIES` 分段（必須依類別連續排列，測試守著）。

## 工具面板（`lib/dock` / `components/dock`）

- 三欄（左停靠區｜中欄｜右停靠區），一側是幾個頁籤群組。預設 `DEFAULT_DOCK_LAYOUT`。
- **背景頁籤不掛載**（只 render `PANELS[group.active]`）：面板的暫時狀態切走會重置。
- 頁籤列自己畫（`role="tablist"`），**不用 shadcn `Tabs`**（屬性面板的子分頁才用：查 `[role="tab"]` 要限定 `[data-dock-tab] > [role="tab"]`）。頁籤列的 ← → Home End 要 `stopPropagation`（否則移動畫布上的物件）。目前頁籤不加粗；間距不放在 `Button` 的 margin（`transition-all`）。
- **單一資料來源** `PANEL_DEFINITIONS`；`PANELS` / `PANEL_ICONS` 用 `satisfies Record<PanelId, …>`。新增面板 = 三處各一筆。需要自己捲動的面板設 `scroll: "self"`。
- `DockLayout` 是 App 偏好；變更只走 `dock-layout.ts` 的純函式（沒變化回傳同一參考）。不變量：一個面板最多出現一次、群組不空、`active` 在 `panels` 裡。`DropTarget` 的 slot **含被拖的那一個**。
- 停靠區寬度拖曳中只改 local state，**放開才寫回**。
- 拖曳頁籤用 pointer events（`startPointerDrag`，和頁面頁籤共用：改動時兩邊都要測），**不用 HTML5 drag & drop**。命中判斷靠 `data-dock-side` / `data-dock-group` / `data-dock-tabbar` / `data-dock-tab`。
- localStorage `magazine-editor.dockLayout.v3`，讀取過 `parseDockLayout`（未知 id 丟掉，所以舊的 `resize` / `photos` 自然消失）；格式不相容時換 key。v2 / v1 只沿用寬度（`parseDockWidths`）。
- Radix `ScrollArea` 內層 `display: table` 會被長文字撐寬：面板裡用 `DockScrollArea`。
- 屬性面板：數字欄位 `NumberField`（Enter / 失焦寫入，一次一筆復原）；「限制寬高比」不存進文件；對齊內容區見 `canvas-ui.md`（`content-align.ts`），文字高度用 `measureTextLayout`，不用 `estimateTextHeight`。
- Tailwind v4 的 `inset-y-0` 是邏輯屬性，和直書放在同一元素會變水平。

## 檔案

- `components/app/app-sidebar.tsx`：舊的側邊欄，保留但不引用，**不要修改或刪除**。
- `panels/library-panel.tsx` 的面板 id 是 **`upload`**（舊版面紀錄不失效）。
- `pointer-drag.ts`：`startPointerDrag`（4 px 門檻、吞掉 click、Esc）、`edgeScrollDelta`。`drag-ghost.tsx`：直接改 style。
- `lib/dock/`：`pages-panel-layout.ts`、`elements-panel-layout.ts`（localStorage `magazine-editor.elementsPanel.v1`）、`dock-storage.ts`。
