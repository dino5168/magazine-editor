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

### 設定對話框（`lib/preferences/settings-pages.ts` + `components/app/settings/`）

計畫與決定：`docs/Plans/imp-偏好設定調整.html`。

- **選單**：「設定 → 文件 ▸（頁面設定...、頁碼管理...、色票...、字型...）」放存進專案、可復原的文件設定；「設定 → 偏好設定 ▸（格線與參考線...，Ctrl+,；Claude Code 連線（MCP）...）」放存在這台電腦的 App 偏好。**一項一個對話框**，各自「取消 / 確定」，沒有分頁。
- **單一資料來源**是 `SETTINGS_PAGES`（id / label / group / 可選的 shortcut）與 `SETTINGS_GROUPS`（子選單順序與名稱）：指令 `settings.<id>`（`settingsCommandId`，同 `panelCommandId` 的做法）、子選單、`home-page.tsx` 的 handler 與對話框都由它推導；`SETTINGS_DIALOGS`（`components/app/settings/index.ts`）以 `satisfies Record<SettingsPageId, …>` 檢查完整性。
- 頁面設定的直橫 / 寬高 / 邊界欄位是 `page-setup-fields.tsx` 的 `PageSetupFields`（受控，紙張下拉與「尺寸不一致」提示由呼叫端以 `paperPicker` / `sizeNote` 傳入），「新增文件」對話框也用它。`SettingsDialogFooter` 的 `applyLabel` 可以把「確定」換成別的字（新增文件是「建立」）。
- **新增設定頁**：在 `SETTINGS_PAGES` 加一筆 → 寫一個 `({ open, onOpenChange }: SettingsDialogProps)` 對話框（外框用 `SettingsDialog`、頁尾用 `SettingsDialogFooter`）→ 登記到 `SETTINGS_DIALOGS`（漏了會編譯失敗）。要放到新的子選單就加一個 group。
- `home-page.tsx` 只有一個 state `openSettings: SettingsPageId | null`，同時最多開一個設定對話框。
- 對話框關閉時 Radix 卸載內容，所以表單草稿每次開啟都從目前的值重新開始；草稿放在各自的表單元件裡。

### 偏好設定與頁面設定（`page-setup-dialog.tsx` / `grid-dialog.tsx` + `lib/preferences` + `page-guides.tsx`）

計畫與決定：`docs/Plans/imp-settings.html`（2026-10-05 拆成兩個對話框，見「設定對話框」）。原本的「尺寸」工具面板已移除，功能併入這裡（舊版面紀錄裡的 `resize` 由 `parseDockLayout` 略過）。

- **兩種資料分開存**：
  - 文件設定（紙張尺寸、邊界）：`history.present`，存進專案檔、可復原、會標記未存檔。
  - App 偏好（`Preferences`：`grid.visible` / `grid.spacing`（pt）/ `grid.snap`、`showContentGuides`、`showMargins`、`showPageNumbers`（在「頁碼管理」對話框切換）、`pageView`（`"single"` / `"spread"`，在「頁面」面板切換）、`showRulers`（「視圖 → 尺規」，預設開）、`lineStyles` / `lineStyleDefaults`（參考線樣式，見下面的「線條樣式」））：localStorage `magazine-editor.preferences.v1`，讀取一律過 `parsePreferences`（逐欄驗證，壞掉的欄位回預設，間距夾在 1–100 mm）。不進復原歷史、不存進專案。
- **頁面設定**（「設定 → 文件 → 頁面設定...」）：按「確定」才寫入，「取消」/ Esc 放棄。
  - **沒有改動時「確定」不 dispatch `document/setPageSetup`**：否則頁面尺寸不一致的文件會被統一成目前頁的尺寸，還多一筆復原。
  - 寬高 10–2000 mm、邊界 0–2000 mm，超出時夾回範圍；只有「邊界合計 ≥ 頁寬 / 頁高」會顯示錯誤並停用「確定」（`page-setup.ts` 的 `validatePageSetup`）。
  - **紙張**：`units.ts` 的 `PAGE_SIZE_PRESETS`（一律直式存，直 / 橫由按鈕切換，比對時不分直橫）依 `PAGE_SIZE_GROUPS` 分組：ISO A（A3–A6）、JIS B（B4–B6，標示「（JIS）」）、台灣書刊開本（16 開、32 開；25 開和 A5 同尺寸不另列）、美規（Letter、Legal、Tabloid）、電子書（3:4、9:16）、**簡報（PPT）**（2026-10-21，計畫 `docs/10-Plans-PaperSize/01-增加PPT尺寸-實作.md`：PPT 16:9 寬螢幕 960 × 540 pt、PPT 4:3 720 × 540、PPT 16:10 720 × 450、Google 簡報 16:9 720 × 405；照簡報軟體的英吋精確換算，匯出的 PDF 一頁剛好是一張投影片）。
    - **自然方向**：簡報的 preset 有 `orientation: "landscape"`（照樣直式存）。選紙張一律走 `selectPresetSize(id, 目前尺寸)`：紙張 ↔ 簡報互換時用新 preset 的自然方向（直式 A4 點 PPT 16:9 → 960 × 540），同類之間保留目前方向（橫式 A4 → 橫式 A5），自訂尺寸當成紙張；新增文件的卡片、頁面設定的下拉、卡片的外框都用它。
    - 下拉選單分組並附尺寸（照自然方向，`presetSizeLabel`），觸發鈕只顯示名稱（按了直 / 橫之後選項的尺寸會和寬高對不上）。**兩個 preset 不可同尺寸**（`presetIdOf` 會認錯，測試守著）；id 不要改名（「範本」面板以 id 引用）。紙張清單只在前端，不改檔案格式。
