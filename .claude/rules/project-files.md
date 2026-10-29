---
paths:
  - "src/lib/project/**"
  - "src/lib/editor/types.ts"
  - "src/lib/library/**"
  - "src/lib/templates/**"
  - "src/components/library/**"
  - "src/components/templates/**"
  - "src/components/app/new-document-dialog.tsx"
  - "src/components/app/unsaved-changes-dialog.tsx"
  - "src/components/app/recovery-dialog.tsx"
  - "src/components/app/use-pending-choice.ts"
  - "src/components/editor/panels/library-panel.tsx"
  - "src/lib/editor/image.ts"
  - "src-tauri/src/project/**"
  - "src-tauri/src/commands/project.rs"
  - "src-tauri/src/commands/library.rs"
  - "src-tauri/src/commands/recovery.rs"
  - "src-tauri/src/commands/templates.rs"
---

# 專案檔案（檔案系統、素材管理、文件範本）

精簡前的完整原文（各版 schema 的逐項說明、UI 操作、使用者決定）：`docs/progress-archive/rules-2026-10/project-files.md`。計畫：`docs/01-Plans-2026-10/04-素材管理-實作.md`、`16-素材可以支援 SVG-實作.md`、`01-修改新增專案流程-實作.md`、`docs/08-Plans-系統全域/02-樣式管理-樣式範本-實作.md`。

## 檔案系統（`lib/project` / `src-tauri/src/project`）

