# CLAUDE.md

雜誌編輯軟體（`magazine-editor`）是 Windows 桌面應用程式，由 `../setup-tauri-reactv3.ps1` 產生專案骨架。

- 長期目標：**排版與輸出以 EPUB 3 固定版面（Fixed Layout）為主，PDF 是由同一份排版資料衍生的輸出**；Konva.js 做前端自由拖放編輯器（類似 Canva）。方向於 2026-09-22 由「Typst 負責排版與 PDF 輸出」調整而來：固定版面 EPUB 的渲染引擎和 Konva 量測文字同源，「所見即所得」從「盡量接近」變成「本來就一樣」。
- 目前階段：前端編輯器 v1（含 Krita 式工具面板，見「工具面板」；2026-10-01 型別重構：圖形合併成 `shape`、draw.io 式屬性面板、邊框、圖形內文字；2026-10-03 多選與框選；2026-10-04 偏好設定：紙張、邊界、格線與吸附；2026-10-04 頁碼管理，見「頁碼管理」；2026-10-05 文字的斜體 / 底線 / 刪除線 / 硬陰影，見「文字裝飾」；2026-10-05 設定選單拆成「文件 ▸ / 偏好設定 ▸」、每項一個對話框，紙張 14 種，見「設定對話框」；2026-10-06 頁面排序：拖曳頁籤、選單、快捷鍵，見「頁面排序」；2026-10-07 主頁（可階層）、動態變數、「頁面」面板、新增頁面 / 主頁對話框，見「主頁與動態變數」；2026-10-07 單頁 / 雙頁（跨頁）編輯，見「單頁 / 雙頁」；2026-10-07 視圖 → 尺規，見「尺規」；2026-10-08「檔案 → 新增」先選紙張，見「檔案系統」的新增專案）+ 檔案系統第一、二階段（專案存檔 / 開啟、自動備份與當機復原）+ Typst 匯出 PDF；正在依 `0-Task/plan-epubv2.md` 重構成 EPUB 為主（共五個階段，階段 0 字型自備化已完成）。計畫：`../../3_系統設計文件/imp-ui-homepage.md`、`0-Task/plan-filesystem.md`、`0-Task/plan-export-pdf.md`、`0-Task/plan-epubv2.md`（後三份本機限定，不在 repo）。
- Bundle identifier：`com.mycompany.magazineeditor`
- 視窗標題：`雜誌編輯軟體`（設定在 `src-tauri/tauri.conf.json`，預設最大化，最小尺寸 1024×640）
- 給人閱讀的說明文件在 `docs/`（依編號分批撰寫，進度見 `docs/README.md`）。修改架構或資料流程時，同步更新對應的文件。
  - `docs/01-Plans/`：早期的任務檔與計畫（`03-`～`07-` 任務檔、`imp-tool-bar.md`、`imp-tldraw-bar.md`、`imp-color-picker.md`、EPUB 計畫、MCP 評估）；之後的計畫在 `docs/Plans/`。
- **開始工作前先讀 `docs/progress.md`**（目前階段、已做的決定、待辦）；完成工作或做出決定後更新它。
- `docs-website/` 是 HTML 版說明（入口 `index.html`），負責「結構與關係」這類適合用圖說明的內容；`docs/` 負責「為什麼這樣設計」，兩邊互相連結、不重複撰寫。
  - 頁面必須自給自足：CSS 內嵌、手寫 inline SVG，不引用 CDN 或外部資源，用 `file://` 可以離線開啟。
  - `types.html` 對應 `src/lib/editor/types.ts`：**修改 `types.ts` 時要同步更新**圖、說明卡，以及頁首的對應 commit。
- `0-Task/` 是使用者的任務檔與計畫檔（已加入 `.gitignore`，內容含本機路徑，不可 commit）。

## Tech Stack

| 層 | 技術 |
|---|---|
| Desktop shell | Tauri v2（`protocol-asset` feature）· `tauri-plugin-opener` · `tauri-plugin-dialog`（只在 Rust 端呼叫）· `tauri-plugin-single-instance` |
| Frontend | React 19 · TypeScript ~6.0（strict）· Vite 8 |
| 編輯畫布 | `konva` 10 · `react-konva` 19 · `use-image` |
| Styling | Tailwind CSS v4（`@tailwindcss/vite`，沒有 `tailwind.config`）· `tw-animate-css` |
| UI | shadcn/ui（style `radix-nova`、base color `neutral`、`radix-ui` 單一套件）· Lucide icons · sonner |
| 測試 | vitest 5（node 環境，只測 `src/lib/**` 的純邏輯）· `cargo test`（`tempfile`、`typst-render`）· 共用 fixture `tests/fixtures/sample.magproj` |
| Backend | Rust 2021 · `rusqlite 0.40`（`bundled`）· `thiserror 2` · serde · `sha2` · `uuid` · `time` |
| 字型 | 自備靜態字型，放在 `fonts/`（黑體 Geist + Noto Sans TC、明體 Noto Serif TC、楷體霞鶩文楷 TC、圓體源泉圓體，各 Regular / Bold，皆為 SIL OFL）；畫面與匯出**共用同一批檔案** |
| PDF 排版 | 內嵌 `typst` / `typst-layout` / `typst-pdf` **`=0.15.1`**（三個版本必須一致，Typst 的 crate API 每版都會變，所以鎖定 `=`） |

## Commands

套件管理器是 **npm**（專案已有 `package-lock.json`，不要混用 pnpm）。

```powershell
npm run tauri dev      # 開發（Vite dev server :1420 + Tauri 視窗）
npm run dev            # 只跑前端（瀏覽器，沒有 Tauri IPC；編輯器可完整操作）
npm run build          # tsc + vite build（前端型別檢查 + 打包）
npm test               # vitest run（src/**/__tests__/*.test.ts）
npx vitest run src/lib/editor/__tests__/editor-reducer.test.ts   # 只跑單一測試檔
npm run tauri build    # 打包 Windows installer / .exe
cargo check --manifest-path src-tauri/Cargo.toml    # Rust 型別檢查
cargo test --manifest-path src-tauri/Cargo.toml     # Rust 測試
npx shadcn@4.21.0 add <component>                    # 新增 shadcn 元件（鎖定和 scaffold 相同的版本）

# 匯出 PDF 的疊圖比對：把每頁算成 PNG（2 px/pt）放到 <dir>，用來對照畫布
$env:EXPORT_PREVIEW_DIR = "<dir>"
cargo test --manifest-path src-tauri/Cargo.toml export_preview -- --ignored
```

目前沒有設定 ESLint / Prettier。

## 目錄結構

