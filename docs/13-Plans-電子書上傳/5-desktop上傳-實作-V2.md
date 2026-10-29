# 上傳翻頁書到網站（magazine-editor 端）：實作計畫 V2

> 建立：2026-10-29　｜　前一版：[5-desktop上傳-實作.md](5-desktop上傳-實作.md)（2026-10-28，兩邊共用的初版）　｜　需求：[5-desktop 上傳.md](5-desktop%20上傳.md)　｜　資安：[4-資安評估.md](4-資安評估.md)
> **API 合約**：web-magazine repo 的 `A01-Magazine-Server/docs/桌面上傳API.md`。**這一邊只讀合約，不讀後端原始碼**；合約和本文件不一致時以合約為準。

## 0. 這一版改了什麼

初版的「已確認的決定」與資安評估都還有效；V2 把它對照到 magazine-editor 現有的程式，改成可以一步一步做的計畫。

| 項目 | 初版 | V2 |
| --- | --- | --- |
| 後端 B1–B3 | 待做 | **已完成**（web-magazine `7c2aad7`：合約文件 + `tests/desktop_upload_test.rs`，API 沒有新增也沒有修改）。這邊不用再做 |
| `myBooks` | `first: 50` | 合約要求用 `after` 分頁（`hasNextPage` / `endCursor`），**不能把 `first` 調大** |
| D1 伺服器設定 | 另開「設定 → 網站上傳…」 | 不另開設定頁：上傳對話框記住上次的網址與 email（App 偏好，localStorage） |
| 錯誤怎麼傳到畫面 | 沒寫 | 新增 `AppError::Upload`（帶 `code`、`retryAfter`），前端依 `code` 決定回到哪一步 |
| 封面 | 「用 typst-render」 | 只排**第一頁**（不排整本），沿用 PowerPoint 的點陣化，改成可指定解析度 |
| 測試 | 「假伺服器」 | 回應分類寫成純函式，餵 (狀態碼, 標頭, body) 測，不需要假伺服器；連網測試比照「下載免費字型」用 `#[ignore]` + 環境變數，對本機後端跑 |
| **新發現** | — | 翻頁書裡有伺服器會**略過**的檔案：GIF 圖片、`viewer/page-flip.LICENSE`。要先決定怎麼處理（§6 U1、U2） |

## 1. 可以直接沿用的現有程式

| 要做的事 | 現有程式 | 怎麼用 |
| --- | --- | --- |
| 產生翻頁書 | `export/flipbook/mod.rs` `build_flipbook(root, request) -> FlipbookOutput { files, pages, skipped_images }` | 檔案本來就在記憶體裡，不用寫資料夾 |
| 壓 zip | `export/archive.rs` `write_zip(entries, format_name)`，`Packing::Stored / Deflated` | 字型、HTML、JS 用 Deflated；PNG / JPEG / WebP 用 Stored |
| 封面點陣化 | `export/pdf.rs` `compile_document`、`export/pptx/raster.rs` `rasterize` / `has_raster_photo` | `rasterize` 現在固定 `PIXELS_PER_PT = 3`，要多一個解析度參數 |
| 已解析的字型 | `commands/export.rs` `ExportState::fonts()`（OnceLock） | 目前是 private，改成 `pub(crate)` |
| HTTP、進度、取消 | `commands/fonts.rs`：`reqwest::Client`（native-tls、user agent）、`network_reason`、`FontDownloadState { busy, cancel }`、`BusyGuard`、進度 event 每 512 KB 一次 | 上傳照同一個模式寫 |
| 匯出請求 | 前端 `buildExportRequest(document, measureTextLayout, measureLineWidth)`（`use-project-commands.ts` 的 `runExport`） | 上傳送同一份 `ExportRequest` |
| 字型授權提醒 | `fontsToCheckBeforePublishing` + `useFontLicenseDialog`（`font-license-dialog.tsx`） | 上傳前呼叫，和匯出翻頁書一樣；文案本來就講「放到網站上」 |
| 開瀏覽器 | `tauri-plugin-opener`（Rust 端 `OpenerExt`，同 `export_open_last`） | 由 Rust 開 `readerUrl`，不給前端開任意網址 |
| 桌面版判斷 | `project-api.ts` 的 `isDesktop` | 瀏覽器模式停用上傳 |

