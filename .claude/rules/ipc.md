---
paths:
  - "src-tauri/src/lib.rs"
  - "src-tauri/src/error.rs"
  - "src-tauri/src/db/**"
  - "src-tauri/src/commands/**"
  - "src-tauri/capabilities/**"
  - "src-tauri/tauri.conf.json"
  - "src-tauri/Cargo.toml"
  - "src/lib/project/project-api.ts"
---

# Rust ↔ Frontend IPC、CSP

## Rust ↔ Frontend IPC

- 資料庫路徑：`%APPDATA%\com.mycompany.magazineeditor\app.db`（`app_data_dir()`；安裝在 Program Files 時 exe 目錄不可寫）。
- 單一 `Connection` 包在 `DbState(Mutex<Connection>)`，command 內用 `state.conn()?` 取得連線，不要直接 `.lock().unwrap()`。
- Schema 變更：在 `db::MIGRATIONS` **尾端**新增一個 SQL 步驟（依 `PRAGMA user_version` 執行，已發布的步驟不可修改）。目前是 v2（`env_vars`、`recent_projects`）。
- Command 一律回傳 `AppResult<T>`；`AppError` 序列化為 `{ kind, message }`，`kind` ∈ `"sqlite" | "lockPoisoned" | "invalidInput" | "io" | "invalidProject" | "unsupportedVersion" | "noProject" | "export" | "tauri"`（前端對應 `AppErrorKind`）。前端依 `kind` 判斷錯誤類型，不要解析 message 字串；`invalidInput` 與 `export` 的 message 是給使用者看的中文，其他 kind 由 `describeCommandError` 翻成中文。使用者取消對話框不是錯誤，command 回傳 `null`。
- IPC 參數來自 WebView，視為不可信任：寫入前要驗證（參考 `commands/env_vars.rs` 的 `validate_key`），SQL 一律用 `params![]` binding。
- 新增 command 的步驟：在 `commands/<domain>.rs` 實作 → 在 `commands/mod.rs` 宣告 `pub mod` → 在 `lib.rs` 的 `generate_handler!` 註冊。Rust 的 snake_case 參數在前端對應為 camelCase。
- 使用新的 Tauri plugin 或 core API 時，要同步在 `capabilities/default.json` 加權限。
- 現有 commands：`project_new`、`project_open_last`、`project_open_dialog`、`project_save`、`project_save_as_dialog`；`library_write`、`library_import`（raw binary body，種類在 header）、`library_read_text`、`library_thumbnail`；`font_import`（raw body，專案字型：檢查並存到 `assets/fonts/`，回傳 `FontFile`，見 `project/fonts.rs`）、`font_collection_faces`、`system_fonts_list`、`font_import_system`、`font_catalog_download`、`font_catalog_cancel`、`font_catalog_cached`（見「專案字型」）；`recovery_list`、`recovery_restore`、`recovery_discard`、`recovery_write`、`recovery_clear`；`template_list`、`template_create`、`template_replace`、`template_update_info`、`template_delete`、`project_new_from_template`（文件範本，見「文件範本」）；`export_choose_path`、`export_pdf`、`export_flipbook`、`export_pptx`、`export_open_last`；`mcp_set_enabled`、`mcp_respond`、`mcp_take_attachment`（MCP 附件的 raw bytes，一次性 token）；`get_env_vars`、`upsert_env_var`、`delete_env_var`（前端還沒有使用）。
- 會做檔案 I/O 或開對話框（blocking API）的 command 一律寫成 `async fn`：同步 command 在主執行緒執行，會凍結視窗。
- `AppError::InvalidInput` 與 `AppError::Export` 的訊息**一律寫成給使用者看的中文**（前端直接顯示）；內部錯誤用其他 kind。

## CSP

`tauri.conf.json` 設定嚴格 CSP，並以 `dangerousDisableAssetCspModification: ["style-src"]` 允許 `'unsafe-inline'`：Radix 和 sonner 會在 runtime 注入 `<style>`，而 Tauri 預設加的 nonce 會讓 `'unsafe-inline'` 失效。**不可移除此設定**。

圖片只允許 `'self'`、`data:`、`blob:`、`asset:`（專案圖片走 asset protocol，即 `http://asset.localhost`）。字型（`font-src`）是 `'self'`、`data:` 與 asset protocol（專案字型用 asset URL 建 `FontFace`，2026-10-14）。Vite 會把小於 4KB 的 SVG 內嵌成 `data:` URI。載入外部資源（遠端圖片、字型、API）前必須更新 CSP，否則會被靜默阻擋。

## 檔案（原 CLAUDE.md「目錄結構」）

```
  src/lib.rs                      # Builder：single-instance（最先註冊）、setup DB / ProjectState、清除上次的未命名專案、註冊 commands、視窗 Destroyed 時刪除目前專案的備份
  src/error.rs                    # AppError / AppResult（所有 command 共用）
  src/db/mod.rs                   # DbState、MIGRATIONS（PRAGMA user_version）、recent_projects
  src/commands/                   # #[tauri::command]，每個領域一個檔案（env_vars.rs、project.rs、library.rs、fonts.rs、recovery.rs、templates.rs、export.rs、mcp.rs）
  capabilities/default.json       # IPC 權限（core:default、opener:default、window set-title / destroy）
  tauri.conf.json                 # 視窗、CSP、bundle 設定、assetProtocol
```