- 專案 = 使用者選的資料夾：`project.magproj`（JSON）+ `.bak` + `assets/images|texts|audio|thumbs|fonts/`（`ASSET_DIRS`）+ `library.json`。圖片檔名 = SHA-256 前 32 碼，寫入後不再修改（復原歷史可以引用）。
- **Rust `project/format/` 是格式的權威定義**（`mod.rs` 常數與 `parse_project`、`document.rs` / `elements.rs` 型別、`upgrade.rs`、`validate.rs`、`tests.rs`）：讀取與存檔都驗證。**改 `types.ts` 的文件模型 = 同步改 `format/` 與 `tests/fixtures/sample.magproj`**，提升 `SCHEMA_VERSION`（目前 17），更新 `docs-website/types.html`。新欄位能用 serde 預設就不寫升級步驟；要改寫舊內容時在 `parse_project` 依版本升級 `serde_json::Value`（備份檔也要套用）。比 App 新的版本拒絕開啟；只有最上層的未知欄位存檔時保留。完整步驟：skill `bump-file-format`。
- 各版：v2 物件顏色可 `#rrggbbaa`・v3 四種圖形合併成 `shape`（`upgrade_shapes_to_v3`）・v4 `margins`・v5 `pageNumberRules`・v6 文字裝飾（`#[serde(flatten)] decoration`）・v7 `masters` / `masterId`・v8 `textStyles` / `styleId`（缺少時 `default_text_styles`）・v9 `lineHeight` / `letterSpacing`（`spacing`）・v10 `align: distributed`・v11 四角圓角・v12 `swatches` 與 `*SwatchId`・v13 `fonts`・v14 preset geometry・v15 `dashDot` / 線條・v16 段落縮排（`indent`）・v17 圖片框 `image`。**v10、v14 沒有新欄位**：提升版本是讓舊版 App 說「檔案比較新」而不是解析失敗。
- **前端不傳路徑給 Rust**：開啟 / 另存對話框由 Rust 呼叫 `tauri-plugin-dialog`，其他 commands 只操作 `ProjectState` 的目前專案。`src` 存專案相對路徑，顯示時 `resolveSrc`（`resolveAssetUrl` + `convertFileSrc`）。asset scope 在開專案時由 Rust `allow_directory()` 開放。
- 寫入：`.tmp` → flush → 舊檔 copy 成 `.bak` → rename。主檔壞了改用 `.bak` 並標記未存檔。
- **開檔清理**刪除沒被引用的 `assets/` 檔案（頁面、主頁、素材庫含垃圾桶都算引用）與孤兒縮圖；素材庫是損壞後重建的那一次、以及從備份復原時**不清理**。
- 未命名專案在 `%LOCALAPPDATA%\com.mycompany.magazineeditor\untitled\<id>\`，「儲存」走另存；啟動時清除殘留（還有備份檔的保留）。另存目標資料夾非空時拒絕。
- dirty = `selectIsDirty`：`history.present !== savedDocument`（比參考）；由 `document/load` / `document/markSaved` 設定。
- 未存檔提示（新增 / 開啟 / 關閉視窗）共用 `useProjectCommands` 的同一段流程；`busyRef` 防止同時兩個檔案操作。**Promise 形式的對話框（`use-pending-choice.ts`）取消一律 resolve `null`**，否則 `busyRef` 一直 busy。
- 新增專案：未存檔提示 → `new-document-dialog.tsx` → `createNew(setup)` / `createFromTemplate(id, margins)`。啟動時沒有上次的專案直接建 A4（不顯示對話框）。
- 選檔統一 `pickFiles(accept)`（`image.ts`）：`pickImageFiles()` / `LIBRARY_ACCEPT`。
- 自動備份 `recovery\<專案 id>.json`：有未存檔變更時每 `AUTOSAVE_INTERVAL_MS` 寫一次（`decideAutosave`）。Rust 在存檔成功、`activate()` 換專案、`WindowEvent::Destroyed` 時刪除。備份 id 只收 UUID 字元；`recovery_discard` 只刪 `untitled\` 底下的資料夾。
- 未做：系統素材庫、匯入其他專案的頁面、「最近開啟」。App 偏好存 localStorage，SQLite `settings` 表不做。

## 素材管理（`lib/library` / `components/library` / Rust `project/library.rs`）

- 每個專案一個素材庫。`library.json`：**Rust 是權威**，TS `lib/library/types.ts` 手寫對應，共用 fixture `tests/fixtures/sample-library.json`。驗證規則 TS `libraryProblem` 與 Rust 同；**同一個 `src` 只能一筆**。比 App 新的 `libraryVersion` 拒絕開啟專案；主檔與 `.bak` 都壞時改名 `.damaged` 並重建。
- **立即寫入、不進復原、不算未存檔**：`LibraryProvider` 每次變更 `library_write`（帶 `projectId`，一次一個、合併）。**換專案、另存、關閉視窗前都要 `flush()`**（`use-project-commands.ts`、`use-close-guard.ts`）。
- `EditorState.assets` 已移除；`project.magproj` 的 `assets` 在存檔時由素材庫算出（`projectAssets`：**所有圖片，含垃圾桶**——舊版 App 的開檔清理只看它）。
- 匯入 `library_import`：raw body，header `x-asset-kind` / `x-asset-extension`；內容由 Rust 檢查（圖片 / 音訊看檔頭；文字 UTF-8、無 NUL、≤ 200 KB）。音訊只能匯入與分類，不能放到頁面。
- 「內建範例」**不寫進 `library.json`**：放到頁面時才 `importBundled`，之後和一般素材同一條路（`usePlaceLibraryItem`）。
- 管理視窗處理的按鍵要 **`stopPropagation`**：否則編輯器快捷鍵判斷不出焦點在視窗裡，會刪掉畫布上的物件。確認框關閉時焦點放回視窗。視窗有 `transform`，拖曳標籤 portal 到 `document.body`。拖曳規則在純函式 `libraryDropResult`；拖已選取的卡片時**開始拖曳才改選取**。
- 永久刪除只移除清單，檔案在下次開檔清理時才刪。
- 文字檔放到頁面時全文由 `library_read_text` 讀：**CSP 不讓前端 fetch asset URL**。
- 縮圖 `assets/thumbs/<原圖 hash>.jpg|png`：路徑由原圖推導、**不寫進 `library.json`**；`library_thumbnail` 用 `spawn_blocking`，前端最多同時 2 個。畫布用原圖。`Cargo.toml` 的 `[profile.dev.package.*]` 最佳化圖片解碼（不要刪，否則開發版一張 24 MP 約 8 秒）。
- SVG：`kind: "image"`、原檔照存（`<img>` 不執行 script）。Rust `is_svg`（roxmltree）要求 SVG namespace 的 `<svg>` 根元素。寬高不是絕對長度時改用 viewBox（`svgViewBoxSize` / `svgIntrinsicSize`）。不支援 `.svgz`；SVG 裡的文字 PDF 可能換字型（已知限制）。

## 文件範本（`lib/templates` / `components/templates` / Rust `project/templates.rs`）

- 範本存在這台電腦（`app_data_dir()/templates/<UUID>/`），所有專案共用：`template.json`（`templateVersion` 1）+ **專案格式的 `project.magproj`** + `assets/fonts|images`。驗證、升級、`.bak`、複製檔案都**重用專案檔的程式**（`validate_content`、`read_project`、`write_project_atomic`、`copy_assets` + `referenced_assets`），新的文件欄位不用改範本程式。前端只用 id。
- 寫入：先 `.tmp` 再 rename；更新時舊的改名 `.old`，成功才刪。啟動時 `clean_up`（`lib.rs` setup）。名稱 / 說明上限 `TEMPLATE_NAME_MAX_LENGTH` / `TEMPLATE_DESCRIPTION_MAX_LENGTH`（TS `lib/templates/types.ts` ↔ Rust 同值）。比 App 新或壞掉的範本照樣列出（`problem`），只能刪除；較新的不能被更新蓋掉。
- 立即寫入、不進復原。建立範本用 `getSnapshot()`（含未存檔修改），`templateContent` 篩範例頁、名稱重設 `UNTITLED_DOCUMENT_NAME`。
- `project_new_from_template(id)`：`create_untitled` → 複製檔案 → `library::load_or_create` → `activate`。新增時**紙張照範本、邊界可改**（`sizeLocked`）。
- 縮圖用 `AssetSrcProvider` 讀範本資料夾；範本的專案字型不登記（縮圖用後備字型）。受限授權字型只提醒（`restrictedFonts`）。
- 沒有 MCP 工具（`run_command project.templates` 只開視窗）。