- **格線與參考線**（「設定 → 偏好設定 → 格線與參考線...」或 Ctrl+,，計畫：`docs/01-Plans-2026-10/03-增加格線邊界線的設定-實作.md`）：格線（顯示、間距、吸附）/ 內容區對齊線 / 邊界參考線三區，各有顯示開關與線條樣式；內容區自己捲動、頁尾固定。按「確定」才寫入 localStorage，不進復原歷史。
  - **即時預覽**：`PreferencesProvider` 有一個**不存檔的預覽值**（`useSetPreviewPreferences`），設定時 `usePreferences()` 回傳它（畫布、TopBar 都跟著變），`savePreferences` 只存正式的值。對話框的草稿每次變更就設預覽，卸載時清除，所以「取消」/ Esc / ✕ / 點外面都會還原；「確定」同一批先寫入偏好再清預覽。不用「邊改邊存、取消時寫回」：那樣對話框開著時關掉視窗，沒確定的修改會留下來。
  - 預覽要看得到畫布：`SettingsDialog` 的 `seeThrough` 讓對話框靠右（`right-4 left-auto! translate-x-0!`），並加 `data-see-through`；遮罩透明、不模糊的規則在 `index.css`（`[data-slot="dialog-overlay"]:has(+ [data-see-through])`，不放在 `@layer` 才蓋得過 utilities），因為 shadcn 的 `DialogContent` 自己畫遮罩、不收 className（`components/ui/` 不改）。其他設定對話框照舊置中、模糊。
  - **預設值**（頁尾左側，`SettingsDialogFooter` 的 `start`）：「恢復預設」= 草稿樣式改成 `defaultLineStyles`（`lineStyleDefaults ?? FACTORY_LINE_STYLES`）；「設為預設」**立即**把草稿的樣式存成 `lineStyleDefaults`（toast；取消也保留），**同時寫進草稿**，否則之後按「確定」會用開啟時的舊預設蓋回去；「原廠設定」= 草稿樣式改成 `FACTORY_LINE_STYLES`（不影響存好的預設）。和草稿相同時停用（`sameLineStyles`）。預設值只含三種線的樣式，不含顯示開關、間距、吸附。
- **線條樣式**（`GuideLineStyle`：`color`（調色板，可含不透明度 `#rrggbbaa`）/ `dash`（同物件邊框的 `solid` / `dashed` / `dotted` / `dashDot`，比例用 `dashPattern`）/ `width`（**螢幕 px** 0.5–4、步進 0.5，`clampGuideLineWidth`））：`lineStyles` 有 `grid` / `contentGuides` / `margins` 三份。畫的時候用 `stroke.ts` 的 `guideLineAttrs(style, zoom, emphasis?)`，粗細與虛線 ÷ zoom，縮放時螢幕上一樣粗。
  - **原廠樣式** `FACTORY_LINE_STYLES` = 加入樣式設定前的外觀：格線 slate-400 45%、對齊線 indigo-500 85%、邊界 pink-500，都是 1 px 虛線；顏色用 `getPaletteHex` 取色票（Tailwind v4，和以前寫死的 v3 hex 差一點），調色板才標得出位置。
  - 內容區對齊線只有一組樣式：1/2 線粗 × 1.5、1/4 與 3/4 線不透明度 × 0.65（`CONTENT_GUIDE_EMPHASIS`），維持「1/2 較明顯」。
  - 舊偏好紀錄沒有 `lineStyles` 時讀成原廠；沒有 `showContentGuides` 時讀成 `grid.visible`（之前對齊線跟著格線，升級後看到的一樣），之後兩者獨立。