```
src/
  App.tsx                         # TooltipProvider + Toaster + lazy 載入 HomePage（不再使用 app-sidebar）
  pages/home-page.tsx             # EditorProvider → ProjectProvider → 版面（選單列 / 左停靠區｜中欄｜右停靠區 / 頁籤列）；dockLayout、選單 handlers、關閉提示放在這裡
  components/
    app/app-menubar.tsx           # 標題列下方的選單列（檔案(F) / 視圖(V) / 設定(S)），依 MENUS 渲染
    app/unsaved-changes-dialog.tsx  # 「要儲存變更嗎？」對話框（Promise 形式的 confirm）
    app/recovery-dialog.tsx       # 啟動時「要復原上次未儲存的內容嗎？」（只能選復原 / 捨棄，Esc 不會關閉）
    app/new-document-dialog.tsx   # 「檔案 → 新增」的「新增文件」對話框（useNewDocumentDialog：左紙張卡片、右 PageSetupFields，回傳 PageSetup | null）
    app/paper-preset-grid.tsx     # 紙張卡片（依 PAGE_SIZE_GROUPS 分組、依比例的外框、跟著直橫轉、radio group 方向鍵）
    app/use-pending-choice.ts     # 以 Promise 等待使用者選擇的對話框狀態（未存檔、復原、新增文件三個對話框共用）
    app/settings/                 # 設定對話框（設定 → 文件 ▸ / 偏好設定 ▸，每項一個對話框，見「設定對話框」）
      index.ts                    # SETTINGS_DIALOGS：SettingsPageId → 對話框元件（satisfies Record，缺項會編譯失敗）
      settings-dialog.tsx         # 共用外框 SettingsDialog、頁尾 SettingsDialogFooter（取消 / 確定）、SettingsDialogProps
      settings-fields.tsx         # 共用欄位：MmField（pt 值以 mm 顯示）、SwitchRow
      page-setup-dialog.tsx       # 「頁面設定」：紙張（分組下拉選單）/ 直橫 / 寬高、邊界（文件設定，一筆復原）
      page-setup-fields.tsx       # PageSetupFields：直橫 / 寬高 / 邊界 / 錯誤訊息（受控），頁面設定與新增文件共用
      grid-dialog.tsx             # 「格線與參考線」：格線、間距、吸附、邊界參考線（App 偏好）
      page-numbers-dialog.tsx     # 「頁碼管理」：頁碼型態、套用頁面與起始值、奇偶頁位置與前後置文字、設定列表、「顯示頁碼」開關
    app/app-sidebar.tsx           # 舊的導覽側邊欄，保留但不引用，不要修改或刪除
    dock/                         # 工具面板（Krita 式停靠）的 UI
      dock-area.tsx               # 一側的停靠區：面板上下堆疊、插入提示線、空白側的放置區
      dock-panel.tsx              # 面板外框：標題列（收合 / 拖曳 / 關閉）+ DockScrollArea（`scroll: "self"` 的面板不包，內容自己捲動）
      dock-splitter.tsx           # size control bar：拖曳 / 雙擊還原 / 鍵盤 ←→ 調整停靠區寬度
      use-dock-drag.ts            # 拖曳標題列移動面板（命中判斷；按下 / 門檻 / Esc 交給 pointer-drag.ts）
      dock-drag-ghost.tsx         # 拖曳時跟著游標的面板 icon + 名稱（DragGhost 的包裝）
    pointer-drag.ts               # startPointerDrag：一次按下的拖曳流程（4 px 門檻、游標（預設 grabbing，可指定）、吞掉拖曳後的 click、Esc 取消、清除），工具面板、頁籤拖曳與「頁面」面板的分區高度共用
    drag-ghost.tsx                # DragGhost / moveDragGhost：拖曳時跟著游標的標籤（直接改 style，不走 React state）
      panel-icons.ts              # PANEL_ICONS：PanelId → icon（satisfies Record）
    editor/
      editor-canvas.tsx           # Stage、捲動工作區、zoom/fit、Transformer、選取、文字編輯 overlay；Layer 是跨頁座標（canvasSheets）；外層 grid 放尺規
      canvas-ruler.tsx            # 尺規：CanvasRuler（2D canvas 刻度 + 選取範圍色帶 + 滑鼠標示線）、RulerCorner（角落 mm）、moveRulerMarker（直接改 DOM）
      canvas-sheet.tsx            # CanvasSheet：一頁畫在位移 x 的 Group 裡（背景、格線、主頁內容、對頁跨過書背的複本、物件、頁碼、參考線、頁緣）；雙頁時書背側裁切；對頁畫成靜態、按下切頁；SpreadSpine 書背線
      canvas-elements.tsx         # 物件 → Konva 節點的 renderer；bakeTransform()；snapAbsoluteToGrid()；StaticElement / StaticShape（主頁內容、頁碼、對頁物件：不能編輯的節點，預設不攔事件）
      text-editor-overlay.tsx     # 雙擊文字 / 圖形（或文字工具新建）時疊在畫布上的 textarea（處理輸入法選字；圖形內文字用 frame 垂直對齊）
      use-canvas-pan.ts           # 手形工具 / 空白鍵 / 中鍵拖曳平移（只改捲動位置）
      use-canvas-create.ts        # 文字 / 圖形工具在畫布上點擊或拖曳建立（預覽框）
      use-canvas-marquee.ts       # 選取工具在空白處拖曳框選（選取框、Ctrl 加入、Esc 取消）
      bottom-toolbar.tsx          # tldraw 風格底部工具列：工具 + 動作列（復原 / 重做 / 刪除 / 複製 / ⋮）
      shape-options.ts            # 圖形清單（種類 / 名稱 / icon），元素面板與底部工具列共用
      number-field.tsx            # 屬性面板的數字欄位（Enter / 失焦才寫入、Esc 取消；可選的 − / ＋ 按鈕，每按一下寫入一次）
      editor-top-bar.tsx          # 系統控制項：文件名稱、縮放、匯出 PDF（復原 / 重做在底部動作列）
      editor-page-bar.tsx         # draw.io 風格頁籤：新增（「+」開新增頁面對話框）/ 切換 / 雙擊改名 / 刪除（AlertDialog）/ 拖曳排序（插入線）、滾輪橫捲、`<` `>` 與頁碼輸入框（編輯主頁時顯示「–」）
      use-page-tab-drag.ts        # 拖曳頁籤調整順序：插入位置（insertionSlot）、頁籤列上下 48 px 內才算、左右邊緣自動捲動
      page-menu.tsx               # 頁面清單選單（`≡` 與目前頁籤的 `˅` 共用）：插入頁面...（新增頁面對話框）、切換頁面；`˅` 另有目前頁的向左 / 向右 / 移到最前 / 移到最後（pageActions）
      panels/index.ts             # PANELS：PanelId → 面板元件（satisfies Record，缺項會編譯失敗）
      panels/*.tsx                # 10 個面板；properties-panel 是 draw.io 式屬性面板（樣式 / 文字 / 調整，文字分頁有「插入變數」）；pages-panel 是 Affinity 式「頁面」面板（主頁 / 頁面縮圖，兩區各自收合、拖曳「頁面」標題列調高度：use-section-resize.ts）；draw 目前是佔位
      sheet-thumbnail.tsx         # 頁面 / 主頁縮圖：小 Konva Stage + StaticElement，捲進畫面才建立、memo
      page-dialogs.tsx            # PageDialogsProvider / usePageDialogs：「新增頁面」「新增主頁」對話框（頁籤列、頁面選單、頁面面板共用）
      master-edit-banner.tsx      # 編輯主頁時畫布上方的提示（主頁名稱、以誰為基礎、幾頁使用）與「回到頁面」
      page-guides.tsx             # 畫布上的格線（PageGrid，一個 Konva Shape 畫完所有線）與邊界參考線（MarginGuide）
      color-picker.tsx            # 調色板：ColorPalette（Tailwind 色系 / 深淺 / 不透明度）與 ColorPicker（按鈕 + Popover）
      style-controls.tsx          # 文字樣式（TextStyleFields：字體 / 字級 / 粗體・斜體・底線・刪除線 / 可選的對齊 / 顏色 / 陰影）與邊框（StrokeFields）控制項，屬性面板與頁碼管理共用
      icon-button.tsx · inline-name-input.tsx   # 共用小元件
    ui/                           # shadcn 產生的元件（視為 vendor code）
  lib/
    utils.ts                      # re-export `cn`（來自 `cn` 套件，不是 clsx + tailwind-merge）
    project/                      # 專案檔案存取（不含 UI）
      project-types.ts            # ProjectInfo / ProjectContent / OpenedProject / CommandError（對應 Rust）
      project-api.ts              # invoke 包裝（回傳 Result）、isDesktop、describeCommandError
      asset-url.ts                # resolveAssetUrl：專案相對路徑 → asset protocol URL
      project-context.tsx         # ProjectProvider：啟動載入、createNew / loadOpened / markSaved、視窗標題、resolveSrc
      use-project-commands.ts     # 新增 / 開啟 / 儲存 / 另存 / 匯出 PDF（未存檔提示與新增文件對話框由 UI 注入）
      use-image-import.ts         # 圖片複製進專案 assets/（上傳檔案與內建相片）
      use-close-guard.ts          # 關閉視窗前提示未存檔
      use-autosave.ts             # 每 60 秒把未存檔內容寫入備份（decideAutosave 是純函式）
      __tests__/
    menu/                         # 選單與全域指令（不含 UI）
      commands.ts                 # COMMANDS（label / shortcut / disabledReason）、CommandId、CommandHandlers、佔位 handler
      menu-structure.ts           # MENUS 結構（item / checkbox / separator / submenu / radio）、助記鍵
      shortcut.ts                 # matchesShortcut / formatShortcut（以 event.code 比對）
      use-menu-shortcuts.ts       # 全域 Ctrl 快捷鍵與 Alt 助記鍵
      __tests__/
    preferences/                  # App 偏好（不含 UI）：preferences.ts（型別、預設、parsePreferences）、preferences-storage.ts（localStorage）、preferences-context.tsx（PreferencesProvider）、settings-pages.ts（設定頁清單 SETTINGS_PAGES / SETTINGS_GROUPS）
    dock/                         # 工具面板版面（不含 UI）
      panels.ts                   # PANEL_DEFINITIONS（id / label / defaultSide / 可選的 scroll: "self"）：面板的單一資料來源，PanelId 由它推導
      pages-panel-layout.ts       # 「頁面」面板兩區的收合與高度比例（純函式、最小高度、parse、localStorage 讀寫）
      dock-layout.ts              # DockLayout 型別與純函式（開關 / 移動 / 拖放 / 收合 / 寬度）、parseDockLayout
      dock-storage.ts             # 版面存取 localStorage（損壞時回到預設）
      __tests__/
    export/                       # 匯出 PDF 的前端部分
      export-request.ts           # ExportRequest / TextLayout 型別、buildExportRequest（對應 Rust；匯出前把頁碼加成每頁最上層的圖形）
      text-layout.ts              # measureTextLayout：用離畫面的 Konva.Text 取得分行、基線與每行寬度；measureLineWidth：單行寬度（頁碼外框）
      __tests__/
    editor/                       # 不含 UI 的編輯器核心，新增邏輯優先放這裡並補測試
      types.ts                    # 文件模型（CanvasElement discriminated union）
      editor-reducer.ts           # 純 reducer + selectors + undo/redo
      selection-actions.ts        # 整組選取的刪除 / 複製 / 方向鍵移動 action（快捷鍵與底部動作列共用）
      editor-context.tsx          # EditorProvider、useEditorState / useEditorDispatch / useActivePage
      element-factory.ts          # 建立物件/頁面/範例文件、拖曳建立（createShapeInBox / createToolText）、describeElement
      geometry.ts                 # 物件外框（含旋轉）、內容範圍、框選判斷（elementsInBox）、文字高度估算、MIN_ELEMENT_SIZE_PT、格線吸附 / 抽稀、邊界框
      page-setup.ts               # 紙張 preset（不分直橫比對、presetIdsInGroup 分組）、直式 / 橫式、頁面設定的錯誤檢查（頁面設定對話框用）
      page-numbers.ts             # 頁碼：規則 → 虛擬圖形（pageNumberShape / withPageNumbers）、驗證（isPageNumberRules，和 Rust 同規則）、對話框的說明與錯誤訊息
      shape-geometry.ts           # 多邊形 / 星形頂點（和 Rust project/shape.rs 同公式）
      shape-label.ts              # 圖形內文字的文字框、垂直對齊、轉成 TextElement（量測 / 編輯 / 匯出共用）
      stroke.ts                   # 邊框的虛線樣式（dashPattern，和 Rust render.rs 同數字）與 Konva 屬性
      text-style.ts               # 文字裝飾：預設值（PLAIN_TEXT_DECORATION、DEFAULT_TEXT_SHADOW）、轉成 Konva 屬性（konvaTextStyle）、陰影偏移換成物件座標（localShadowOffset）
      properties.ts               # 屬性面板的數字換算（解析輸入、大小 / 旋轉 / 圓角 / 邊數的限制）
      viewport.ts                 # 縮放、捲動版面與錨點換算（pt ↔ 螢幕像素）
      units.ts                    # mm ↔ pt、紙張 preset（PAGE_SIZE_PRESETS，14 種，依 PAGE_SIZE_GROUPS 分組）
      validation.ts               # Result type、上傳檔案/名稱/字級/顏色驗證，以及 stroke / label / geometry 的執行時驗證（規則和 Rust format.rs 相同）
      palette.ts                  # Tailwind 色票（oklch → hex）、findPaletteColor、colorAlpha / withAlpha
      image.ts                    # loadImageSize()
      ruler.ts                    # 尺規的純邏輯：rulerScale（依縮放選 1–2–5 主刻度與細分）、rulerTicks（可見刻度）、rulerOrigin（目前頁左上角的螢幕位置）、selectionSpans（選取範圍）
      page-navigation.ts          # 換頁的純邏輯：頁碼解析、上 / 下 / 第一 / 最後一頁、換頁按鍵與移動頁面的按鍵（Ctrl+Shift+PageUp / PageDown）
      page-order.ts               # 頁面排序的純邏輯：isPageOrder、movePage、shiftPage / shiftedPageOrder（選單與快捷鍵）、slotToIndex（拖曳的空隙 → 新位置）
      spreads.ts                  # 跨頁：pageSide（第 1 頁在右）、spreadIndexOf / spreadsOf / spreadOf（1 ／ 2–3 ／ 4–5…）、canvasSheets（畫布畫哪些頁、各自的位移）、canvasSlotAt（某一點落在哪一頁）、spilloverInto（對頁跨過書背的物件）、pageAcrossSpine（放下時中心過書背要搬去的頁）
      master-pages.ts             # 主頁：findSheet、masterChain / inheritedElements / masterContent（要畫哪些主頁內容）、canSetParent / isMasterGraphValid（循環與深度，和 Rust 同規則）、deleteMaster、pagesUsingMaster、nextMasterName
      variables.ts                # 動態變數：TEXT_VARIABLES（{頁碼} {總頁數} {文件名稱} {頁面名稱}）、variableValues（主頁回傳 null）、resolveElementsVariables
      add-pages.ts                # 新增頁面 / 主頁對話框的純邏輯：預設值、錯誤訊息、插入位置、建立新頁面
      fonts.ts                    # FONT_OPTIONS（可選的字型）、文件用到的字型、載入參數
      use-fonts-ready.ts          # 字型用到才載入：loadFontOption、useFontsReady（畫布等字型）
      tools.ts                    # 畫布工具（select / hand / text / shape）與工具快捷鍵的單一資料來源
      use-editor-shortcuts.ts     # 全域快捷鍵
      __tests__/                  # vitest
  assets/photos/*.svg             # 相片面板的佔位範例圖（可以直接換成真實照片）
src-tauri/
  src/lib.rs                      # Builder：single-instance（最先註冊）、setup DB / ProjectState、清除上次的未命名專案、註冊 commands、視窗 Destroyed 時刪除目前專案的備份
  src/error.rs                    # AppError / AppResult（所有 command 共用）
  src/db/mod.rs                   # DbState、MIGRATIONS（PRAGMA user_version）、recent_projects
  src/project/                    # 專案資料夾：format.rs（serde 型別、驗證、schemaVersion、舊版升級）、shape.rs（多邊形 / 星形頂點）、io.rs（原子寫入、.bak、清理）、assets.rs（圖片匯入）、recovery.rs（自動備份檔）
  src/export/                     # 匯出 PDF：mod.rs（文件 → data.json、render_pdf）、world.rs（typst::World、載入 fonts/ 的字型）、template.typ（Typst 模板）
  src/commands/                   # #[tauri::command]，每個領域一個檔案（env_vars.rs、project.rs、recovery.rs、export.rs）
  capabilities/default.json       # IPC 權限（core:default、opener:default、window set-title / destroy）
  tauri.conf.json                 # 視窗、CSP、bundle 設定、assetProtocol
fonts/                            # 畫面與匯出共用的字型檔（見 fonts/README.md）；**不要只改一邊的引用**
tests/fixtures/sample.magproj     # Rust 與 vitest 共用的專案檔 fixture（v7：文字、四種 geometry 的圖形、圖片；有 / 沒有邊框與圖形內文字；兩層主頁，第 1 頁套用子主頁，主頁上有只在主頁用到的圖片）
tests/fixtures/sample-v2.magproj  # 同一份內容的 v2 格式，測試舊檔升級
```