**不用改**：CSP（請求都在 Rust 端）、`capabilities/default.json`（Rust 端呼叫 opener 不經過 capability）、專案檔格式（不提升 `SCHEMA_VERSION`）、SQLite。

## 2. 架構

```
WebView（React）                         Rust（src-tauri/src/upload/ + commands/upload.rs）          web-magazine
────────────────                         ──────────────────────────────────────────────           ────────────
上傳對話框 ① 網址 / email / 密碼 ──────▶ upload_login ─ parse_server_url ─ POST /graphql login ──▶
          （密碼只在這一次 IPC）          UploadState { server, token, expires_at, user }
          ◀── { displayName, role, host, insecure }（不含 token）
          ② 書單（分頁）、新建 ─────────▶ upload_list_books(after) / upload_create_book(title) ────▶
          ③ 授權提醒 → 上傳 ────────────▶ upload_flipbook(bookId, request)
                                            spawn_blocking：build_flipbook → 檢查 → zip → 封面
                                            multipart 串流（package + cover）──────────────────────▶
          ◀── event upload://progress     每 512 KB 一次；upload_cancel 中止串流
          ④ 結果 ◀────────────────────── { pageCount, readerUrl, skippedImages }
          「在瀏覽器開啟」───────────────▶ upload_open_reader（開 UploadState 裡記的 readerUrl）
```

- token、`Authorization` 標頭只存在 `UploadState`（`Mutex`），**沒有任何 command 回傳它**，也不寫 log。
- 錯誤一律 `AppError::Upload { code, message, retry_after }`（`message` 是給使用者看的中文），前端依 `code` 決定畫面（§4 表）。

## 3. 檔案清單

| 檔案 | 新 / 改 | 內容 |
| --- | --- | --- |
| `src-tauri/Cargo.toml` | 改 | `reqwest` 加 `json`、`multipart`、`stream`（保留 `default-features = false`、`native-tls`、`system-proxy`）。另加 `futures-util`（把位元組切成串流）。加之前用 `cargo tree -i` 確認 tauri 已經帶同一版，不會多編一份 |
| `src-tauri/src/error.rs` | 改 | `AppError::Upload { code: UploadCode, message, retry_after: Option<u64> }`，序列化多兩個欄位 `code`、`retryAfter`；`kind = "upload"` |
| `src-tauri/src/upload/mod.rs` | 新 | `UploadState`（server、session、`busy`、`cancel`、`last_reader_url`）、常數（逾時、上限） |
| `src-tauri/src/upload/server_url.rs` | 新 | `parse_server_url(input) -> AppResult<ServerUrl { origin, host, insecure }>`（純函式） |
| `src-tauri/src/upload/response.rs` | 新 | `classify_graphql(body)`、`classify_http(status, retry_after_header, body)` → `UploadCode` + 中文訊息（純函式） |
| `src-tauri/src/upload/client.rs` | 新 | `reqwest::Client`（關轉址、逾時、UA）、`login` / `my_books` / `create_book` / `upload_package` |
| `src-tauri/src/upload/package.rs` | 新 | `prepare(files) -> AppResult<Vec<u8>>`：伺服器白名單檢查、zip、100 MB 檢查（純函式） |
| `src-tauri/src/export/cover.rs` | 新 | `render_cover(root, request, fonts) -> AppResult<CoverImage>`：只排第一頁，寬 600 px |
| `src-tauri/src/export/pptx/raster.rs` | 改 | `rasterize` 拆出 `rasterize_at(page, format, pixel_per_pt)`；原函式行為不變 |
| `src-tauri/src/commands/upload.rs` | 新 | `upload_login`、`upload_logout`、`upload_session`、`upload_list_books`、`upload_create_book`、`upload_flipbook`、`upload_cancel`、`upload_open_reader` |
| `src-tauri/src/commands/export.rs` | 改 | `ExportState::fonts()` 改 `pub(crate)` |
| `src-tauri/src/lib.rs`、`commands/mod.rs` | 改 | `app.manage(UploadState::default())`、`generate_handler!` 註冊 |
| `src/lib/upload/upload-api.ts` | 新 | invoke 包裝與型別（`UploadSession`、`UploadBook`、`UploadProgress`、`UploadResult`） |
| `src/lib/upload/upload-flow.ts` | 新 | 純邏輯：錯誤 `code` → 對話框下一步、`retryAfter` 倒數文字、覆蓋公開書的提醒條件（vitest） |
| `src/lib/project/project-types.ts`（`AppErrorKind`） | 改 | 加 `"upload"`；`describeCommandError` 直接顯示 `message` |
| `src/lib/preferences/preferences.ts`、`preferences-storage.ts` | 改 | `upload: { server, email, confirmedHosts }`（讀取時驗證，壞值回預設） |
| `src/components/app/upload-dialog.tsx` | 新 | 四步對話框（shadcn `Dialog`、`Progress`、`Select`/清單） |
| `src/lib/menu/commands.ts`、`menu-structure.ts`、`command-availability.ts` | 改 | `file.uploadFlipbook`「上傳到網站...」放在「匯出為」子選單下面；瀏覽器模式停用（原因「只有桌面版可以上傳」） |
| `src/pages/home-page.tsx` | 改 | 掛對話框與 handler |