- **快速切換**（計畫：`docs/01-Plans-2026-10/02-視圖-實作.md`）：「視圖」選單的格線（Ctrl+'）/ 內容區對齊線（沒有快捷鍵）/ 邊界參考線（Ctrl+;）/ 吸附格線（Ctrl+Shift+'）勾選項目，與 TopBar 縮放左邊的同名按鈕（`view-toggle-buttons.tsx`），**按下立即寫入偏好**（不用確定）；間距在按鈕旁的 Popover 改（Enter / 失焦寫入），「更多設定...」開上面的對話框。三處改的是同一份 `Preferences`，所以永遠一致；對話框的草稿只在開啟當下取值（對話框開著時選單快捷鍵不觸發）。
  - 開關的讀寫與快捷鍵只寫在 `lib/preferences/view-toggles.ts` 的 `VIEW_TOGGLES`：`commands.ts` 由它產生 `view.<id>` 指令（`viewCommandId`），`home-page.tsx` 的 `isChecked` / handlers 與 TopBar 按鈕都讀它。**新增視圖開關** = 加一筆 + 放進 `MENUS` 的「視圖」（`menu-structure.test.ts` 會檢查每個指令恰好出現一次）+ 需要的話加到 TopBar 的 `BUTTONS`。
  - 吸附格線是獨立開關：格線隱藏時吸附照樣有效，按鈕也不跟著格線停用。
- **畫布**：格線（`PageGrid`）畫在頁面背景之上、物件之下，同一層還有**內容區對齊線**（`ContentGuides`）：內容區（邊界以內，邊界全 0 時是整頁）寬、高的 1/4、1/2、3/4 處，1/2 比 1/4 粗而明顯，只畫在內容區內，有自己的開關 `showContentGuides`（`geometry.ts` 的 `contentGuides`）；對齊線只是視覺參考，吸附仍只對齊格線。邊界參考線（`MarginGuide`）畫在物件之上、頁緣線旁。三者的樣式都來自 `lineStyles`，都 `listening={false}`、不算進內容範圍，也不會匯出。線距小於 6 px（`MIN_GRID_GAP_PX`）時只畫每 N 條（`drawnGridSpacing`），畫出來的線仍落在吸附格線上。
- **吸附格線**（格線隱藏時也可以開）：
  - 拖曳：`ElementNode` 的 `dragBoundFunc` 交給 `editor-canvas` 的 `dragBound`。**多選時 Konva 會讓每個節點各自呼叫 `dragBoundFunc`，而且 Transformer 在主節點第一次 dragmove 後才讓其他節點開始拖曳**，所以不能各自吸附，也不能用各自的位置推算：第一個呼叫的節點是 lead，記下它的起點與滑鼠偏移，每次從**滑鼠位置**推回 lead 的原始位置再吸附，所有節點都用「自己的起點 + lead 的位移」（相對位置不變）。記錄在 `handleMoveEnd` 清空。
  - 縮放：Transformer 的 `anchorDragBoundFunc`，只在單選且旋轉 0° 時吸附控制點。
  - 吸附的參考座標是**物件所在頁的 Group**（lead 節點的 `getParent()`），跨頁時右頁的 Group 有位移，用 Layer 會吸到錯的位置。
  - 建立：拖曳框的兩個角吸附（吸附後寬或高為 0 時當成點擊）；點擊建立的物件吸附外框左上角。預覽框不吸附。
  - 方向鍵與屬性面板輸入不吸附。

## 選單列與指令（`lib/menu`）

- 選單使用自訂 HTML（shadcn `Menubar`），**不使用** Tauri 原生選單；橫跨全寬，放在 Grid 第一列。
- **指令是單一資料來源**：`COMMANDS` 定義 label、快捷鍵與停用原因；`MENUS` 只描述結構；`CommandHandlers` 是 `{ [K in CommandId]: () => void }`，新增指令卻沒有提供 handler 時會編譯失敗。
- Handlers 在 `home-page.tsx` 建立（需要編輯器與專案狀態，所以在 `EditorProvider` / `ProjectProvider` 內）：新增、開啟、儲存、另存新檔、匯入圖片、匯出 PDF、匯出翻頁電子書、設定頁（由 `SETTINGS_PAGES` 產生，見「設定對話框」）已實作（`file.exportPdf` 和上方工具列的「匯出 PDF」按鈕呼叫同一個 `project.exportPdf()`）；其餘仍是佔位（`createPlaceholderHandlers` → toast「『xxx』尚未實作」），實作時覆寫對應的 key 即可。
- 新增選單項目的步驟：在 `COMMANDS` 加定義 → 在 `MENUS` 放入結構 → 提供 handler。`menu-structure.test.ts` 會檢查每個指令都出現在選單中恰好一次、快捷鍵沒有重複，也不會和編輯器快捷鍵衝突。
- 快捷鍵以 **`event.code`**（實體按鍵，例如 `KeyS`、`Comma`）比對，不用 `event.key`：注音輸入法啟用時 `key` 可能是 `Process`。`metaKey` 視同 Ctrl。
- `use-menu-shortcuts` 在 `window` capture 階段註冊：
  - 在輸入框與文字編輯中也生效，並呼叫 `preventDefault()`，避免 WebView2 預設的 Ctrl+S / Ctrl+O 行為。
  - 例外：輸入法選字中（`isComposing`）或焦點在 dialog / alertdialog 內時不觸發。