`@/*` alias 指向 `src/*`，`tsconfig.json` 的 paths 和 `vite.config.ts` 的 resolve.alias 兩處必須一致。

## 編輯器架構

### 文件模型（`lib/editor/types.ts`）

- **長度單位一律是 pt（1/72 inch）**，和 Typst 一致。座標原點是頁面左上角；zoom 1 時 1pt = 1 CSS px。
- 物件只有三種：`text` / `shape` / `image`。**每種物件的 `x` / `y` 都是外框（旋轉前）的左上角**，旋轉也繞這一點（2026-10-01 起；舊檔的橢圓 / 多邊形 / 星形以中心定位，開檔時由 Rust 換算）。
- **圖形 = `ShapeElement`**（計畫與決定：`docs/Plans/imp-refactory-types.md`）：
  - 外框 `width` / `height` + `geometry`（`rect` 圓角 / `ellipse` / `polygon` 邊數 / `star` 角數與 `innerRatio`）+ `fill` + `stroke: Stroke | null` + `label: ShapeLabel | null`。
  - 多邊形與星形的頂點拉伸到碰到外框四邊（`shape-geometry.ts` 與 Rust `project/shape.rs` 同公式），所以每種圖形都能自由拉伸。
  - **新增框型圖形**（箭頭、對話框…）= 在 `ShapeGeometry` 加一個成員，不是新增 Element。
- **名稱**：`element-factory.ts` 的 `ShapeKind`（rect / roundedRect / ellipse / triangle / star）是元素面板與底部工具列的**圖形選項**，由 `SHAPE_PRESETS` 對應到 geometry；`types.ts` 的 `GeometryKind` 才是文件裡存的種類。
- **圖形內文字**（`ShapeLabel extends TextStyle`）：
  - 排在外框往內縮 `LABEL_PADDING_PT`（4 pt）的文字框裡，依 `verticalAlign` 上 / 中 / 下對齊，超出照常顯示，隨圖形旋轉。
  - 畫布上是圖形 Group 裡的 Konva `Text`。它的 `getClientRect` 被改成回報空的外框（`excludeFromBounds`），否則超出的文字會撐大 Transformer 的控制框，縮放換算就錯。
  - 雙擊圖形編輯（`TextEditorOverlay` 的 `frame` 模式）。清空文字 = `label: null`。
- **邊框**（`Stroke`）畫在外框線的**中心**（Konva / Typst / SVG 都是）；Transformer 設 `ignoreStroke`，控制框不含邊線。
- **模型不存 scale**。Transformer 縮放結束時由 `bakeTransform()` 把 scale 換算進 `width` / `height`，再把節點 scale 重設為 1。文字只調整 `width`（換行寬度），不改字級。
- **文字樣式**（`TextStyle`，文字物件、圖形內文字、頁碼共用）：`fontStyle`（`normal` / `bold`，選字型檔）之外還有 `italic` / `underline` / `strikethrough`（boolean）與 `shadow: TextShadow | null`（v6 起；舊檔讀成全部關閉）。怎麼畫見「文字裝飾」。
- `stroke` / `label` / `geometry` / `shadow` 是物件，`element/update` 的 patch 會**整個取代**，修改時要展開原本的值（`{ stroke: { ...stroke, color } }`）。
- `Page.elements` 的 index 0 是最底層。圖層面板反向顯示，最上層在最前。
- 物件**可以超出頁面，而且不裁切**（使用者需求）：頁面 Group 不設 clip、拖曳不限制在頁面內（`dragBoundFunc` 只在開啟「吸附格線」時用來對齊格線，見「偏好設定」）；頁緣線畫在物件上方。匯出 PDF 時超出部分會被紙張邊界裁掉。
- **邊界**：`EditorDocument.margins`（`Margins`，pt，所有頁面共用一組）只在畫布畫參考線，**匯出不讀它**。檔案驗證只檢查每一邊 0–2000 mm（`MARGIN_MAX_PT`），「左 + 右 < 頁寬」只在對話框檢查，縮小紙張不會讓檔案變成不合法。新文件預設四邊 15 mm（`DEFAULT_MARGINS`），v4 之前的檔案讀成全 0（不畫）。
- **頁碼**：`EditorDocument.pageNumberRules`（依 `from` 排序、範圍不重疊）存的是**規則**，頁碼本身**不是物件**：不在 `Page.elements`、圖層面板與選取裡，畫布與匯出時才算出來（見「頁碼管理」）。v5 之前的檔案讀成空陣列。
- **主頁**（v7 起）：`EditorDocument.masters: MasterPage[]` 和 `pages` 分開存；`Page` 與 `MasterPage` 都 extends `Sheet`（id / name / 尺寸 / 背景 / elements）。`Page.masterId` 指套用的主頁、`MasterPage.parentId` 指以哪個主頁為基礎（`null` = 沒有）；頁面與主頁的 id 在整份文件中不重複。見「主頁與動態變數」。v7 之前的檔案讀成沒有主頁。
- 新增物件類型（不是框的東西，例如之後的自由繪圖 `path`）時要改的地方：
  - 前端：`types.ts` 的 union，以及 `geometry.localBounds`、`canvas-elements`（renderer + `StaticElement` + `bakeTransform`）、`editor-canvas` 的 `TRANSFORMER_OPTIONS`、`describeElement`、`layers-panel` 的 `elementIcon`、`properties-panel` 的 `tabsOf` / `elementName`。這些都有 exhaustive switch 或 mapped type，漏改會編譯失敗。
  - 匯出端：`format.rs` 的 `Element`、`export/render.rs` 的 `build_render`（exhaustive match，漏改會編譯失敗），以及 `template.typ` 的 `draw` 與 EPUB `xhtml.rs` 的 `element_markup`。`template.typ` 是 Typst 腳本，漏改只會**靜默不畫**，要自己記得。
- 新增 geometry 種類時要改的地方：`ShapeGeometry`，以及 `shape-geometry.ts` 的 `unitVertices`、`canvas-elements` 的 `ShapeBody`、`describeShape`、`layers-panel` 的 `GEOMETRY_ICONS`、`properties-panel` 的 `GeometrySection`、`validation.ts` 的 `isShapeGeometry`；Rust `format.rs` 的 `ShapeGeometry` / `validate_geometry`、`render.rs` 的 `shape_kind`（都有 exhaustive switch / match）。
- **檔案格式升級**：`format.rs` 的 `upgrade_shapes_to_v3` 把 v1 / v2 的 rect / ellipse / polygon / star 改寫成 shape。`recovery::read` 也會呼叫它，因為備份檔沒有版本號，舊版 App 當機留下的備份可能還是舊格式。

### 狀態（`lib/editor/editor-reducer.ts`）

- 用 `useReducer` + 兩個 Context（state / dispatch 分開），不使用 zustand 或 redux。
- `HANDLERS` 是 `{ [T in EditorAction["type"]]: handler }` 的 dispatch map，新增 action 時必須同時加 handler。
- **會進入 undo 歷史的**：`history.present`（EditorDocument）的變更，上限 100 筆（`HISTORY_LIMIT`）。
- **不進歷史的 UI 狀態**：`activePageId`（也可以是主頁的 id：正在編輯主頁）、`lastPageId`（最後顯示的頁面，「回到頁面」用；`editorReducer` 每次切到頁面時記下）、`selectedIds`（可多選，見「多選與框選」）、`view`（zoom / fitRequest）、`tool` / `shapeKind`（底部工具列的目前工具與圖形，定義在 `lib/editor/tools.ts`）、`assets`（專案圖片清單，會存檔）、`savedDocument`（上次存檔的文件）。工具面板版面（`dockLayout`）放在 `home-page.tsx` 的 local state，並存進 `localStorage`（見「工具面板」）；格線等 App 偏好放在 `PreferencesProvider`（見「偏好設定」）。
- `selectActivePage` 回傳 `Sheet`（頁面或主頁）：`element/*` 不分頁面或主頁，編輯主頁不需要另一套 action。`page/rename`、`page/setBackground` 也對兩者都有效。只需要頁面的地方（頁序、頁碼）自己查 `pages`。
- 主頁與多頁新增的 action（新 id 一律由呼叫端帶入）：`page/addMany { pages, index }`、`page/duplicate` / `master/duplicate { id, newId, elementIds }`、`page/setMaster { ids, masterId }`、`master/add { master }`、`master/setParent`（會循環或太深時 no-op）、`master/delete`（套用它的頁面與子主頁接到它的父主頁）。見「主頁與動態變數」。`element/moveToPage { moves, pageId, dx }`：拖過書背放下時，一筆復原裡改位置、換到對頁座標、搬到對頁最上層並切頁選取（見「單頁 / 雙頁」）。
- 頁面順序由 `page/reorder { order }` 一次改完（完整的新順序，必須剛好是現有頁面的排列，否則 no-op；順序沒變回傳同一個 state；目前頁與選取跟著頁面走，不調整）。見「頁面排序」。
- 紙張尺寸與邊界由 `document/setPageSetup { size, margins }` 一次改完（所有頁面與主頁 + 邊界 = 一筆復原；物件位置不動；沒變的部分保留原參考）。
- 頁碼規則由 `document/setPageNumbering { rules }` 整份取代（一筆復原；依 `from` 排序後存；內容相同時回傳同一個 state；重疊或不合法時 no-op）。
- undo/redo 後由 `reconcileSelection` 校正已經失效的頁面或選取 id。
- 沒有變化時必須回傳**同一個 state 參考**（測試有檢查），避免多餘的 render 和空的歷史紀錄。
- `element/update`（多個物件用 `element/updateMany`，一次 = 一筆復原；有一個 patch 不合法就整批不做）只在 dragend / transformend / 屬性確定時送出。拖曳過程中不要 dispatch。調色板（`ColorPalette`）點選色票寫入一次，不透明度 slider 拖曳時只改預覽、放開（`onValueCommit`）才寫入。
- reducer 內部會驗證名稱與顏色，非法輸入直接 no-op；UI 端的錯誤訊息用 sonner `toast`。

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

### 底部工具列與畫布工具（`bottom-toolbar.tsx` + `lib/editor/tools.ts`）

參考 tldraw 的**工具模式**：先選工具，再到畫布上點擊或拖曳建立，建立後回到選取工具。計畫與決定：`docs/01-Plans/imp-tldraw-bar.md`。

- `EditorState.tool`（`select` / `hand` / `text` / `shape`）與 `shapeKind`（圖形工具建立的圖形，也是按鈕上顯示的「最近用過的圖形」）是 UI 狀態，不進復原歷史。圖片不是工具模式：按鈕直接開選檔對話框（和「檔案 → 匯入 → 圖片」共用 `home-page.tsx` 的 `importImage`）。
- 工具列疊在畫布上（`absolute`），不佔版面，不影響畫布尺寸計算。
- 平移（`use-canvas-pan`）與建立（`use-canvas-create`）都在捲動容器的 **capture 階段**攔下 `pointerdown`（`preventDefault` + `stopPropagation`），事件不會到達 Konva：手形 / 建立工具下按在物件上不會選取或拖曳物件。平移優先；平移攔下的事件建立工具不處理。
- 建立：移動不到 4px 視為點擊（預設大小、以點擊處為中心）；拖曳時圖形填滿拖曳框。只在放開時 dispatch 一次 `element/add`；預覽框直接改 DOM style。
- **文字工具的新文字是草稿**（`editor-canvas` 的 `draftText`），不在文件裡；輸入完成才 `element/add`，所以復原一次就撤銷，沒輸入就不建立。
- `element/duplicate` 的新 id 由呼叫端帶入（`copies[].newId`），reducer 保持純函式。
- 可平移的範圍 = 捲軸的範圍（內容範圍 + 200px），不是無限畫布。