## 4. 規格細節

### 4.1 網址驗證 `parse_server_url`

- 去掉前後空白；沒有 scheme 時補 `https://`。
- scheme 只能 `https` / `http`；拒絕帳密（`user:pass@`）、路徑（`/` 以外）、查詢字串、fragment。
- `http` 只允許 `localhost` 與**字面 IP**：`127.0.0.1`、`::1`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`。主機名稱就算解析到私有 IP 也拒絕（不做 DNS 查詢）。通過時 `insecure = true`，畫面顯示「連線未加密，只適合本機或區網測試」。
- 回傳的 `origin` 只有 `scheme://host[:port]`，之後的網址都由它組出來（`{origin}/graphql`、`{origin}/api/books/{id}/package`）。

### 4.2 HTTP 用戶端

| 設定 | 值 | 理由 |
| --- | --- | --- |
| 轉址 | `redirect::Policy::none()`，3xx 當錯誤 | 不把 `Authorization` 送到別的位址 |
| 憑證 | 預設驗證（Schannel），**不提供忽略選項** | 合約資安要求 2 |
| 連線逾時 | 10 秒 | |
| GraphQL 總逾時 | 30 秒 | |
| 上傳總逾時 | 16 分鐘 | 伺服器 15 分鐘，留餘裕讓伺服器的 408 先回來 |
| User-Agent | `magazine-editor/<版本>` | 同 `fonts.rs` |

- GraphQL 一律 `POST` + JSON，查詢字串**逐字**照合約（`login`、`myBooks(first: 50, after: $after)`、`createBook`）。
- 送出前檢查 `expires_at`：已過期就直接回 `Unauthenticated`，不連線。
- `bookId` 來自 WebView：只接受 `[0-9A-Za-z-]`、長度 ≤ 64，否則 `InvalidInput`（避免路徑注入）。
- `readerUrl` 開啟前用同一套規則檢查（https，或允許的 http），不符就不開。

### 4.3 上傳 `upload_flipbook(bookId, request)`

1. `busy` 已是 true → `UploadInProgress`（本機也只允許一個上傳）。
2. `spawn_blocking`：`build_flipbook` → `package::prepare`（§6 U1、U2 決定後的白名單處理；zip 後 > 100 MB 回「翻頁書壓縮後 N MB，超過網站上限 100 MB」）→ `render_cover`。
3. multipart：`package`（`book.zip`、`application/zip`、串流 body，每 64 KB 一塊，每塊檢查 `cancel`、累計送出量，每 512 KB 發 `upload://progress { stage: "uploading", sent, total }`）；`cover`（`cover.png` 或 `cover.jpg`）。
4. 全部送完到收到回應之間發 `stage: "processing"`（伺服器在解壓、檢查）。
5. 取消：串流回傳錯誤，請求中止 → command 回 `Ok(None)`（取消不是錯誤）。伺服器在新內容寫入成功後才換掉舊內容，中斷不會留下半本書（步驟 6 實測確認）。
6. 成功：記下 `last_reader_url`，回 `{ pageCount, readerUrl, skippedImages }`。

### 4.4 封面 `render_cover`

- 複製 `request`，`document.pages` 只留第一頁，再 `compile_document`（不排整本，200 頁的文件也只花一頁的時間）。
- `pixel_per_pt = 600 / 頁寬`；有照片（`has_raster_photo`）用 JPEG，其他 PNG。超過 5 MB（正常不會）改 JPEG 再試一次，還是超過就不傳 `cover`、照樣上傳 zip。
- 封面來自 Typst 排版、書本身是 HTML，兩者有細微差異（全形標點擠壓，見 `progress.md` 已知問題），可以接受。