- 選單列順序 = `MENUS` 的陣列順序：檔案、專案管理、設定、視圖、工具面板（2026-10-09 使用者指定，計畫 `docs/01-Plans-2026-10/05-畫面調整-設定-工具面板-實作.md`；2026-10-19 加入專案管理，計畫 `docs/08-Plans-系統全域/01-素材管理-實作.md`）。
- 助記鍵 Alt+F / Alt+P / Alt+S / Alt+V / Alt+W（2026-10-19 起 Alt+P 是專案管理，工具面板改 Alt+W，使用者決定）：以 Menubar 受控 `value` 開啟選單。**不要**攔截事件傳遞（`stopPropagation`），Radix Menu 依賴 document 上的 keydown 判斷「鍵盤操作」，才會自動聚焦第一個項目。
- 「外觀」單選的 `value` 固定為「跟隨系統」，而且不接 `onValueChange`，等主題切換實作後再改成受控。
- `checkbox` 節點的勾選狀態不放在靜態的 `MENUS`，由 `AppMenubar` 的 `isChecked(commandId)` 從外部狀態讀取；不接 `onCheckedChange`，handler 負責切換。
- **動態停用**（2026-10-21）：看文件決定的停用寫在 `lib/menu/command-availability.ts` 的 `commandDisabledReason(id, document)`（固定的 `COMMANDS.disabledReason` 優先；目前只有 `file.exportPptx`）。`AppMenubar` 的 `disabledReason` prop 與 MCP 的 `CommandAccess.disabledReason` 都用 `home-page.tsx` 同一個函式，它在**呼叫當下**讀 `useProject().getSnapshot()`：Radix 選單打開時才掛上項目，所以 `EditorLayout` 不用訂閱編輯器狀態。快捷鍵（`findCommandByEvent`）只看固定原因：有快捷鍵的指令不要做成動態停用，或一起改。
- `專案管理`（主選單，2026-10-19 起）：`專案管理 → 素材管理...`（`project.library`，沒有快捷鍵；之前是 `檔案 → 素材管理...` / `file.library`）：開啟素材管理視窗，和「素材」面板的按鈕共用 `useLibraryDialog`。`專案管理 → 文件範本...`（`project.templates`，桌面版限定）：開啟文件範本視窗（見「文件範本」）。
- `視圖`：放畫面上的輔助顯示（存這台電腦、不影響輸出）：尺規、分隔線、格線、內容區對齊線、邊界參考線、吸附格線，都是 `view.<id>` 勾選項目，由 `VIEW_TOGGLES` 產生（見「偏好設定與頁面設定」的快速切換）。勾選項目也會顯示快捷鍵（`MenubarShortcut`，勾選記號在左側不重疊）。
- `設定 → 文件` / `設定 → 偏好設定`：`settings.<id>` 項目由 `SETTINGS_PAGES` 依 `SETTINGS_GROUPS` 自動產生（`settingsCommandId`），快捷鍵也宣告在清單裡。
- `設定` 只有文件 ▸、偏好設定 ▸、外觀 ▸。
- `工具面板`（主選單，2026-10-09 起；之前是「設定 → 工具面板 ▸」）：10 個 `panel.<id>` 勾選項目由 `PANEL_DEFINITIONS` 自動產生（`panelCommandId`），**依 `PANEL_CATEGORIES` 分三類、類別之間是分隔線**（加入內容：範本 文字 元素 素材 背景 繪圖 ─ 屬性與樣式：屬性 樣式 ─ 頁面與圖層：頁面 圖層；2026-10-14 使用者決定，不加類別標題），最下方是 `panel.resetLayout`「重設版面」。`PANEL_DEFINITIONS` 必須依類別連續排列（測試守著）。

| 快捷鍵 | 指令 |
|--------|------|
| Ctrl+N / Ctrl+O | 新增 / 開啟... |
| Ctrl+S / Ctrl+Shift+S | 儲存 / 另存新檔... |
| Ctrl+, | 格線與參考線...（設定 → 偏好設定 ▸） |
| Ctrl+' / Ctrl+; / Ctrl+Shift+' | 視圖 → 格線 / 邊界參考線 / 吸附格線（`event.code` 是 `Quote` / `Semicolon`） |
| Alt+F / Alt+P / Alt+S / Alt+V / Alt+W | 開啟「檔案」/「專案管理」/「設定」/「視圖」/「工具面板」選單 |