### 調色板（`color-picker.tsx` + `lib/editor/palette.ts`）

計畫與決定：`docs/01-Plans/imp-color-picker.md`。

- 顏色**只能從 Tailwind v4 色票選**：經典 22 個色系 × 11 階深淺 + 黑、白，沒有自訂顏色輸入。不在色票裡的既有顏色（舊專案、示範內容）照常顯示與匯出，只是不會標示位置。
- `palette.ts` 的資料照抄 Tailwind 的 oklch，載入時用 `oklchToHex` 換成 hex；**模型只存 hex**，Rust 驗證與匯出不認識 oklch。超出 sRGB 的顏色以「保持明度與色相、降低彩度」處理，少數飽和色和 Tailwind 官方 hex 差幾個數值。
- **顏色格式**：物件的 `fill` 是 `#rrggbb` 或 `#rrggbbaa`（完全不透明時一律寫 6 位，`withAlpha` 負責）；頁面背景只能是 `#rrggbb`。TS `isElementColor` / `isHexColor` 與 Rust `require_element_color` / `require_background_color` 規則必須一致。
- `ColorPalette` 是本體（背景面板直接內嵌，`allowAlpha={false}`）；`ColorPicker` 是按鈕 + Popover（屬性面板的填色、邊框、文字顏色）。Popover 內容是 `role="dialog"`，編輯器快捷鍵不會在裡面觸發。

### 設定對話框（`lib/preferences/settings-pages.ts` + `components/app/settings/`）

計畫與決定：`docs/Plans/imp-偏好設定調整.html`。

- **選單**：「設定 → 文件 ▸（頁面設定...、頁碼管理...）」放存進專案、可復原的文件設定；「設定 → 偏好設定 ▸（格線與參考線...，Ctrl+,）」放存在這台電腦的 App 偏好。**一項一個對話框**，各自「取消 / 確定」，沒有分頁。
- **單一資料來源**是 `SETTINGS_PAGES`（id / label / group / 可選的 shortcut）與 `SETTINGS_GROUPS`（子選單順序與名稱）：指令 `settings.<id>`（`settingsCommandId`，同 `panelCommandId` 的做法）、子選單、`home-page.tsx` 的 handler 與對話框都由它推導；`SETTINGS_DIALOGS`（`components/app/settings/index.ts`）以 `satisfies Record<SettingsPageId, …>` 檢查完整性。
- 頁面設定的直橫 / 寬高 / 邊界欄位是 `page-setup-fields.tsx` 的 `PageSetupFields`（受控，紙張下拉與「尺寸不一致」提示由呼叫端以 `paperPicker` / `sizeNote` 傳入），「新增文件」對話框也用它。`SettingsDialogFooter` 的 `applyLabel` 可以把「確定」換成別的字（新增文件是「建立」）。
- **新增設定頁**：在 `SETTINGS_PAGES` 加一筆 → 寫一個 `({ open, onOpenChange }: SettingsDialogProps)` 對話框（外框用 `SettingsDialog`、頁尾用 `SettingsDialogFooter`）→ 登記到 `SETTINGS_DIALOGS`（漏了會編譯失敗）。要放到新的子選單就加一個 group。
- `home-page.tsx` 只有一個 state `openSettings: SettingsPageId | null`，同時最多開一個設定對話框。
- 對話框關閉時 Radix 卸載內容，所以表單草稿每次開啟都從目前的值重新開始；草稿放在各自的表單元件裡。

### 偏好設定與頁面設定（`page-setup-dialog.tsx` / `grid-dialog.tsx` + `lib/preferences` + `page-guides.tsx`）

計畫與決定：`docs/Plans/imp-settings.html`（2026-10-05 拆成兩個對話框，見「設定對話框」）。原本的「尺寸」工具面板已移除，功能併入這裡（舊版面紀錄裡的 `resize` 由 `parseDockLayout` 略過）。

- **兩種資料分開存**：
  - 文件設定（紙張尺寸、邊界）：`history.present`，存進專案檔、可復原、會標記未存檔。
  - App 偏好（`Preferences`：`grid.visible` / `grid.spacing`（pt）/ `grid.snap`、`showMargins`、`showPageNumbers`（在「頁碼管理」對話框切換）、`pageView`（`"single"` / `"spread"`，在「頁面」面板切換）、`showRulers`（「視圖 → 尺規」，預設開））：localStorage `magazine-editor.preferences.v1`，讀取一律過 `parsePreferences`（逐欄驗證，壞掉的欄位回預設，間距夾在 1–100 mm）。不進復原歷史、不存進專案。
- **頁面設定**（「設定 → 文件 → 頁面設定...」）：按「確定」才寫入，「取消」/ Esc 放棄。
  - **沒有改動時「確定」不 dispatch `document/setPageSetup`**：否則頁面尺寸不一致的文件會被統一成目前頁的尺寸，還多一筆復原。
  - 寬高 10–2000 mm、邊界 0–2000 mm，超出時夾回範圍；只有「邊界合計 ≥ 頁寬 / 頁高」會顯示錯誤並停用「確定」（`page-setup.ts` 的 `validatePageSetup`）。
  - **紙張**：`units.ts` 的 `PAGE_SIZE_PRESETS`（一律直式存，直 / 橫由按鈕切換，比對時不分直橫）依 `PAGE_SIZE_GROUPS` 分組：ISO A（A3–A6）、JIS B（B4–B6，標示「（JIS）」）、台灣書刊開本（16 開、32 開；25 開和 A5 同尺寸不另列）、美規（Letter、Legal、Tabloid）、電子書（3:4、9:16）。下拉選單分組並附尺寸，觸發鈕只顯示名稱（選項的尺寸是直式）。**兩個 preset 不可同尺寸**（`presetIdOf` 會認錯，測試守著）；id 不要改名（「範本」面板以 id 引用）。紙張清單只在前端，不改檔案格式。
- **格線與參考線**（「設定 → 偏好設定 → 格線與參考線...」或 Ctrl+,）：按「確定」才寫入 localStorage，不進復原歷史。
- **畫布**：格線（灰色虛線）畫在頁面背景之上、物件之下，同一層還有**內容區對齊線**：內容區（邊界以內，邊界全 0 時是整頁）寬、高的 1/4、1/2、3/4 處的靛藍虛線，1/2 比 1/4 粗而明顯，只畫在內容區內，跟著「顯示格線」開關（`geometry.ts` 的 `contentGuides`）；對齊線只是視覺參考，吸附仍只對齊格線。邊界參考線（粉紅虛線）畫在物件之上、頁緣線旁。兩者都 `listening={false}`、不算進內容範圍，也不會匯出。線距小於 6 px（`MIN_GRID_GAP_PX`）時只畫每 N 條（`drawnGridSpacing`），畫出來的線仍落在吸附格線上。
- **吸附格線**（格線隱藏時也可以開）：
  - 拖曳：`ElementNode` 的 `dragBoundFunc` 交給 `editor-canvas` 的 `dragBound`。**多選時 Konva 會讓每個節點各自呼叫 `dragBoundFunc`，而且 Transformer 在主節點第一次 dragmove 後才讓其他節點開始拖曳**，所以不能各自吸附，也不能用各自的位置推算：第一個呼叫的節點是 lead，記下它的起點與滑鼠偏移，每次從**滑鼠位置**推回 lead 的原始位置再吸附，所有節點都用「自己的起點 + lead 的位移」（相對位置不變）。記錄在 `handleMoveEnd` 清空。
  - 縮放：Transformer 的 `anchorDragBoundFunc`，只在單選且旋轉 0° 時吸附控制點。
  - 吸附的參考座標是**物件所在頁的 Group**（lead 節點的 `getParent()`），跨頁時右頁的 Group 有位移，用 Layer 會吸到錯的位置。
  - 建立：拖曳框的兩個角吸附（吸附後寬或高為 0 時當成點擊）；點擊建立的物件吸附外框左上角。預覽框不吸附。
  - 方向鍵與屬性面板輸入不吸附。

### 頁碼管理（`settings/page-numbers-dialog.tsx` + `lib/editor/page-numbers.ts`）

計畫與決定：`docs/Plans/imp-page-settings.html`。

- **模型**：`PageNumberRule` = 一段頁面（`from`–`to`，1 起算、含兩端，`to` 可以超過目前頁數）+ `start`（第 `from` 頁顯示的數字）+ `odd` / `even`（各自的 `position` 與 `prefix` / `suffix`）+ `style`（字型、字級、粗體、斜體 / 底線 / 刪除線 / 陰影、顏色、`stroke` 框線，整段共用）。第 1 頁是奇數頁；規則跟著**頁序**，不跟著某一頁。沒有規則涵蓋的頁面不顯示頁碼。
- **頁碼 = 虛擬圖形**：`pageNumberShape()` 把規則算成一個 `ShapeElement`（透明矩形 + `stroke` + `label`，id `page-number:<pageId>`），畫布與匯出都沿用既有的圖形 / 圖形內文字路徑，**不新增物件類型、Rust 的 render 不用改**。
  - 畫布：`editor-canvas` 用 `StaticShape`（`listening={false}`）畫在物件之上、邊界參考線之下；不能選取、不在圖層面板、不算進捲動範圍。字型載入前不計算；`usedFontFamilies` 包含頁碼字型。
  - 匯出：`buildExportRequest(document, measureTextLayout, measureLineWidth)` 展開主頁內容之後，用 `withPageNumbers` 把頁碼加到每頁**最上層**（只在匯出的副本，不寫回文件），所以 PDF / EPUB 都有頁碼。匯出不讀 `showPageNumbers`。
- **外框寬度由呼叫端量測**（`MeasureTextWidth`，App 用 `measureLineWidth`），不用估算：估得太窄 Konva 會把頁碼折成兩行。另加 1 pt（`WRAP_SLACK_PT`）防止捨入造成換行。
- **位置**：上 / 下放在邊界區（頁緣到邊界線）正中；左 / 右欄靠左 / 靠右，**文字**（不是外框）對齊內容區的邊，中欄置中於頁面；左中 / 右中**直書**（字與字之間插入 `\n`，每字一行，外框寬一個字），置中於左 / 右邊界區與頁面中線。邊界為 0 或放不下時改用距頁緣 10 mm（`PAGE_NUMBER_FALLBACK_INSET_PT`）。加框線時，框線比文字多出 4 pt 內距（`LABEL_PADDING_PT`）。
- **對話框**：「設定 → 文件 → 頁碼管理...」（`settings.pageNumbers`，`components/app/settings/page-numbers-dialog.tsx`，外框與頁尾用共用的 `SettingsDialog` / `SettingsDialogFooter`）。表單與列表都是草稿，「確定」一次 dispatch `document/setPageNumbering`（一筆復原），「取消」/ Esc 放棄。「加入設定」以表單新增一段、「修改設定」覆寫選中的那段（表單沒變時停用）、「刪除」、「新的一段」（範圍接在最後一段之後，`nextPageNumberRange`）。重疊等錯誤由 `pageNumberRuleError` 給中文訊息並停用按鈕。表單改了沒按「修改設定」就按「確定」不會套用（頁尾有提示）。
- **「在編輯畫面顯示頁碼」**是 App 偏好 `showPageNumbers`（預設開），在這個對話框切換、「確定」才寫入；只影響畫布。
- 字型 / 顏色 / 框線控制項和屬性面板共用 `components/editor/style-controls.tsx`（頁碼不顯示對齊按鈕，對齊由位置決定）。前後置文字只能單行、最多 20 個字（`PAGE_NUMBER_AFFIX_MAX_LENGTH`）。

