---
paths:
  - "src-tauri/src/upload/**"
  - "src-tauri/src/commands/upload.rs"
  - "src-tauri/src/export/cover.rs"
  - "src/lib/upload/**"
  - "src/components/app/upload-dialog.tsx"
---

# 上傳翻頁書到網站（web-magazine）

計畫與每步紀錄：`docs/13-Plans-電子書上傳/5-desktop上傳-實作-V2.md`（資安評估 `4-資安評估.md`）。

## 合約

- **只依 web-magazine 的 `A01-Magazine-Server/docs/桌面上傳API.md` 實作，不讀後端原始碼**（例外：對照 `service/package.rs` 的白名單）。後端在另一個 repo，改後端要另開工作階段。
- GraphQL 查詢字串**逐字照合約**（`client.rs` 的 `LOGIN_QUERY` / `MY_BOOKS_QUERY` / `CREATE_BOOK_QUERY`）：`myBooks` 用 `after` 分頁，**不要調大 `first` 或加欄位**（複雜度上限會讓整個請求失敗）。
- 判斷錯誤只看 `code`（GraphQL `extensions.code`、REST `error.code`），不比對英文 `message`；body 不是 JSON（Nginx / Cloudflare 的 HTML）時看 HTTP 狀態碼。全部在 `response.rs` 的純函式 `graphql_data` / `classify_http`，對應表在計畫 §4.5。
- 伺服器白名單 `package.rs` 的 `ALLOWED_EXTENSIONS` = web-magazine 的 `ALLOWED_EXTENSIONS`：翻頁書多了新的檔案類型時兩邊一起改，否則網站會**默默略過**那些檔案（所以 `prepare` 把會被略過的檔案當錯誤）。上限 100 MB / 5 000 個檔案 / 解壓 4 倍也照合約。

## 資安（不可放寬）

- **所有網路請求在 Rust**（`reqwest`，Schannel）。CSP `connect-src` 不放寬；前端不 fetch 伺服器。
- **token 只在 `UploadState`**：沒有 command 回傳它，`Session` 的 `Debug` 不印它，不寫 log / 檔案 / 偏好。密碼只在 `upload_login` 那一次 IPC，用完即丟；偏好只記網址、email、確認過的主機。
- `http_client`：**關閉轉址**（3xx 當錯誤，不把 `Authorization` 送到別處）、不提供忽略憑證的選項、連線 10 秒、GraphQL 30 秒、上傳 16 分鐘（比伺服器的 15 分鐘長）、回應有大小上限。
- 網址：`parse_server_url` 只收 https；`http` 只給 localhost 與字面私有 IP（不查 DNS）。前端 `previewServer` 用同一條規則只做顯示，**以 Rust 為準**。`readerUrl` 開之前過 `is_openable_reader_url`，網址存在 Rust（`upload_open_reader`），前端不能叫它開別的網址。
- `bookId` 來自 WebView，進 URL 前檢查只含英數與 `-`（`is_valid_book_id`）。
- **沒有 MCP 上傳工具**（密碼不能經過 AI 的對話）；`run_command file.uploadFlipbook` 只打開對話框。

## 流程與 UI

- `upload_flipbook`：`spawn_blocking` 裡 `build_flipbook` → `package::prepare`（`flipbook::zip_book`，**和「翻頁電子書（Zip）」匯出同一份內容**）→ `cover::render_cover`（只排第一頁、寬 600 px；失敗不擋上傳）→ 送出前**再確認一次登入**。同時只一個上傳（`begin_upload`）。
- 進度 event `upload://progress`（`building` / `uploading` / `processing`）。取消只在還沒送完時有效：送完後伺服器已在換書，取消只會隱藏結果。中斷的上傳不會換掉網站上原本的書（伺服器寫完新內容才刪舊的）。
- 錯誤是 `AppError::Upload`（JSON 多 `code`、`retryAfter`）→ 前端 `CommandError.upload`；對話框用 `stepAfterError` 決定回到哪一步：`unauthenticated` 回登入、成功後重試同一本；`notFound` 重新載入書單。`UploadState.check` 收到 `unauthenticated` 時忘掉 session。
- 對話框（`upload-dialog.tsx`）：上傳中不能關；第一次連到某主機要確認一次（`confirmedHosts`）；覆蓋公開書提醒；ADMIN 不顯示新建（Rust 也擋）；字型授權提醒沿用匯出。瀏覽器模式只顯示「僅在桌面版可用」。

## 測試

- 純函式：`cargo test --lib -- upload`、`npx vitest run src/lib/upload`。
- 對本機後端（`#[ignore]`，帳密放環境變數 `UPLOAD_SERVER` / `UPLOAD_EMAIL` / `UPLOAD_PASSWORD`，**在使用者自己的終端機跑**，不經過對話）：`login_and_books_over_the_network`、`upload_over_the_network`。一定要加 `--lib -j 2`，否則可能 os error 1455（記憶體不足）。會在伺服器建立「magazine-editor … 測試」草稿書。
