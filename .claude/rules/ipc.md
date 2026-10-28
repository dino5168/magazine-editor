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

# Rust ↔ Frontend IPC、DB、CSP

精簡前原文（含當時的 command 清單）：`docs/progress-archive/rules-2026-10/ipc.md`。現有 command 看 `lib.rs` 的 `generate_handler!`。

## Command

- 新增 command：`commands/<domain>.rs` 實作 → `commands/mod.rs` 宣告 `pub mod` → `lib.rs` 的 `generate_handler!` 註冊。Rust 的 snake_case 參數在前端是 camelCase。
- 用到新的 Tauri plugin 或 core API 時，同步在 `capabilities/default.json` 加權限。
- 會做檔案 I/O 或開對話框（blocking API）的 command 一律 `async fn`：同步 command 在主執行緒執行，會凍結視窗。
- 一律回傳 `AppResult<T>`；`AppError` 序列化為 `{ kind, message }`（前端 `AppErrorKind`）。前端依 `kind` 判斷，**不要解析 message**。`InvalidInput` 與 `Export` 的 message **一律是給使用者看的中文**（前端直接顯示）；其他 kind 由 `describeCommandError` 翻譯。使用者取消對話框不是錯誤，回傳 `null`。
- IPC 參數來自 WebView，視為不可信任：寫入前驗證（參考 `env_vars.rs` 的 `validate_key`），SQL 一律 `params![]` binding。路徑不從前端傳給 Rust（對話框在 Rust 開，見 `export.md` 的兩步 command）。
- `lib.rs`：single-instance plugin 要**最先**註冊。

## DB

- `%APPDATA%\com.mycompany.magazineeditor\app.db`（`app_data_dir()`；Program Files 裡 exe 目錄不可寫）。
- 單一 `Connection` 在 `DbState(Mutex<Connection>)`，用 `state.conn()?`，不要直接 `.lock().unwrap()`。
- Schema 變更：在 `db::MIGRATIONS` **尾端**加一步（依 `PRAGMA user_version`），已發布的步驟不可修改。

## CSP（`tauri.conf.json`）

- `dangerousDisableAssetCspModification: ["style-src"]` **不可移除**：Radix / sonner 在 runtime 注入 `<style>`，Tauri 的 nonce 會讓 `'unsafe-inline'` 失效。
- `img-src`：`'self'`、`data:`、`blob:`、`asset:`（專案圖片走 asset protocol `http://asset.localhost`）；`font-src`：`'self'`、`data:`、asset protocol（專案字型用 asset URL 建 `FontFace`）。Vite 會把 < 4 KB 的 SVG 內嵌成 `data:`。
- 載入外部資源（遠端圖片、字型、API）前必須更新 CSP，否則被靜默阻擋。