### 文字裝飾（`lib/editor/text-style.ts` + `style-controls.tsx` + 匯出）

計畫與決定：`docs/Plans/imp-text-attribute.html`。

- **UI**：`TextStyleFields` 粗體旁的「斜體」「底線」「刪除線」，文字顏色下方的「陰影」開關（開啟時寫入 `DEFAULT_TEXT_SHADOW`：黑色 50%、偏移 2 / 2 pt；偏移限制 ±50 pt，`TEXT_SHADOW_OFFSET_MAX`）。屬性面板與頁碼對話框共用。文字背景 / 外框不做：用「圖形 + 圖形內文字」。
- **畫布**：一律經 `konvaTextStyle()` 轉成 Konva 屬性（文字物件、圖形內文字、頁碼、`measureTextLayout` 共用），每個 key 都給值，關掉陰影時節點才會真的移除；陰影透明度拆成 `shadowOpacity`，`shadowBlur` 固定 0（PDF 畫不出模糊）。斜體與線都不改字寬，換行不變。
- **斜體是模擬的**（沒有斜體字型檔）：瀏覽器以基線為軸斜切 1/4（實測五種字型都是 0.25）。PDF 用 Typst `skew`、EPUB 用每行 `skewX`，斜率是 Rust `render.rs` 的 `SYNTHETIC_ITALIC_SLANT`。EPUB **不用** `font-style: italic`（斜率會隨閱讀器而變）。
- **底線 / 刪除線**的位置照 Konva 10.5.0 的 `Text._sceneFunc`：基線 ± `round(字級 / 4)`、粗 `字級 / 15`、長 `round(該行寬)`，由 `render.rs` 的 `decoration_lines` 算好，PDF 畫 `line`、EPUB 畫絕對定位的 `span.d`（不用 CSS `text-decoration`，位置對不上）。行寬由 `TextLayout.lineWidths` 從前端傳來。**升級 Konva 時要重查這組公式。**
- **陰影方向以頁面為準**，不隨物件旋轉（Canvas 2D 的 shadow offset 不受旋轉影響）。匯出與文字編輯框在旋轉後的框裡畫，所以偏移要反向旋轉（TS `localShadowOffset`、Rust `render_shadow`）。陰影的透明度 = 陰影色 × 文字顏色的透明度。
- **有線又有陰影時，Konva 改用 buffer canvas**：整段文字畫好再投一個陰影在最底下（`RenderShadow.whole_block`）；沒有線時每行各自投陰影。PDF 照兩種情況畫；EPUB 的文字陰影是 `text-shadow`（不複製文字），線的陰影是 `z-index: -1` 的 `span.d.s`（`.t` 有 `z-index: 0`）。
- **已知限制**：半透明陰影在有線的文字上，重疊處 PDF / EPUB 比畫布深（Typst 沒有群組透明度）；EPUB 逐行畫文字陰影，行與行的陰影重疊時順序可能和畫布不同。

### 單頁 / 雙頁（跨頁）（`spreads.ts` + `canvas-sheet.tsx` + `pages-panel.tsx`）

計畫與決定：`docs/Plans/imp-page-switch.md`。

- **切換**：「頁面」面板「頁面」標題列中間的 `PageViewToggle`（單頁 / 雙頁兩個 `IconButton`，`aria-pressed`）。模式是 App 偏好 `Preferences.pageView`（localStorage，不存進專案、不進復原歷史、不改檔案格式）。
- **配對**：雜誌慣例，**第 1 頁（封面）單獨在右**，之後 2–3、4–5…；頁數是偶數時最後一頁單獨在左。奇數頁在右（`pageSide`），和頁碼的奇偶頁一致。頁面上緣對齊，左頁 x = 0、右頁 x = 左頁寬；單獨一頁位移 0。
- **畫布**（雙頁模式）：畫目前頁所在的跨頁（`canvasSheets`），換頁時跟著換跨頁；同一跨頁內換頁時範圍不變、畫面不跳。書背虛線 `SpreadSpine`（兩頁之間；封面畫在左緣、最後一頁單獨時畫在右緣）；兩頁並排時用主色框出目前頁。**編輯主頁一律單頁**（主頁沒有左右頁）。
- **編輯**：選取只屬於目前頁（規則不變）。
  - 對頁的物件畫成 `StaticElement listening`（不是 `ElementNode`）：按下物件 = `page/select` 再 `selection/set`（一次點選）；按下對頁背景 = 只切頁。事件 `cancelBubble`，不會清空選取或開始框選。**要拖曳對頁的物件得按第二次**（切頁後才重畫成可拖曳的節點）。
  - 建立工具建在**按下處的那一頁**：`use-canvas-create` 的 `pageAt(screen)` 回傳那一頁與換到它頁面座標的函式，放開時先 `page/select` 再建立（文字草稿也跟著到那一頁）。
  - **跨頁物件**（計畫：`docs/Plans/imp-edit-crose-page.md`）：物件仍只屬於一頁（模型不變），但**跨過書背的部分在對頁也畫、也匯出**，兩頁接得起來（Affinity 的做法）。`spilloverInto(pages, pageIndex)` 找出對頁跨過書背（含旋轉外框，只看書背那一側；單獨一頁沒有）的物件與位移（左頁 → 右頁 `−左頁寬`、右頁 → 左頁 `+左頁寬`）。
    - 疊放順序（畫布與匯出相同）：主頁內容 → **對頁跨過來的複本** → 這一頁自己的物件 → 頁碼。複本的變數用**物件所屬頁**的值。
    - 畫布：複本是 `StaticElement`，包在書背側裁切的 Group（`spineClip`：左頁裁右緣、右頁裁左緣，其他三邊用很大的範圍等於不裁）裡；**單頁模式也畫**（匯出一律套用）。雙頁時每頁自己的物件也在書背處裁切（`clipAtSpine`），跨過去的部分只由對頁的複本顯示；**拖曳 / 縮放中目前頁不裁切**（`interacting`，Layer 的 drag 事件與 Transformer 的 transform 事件），而且目前頁最後畫，拖的時候看得到整個物件。
    - 按複本 = 到物件所屬頁並選取（`onPickElsewhere`）；那一段不能直接拖（從所屬頁那一側或控制點拖）。
    - 匯出：`buildExportRequest` 的 `exportedPage` 加複本，id `spill:<頁序>:<第幾個>`（`spilloverCopyId`），**一律依雜誌配對套用**，和畫面用單頁或雙頁無關。
  - **放下時中心過書背就換頁**（取代原本的「不換頁」）：`handleMoveEnd` 在兩頁都看得到時，用放下的整組外框中心問 `pageAcrossSpine`，過了就送 `element/moveToPage`（一筆復原；開吸附時以被拖的物件為準對齊新頁的格線，因為頁寬不一定是間距的倍數）。單頁模式拖出頁面不換頁；縮放不換頁。
  - Transformer 只掛目前頁的節點，不會兩頁物件一起拖。
- **「頁面」面板**：雙頁模式時縮圖固定兩欄、欄間不留空，最前面一個空格讓第 1 頁落在右欄，左頁靠右、右頁靠左，兩頁貼在一起。
- **匯出**仍是一頁一頁；跨過書背的物件會出現在兩頁（見上面的跨頁物件）。頁碼、動態變數、主頁內容都以頁為單位，兩頁並排各自正確。

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

### 頁面排序（`page-order.ts` + `editor-page-bar.tsx` + `page-menu.tsx`）

計畫與決定：`docs/Plans/imp-頁面調整.html`。

- 三種入口，最後都是一次 `page/reorder`（一筆復原），目前頁不變：
  - **拖曳頁籤**（`use-page-tab-drag.ts`）：按在選單 / 刪除按鈕上或改名中不開始拖曳；4 px 門檻，點擊與雙擊改名照常；只在放下會改變順序時畫插入線；頁籤列上下 48 px 外放開 = 取消；靠近左右邊緣 40 px 自動捲動。插入位置用 `lib/dock` 的 `insertionSlot`（任一軸），空隙換算新位置用 `slotToIndex`。
  - **目前頁籤的 `˅` 選單**：向左 / 向右 / 移到最前 / 移到最後（`shiftedPageOrder` 回傳 `null` 時停用）；`≡` 選單沒有這些項目。
  - **Ctrl+Shift+PageUp / PageDown**：往前 / 往後一格（`use-editor-shortcuts.ts`，在換頁之前判斷）。
- 頁碼規則跟著**頁序**：頁面換位置後頁碼依新位置重新計算。
- 不做「頁面排序」對話框。2026-10-06 時使用者不要「頁面」工具面板；**2026-10-07 為了主頁改成要**（Affinity 式，見「主頁與動態變數」）。面板目前不能拖曳排序，排序仍用上面三種入口。

### 主頁與動態變數（`master-pages.ts` / `variables.ts` / `add-pages.ts` + `pages-panel.tsx` / `page-dialogs.tsx`）

計畫與決定：`docs/Plans/imp-master-pages.md`。參考 Affinity Publisher，**只做單頁**（沒有跨頁 / spread）。

- **模型**：見「文件模型」的主頁。**繪製順序**（下 → 上）：頁面背景 → 最上層祖先主頁的物件 → … → `masterId` 指的主頁的物件 → 頁面自己的物件 → 頁碼。`masterChain` / `inheritedElements` 算出要畫哪些主頁內容。
  - **背景不繼承**：頁面背景是頁面自己的；主頁背景只在編輯主頁時看到，以及新增頁面時當預設值。
  - **主頁物件在頁面上不能選取**、不在圖層面板、不算進捲動範圍；要改就切去編輯主頁。Affinity 的 Detach / 在頁面上改主頁物件不做。
  - 階層：`parentId` 不可循環，一條鏈最多 8 層（`MASTER_DEPTH_MAX`，TS `canSetParent` / `isMasterGraphValid` 與 Rust `validate_master_graph` 同規則）。
  - 刪除主頁：直接套用它的頁面與以它為基礎的子主頁，改接到它的父主頁（沒有就變成「無」）。