## 工具面板（`lib/dock` + `components/dock`）

原本參考 Krita 的 Docker（計畫：`docs/01-Plans/imp-tool-bar.md`）；2026-10-09 改成 **Affinity 式的頁籤群組**（計畫與決定：`docs/01-Plans-2026-10/06-畫面調整-工具面板停靠區-實作.md`）。

- **三欄版面**：`左停靠區 ｜ 中欄（系統控制列 + 畫布） ｜ 右停靠區`；選單列與頁籤列橫跨全寬。某一側沒有面板時整欄不顯示。
- **頁籤群組**：一側由上到下是幾個**群組**，每組頂端一排頁籤、一次顯示一個面板。預設（第一次啟動與「重設版面」共用 `DEFAULT_DOCK_LAYOUT`）：左 `[頁面]`、右 `[屬性]`（2026-10-14 使用者決定；計畫 `docs/02-Plans-操作/02-工具面板-重構-實作.md`）；其他面板從「工具面板」選單打開，依類別放進群組（見下面的 `togglePanel`）。有版面記錄的使用者不受影響，按「重設版面」才變。
  - 點頁籤切換；頁籤上的 ✕ 關閉（目前頁籤一直顯示，其他頁籤滑過才浮在右端，不佔寬度）；頁籤列左端的箭頭收合整組（只剩頁籤列）。展開的群組平分高度。
  - **背景頁籤不掛載**（`DockArea` 只 render `PANELS[group.active]`，以面板 id 為 key）：看不到的面板不訂閱編輯器狀態、不多做 re-render。代價是面板自己的暫時狀態（屬性面板的子分頁、捲動位置、「限制寬高比」）切走再回來會重置。
  - 頁籤列放不下時橫向捲動（捲軸隱藏）：滾輪直向轉橫向；目前頁籤一直捲在看得到的地方（`DockPanelGroup` 的 effect 自己算 `scrollLeft`，不用 `scrollIntoView`）；拖曳靠近邊緣自動捲動。
  - 鍵盤：頁籤列 ← →（頭尾循環）/ Home / End 切換並移動焦點；這幾個鍵 `stopPropagation`，否則會傳到編輯器、移動畫布上選取的物件（`use-editor-shortcuts` 在 `window` bubble 階段）。
  - 外觀：目前頁籤有框線、和內容同底色、蓋住頁籤列的底線。底線是 inset 陰影（用 border 要讓頁籤往下凸 1 px，頁籤列會多出垂直捲動）；目前頁籤**不加粗**（粗體較寬，切換時整排位移）。頁籤上的間距不要放在 shadcn `Button` 的 margin：它有 `transition-all`，margin 會慢慢長出來，頁籤捲進畫面的位置就差幾 px。
  - 頁籤列自己畫（`role="tablist"` / `tab` / `tabpanel`），**不用 shadcn `Tabs`**：Radix Tabs 按下就切換、有自己的 roving focus，和拖曳頁籤、關閉鈕混在一起不好控制。屬性面板裡面的子分頁才用 shadcn `Tabs`（所以查 `[role="tab"]` 時要限定 `[data-dock-tab] > [role="tab"]`）。
- **屬性面板**（`properties`，預設在右側最上方）取代了原本的上方選取工具列：
  - 分頁依物件類型：圖形 = 樣式 / 文字 / 調整，文字 = 文字 / 調整，圖片 = 調整。名稱與分頁列固定在面板頂端（sticky）。
  - 數字欄位用 `NumberField`：Enter / 失焦才寫入，一次編輯 = 一筆復原。
  - 「限制寬高比」是面板的編輯選項，不存進文件。
  - **對齊內容區**（「調整」分頁，「圖層順序」與「大小」之間，計畫 `docs/01-Plans-2026-10/14-物件屬性增加填滿寬度、高度-實作.md`）：**一次性的動作**（一個 `element/update` = 一筆復原，不存進文件；改邊界後不會跟著變），邏輯在 `lib/editor/content-align.ts`。內容區 = 物件所在 sheet（頁面或主頁）的邊界以內，邊界全 0 時整頁。
    - 填滿寬度 / 高度：位置與大小設成內容區的；**旋轉不是 0 時同一筆 patch 先歸零**（使用者決定）；照「限制寬高比」（另一邊等比例、位置不動，可能超出內容區）；文字只有填滿寬度（行寬）；內容區小於最小物件尺寸時停用。
    - 靠左 / 水平置中 / 靠右 / 靠上 / 垂直置中 / 靠下：只移動，**用旋轉後的外框**（旋轉不變）；文字的高度用 `measureTextLayout` 的行數（變數先換成畫布上的值），不用 `estimateTextHeight`（粗估）。已經對齊時不 dispatch。