### 4.5 錯誤對應（實作合約的錯誤表）

| `UploadCode` | 來源 | 訊息 / 前端處理 |
| --- | --- | --- |
| `Unauthenticated` | GraphQL `UNAUTHENTICATED`、HTTP 401 | 在登入步驟：「帳號或密碼錯誤」。其他步驟：「登入已過期，請重新輸入密碼」→ 回到 ①，登入成功後**自動重試一次**原本的動作 |
| `TooManyRequests` | GraphQL `TOO_MANY_REQUESTS`（`extensions.retryAfter`）、HTTP 429 + `Retry-After` | 「請 N 分鐘後再試」，倒數期間停用按鈕 |
| `Forbidden` | `FORBIDDEN`、403 | 「你沒有權限上傳這本書」 |
| `NotFound` | 404 | 「這本書已被刪除」，重新載入書單 |
| `BadInput` | `BAD_USER_INPUT`、400 | 顯示伺服器 `message`（英文）前加「伺服器拒絕：」；zip 不合格代表匯出有 bug |
| `UploadInProgress` | 429 `UPLOAD_IN_PROGRESS` 或本機 `busy` | 「這個帳號正在上傳另一本書」 |
| `QuotaExceeded` | 413 `QUOTA_EXCEEDED` | 「出版社容量不足，請洽出版社管理者」+ `message` |
| `TooLarge` | 413 其他 | 「檔案超過網站上限」 |
| `Timeout` | 408、用戶端逾時 | 「上傳逾時，請檢查網路後再試」 |
| `Redirect` | 3xx | 「伺服器要求轉址，為了安全不跟隨；請確認網址（例如改用 https）」 |
| `Network` | 連不上、TLS 錯誤 | 「連不上伺服器」；TLS 失敗另說「憑證無效」 |
| `Server` | `INTERNAL_SERVER_ERROR`、5xx、body 不是 JSON（Nginx / Cloudflare 的 HTML） | 「伺服器發生錯誤（HTTP 502），請稍後再試」 |

## 5. 實作步驟

一次做一步，每步完成後停下來給使用者確認；commit 等使用者指示。後端已完成，以下全在 magazine-editor。

| 步驟 | 內容 | 驗收 |
| --- | --- | --- |
| **1** 純函式 | `Cargo.toml` features；`AppError::Upload`；`upload/server_url.rs`、`upload/response.rs` | `cargo test`：`https://x.com/path` 拒絕（有路徑）、`x.com` → `https://x.com`、`http://203.0.113.5` 拒絕、`http://192.168.1.10:8081` 通過且 `insecure`、`http://172.32.0.1` 拒絕、`https://user:pw@host` 拒絕、`http://localhost:8081` 通過；§4.5 每一列各一個分類測試（含 HTML body 的 502、缺 `Retry-After`）；`AppError::Upload` 的 JSON 形狀 |
| **2** 登入與書單 | `upload/client.rs`、`UploadState`、`upload_login` / `upload_logout` / `upload_session` / `upload_list_books` / `upload_create_book` | 單元：過期 token 不連線、`bookId` 驗證。連網（`#[ignore]`，環境變數 `UPLOAD_SERVER` / `UPLOAD_EMAIL` / `UPLOAD_PASSWORD`，對本機 web-magazine 後端）：登入成功、錯誤密碼得 `Unauthenticated`、`myBooks` 分頁、新建得 `DRAFT`、回傳值裡沒有 token |
| **3** 打包與封面 | `upload/package.rs`、`export/cover.rs`、`rasterize_at` | 用 `tests/fixtures/sample.magproj`：zip 根目錄有 `index.html`、`fb-page` 數 = 頁數、每個項目的副檔名都在伺服器白名單（依 U1、U2 的決定）；封面是 PNG / JPEG、寬 600 px、< 5 MB；PowerPoint 既有測試全過（`rasterize` 行為不變） |
| **4** 上傳 command | `upload_flipbook`、`upload_cancel`、`upload_open_reader`、進度 event | 連網（`#[ignore]`）：`sample.magproj` 新建書並上傳，回傳頁數正確、`readerUrl` 是 https 或允許的 http；同一本再上傳一次（覆蓋）成功；上傳中取消回 `None` |
| **5** 對話框與選單 | §3 的前端檔案；授權提醒；偏好 `upload` | `npm test`（`upload-flow.ts`、偏好讀取）、`npm run build`；瀏覽器模式（`ui-verify`）選單項目停用並顯示原因 |
| **6** 桌面版人工驗證 | 使用者用 `npm run tauri dev` 連本機後端 | 見下方清單 |
| **7** 文件 | 規則檔、CLAUDE.md、progress、docs | §7 |