- **畫布**（`canvas-sheet.tsx` 的 `CanvasSheet`）：主頁內容用 `StaticElement`（`canvas-elements.tsx`，預設不攔事件，文字屬性和 `ElementNode` 共用 `textAttrs`）畫在頁面物件之下；編輯子主頁時父主頁的內容也畫在底下。`usedFontFamilies` 包含主頁。
- **編輯主頁模式**：`page/select` 主頁的 id。畫布上方 `MasterEditBanner`（主頁名稱、以誰為基礎、`pagesUsingMaster` 幾頁使用、「回到頁面」→ `selectReturnPageId`）；頁籤列沒有頁籤被選取、頁碼欄顯示「–」；不畫頁碼（`pageIndex` = -1）；變數照原文顯示。
- **「頁面」面板**（`pages-panel.tsx`，預設左側範本下方）：上半主頁、下半頁面，各有新增 / 複製 / 刪除；點縮圖切換、雙擊名稱改名、`⋮` 或右鍵選單（頁面：套用主頁 ▸；主頁：以…為基礎 ▸，會循環或太深的選項停用）。刪除前 AlertDialog 說明後果。計畫：`docs/Plans/imp-fix-master.md`。
  - **兩區各自收合**：標題列最左邊的箭頭是收合鈕（**只有箭頭**是按鈕，標題是一般文字，才抓得到標題拖曳）。收起的區只剩標題列，另一區佔滿；收起的「頁面」標題列貼在面板底部；兩區都收起時標題列靠上。
  - **高度分配**：兩區的標題列與內容區是**同一層的 flex 子元素**（`Section` 回傳 header + 內容，不包外層），內容區 `flex: <比例> 1 0px` 分配標題列以外的高度、各自用 `DockScrollArea` 捲動，**不量測高度**。這需要面板自己處理捲動：`PANEL_DEFINITIONS` 的 `scroll: "self"`，`DockPanel` 對它不包共用捲動區。
  - **拖曳**（`use-section-resize.ts`）：只有兩區都展開時可拖「頁面」標題列（按在按鈕上不算）；走 `startPointerDrag`（`cursor: "row-resize"`）；拖曳中**直接改兩個內容區的 `style.flex`**（不 render、縮圖不重畫），放開才寫回、Esc 改回原值；雙擊還原 0.35（`MASTERS_RATIO_DEFAULT`）；標題列上緣的 `role="separator"` 可用 ↑ / ↓ 每次 16 px；兩區內容各至少 80 px（`PAGES_SECTION_MIN_PX`，`resizeMastersRatio`）。
  - **記憶**：`PagesPanelLayout`（`mastersCollapsed` / `pagesCollapsed` / `mastersRatio`，存比例不存 px）是 App 偏好，localStorage `magazine-editor.pagesPanel.v1`，讀取過 `parsePagesPanelLayout`；不進復原歷史、不存進專案。
  - **縮圖**（`sheet-thumbnail.tsx`）：小 Konva Stage 畫 `StaticElement`，**捲進畫面才建立**（`IntersectionObserver`），`memo` 只在 sheet / 內容參考改變時重畫；主頁內容由 `masterContent` 依主頁快取、頁面的變數依文件快取，參考才穩定。縮圖不畫頁碼。
- **對話框**（`page-dialogs.tsx`，`PageDialogsProvider` 包在 `home-page.tsx` 的 `EditorLayout` 外，`usePageDialogs()` 開啟；外框沿用 `SettingsDialog`）：
  - 新增頁面（頁籤列「+」= 加在最後；「插入頁面...」與面板 = 目前頁之後）：主頁、頁數 1–100（`ADD_PAGES_MAX`）、之前 / 之後、第幾頁 → 一次 `page/addMany`（一筆復原）。預設主頁 = 正在編輯的主頁 → 目前頁的主頁 → 第一個主頁。新頁面背景用主頁的背景。名稱照 `nextPageNames`（建立順序編號，不跟位置）。
  - 新增主頁：名稱（`nextMasterName`：Master A、B…）、以…為基礎（編輯某主頁時預設以它為基礎）→ `master/add`，切過去編輯。
- **動態變數**（`variables.ts`）：`{頁碼}`（`displayedPageNumber`：有頁碼規則涵蓋就依規則與起始值，否則第幾頁）、`{總頁數}`、`{文件名稱}`、`{頁面名稱}`；`TEXT_VARIABLES` 是單一資料來源。文字物件與圖形內文字都可以用；**只取代完全相符的 token**，其他大括號原樣保留（不需要跳脫）。
  - 文件只存原文。畫布與頁面縮圖顯示時才換（`resolveElementsVariables`，沒變時回傳同一個參考）；主頁上照原文；**文字編輯框編輯的是原文**（`page.elements`），畫布顯示的是換過的副本，`bakeTransform` 只回寫位置與尺寸所以不會把值寫回文字。
  - 屬性面板「文字」分頁的「插入變數」按鈕把 token 加在文字最後（一筆復原）。
  - 頁碼規則與 `{頁碼}` 並存：同一頁兩者都用會出現兩次，由使用者決定，程式不擋。
- **匯出**：`buildExportRequest` 在副本上逐頁 `exportedPage`（主頁內容放最下面、接著對頁跨過書背的物件、再來頁面自己的物件，都換變數）再 `withPageNumbers`，**Rust render / PDF 模板 / EPUB 都不讀 `masters`**。展開後的主頁物件 id 是 `master:<頁序>:<第幾個>`（`masterCopyId`）：`textLayouts` 以 id 為 key、同一個主頁物件每頁文字不同，而 **Rust `require_id` 只接受 64 字以內**，`<UUID>/<UUID>` 會超過。
- **檔案**：`referenced_assets`（開檔清理沒引用的圖片）包含主頁上的圖片，否則只用在主頁的圖片會被刪掉。

### 其他注意事項

- 字型：canvas 必須等字型載入後才建立 Stage，否則換行寬度會算錯（Konva 不會在字型載入後重新量測）。
  - 可選的字型是 `lib/editor/fonts.ts` 的 `FONT_OPTIONS`（屬性面板的下拉選單與字型載入的單一資料來源）；第一個是預設（黑體 `"Geist", "Noto Sans TC", sans-serif`）。文件的 `fontFamily` 存 `family` 字串，不在清單中的照常顯示，選單顯示「其他字型」。
  - **用到才載入**（`use-fonts-ready.ts`）：畫布等「預設字型 + 文件所有頁面用到的字型」都載入才畫；屬性面板換字型時先 `loadFontOption` 再寫入，畫布不會閃。中文字型也要等，一份中文雜誌的換行幾乎都由中文字型決定。
- 文字編輯 overlay 會用 `compositionstart/end` 和 `isComposing` 忽略選字期間的 Enter / Esc。
- 快捷鍵（Delete / Ctrl+Z / Ctrl+Y / Ctrl+D / Esc / 方向鍵 / 工具鍵 V・H・T・R・O / 換頁 PageUp・PageDown・Ctrl+Home・Ctrl+End / 移動目前頁面 Ctrl+Shift+PageUp・PageDown）焦點在 input、textarea、dialog、menu 內時不觸發。
  - 一般瀏覽器分頁（`npm run dev`）會自己攔下 Ctrl+Shift+PageUp / PageDown（移動瀏覽器分頁），網頁收不到；桌面版沒有這個問題。
  - 工具鍵與 Ctrl+D 以 **`event.code`** 比對；工具鍵只接受不帶修飾鍵的按鍵（不會和選單快捷鍵衝突），按住不放只觸發一次。沒有選取時 Esc 回到選取工具。
  - 空白鍵（暫時手形）只在焦點在 `document.body` 時生效：輸入框照常打空白，按鈕照常用空白鍵觸發。
- 上傳圖片只接受 PNG / JPEG / WebP / GIF、單檔 ≤ 20 MB，而且必須能實際解碼；桌面版會複製進專案（見「檔案系統」）。瀏覽器模式才使用 `blob:` URL，而且不 revoke（undo 可能讓刪除的圖片回來）。
- `tauri.conf.json` 設定 `dragDropEnabled: false`：Tauri 預設會攔截檔案拖放，HTML5 drop 事件在 Windows 上收不到，上傳面板的拖放區需要這個設定。**不可移除**。
- 桌面版啟動時開啟上次的專案，沒有就建立空白 A4 的未命名專案；瀏覽器模式（`npm run dev`）沒有檔案存取，只載入 `createSampleDocument()` 的示範內容，檔案指令會提示「僅在桌面版可用」。

## 選單列與指令（`lib/menu`）

- 選單使用自訂 HTML（shadcn `Menubar`），**不使用** Tauri 原生選單；橫跨全寬，放在 Grid 第一列。
- **指令是單一資料來源**：`COMMANDS` 定義 label、快捷鍵與停用原因；`MENUS` 只描述結構；`CommandHandlers` 是 `{ [K in CommandId]: () => void }`，新增指令卻沒有提供 handler 時會編譯失敗。
- Handlers 在 `home-page.tsx` 建立（需要編輯器與專案狀態，所以在 `EditorProvider` / `ProjectProvider` 內）：新增、開啟、儲存、另存新檔、匯入圖片、匯出 PDF、設定頁（由 `SETTINGS_PAGES` 產生，見「設定對話框」）已實作（`file.exportPdf` 和上方工具列的「匯出 PDF」按鈕呼叫同一個 `project.exportPdf()`）；其餘仍是佔位（`createPlaceholderHandlers` → toast「『xxx』尚未實作」），實作時覆寫對應的 key 即可。
- 新增選單項目的步驟：在 `COMMANDS` 加定義 → 在 `MENUS` 放入結構 → 提供 handler。`menu-structure.test.ts` 會檢查每個指令都出現在選單中恰好一次、快捷鍵沒有重複，也不會和編輯器快捷鍵衝突。
- 快捷鍵以 **`event.code`**（實體按鍵，例如 `KeyS`、`Comma`）比對，不用 `event.key`：注音輸入法啟用時 `key` 可能是 `Process`。`metaKey` 視同 Ctrl。
- `use-menu-shortcuts` 在 `window` capture 階段註冊：
  - 在輸入框與文字編輯中也生效，並呼叫 `preventDefault()`，避免 WebView2 預設的 Ctrl+S / Ctrl+O 行為。
  - 例外：輸入法選字中（`isComposing`）或焦點在 dialog / alertdialog 內時不觸發。
- 助記鍵 Alt+F / Alt+V / Alt+S：以 Menubar 受控 `value` 開啟選單。**不要**攔截事件傳遞（`stopPropagation`），Radix Menu 依賴 document 上的 keydown 判斷「鍵盤操作」，才會自動聚焦第一個項目。
- 「外觀」單選的 `value` 固定為「跟隨系統」，而且不接 `onValueChange`，等主題切換實作後再改成受控。
- `checkbox` 節點的勾選狀態不放在靜態的 `MENUS`，由 `AppMenubar` 的 `isChecked(commandId)` 從外部狀態讀取；不接 `onCheckedChange`，handler 負責切換。
- `視圖`：放畫面上的輔助顯示（目前只有「尺規」勾選項目，`view.rulers`；勾選狀態由 `home-page.tsx` 的 `isChecked` 讀偏好）。
- `設定 → 文件` / `設定 → 偏好設定`：`settings.<id>` 項目由 `SETTINGS_PAGES` 依 `SETTINGS_GROUPS` 自動產生（`settingsCommandId`），快捷鍵也宣告在清單裡。
- `設定 → 工具面板`：10 個 `panel.<id>` 勾選項目由 `PANEL_DEFINITIONS` 自動產生（`panelCommandId`），最下方是 `panel.resetLayout`「重設版面」。

| 快捷鍵 | 指令 |
|--------|------|
| Ctrl+N / Ctrl+O | 新增 / 開啟... |
| Ctrl+S / Ctrl+Shift+S | 儲存 / 另存新檔... |
| Ctrl+, | 格線與參考線...（設定 → 偏好設定 ▸） |
| Alt+F / Alt+V / Alt+S | 開啟「檔案」/「視圖」/「設定」選單 |

## 工具面板（`lib/dock` + `components/dock`）

參考 Krita 的 Docker。計畫與決定：`docs/01-Plans/imp-tool-bar.md`。

- **三欄版面**：`左停靠區 ｜ 中欄（系統控制列 + 畫布） ｜ 右停靠區`；選單列與頁籤列橫跨全寬。某一側沒有面板時整欄不顯示。
- **屬性面板**（`properties`，預設在右側最上方）取代了原本的上方選取工具列：
  - 分頁依物件類型：圖形 = 樣式 / 文字 / 調整，文字 = 文字 / 調整，圖片 = 調整。名稱與分頁列固定在面板頂端（sticky）。
  - 數字欄位用 `NumberField`：Enter / 失焦才寫入，一次編輯 = 一筆復原。
  - 「限制寬高比」是面板的編輯選項，不存進文件。