- **面板的單一資料來源**是 `lib/dock/panels.ts` 的 `PANEL_DEFINITIONS`；`PANELS`（內容）、`PANEL_ICONS`（icon）以 `satisfies Record<PanelId, …>` 檢查完整性，選單指令自動產生。**新增面板**：在 `PANEL_DEFINITIONS` 加一筆 → 補 `PANELS` 與 `PANEL_ICONS`（漏了會編譯失敗）。
- `DockLayout`（左右各一個由上到下的 `DockGroup[]` + 兩側寬度；`DockGroup` = `panels`（頁籤順序）/ `active` / `collapsed`）是 App 偏好：**不進復原歷史、不存進專案檔**；所有變更都走 `dock-layout.ts` 的純函式（沒變化時回傳同一個參考）。規則：一個面板在整個版面最多出現一次；群組不會是空的（最後一個頁籤關掉 = 群組消失）；`active` 一定在 `panels` 裡。
  - `togglePanel`（選單勾選）：打開 = 預設側**第一個含同類別面板的群組**，加在最後並顯示；沒有 → 另開一組，插在第一個「含後面類別面板」的群組之前（`PANEL_CATEGORIES` 的順序，所以內容面板在頁面上面、圖層在屬性下面；使用者拖成混合類別的群組也照這規則判斷）；已打開（含背景頁籤）= 關閉。選單的勾選 = 在某個群組裡，不是「看得到」。
  - `closePanel`：關掉目前頁籤時顯示下一個（最後一個就顯示前一個）。`activatePanel`、`toggleCollapsed`（以組裡任一面板指定那一組）。
  - `dropPanel(layout, id, target)`：`DropTarget` 有兩種——`{ kind: "tab", group, slot }` 插進某組的頁籤列（併入 / 同列換位置）、`{ kind: "group", slot }` 在群組之間另成一組；slot 都**含被拖的那一個**（拖曳時看到的樣子）。放下的面板成為那組的目前頁籤；併入收合的組時保持收合。`dropMovesPanel` 判斷位置有沒有變（原位放下只是切換頁籤，不畫提示）。
- **size control bar**（`DockSplitter`）：停靠區寬度 200–560px（`DOCK_WIDTH`），畫布欄至少 `CANVAS_MIN_WIDTH`（480px）。拖曳期間只改 `DockArea` 的 local state，**放開才寫回** `DockLayout`（和畫布「dragend 才 dispatch」同一原則）。畫布尺寸由 `EditorCanvas` 的 `ResizeObserver` 自動跟上。
- **拖曳頁籤**（`useDockDrag`）：用 pointer events 自己做，**不用 HTML5 drag & drop**（只有從檔案總管拖檔案進素材庫用那一套）。按下後移動 4px 才算拖曳、結束後吞掉下一次 click、Esc 取消，這些由 `components/pointer-drag.ts` 的 `startPointerDrag` 處理（頁面頁籤拖曳也用它，改動時兩邊都要測）。React state 只在目標改變時更新，跟著游標的標籤直接改 style，避免每次 pointermove 重畫畫布。
  - 命中判斷靠屬性：停靠區（含空白側的放置區）`data-dock-side`、群組 `data-dock-group`、頁籤列 `data-dock-tabbar`、頁籤 `data-dock-tab`。**指到頁籤列 = 併入那一組**（頁籤的水平中心算 `insertionSlot`，畫直線 `TabDropIndicator`、整列淡淡標示）；**停靠區其他地方 = 在群組之間另成一組**（群組的垂直中心，畫橫線）。提示線都是寬 / 高 0，不影響版面。
  - 拖曳靠近頁籤列左右邊緣時自動捲動那一列：`pointer-drag.ts` 的 `edgeScrollDelta`，和頁面頁籤列（`use-page-tab-drag.ts`）共用同一個算法。