**步驟 6 的人工驗證清單**

- [ ] 用「範本測試」專案新建書並上傳：網站「我的書」看到草稿、頁數正確、封面是第一頁；`readerUrl` 開得起來、字型正常。
- [ ] 覆蓋一本 `PUBLIC` 的書：對話框先提醒「讀者會立刻看到新內容」。
- [ ] ADMIN 帳號登入：看不到「新建」，可以覆蓋既有的書。
- [ ] 錯誤密碼 → 「帳號或密碼錯誤」；連續錯 10 次 → 倒數、按鈕停用。
- [ ] 上傳中按取消：網站上這本書維持原本內容，沒有半本。
- [ ] 兩個視窗 / 兩台電腦同帳號同時上傳 → 「這個帳號正在上傳另一本書」。
- [ ] 上傳中拔網路線 → 看得懂的錯誤，按鈕恢復可用。
- [ ] 填 `http://` 公網 IP → 被拒；填 `http://192.168.x.x` → 黃色「連線未加密」警告。
- [ ] 第一次連新主機：顯示「將傳送密碼到 **主機名稱**」並要求確認；第二次不再問。
- [ ] 關掉 App 再開：網址與 email 還在，密碼要重新輸入。

## 6. 待決事項（開始步驟 3 前要決定）

| # | 問題 | 選項 | 建議 |
| --- | --- | --- | --- |
| **U1** | 專案圖片可以是 **GIF**（`html/mod.rs` 的 `image_type` 收 gif），但伺服器白名單沒有 `gif`，上傳後圖片會不見 | A. 後端白名單加 `gif`（web-magazine 改一行 + 測試）　B. 上傳時把 GIF 轉成 PNG（只留第一格），改寫 `index.html` 的參照　C. 有 GIF 就擋下，請使用者換圖 | **A**：其他格式本來就原樣放，B 要動共用的頁面標記 |
| **U2** | `viewer/page-flip.LICENSE` 沒有副檔名，會被伺服器略過；但 page-flip 是 MIT，散布時要附授權文字 | A. 翻頁書改名為 `viewer/page-flip.LICENSE.txt`，後端白名單加 `txt`　B. 上傳時把授權文字放成 `viewer/page-flip.LICENSE.css`（整段註解）　C. 不處理 | **A**：本機匯出也一起改名，靜態主機也比較好處理；`flipbook/tests.rs`、`vendor/README.md` 跟著改 |

兩項都選 A 時，後端要先做（另開 web-magazine 的工作階段，同時更新 `桌面上傳API.md` 的白名單）；magazine-editor 的 `package::prepare` 仍要檢查白名單，把伺服器會略過的檔案列出來當成錯誤，避免以後新增格式時又默默不見。

## 7. 收尾要更新的文件

- 新規則檔 `.claude/rules/upload.md`（`paths`：`src-tauri/src/upload/**`、`src-tauri/src/commands/upload.rs`、`src/lib/upload/**`、`src/components/app/upload-dialog.tsx`）：合約位置、token 不出 Rust、轉址 / 憑證規則、錯誤 `code` 表。
- `CLAUDE.md`：技術表 `reqwest` 那一列改成「下載免費字型與上傳翻頁書」並列出新 feature；規則索引加一列。
- `.claude/rules/mcp.md`：「上傳不給 MCP；`run_command` 只會打開對話框，密碼要使用者自己輸入」。
- `.claude/rules/docs-layout.md`：加 `docs/13-Plans-電子書上傳/`。
- `docs/progress.md`：一行摘要（skill `iteration-end`）。
- 本文件：每步完成後在 §5 記日期與 commit。

## 8. 不做的事（沿用初版）

- 不做 MCP 上傳工具（密碼不能經過 AI 對話）；不上傳 `.magproj`；不在桌面程式改公開狀態、分類、簡介。
- 之後再說：裝置權杖（記住登入，存 Windows 憑證管理員）、上傳時設定簡介與分類、增量上傳與字型去重。