- **面板的單一資料來源**是 `lib/dock/panels.ts` 的 `PANEL_DEFINITIONS`；`PANELS`（內容）、`PANEL_ICONS`（icon）以 `satisfies Record<PanelId, …>` 檢查完整性，選單指令自動產生。**新增面板**：在 `PANEL_DEFINITIONS` 加一筆 → 補 `PANELS` 與 `PANEL_ICONS`（漏了會編譯失敗）。
- `DockLayout`（左右各一個由上到下的面板清單 + 兩側寬度）是 App 偏好：**不進復原歷史、不存進專案檔**；所有變更都走 `dock-layout.ts` 的純函式（沒變化時回傳同一個參考）。
- 同一側多個面板上下堆疊，展開的平分高度，收合只剩標題列。一個面板最多出現一次。
- **size control bar**（`DockSplitter`）：停靠區寬度 200–560px（`DOCK_WIDTH`），畫布欄至少 `CANVAS_MIN_WIDTH`（480px）。拖曳期間只改 `DockArea` 的 local state，**放開才寫回** `DockLayout`（和畫布「dragend 才 dispatch」同一原則）。畫布尺寸由 `EditorCanvas` 的 `ResizeObserver` 自動跟上。
- **拖曳停靠**（`useDockDrag`）：用 pointer events 自己做，**不用 HTML5 drag & drop**（上傳面板的檔案拖放用那一套）。按下後移動 4px 才算拖曳、結束後吞掉下一次 click、Esc 取消，這些由 `components/pointer-drag.ts` 的 `startPointerDrag` 處理（頁籤拖曳也用它，改動時兩邊都要測）。命中判斷靠 `data-dock-side` / `data-dock-panel` 屬性。React state 只在目標改變時更新，跟著游標的標籤直接改 style，避免每次 pointermove 重畫畫布。
- **記憶**：`localStorage` key `magazine-editor.dockLayout.v2`，讀取一律過 `parseDockLayout`（不信任儲存內容）。格式不相容時換 key。只有 v1 時沿用它，並把屬性面板加到右側最上方一次（`loadDockLayout`）。`npm run dev` 與安裝版 origin 不同，各記一份。
- Radix `ScrollArea` 內層是 `display: table`，長文字會撐寬面板；`DockScrollArea`（`dock-panel.tsx` 匯出）用 `[&_[data-slot=scroll-area-viewport]>div]:block!` 修正，面板裡需要捲動區時用它。
- 面板預設由 `DockPanel` 包一個捲動區；需要把高度分給好幾塊、各自捲動的面板，在 `PANEL_DEFINITIONS` 設 `scroll: "self"`（目前只有「頁面」），內容會放在 `flex-1 min-h-0` 的容器裡。
- Tailwind v4 的 `inset-y-0` 是邏輯屬性（`inset-block`），和直書（`writing-mode: vertical-rl`）放在同一個元素會變成水平方向。

## 檔案系統（`lib/project` + `src-tauri/src/project`）

- **專案 = 使用者自選位置的資料夾**：`project.magproj`（UTF-8 JSON，`schemaVersion` 7；v2 起物件顏色可為 `#rrggbbaa`，頁面背景仍只能是 `#rrggbb`；v3 起四種圖形合併成 `shape`，v1 / v2 開檔時自動升級；v4 加 `document.margins`，舊檔與備份缺這個欄位時 serde 預設全 0，不需要升級步驟；v5 加 `document.pageNumberRules`，缺少時預設空陣列；v6 的文字樣式加 `italic` / `underline` / `strikethrough` / `shadow`，Rust 以 `#[serde(flatten)] decoration: TextDecoration` 放進三個結構，缺少時全部關閉；v7 加 `document.masters` 與 `Page.masterId`，缺少時沒有主頁，驗證引用、循環與深度）、`project.magproj.bak`（上一次存檔）、`assets/images/<SHA-256 前 32 碼>.<ext>`。一個專案 = 一份多頁文件。
- **專案資料夾自給自足**：頁面上的每張圖片（上傳、內建相片）都先複製進 `assets/images/`。`ImageElement.src` / `AssetInfo.src` 存**專案相對路徑**，顯示時由 `resolveSrc`（`resolveAssetUrl` + `convertFileSrc`）轉成 asset protocol URL。圖片檔寫入後不再修改，復原歷史可以放心引用。
- **Rust 是檔案格式的權威定義**：`project/format.rs` 的 serde 型別對應 `types.ts`，讀取與存檔時都會驗證（顏色、頁面尺寸、`src` 只能是 `assets/images/<檔名>`）。**修改 `types.ts` 的文件模型時必須同步修改 `format.rs` 和 `tests/fixtures/sample.magproj`**；兩邊的測試都會讀這份 fixture，欄位不一致時會失敗。格式變更要提升 `SCHEMA_VERSION`；需要改寫舊版內容時，在 `parse_project` 的版本判斷處把舊版 JSON（`serde_json::Value`）升級後再轉換（v1 → v2 只放寬顏色格式，沒有升級步驟；v1 / v2 → v3 由 `upgrade_shapes_to_v3` 改寫圖形，備份檔也要套用）；比 App 新的版本拒絕開啟。只有最上層的未知欄位會在存檔時保留。
- **前端不傳路徑給 Rust**：開啟 / 另存對話框由 Rust 呼叫 `tauri-plugin-dialog`，其他 commands 只操作 `ProjectState` 中目前開啟的專案。前端不需要 dialog 的 JS 套件或 capability。
- 寫入：`.tmp` → flush → 舊檔 copy 成 `.bak` → rename 取代。開啟時主檔損壞會自動改用 `.bak`，並標記為未存檔。開啟時會刪除 `assets/images/` 裡沒被引用的檔案（此時復原歷史是空的；頁面與主頁上的圖片都算引用）。
- 未命名專案放在 `%LOCALAPPDATA%\com.mycompany.magazineeditor\untitled\<id>\`，「儲存」會改走「另存新檔」，另存成功後刪除暫存資料夾；下次啟動時清除殘留的暫存資料夾（single-instance 保證沒有其他實例在用），但**還有備份檔的暫存資料夾會保留**。
- 另存對話框：使用者輸入的名稱（去掉 `.magproj`）就是新的專案資料夾名稱，檔案固定叫 `project.magproj`；目標資料夾已存在而且不是空的會拒絕。對話框預設位置是「文件\雜誌編輯軟體」。
- asset protocol 的 scope 在 `tauri.conf.json` 是空的，開啟專案時由 Rust `asset_protocol_scope().allow_directory()` 動態開放。
- **dirty 判斷**：reducer 的 `selectIsDirty`＝`history.present !== savedDocument`（比較參考）。`document/load`（清空復原歷史，`saved: false` 時 `savedDocument` 設為 null）與 `document/markSaved` 負責設定 `savedDocument`；`ProjectProvider` 只在有開啟專案時才回報 dirty。
- 視窗標題：`● 文件名稱 — 雜誌編輯軟體`（`●` 表示未存檔），由 `ProjectProvider` 呼叫 `setTitle`。
- 新增 / 開啟 / 關閉視窗前，有未存檔的變更時會詢問「儲存 / 不儲存 / 取消」；三者共用 `useProjectCommands` 的同一段流程（關閉視窗走 `confirmClose`）。`busyRef` 防止同時執行兩個檔案操作（包括對話框開著時關閉視窗）。
- **新增專案**（「檔案 → 新增」，計畫：`docs/01-Plans-2026-10/01-修改新增專案流程-實作.md`）：未存檔提示 → 「新增文件」對話框（`new-document-dialog.tsx`，`useProjectCommands` 的第二個參數 `chooseNewSetup` 注入）→ `createNew(setup)` → `createBlankDocument(setup)`。
  - 對話框：左邊紙張卡片（`PaperPresetGrid`，同頁面設定的 14 種紙張與分組，卡片尺寸跟著目前方向），右邊 `PageSetupFields`（和頁面設定共用：直橫、寬高、邊界）；底部「取消 / 建立」。每次開啟都從 `DEFAULT_NEW_PAGE_SETUP`（A4 直式、邊界 15 mm）開始，**不記憶**上次的選擇。
  - 取消、Esc、點外面一律 resolve `null`（不能讓 Promise 懸著，否則 `busyRef` 一直是 busy）→ 留在目前的文件。先問未存檔再選紙張，所以選了「儲存」再取消也只是存了檔。
  - **啟動時沒有上次的專案仍直接建立 A4**（`createNew()` 不帶參數），不顯示對話框。瀏覽器模式的「新增」照舊只顯示「僅在桌面版可用」。
  - 只改前端，Rust `project_new` 只建立資料夾、檔案格式不變。
- 圖片的選檔對話框統一用 `lib/editor/image.ts` 的 `pickImageFiles()`（上傳面板與「匯入圖片」共用）。
- **自動備份**（`%LOCALAPPDATA%\com.mycompany.magazineeditor\recovery\<專案 id>.json`）：
  - 有未存檔變更時每 60 秒寫入一次（`useAutosave`，內容沒變就不寫）；變更被存檔或復原掉之後，下一次 tick 會刪除備份。
  - Rust 端在這些時候刪除備份：`project_save` 成功、`activate()` 換成另一個專案（使用者已處理過未存檔提示）、視窗 `WindowEvent::Destroyed`（只有正常關閉才會觸發，當機不會）。
  - 啟動時有備份檔 → 先問「復原 / 捨棄」（只處理最新一份），選復原就載入備份內容並標記為未存檔，**不**清理沒引用的圖片（備份可能用到上次存檔沒用到的圖片）；選捨棄會刪除備份和未命名專案的暫存資料夾。
  - 備份 id 只接受 UUID 字元（組成檔名）；`recovery_discard` 只刪除位於 `untitled\` 底下的暫存資料夾。
- **尚未實作**（見 `0-Task/plan-filesystem.md`）：第三階段系統素材庫與範本、匯入其他專案的頁面、「最近開啟」選單；備份間隔目前固定 60 秒（`AUTOSAVE_INTERVAL_MS`）。App 偏好決定存 localStorage（見「偏好設定」），SQLite 的 `settings` 資料表目前不做。

## 匯出 PDF（`lib/export` + `src-tauri/src/export`）

- **Typst 以 crate 形式內嵌**（沒有外部執行檔、沒有 sidecar）：`typst` + `typst-layout` + `typst-pdf`，版本鎖 `=0.15.1`。升級時三個要一起改，而且 `World` trait 與 `RootedPath` / `VirtualRoot` 這些 API 每版都會變動。
- **換行由編輯器決定，Typst 只負責定位**（所見即所得的關鍵）：`measureTextLayout()` 用離畫面的 `Konva.Text`（屬性和 `canvas-elements.tsx` 畫的節點完全相同）取得 `lines`、`baseline` 與 `lineWidths`（底線 / 刪除線的長度），`buildExportRequest()` 把每個 text 物件的結果放進 `ExportRequest.textLayouts`（以 element id 為 key）。模板逐行 `place`，不讓 Typst 再斷行。
  - 因此 `measureTextLayout` **必須在字型載入後**呼叫（編輯器已顯示即符合），否則量出來的行寬是錯的。
  - **前端與 Rust 各有一份、改一邊要改兩邊的常數**（兩邊的測試用同一組數字守著）：
    - `TEXT_LINE_HEIGHT = 1.2`：`geometry.ts` / `export/render.rs`。
    - `LABEL_PADDING_PT = 4`：`shape-label.ts` / `render.rs`。
    - 虛線樣式：`stroke.ts` 的 `dashPattern` / `render.rs` 的 `dash_pattern`。虛線 3w + 3w；點線 0 + 2w，圓頭。
    - 多邊形 / 星形頂點：`shape-geometry.ts` / `project/shape.rs`。
    - 線寬上限 `STROKE_WIDTH_MAX`、`MAX_VERTEX_COUNT`、邊界上限 `MARGIN_MAX_PT`、陰影偏移上限 `TEXT_SHADOW_OFFSET_MAX`：`validation.ts` / `format.rs`。
    - 主頁鏈的深度上限 `MASTER_DEPTH_MAX`（8）與主頁引用的規則：`master-pages.ts` / `format.rs`。
    - 底線 / 刪除線的公式與模擬斜體的斜率只在 Rust（`render.rs`），對應的是 **Konva 與瀏覽器本身的行為**，不是前端常數：升級 Konva 時重查（見「文字裝飾」）。
    - 字級範圍 `FONT_SIZE_MIN` / `FONT_SIZE_MAX`（`validation.ts`）、`PAGE_NUMBER_MAX` / `PAGE_NUMBER_AFFIX_MAX_LENGTH`（`page-numbers.ts`）：`format.rs` 的頁碼驗證（`validate_page_number_rules`）。
  - 圖形內文字也由畫布量測：`textLayouts` 的 key 是 `<id>#label`，Rust 的 `shape_label` 把它變成一般的文字元素，緊接在圖形之後。
  - Rust 端缺 layout 時會退回「以 `\n` 分行 + 估算基線」，只是保險，正常路徑不該走到。