- **記憶**：`localStorage` key `magazine-editor.dockLayout.v3`，讀取一律過 `parseDockLayout`（不信任儲存內容：未知 / 重複 id、空群組丟掉，`active` 無效改成第一個）。格式不相容時換 key。**v2 / v1（上下堆疊的格式）不轉換**：用新的預設群組，只沿用兩側寬度（`parseDockWidths`，使用者決定）。`npm run dev` 與安裝版 origin 不同，各記一份。
- Radix `ScrollArea` 內層是 `display: table`，長文字會撐寬面板；`DockScrollArea`（`dock-panel.tsx` 匯出）用 `[&_[data-slot=scroll-area-viewport]>div]:block!` 修正，面板裡需要捲動區時用它。
- 面板預設由 `DockPanelGroup` 包一個捲動區；需要把高度分給好幾塊、各自捲動的面板，在 `PANEL_DEFINITIONS` 設 `scroll: "self"`（目前只有「頁面」），內容會放在 `flex-1 min-h-0` 的 tabpanel 裡。
- 之後可以另排（沒做）：群組之間的分隔條調整高度（現在平分）、雙擊頁籤列收合（Affinity 的做法）、浮動面板。
- Tailwind v4 的 `inset-y-0` 是邏輯屬性（`inset-block`），和直書（`writing-mode: vertical-rl`）放在同一個元素會變成水平方向。

## 檔案（原 CLAUDE.md「目錄結構」）

