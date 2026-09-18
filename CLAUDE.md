# CLAUDE.md

雜誌編輯軟體（`magazine-editor`）是 Windows 桌面應用程式，由 `../setup-tauri-reactv3.ps1` 產生專案骨架。

- 長期目標：**Typst 負責排版與 PDF 輸出，Konva.js 做前端自由拖放編輯器**（類似 Canva）。
- 目前階段：前端編輯器 v1 + 檔案系統第一階段（專案存檔 / 開啟）。計畫：`../../3_系統設計文件/imp-ui-homepage.md`、`0-Task/plan-filesystem.md`（本機限定，不在 repo）。
- Bundle identifier：`com.mycompany.magazineeditor`
- 視窗標題：`雜誌編輯軟體`（設定在 `src-tauri/tauri.conf.json`，預設最大化，最小尺寸 1024×640）
- 給人閱讀的說明文件在 `docs/`（依編號分批撰寫，進度見 `docs/README.md`）。修改架構或資料流程時，同步更新對應的文件。
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
| UI | shadcn/ui（style `radix-nova`、base color `neutral`、`radix-ui` 單一套件）· Lucide icons · Geist Variable font · sonner |
| 測試 | vitest 5（node 環境，只測 `src/lib/**` 的純邏輯）· `cargo test`（`tempfile`）· 共用 fixture `tests/fixtures/sample.magproj` |
| Backend | Rust 2021 · `rusqlite 0.40`（`bundled`）· `thiserror 2` · serde · `sha2` · `uuid` · `time` |

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
```

目前沒有設定 ESLint / Prettier。

## 目錄結構

```
src/
  App.tsx                         # TooltipProvider + Toaster + lazy 載入 HomePage（不再使用 app-sidebar）
  pages/home-page.tsx             # EditorProvider → ProjectProvider → Grid 版面（選單列 / UI-01）；openPanel、選單 handlers、關閉提示放在這裡
  components/
    app/app-menubar.tsx           # 標題列下方的選單列（檔案(F) / 設定(S)），依 MENUS 渲染
    app/unsaved-changes-dialog.tsx  # 「要儲存變更嗎？」對話框（Promise 形式的 confirm）
    app/app-siderbutton.tsx       # 左側按鈕列；SIDER_BUTTONS 是按鈕的單一資料來源，SiderButtonId 由它推導
    app/app-sidebar.tsx           # 舊的導覽側邊欄，保留但不引用，不要修改或刪除
    editor/
      editor-canvas.tsx           # Stage、捲動工作區、zoom/fit、Transformer、選取、文字編輯 overlay
      canvas-elements.tsx         # 物件 → Konva 節點的 renderer；bakeTransform()
      text-editor-overlay.tsx     # 雙擊文字時疊在畫布上的 textarea（處理輸入法選字）
      selection-toolbar.tsx       # 選取物件後的屬性工具列
      editor-top-bar.tsx          # 系統控制項：文件名稱、復原/重做、縮放、匯出 PDF（停用）
      editor-page-bar.tsx         # draw.io 風格頁籤：新增 / 切換 / 雙擊改名 / 刪除（AlertDialog）
      sider-panel.tsx             # 面板外框（標題、ScrollArea、右緣「<」收合）
      panels/index.ts             # PANELS：SiderButtonId → 面板元件（satisfies Record，缺項會編譯失敗）
      panels/*.tsx                # 9 個面板；draw / resize 目前是佔位
      icon-button.tsx · color-input.tsx · inline-name-input.tsx   # 共用小元件
    ui/                           # shadcn 產生的元件（視為 vendor code）
  lib/
    utils.ts                      # re-export `cn`（來自 `cn` 套件，不是 clsx + tailwind-merge）
    project/                      # 專案檔案存取（不含 UI）
      project-types.ts            # ProjectInfo / ProjectContent / OpenedProject / CommandError（對應 Rust）
      project-api.ts              # invoke 包裝（回傳 Result）、isDesktop、describeCommandError
      asset-url.ts                # resolveAssetUrl：專案相對路徑 → asset protocol URL
      project-context.tsx         # ProjectProvider：啟動載入、createNew / loadOpened / markSaved、視窗標題、resolveSrc
      use-project-commands.ts     # 新增 / 開啟 / 儲存 / 另存（confirm 由 UI 注入）
      use-image-import.ts         # 圖片複製進專案 assets/（上傳檔案與內建相片）
      use-close-guard.ts          # 關閉視窗前提示未存檔
      __tests__/
    menu/                         # 選單與全域指令（不含 UI）
      commands.ts                 # COMMANDS（label / shortcut / disabledReason）、CommandId、CommandHandlers、佔位 handler
      menu-structure.ts           # MENUS 結構（item / separator / submenu / radio）、助記鍵
      shortcut.ts                 # matchesShortcut / formatShortcut（以 event.code 比對）
      use-menu-shortcuts.ts       # 全域 Ctrl 快捷鍵與 Alt 助記鍵
      __tests__/
    editor/                       # 不含 UI 的編輯器核心，新增邏輯優先放這裡並補測試
      types.ts                    # 文件模型（CanvasElement discriminated union）
      editor-reducer.ts           # 純 reducer + selectors + undo/redo
      editor-context.tsx          # EditorProvider、useEditorState / useEditorDispatch / useActivePage
      element-factory.ts          # 建立物件/頁面/範例文件、describeElement
      geometry.ts                 # 物件外框（含旋轉）、內容範圍、文字高度估算
      viewport.ts                 # 縮放、捲動版面與錨點換算（pt ↔ 螢幕像素）
      units.ts                    # mm ↔ pt、頁面尺寸 preset
      validation.ts               # Result type、上傳檔案/名稱/字級/顏色驗證
      image.ts                    # loadImageSize()
      use-editor-shortcuts.ts     # 全域快捷鍵
      __tests__/                  # vitest
  assets/photos/*.svg             # 相片面板的佔位範例圖（可以直接換成真實照片）
src-tauri/
  src/lib.rs                      # Builder：single-instance（最先註冊）、setup DB / ProjectState、清除上次的未命名專案、註冊 commands
  src/error.rs                    # AppError / AppResult（所有 command 共用）
  src/db/mod.rs                   # DbState、MIGRATIONS（PRAGMA user_version）、recent_projects
  src/project/                    # 專案資料夾：format.rs（serde 型別、驗證、schemaVersion）、io.rs（原子寫入、.bak、清理）、assets.rs（圖片匯入）
  src/commands/                   # #[tauri::command]，每個領域一個檔案（env_vars.rs、project.rs）
  capabilities/default.json       # IPC 權限（core:default、opener:default、window set-title / destroy）
  tauri.conf.json                 # 視窗、CSP、bundle 設定、assetProtocol
tests/fixtures/sample.magproj     # Rust 與 vitest 共用的專案檔 fixture（含六種物件）
```

`@/*` alias 指向 `src/*`，`tsconfig.json` 的 paths 和 `vite.config.ts` 的 resolve.alias 兩處必須一致。

## 編輯器架構

### 文件模型（`lib/editor/types.ts`）

- **長度單位一律是 pt（1/72 inch）**，和 Typst 一致。座標原點是頁面左上角；zoom 1 時 1pt = 1 CSS px。
- `x` / `y` 沿用 Konva 的定義：`text` / `rect` / `image` 是左上角，`ellipse` / `polygon` / `star` 是中心點。
- **模型不存 scale**。Transformer 縮放結束時由 `bakeTransform()` 把 scale 換算進 `width` / `height` / `radius`，再把節點 scale 重設為 1。文字只調整 `width`（換行寬度），不改字級。
- `Page.elements` 的 index 0 是最底層。圖層面板反向顯示，最上層在最前。
- 物件**可以超出頁面，而且不裁切**（使用者需求）：頁面 Group 不設 clip、物件沒有 dragBoundFunc；頁緣線畫在物件上方。匯出 PDF 時超出部分會被紙張邊界裁掉。
- 新增物件類型時要改的地方：`types.ts` 的 union，以及 `geometry.localBounds`、`canvas-elements`（renderer + `bakeTransform`）、`editor-canvas` 的 `TRANSFORMER_OPTIONS`、`describeElement`、`selection-toolbar` 的 `TYPE_LABELS`、`layers-panel` 的 `TYPE_ICONS`。這些都有 exhaustive switch 或 mapped type，漏改會編譯失敗。

### 狀態（`lib/editor/editor-reducer.ts`）

- 用 `useReducer` + 兩個 Context（state / dispatch 分開），不使用 zustand 或 redux。
- `HANDLERS` 是 `{ [T in EditorAction["type"]]: handler }` 的 dispatch map，新增 action 時必須同時加 handler。
- **會進入 undo 歷史的**：`history.present`（EditorDocument）的變更，上限 100 筆（`HISTORY_LIMIT`）。
- **不進歷史的 UI 狀態**：`activePageId`、`selectedId`、`view`（zoom / fitRequest）、`assets`（專案圖片清單，會存檔）、`savedDocument`（上次存檔的文件）。面板開關（`openPanel`）放在 `home-page.tsx` 的 local state。
- undo/redo 後由 `reconcileSelection` 校正已經失效的頁面或選取 id。
- 沒有變化時必須回傳**同一個 state 參考**（測試有檢查），避免多餘的 render 和空的歷史紀錄。
- `element/update` 只在 dragend / transformend / 屬性確定時送出。拖曳過程中不要 dispatch。顏色選擇器聽原生 `change` 事件（`ColorInput`），避免 React `onChange` 連續寫入歷史。
- reducer 內部會驗證名稱與顏色，非法輸入直接 no-op；UI 端的錯誤訊息用 sonner `toast`。

### 畫布捲動與縮放（`editor-canvas.tsx` + `viewport.ts`）

- Stage 只有視窗大小，放在 `sticky` 容器裡；外層 `overflow-scroll` 內放一個 `contentWidth × contentHeight` 的空 div 撐出捲軸。捲動時只改 Layer 位移，不建立超大 canvas。
- 內容範圍 = 頁面 ∪ 所有物件外框，再加上 200px 邊距（`getContentBounds` + `WORKSPACE_MARGIN_PX`），確保拖到遠處的物件仍可以捲過去。
- 換算公式：螢幕像素 = pt × zoom + `layout.offset` − scroll。縮放或內容範圍改變時，用錨點（Ctrl+滾輪時是游標，其他情況是畫面中心）重新計算 scroll，讓錨點下的內容保持不動。
- 「符合畫面」以 `view/fit` 遞增 `fitRequest` 觸發，因為只有 canvas 知道 viewport 大小。
- 兩個 `useLayoutEffect`（捲動校正 → fit）的**宣告順序不能對調**：fit 設定的錨點必須留到下一次 commit 才處理。
- 從圖層面板選取完全不在畫面內的物件時，會自動捲動到該物件。

### 其他注意事項

- 字型：canvas 必須等 Geist 載入後才建立 Stage（`useFontsReady`），否則換行寬度會算錯。預設 fontFamily 是 `"Geist Variable", "Microsoft JhengHei", sans-serif`。
- 文字編輯 overlay 會用 `compositionstart/end` 和 `isComposing` 忽略選字期間的 Enter / Esc。
- 快捷鍵（Delete / Ctrl+Z / Ctrl+Y / Esc / 方向鍵）焦點在 input、textarea、dialog、menu 內時不觸發。
- 上傳圖片只接受 PNG / JPEG / WebP / GIF、單檔 ≤ 20 MB，而且必須能實際解碼；桌面版會複製進專案（見「檔案系統」）。瀏覽器模式才使用 `blob:` URL，而且不 revoke（undo 可能讓刪除的圖片回來）。
- `tauri.conf.json` 設定 `dragDropEnabled: false`：Tauri 預設會攔截檔案拖放，HTML5 drop 事件在 Windows 上收不到，上傳面板的拖放區需要這個設定。**不可移除**。
- 桌面版啟動時開啟上次的專案，沒有就建立空白 A4 的未命名專案；瀏覽器模式（`npm run dev`）沒有檔案存取，只載入 `createSampleDocument()` 的示範內容，檔案指令會提示「僅在桌面版可用」。

## 選單列與指令（`lib/menu`）

- 選單使用自訂 HTML（shadcn `Menubar`），**不使用** Tauri 原生選單；橫跨全寬，放在 Grid 第一列。
- **指令是單一資料來源**：`COMMANDS` 定義 label、快捷鍵與停用原因；`MENUS` 只描述結構；`CommandHandlers` 是 `{ [K in CommandId]: () => void }`，新增指令卻沒有提供 handler 時會編譯失敗。
- Handlers 在 `home-page.tsx` 建立（需要編輯器與專案狀態，所以在 `EditorProvider` / `ProjectProvider` 內）：新增、開啟、儲存、另存新檔、匯入圖片已實作；其餘仍是佔位（`createPlaceholderHandlers` → toast「『xxx』尚未實作」），實作時覆寫對應的 key 即可。
- 新增選單項目的步驟：在 `COMMANDS` 加定義 → 在 `MENUS` 放入結構 → 提供 handler。`menu-structure.test.ts` 會檢查每個指令都出現在選單中恰好一次、快捷鍵沒有重複，也不會和編輯器快捷鍵衝突。
- 快捷鍵以 **`event.code`**（實體按鍵，例如 `KeyS`、`Comma`）比對，不用 `event.key`：注音輸入法啟用時 `key` 可能是 `Process`。`metaKey` 視同 Ctrl。
- `use-menu-shortcuts` 在 `window` capture 階段註冊：
  - 在輸入框與文字編輯中也生效，並呼叫 `preventDefault()`，避免 WebView2 預設的 Ctrl+S / Ctrl+O 行為。
  - 例外：輸入法選字中（`isComposing`）或焦點在 dialog / alertdialog 內時不觸發。
- 助記鍵 Alt+F / Alt+S：以 Menubar 受控 `value` 開啟選單。**不要**攔截事件傳遞（`stopPropagation`），Radix Menu 依賴 document 上的 keydown 判斷「鍵盤操作」，才會自動聚焦第一個項目。
- 「外觀」單選的 `value` 固定為「跟隨系統」，而且不接 `onValueChange`，等主題切換實作後再改成受控。

| 快捷鍵 | 指令 |
|--------|------|
| Ctrl+N / Ctrl+O | 新增 / 開啟... |
| Ctrl+S / Ctrl+Shift+S | 儲存 / 另存新檔... |
| Ctrl+, | 偏好設定... |
| Alt+F / Alt+S | 開啟「檔案」/「設定」選單 |

## 檔案系統（`lib/project` + `src-tauri/src/project`）

- **專案 = 使用者自選位置的資料夾**：`project.magproj`（UTF-8 JSON，`schemaVersion` 1）、`project.magproj.bak`（上一次存檔）、`assets/images/<SHA-256 前 32 碼>.<ext>`。一個專案 = 一份多頁文件。
- **專案資料夾自給自足**：頁面上的每張圖片（上傳、內建相片）都先複製進 `assets/images/`。`ImageElement.src` / `AssetInfo.src` 存**專案相對路徑**，顯示時由 `resolveSrc`（`resolveAssetUrl` + `convertFileSrc`）轉成 asset protocol URL。圖片檔寫入後不再修改，復原歷史可以放心引用。
- **Rust 是檔案格式的權威定義**：`project/format.rs` 的 serde 型別對應 `types.ts`，讀取與存檔時都會驗證（顏色、頁面尺寸、`src` 只能是 `assets/images/<檔名>`）。**修改 `types.ts` 的文件模型時必須同步修改 `format.rs` 和 `tests/fixtures/sample.magproj`**；兩邊的測試都會讀這份 fixture，欄位不一致時會失敗。格式變更要提升 `SCHEMA_VERSION` 並在 `migrate()` 加升級步驟；比 App 新的版本拒絕開啟。只有最上層的未知欄位會在存檔時保留。
- **前端不傳路徑給 Rust**：開啟 / 另存對話框由 Rust 呼叫 `tauri-plugin-dialog`，其他 commands 只操作 `ProjectState` 中目前開啟的專案。前端不需要 dialog 的 JS 套件或 capability。
- 寫入：`.tmp` → flush → 舊檔 copy 成 `.bak` → rename 取代。開啟時主檔損壞會自動改用 `.bak`，並標記為未存檔。開啟時會刪除 `assets/images/` 裡沒被引用的檔案（此時復原歷史是空的）。
- 未命名專案放在 `%LOCALAPPDATA%\com.mycompany.magazineeditor\untitled\<id>\`，「儲存」會改走「另存新檔」，另存成功後刪除暫存資料夾；下次啟動時清除殘留的暫存資料夾（single-instance 保證沒有其他實例在用）。
- 另存對話框：使用者輸入的名稱（去掉 `.magproj`）就是新的專案資料夾名稱，檔案固定叫 `project.magproj`；目標資料夾已存在而且不是空的會拒絕。對話框預設位置是「文件\雜誌編輯軟體」。
- asset protocol 的 scope 在 `tauri.conf.json` 是空的，開啟專案時由 Rust `asset_protocol_scope().allow_directory()` 動態開放。
- **dirty 判斷**：reducer 的 `selectIsDirty`＝`history.present !== savedDocument`（比較參考）。`document/load`（清空復原歷史，`saved: false` 時 `savedDocument` 設為 null）與 `document/markSaved` 負責設定 `savedDocument`；`ProjectProvider` 只在有開啟專案時才回報 dirty。
- 視窗標題：`● 文件名稱 — 雜誌編輯軟體`（`●` 表示未存檔），由 `ProjectProvider` 呼叫 `setTitle`。
- 新增 / 開啟 / 關閉視窗前，有未存檔的變更時會詢問「儲存 / 不儲存 / 取消」；三者共用 `useProjectCommands` 的同一段流程（關閉視窗走 `confirmClose`）。`busyRef` 防止同時執行兩個檔案操作（包括對話框開著時關閉視窗）。
- 圖片的選檔對話框統一用 `lib/editor/image.ts` 的 `pickImageFiles()`（上傳面板與「匯入圖片」共用）。
- **尚未實作**（見 `0-Task/plan-filesystem.md`）：第二階段自動備份（`%LOCALAPPDATA%\...\recovery\`）、第三階段系統素材庫與範本、匯入其他專案的頁面、「最近開啟」選單。

## Rust ↔ Frontend IPC

- 資料庫路徑：`%APPDATA%\com.mycompany.magazineeditor\app.db`（`app_data_dir()`；安裝在 Program Files 時 exe 目錄不可寫）。
- 單一 `Connection` 包在 `DbState(Mutex<Connection>)`，command 內用 `state.conn()?` 取得連線，不要直接 `.lock().unwrap()`。
- Schema 變更：在 `db::MIGRATIONS` **尾端**新增一個 SQL 步驟（依 `PRAGMA user_version` 執行，已發布的步驟不可修改）。目前是 v2（`env_vars`、`recent_projects`）。
- Command 一律回傳 `AppResult<T>`；`AppError` 序列化為 `{ kind, message }`，`kind` ∈ `"sqlite" | "lockPoisoned" | "invalidInput" | "io" | "invalidProject" | "unsupportedVersion" | "noProject" | "tauri"`（前端對應 `AppErrorKind`）。前端依 `kind` 判斷錯誤類型，不要解析 message 字串；`invalidInput` 的 message 是給使用者看的中文，其他 kind 由 `describeCommandError` 翻成中文。使用者取消對話框不是錯誤，command 回傳 `null`。
- IPC 參數來自 WebView，視為不可信任：寫入前要驗證（參考 `commands/env_vars.rs` 的 `validate_key`），SQL 一律用 `params![]` binding。
- 新增 command 的步驟：在 `commands/<domain>.rs` 實作 → 在 `commands/mod.rs` 宣告 `pub mod` → 在 `lib.rs` 的 `generate_handler!` 註冊。Rust 的 snake_case 參數在前端對應為 camelCase。
- 使用新的 Tauri plugin 或 core API 時，要同步在 `capabilities/default.json` 加權限。
- 現有 commands：`project_new`、`project_open_last`、`project_open_dialog`、`project_save`、`project_save_as_dialog`、`asset_import`（raw binary body）；`get_env_vars`、`upsert_env_var`、`delete_env_var`（前端還沒有使用）。
- 會做檔案 I/O 或開對話框（blocking API）的 command 一律寫成 `async fn`：同步 command 在主執行緒執行，會凍結視窗。
- `AppError::InvalidInput` 的訊息**一律寫成給使用者看的中文**（前端直接顯示）；內部錯誤用其他 kind。

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