- **使用者文字絕不進入 Typst 程式碼**：模板 `template.typ` 是固定的，資料以 `data.json`（`export/pdf.rs` 的 `to_data()` 產生）傳入，用 `json()` 讀取。`#`、`$`、`[`、`\` 這些字元會原樣輸出（有測試 `user_text_is_data_not_typst_code` 守著）。**不要改成用字串拼接組出 .typ**。
- **`ExportWorld` 是沙箱**：只有 `main.typ`（內嵌模板）、`data.json` 與 `assets/images/*` 可讀，其他路徑一律 `AccessDenied`，圖片路徑還要過 `validate_asset_path`（和專案檔同一個檢查，擋 `../` 與絕對路徑）。
- **字型**：畫面、PDF、EPUB **共用 `fonts/` 底下的同一批檔案**，換行位置才會一致。前端用 `src/index.css` 的 `@font-face` 與 `lib/editor/fonts.ts` 的 `FONT_OPTIONS`（字體選單），Rust 用 `export/fonts.rs` 的 `BUNDLED_FONTS`（`include_bytes!`），**改一處就要改其他處**。新增字型的步驟、修改過的字型檔與 `patch_font.py` 見 `fonts/README.md`。
  - Typst 讀到的家族名稱不一定等於 CSS 名稱（霞鶩文楷是「霞鶩文楷 TC」）：`BUNDLED_FONTS.typst_family` 記錄它，`pdf.rs` 用 `typst_family()` 轉換。測試 `typst_sees_the_declared_family_and_weight` 守著。
  - 霞鶩文楷沒有 Bold，粗體用 Medium（CSS 宣告為 700、`bold: true`）。
  - 只放**靜態**字重（Geist / Noto Sans TC 各 Regular + Bold），不要換成可變字型：模型的 `fontStyle` 只有 `normal` / `bold`，而可變字型與靜態實例的度量可能不同，混用會讓畫面與輸出對不上。沒有斜體字型檔：`italic` 是模擬斜切（見「文字裝飾」），加入真的斜體字型會讓畫面與輸出的斜體不一致。
  - 不讀系統字型，所以 `load_fonts()` 不會失敗，匯出結果在每台機器上都一樣。字型在第一次匯出時解析並快取在 `ExportState` 的 `OnceLock`。
  - CSS 的 `font-family` 由 `font_families()` 轉成 Typst 家族名：去掉 `serif` / `sans-serif` 等泛用名稱，再套 `LEGACY_FAMILIES`（`"Geist Variable"` → `"Geist"`、`"Microsoft JhengHei"` → `"Noto Sans TC"`）。**這個對應表不能刪**：內嵌字型之前存檔的專案仍然帶著舊名稱，而且沒有 schema 遷移會改寫它。
  - `font-display` 用 `block`：讓瀏覽器先以 fallback 畫再換字，會讓 Konva 已經量好的行寬失效。
- **兩步 command**：`export_pdf_choose_path`（開儲存對話框，路徑存進 `ExportState.pending`，只回傳檔名）→ `export_pdf`（取出路徑、排版、寫檔）。延續「前端不傳路徑給 Rust」的原則，同時讓前端只在排版期間顯示 loading toast。`export_open_last` 用 opener 開啟最後一次匯出的 PDF（成功 toast 的「開啟」按鈕）。
- 排版是 CPU 密集工作，`export_pdf` 用 `spawn_blocking` 執行，不要在 async runtime 上直接跑。PDF 一樣先寫 `.pdf.tmp` 再 rename。
- 匯出的是**目前畫面上的內容（含未存檔的修改）**，不要求先存檔；圖片檔在專案資料夾中不存在時略過該張並回報 `skippedImages`（和畫布顯示灰框一致，不讓整份匯出失敗）。
- 座標定義與 Konva 相同（pt、原點左上、y 向下、順時針旋轉）。render model 的每個元素都以外框左上角定位，旋轉也繞這一點。
- 多邊形與星形由 `project/shape.rs` 算出頂點後以 Typst `polygon` 繪製，兩者在模板裡是同一個 `kind: "polygon"`。
- **邊框的虛線位置由路徑起點決定**：Typst 內建 `rect` / `ellipse` 的起點和 Konva 不同。所以有邊框的矩形與橢圓在 PDF 裡改畫成 `kind: "path"`（`pdf.rs` 的 `rect_path` / `ellipse_path`，起點與方向和 Konva、SVG 相同），沒有邊框的照舊。
- EPUB 中有邊框的矩形 / 橢圓輸出成 inline SVG，因為 CSS border 畫在框內，位置會差半個線寬。
- 半透明顏色：PDF 直接交給 Typst 的 `rgb("#rrggbbaa")`；**EPUB 輸出前轉換**（`epub/xhtml.rs` 的 `css_color` / `svg_fill`），CSS 用 `rgba()`、SVG 用 `fill-opacity`，不讓 8 位 hex 進入 EPUB（SVG 1.1 不允許，舊閱讀引擎也不支援）。
- 預設儲存位置：已存檔的專案用專案資料夾，未命名專案用「文件\雜誌編輯軟體」（暫存資料夾不適合放成品）。
- **已知限制**：所見即所得只保證換行位置，字距由 Typst 的字型引擎計算，置中 / 靠右可能差零點幾 pt；顏色是 RGB（可含透明度），沒有出血、裁切線與 CMYK；內嵌字型沒有的字元（含 emoji）會是缺字方塊，瀏覽器則可能用系統字型補上。
- **調校方式**：`export_preview` 測試（`#[ignore]`）把每頁算成 2 px/pt 的 PNG 和畫布疊圖比對；設 `EXPORT_REQUEST_JSON` 可以改用從編輯器擷取的真實 `ExportRequest`。

## Rust ↔ Frontend IPC

- 資料庫路徑：`%APPDATA%\com.mycompany.magazineeditor\app.db`（`app_data_dir()`；安裝在 Program Files 時 exe 目錄不可寫）。
- 單一 `Connection` 包在 `DbState(Mutex<Connection>)`，command 內用 `state.conn()?` 取得連線，不要直接 `.lock().unwrap()`。
- Schema 變更：在 `db::MIGRATIONS` **尾端**新增一個 SQL 步驟（依 `PRAGMA user_version` 執行，已發布的步驟不可修改）。目前是 v2（`env_vars`、`recent_projects`）。
- Command 一律回傳 `AppResult<T>`；`AppError` 序列化為 `{ kind, message }`，`kind` ∈ `"sqlite" | "lockPoisoned" | "invalidInput" | "io" | "invalidProject" | "unsupportedVersion" | "noProject" | "export" | "tauri"`（前端對應 `AppErrorKind`）。前端依 `kind` 判斷錯誤類型，不要解析 message 字串；`invalidInput` 與 `export` 的 message 是給使用者看的中文，其他 kind 由 `describeCommandError` 翻成中文。使用者取消對話框不是錯誤，command 回傳 `null`。
- IPC 參數來自 WebView，視為不可信任：寫入前要驗證（參考 `commands/env_vars.rs` 的 `validate_key`），SQL 一律用 `params![]` binding。
- 新增 command 的步驟：在 `commands/<domain>.rs` 實作 → 在 `commands/mod.rs` 宣告 `pub mod` → 在 `lib.rs` 的 `generate_handler!` 註冊。Rust 的 snake_case 參數在前端對應為 camelCase。
- 使用新的 Tauri plugin 或 core API 時，要同步在 `capabilities/default.json` 加權限。
- 現有 commands：`project_new`、`project_open_last`、`project_open_dialog`、`project_save`、`project_save_as_dialog`、`asset_import`（raw binary body）；`recovery_list`、`recovery_restore`、`recovery_discard`、`recovery_write`、`recovery_clear`；`export_pdf_choose_path`、`export_pdf`、`export_open_last`；`get_env_vars`、`upsert_env_var`、`delete_env_var`（前端還沒有使用）。
- 會做檔案 I/O 或開對話框（blocking API）的 command 一律寫成 `async fn`：同步 command 在主執行緒執行，會凍結視窗。
- `AppError::InvalidInput` 與 `AppError::Export` 的訊息**一律寫成給使用者看的中文**（前端直接顯示）；內部錯誤用其他 kind。

## CSP

`tauri.conf.json` 設定嚴格 CSP，並以 `dangerousDisableAssetCspModification: ["style-src"]` 允許 `'unsafe-inline'`：Radix 和 sonner 會在 runtime 注入 `<style>`，而 Tauri 預設加的 nonce 會讓 `'unsafe-inline'` 失效。**不可移除此設定**。

圖片只允許 `'self'`、`data:`、`blob:`、`asset:`（專案圖片走 asset protocol，即 `http://asset.localhost`）。Vite 會把小於 4KB 的 SVG 內嵌成 `data:` URI。載入外部資源（遠端圖片、字型、API）前必須更新 CSP，否則會被靜默阻擋。

## 慣例

- `src/components/ui/` 由 shadcn CLI 管理，客製化時優先在外層包裝；直接修改會在 `add --overwrite` 時被覆蓋。
- 顏色使用 design tokens（`bg-background`、`bg-muted`、`text-muted-foreground`…）。Dark mode 用 `.dark` class 切換（`@custom-variant dark`），目前還沒有切換入口。
- Tailwind v4 的漸層寫法是 `bg-linear-to-*`（不是 `bg-gradient-to-*`）；動態 class 必須以完整字串出現在原始碼中，才會被掃描到。
- 錯誤處理使用 `Result<T>`（`{ data, error }`，定義在 `lib/editor/validation.ts`）或 toast，不要直接 throw 未型別化的錯誤。Context hook 在 Provider 外使用時才 throw。
- `shadcn` 必須留在 `dependencies`：`index.css` 會 `@import "shadcn/tailwind.css"`。
- TypeScript 6：**不要**在 `tsconfig.json` 加 `baseUrl`（已 deprecated，會讓 `tsc` 失敗）。
- `tsconfig` 開啟了 `noUnusedLocals` / `noUnusedParameters`，未使用的 import 會讓 `npm run build` 失敗。
- lucide-react 1.x 的 icon 名稱和舊版不同（例如 `Trash`、`TextAlignStart`，而不是 `Trash2`、`AlignLeft`），使用前先確認 `node_modules/lucide-react/dist/lucide-react.d.ts`。
- 用 PowerShell 5.1 讀寫含中文的檔案時，務必明確指定 UTF-8 編碼。
- Git：remote 是 `https://github.com/dino5168/magazine-editor`（**public**），預設分支 `main`。`.gitattributes` 設定 `text=auto`，repo 內一律以 LF 儲存。
- 本 repo 只包含 `magazine-editor/`。上層的設計文件（`../../3_系統設計文件/`）與 scaffold 腳本（`../setup-tauri-reactv3.ps1`）不在 repo 內。