```
  App.tsx                         # TooltipProvider + Toaster + lazy 載入 HomePage（不再使用 app-sidebar）
  pages/home-page.tsx             # EditorProvider → ProjectProvider → 版面（選單列 / 左停靠區｜中欄｜右停靠區 / 頁籤列）；dockLayout、選單 handlers、關閉提示放在這裡
    app/app-menubar.tsx           # 標題列下方的選單列（檔案(F) / 專案管理(P) / 設定(S) / 視圖(V) / 工具面板(W)），依 MENUS 渲染
    app/paper-preset-grid.tsx     # 紙張卡片（依 PAGE_SIZE_GROUPS 分組、依比例的外框、每張畫「點了會得到的尺寸」（selectPresetSize）、radio group 方向鍵）
    app/settings/                 # 設定對話框（設定 → 文件 ▸ / 偏好設定 ▸，每項一個對話框，見「設定對話框」）
      index.ts                    # SETTINGS_DIALOGS：SettingsPageId → 對話框元件（satisfies Record，缺項會編譯失敗）
      settings-dialog.tsx         # 共用外框 SettingsDialog（seeThrough：靠右、遮罩透明不模糊，即時預覽用）、頁尾 SettingsDialogFooter（取消 / 確定，左側可放 start）、SettingsDialogProps
      settings-fields.tsx         # 共用欄位：MmField（pt 值以 mm 顯示）、SwitchRow
      page-setup-dialog.tsx       # 「頁面設定」：紙張（分組下拉選單）/ 直橫 / 寬高、邊界（文件設定，一筆復原）
      page-setup-fields.tsx       # PageSetupFields：直橫 / 寬高 / 邊界 / 錯誤訊息（受控），頁面設定與新增文件共用
      grid-dialog.tsx             # 「格線與參考線」：格線（間距、吸附）/ 內容區對齊線 / 邊界參考線三區，各自的顯示開關與顏色・粗細・線型；即時預覽；恢復預設 / 設為預設 / 原廠設定（App 偏好）
    app/app-sidebar.tsx           # 舊的導覽側邊欄，保留但不引用，不要修改或刪除
    dock/                         # 工具面板（Affinity 式頁籤群組停靠）的 UI
      dock-area.tsx               # 一側的停靠區：群組上下堆疊、只掛每組目前頁籤的面板、群組之間的插入線、空白側的放置區
      dock-panel.tsx              # DockPanelGroup：頁籤列（收合、頁籤切換 / 關閉 / 拖曳、插入直線、滾輪橫捲、← → Home End）+ tabpanel；DockScrollArea（`scroll: "self"` 的面板不包，內容自己捲動）
      dock-splitter.tsx           # size control bar：拖曳 / 雙擊還原 / 鍵盤 ←→ 調整停靠區寬度
      use-dock-drag.ts            # 拖曳頁籤（命中判斷：頁籤列 = 併入、其他 = 另成一組；靠邊自動捲動；按下 / 門檻 / Esc 交給 pointer-drag.ts）
      dock-drag-ghost.tsx         # 拖曳時跟著游標的面板 icon + 名稱（DragGhost 的包裝）
    pointer-drag.ts               # startPointerDrag：一次按下的拖曳流程（4 px 門檻、游標（預設 grabbing，可指定）、吞掉拖曳後的 click、Esc 取消、清除），工具面板、頁籤拖曳與「頁面」面板的分區高度共用；edgeScrollDelta：拖曳靠近頁籤列邊緣時的自動捲動量（頁面頁籤列與停靠區頁籤列共用）
    drag-ghost.tsx                # DragGhost / moveDragGhost：拖曳時跟著游標的標籤（直接改 style，不走 React state）
      panel-icons.ts              # PANEL_ICONS：PanelId → icon（satisfies Record）
      number-field.tsx            # 屬性面板的數字欄位（Enter / 失焦才寫入、Esc 取消；可選的 − / ＋ 按鈕，每按一下寫入一次；mixed：空白 +「混合」，打任何數字都寫入）
      panels/index.ts             # PANELS：PanelId → 面板元件（satisfies Record，缺項會編譯失敗）
      panels/*.tsx                # 10 個面板（「相片」2026-10-14 移除，內建相片在素材面板的「內建範例」）；styles-panel 是「樣式」面板（文件的文字樣式：點一下套用到選取、編輯 / 複製 / 刪除、雙擊改名，見「文字樣式」）；text-panel 列出文件的樣式（新文字連到該樣式）；library-panel 是「素材」面板（id 仍是 upload：資料夾選單（含「內建範例」）、匯入、點一下放到中央、拖到畫布；素材與內建範例共用拖曳流程 `Placeable`）；properties-panel 是 draw.io 式屬性面板（樣式 / 文字 / 調整，文字分頁有「插入變數」）；pages-panel 是 Affinity 式「頁面」面板（主頁 / 頁面縮圖，兩區各自收合、拖曳「頁面」標題列調高度：use-section-resize.ts）；elements-panel 是「元素」面板（依分類的 Accordion，`type="single" collapsible`：一次只展開一個、可以全部收起，記住展開哪一個（`lib/dock/elements-panel-layout.ts`），標題有圖形數量；點一下放到頁面中央）；draw-panel 是「繪圖」面板（常用線條與箭頭 `LINE_PRESETS`，`lib/editor/line-presets.ts`：點一下放到頁面中央，分隔線橫跨內容區）
      page-guides.tsx             # 畫布上的格線（PageGrid，一個 Konva Shape 畫完所有線）、內容區對齊線（ContentGuides）與邊界參考線（MarginGuide），樣式來自偏好（guideLineAttrs）
    menu/                         # 選單與全域指令（不含 UI）
      commands.ts                 # COMMANDS（label / shortcut / disabledReason）、CommandId、CommandHandlers、佔位 handler
      command-availability.ts     # commandDisabledReason(id, document)：固定的 disabledReason 之外看文件決定的停用（匯出 PowerPoint 只給簡報尺寸）；選單與 MCP 共用
      menu-structure.ts           # MENUS 結構（item / checkbox / separator / submenu / radio）、助記鍵
      shortcut.ts                 # matchesShortcut / formatShortcut（以 event.code 比對）
      use-menu-shortcuts.ts       # 全域 Ctrl 快捷鍵與 Alt 助記鍵
      __tests__/
    preferences/                  # App 偏好（不含 UI）：preferences.ts（型別、預設、parsePreferences）、preferences-storage.ts（localStorage）、preferences-context.tsx（PreferencesProvider，含不存檔的預覽值）、settings-pages.ts（設定頁清單 SETTINGS_PAGES / SETTINGS_GROUPS）、view-toggles.ts（視圖開關 VIEW_TOGGLES：尺規 / 格線 / 內容區對齊線 / 邊界參考線 / 吸附格線的讀寫與快捷鍵，選單與 TopBar 共用）
    dock/                         # 工具面板版面（不含 UI）
      panels.ts                   # PANEL_DEFINITIONS（id / label / category / defaultSide / 可選的 scroll: "self"）：面板的單一資料來源，PanelId 由它推導；PANEL_CATEGORIES（加入內容 / 屬性與樣式 / 頁面與圖層，順序 = 選單順序 = 新群組的上下順序）、panelsIn、getPanelCategory
      pages-panel-layout.ts       # 「頁面」面板兩區的收合與高度比例（純函式、最小高度、parse、localStorage 讀寫）
      elements-panel-layout.ts    # 「元素」面板展開的分類（或全部收起）：parse（不認得的分類 → 基本）、和 Accordion 值互轉、localStorage `magazine-editor.elementsPanel.v1`
      dock-layout.ts              # DockLayout / DockGroup 型別與純函式（開關 / 切換頁籤 / 拖放（併入、另成一組）/ 收合 / 寬度）、parseDockLayout / parseDockWidths
      dock-storage.ts             # 版面存取 localStorage（v3；損壞時回到預設，v2 / v1 只沿用寬度）
      __tests__/
      page-setup.ts               # 紙張 preset（不分直橫比對、presetIdsInGroup 分組、presetOrientation 自然方向、selectPresetSize 選紙張時的方向）、直式 / 橫式、頁面設定的錯誤檢查（頁面設定對話框用）
      units.ts                    # mm ↔ pt、紙張 preset（PAGE_SIZE_PRESETS，18 種，依 PAGE_SIZE_GROUPS 分組；簡報有 orientation: "landscape"）
```
