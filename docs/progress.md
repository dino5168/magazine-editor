# 專案進度

> **用途:** 交接用。`CLAUDE.md` 已要求 Claude 開始工作前先讀這份檔案,開新對話時不用重新探索整個專案。
> **更新時機:** 每段工作結束前(或 `/clear` 之前),請 Claude 更新這份檔案。
> **注意:** repo 是 public,不要在這裡寫個人資訊、本機路徑或金鑰。

最後更新:2026-09-18

---

## 目前階段

**檔案系統第一、二階段完成(存檔 / 開啟、自動備份與當機復原),等待使用者手動測試第一階段的對話框流程。** 同時仍在理解追趕期:前端編輯器 v1 的程式碼超過了使用者目前的理解程度,正在透過 `docs/` 的學習文件追上。

- **建議:** 讀完 `04-state-and-undo.md` 之前,先不要新增功能。
- 檔案系統計畫共三階段(專案存取 → 自動備份 → 系統素材庫與範本),每個階段完成後等使用者確認才進行下一個。計畫檔放在 `0-Task/`(不在 repo)。

---

## 已完成

| 日期 | 項目 |
|---|---|
| 2026-09-17 | clone repo、`npm install` |
| 2026-09-17 | 移除 `package.json` 中被自動加入的 `packageManager: pnpm` 那行(維持使用 npm) |
| 2026-09-17 | 新增 `.claude/settings.json`:`permissions.deny` 禁止 Claude 讀取 `node_modules`、`dist`、`src-tauri/target`、`src-tauri/gen/schemas`、兩個 lock 檔 |
| 2026-09-17 | 新增 PostToolUse hook(`.claude/hooks/post-edit-check.ps1`):Claude 修改 `src/` 的 TS 檔後自動跑 `tsc` 和 `vitest related`,失敗時回饋給 Claude |
| 2026-09-17 | 建立 `docs/` 第一批:`README.md`、`01-overview.md`、`02-architecture.md` |
| 2026-09-17 | `CLAUDE.md` 加一行指向 `docs/` |
| 2026-09-17 | 建立 `docs/progress.md`,並在 `CLAUDE.md` 要求開始工作前先讀、完成後更新 |
| 2026-09-18 | 新增選單列(檔案 / 設定):`components/app/app-menubar.tsx`、`lib/menu/`。所有指令目前是佔位(只跳 toast),規則寫在 `CLAUDE.md`「選單列與指令」一節 |
| 2026-09-18 | 建立 `docs-website/`(HTML 版說明):`index.html`、`types.html`(`types.ts` 的型別關係圖、欄位說明、常見誤解、自我檢查題) |
| 2026-09-18 | `0-Task/` 加入 `.gitignore` |
| 2026-09-18 | **檔案系統第一階段**:專案資料夾(`project.magproj` + `assets/images/`)、新增 / 開啟 / 儲存 / 另存新檔、匯入圖片、未存檔提示、視窗標題、啟動時開啟上次的專案、只允許一個 App。規則寫在 `CLAUDE.md`「檔案系統」一節 |
| 2026-09-18 | `types.ts`:`UploadedImage` 改為 `AssetInfo`,`ImageElement.src` 改存專案相對路徑;`docs-website/types.html` 已同步 |
| 2026-09-18 | **檔案系統第二階段**:每 60 秒自動備份未存檔內容、啟動時詢問復原 / 捨棄、存檔 / 切換專案 / 正常關閉時刪除備份 |

---

## 已做的決定

| 決定 | 原因 |
|---|---|
| 套件管理器使用 **npm**,不用 pnpm | repo 已有 `package-lock.json` |
| `docs/` 採**學習路徑型**,分批撰寫 | 文件的速度也不能超過理解的速度;使用者確認看懂一份才寫下一份 |
| `CLAUDE.md` 和 `docs/` **分開,互相連結** | `CLAUDE.md` 是給 Claude 的規則;`docs/` 用白話解釋原因給人看。規則不搬走,避免 Claude 漏掉 |
| `docs/` **commit 到 repo**(public) | 跟著程式碼一起做版本管理 |
| `docs-website/`(HTML)負責「結構與關係」,`docs/`(Markdown)負責「為什麼這樣設計」,互相連結 | 圖比較適合用 HTML 呈現;兩邊分工可以避免重複撰寫。`docs/03-document-model.md` 會連到 `types.html`,不重畫型別圖 |
| `docs-website/` 的圖用**手寫 inline SVG**,不用 Mermaid | Mermaid 需要 CDN(離線打不開),或把約 3 MB 的函式庫放進 public repo;代價是 `types.ts` 改變時要手動更新圖(頁首標注對應的 commit) |
| `0-Task/` **不 commit** | 任務檔含本機絕對路徑,repo 是 public |
| 專案 = 使用者自選位置的資料夾,一個專案 = 一份多頁文件 | 使用者確認(2026-09-18) |
| 頁面用到的圖片**一律複製進專案**的 `assets/images/`,以內容 hash 命名 | 專案資料夾自給自足,可以搬移;之後 Typst 也能用相對路徑讀圖 |
| 檔案格式由 **Rust serde 型別**定義與驗證,TS 手寫對應,用共用 fixture 防止不一致 | 外部檔案不可信任;之後 Typst 匯出也在 Rust 端 |
| 開啟 / 另存對話框在 Rust 端呼叫,前端不傳路徑 | 縮小 WebView 能影響的檔案範圍 |
| 手動存檔 + 自動備份(備份是第二階段) | 使用者確認(2026-09-18) |
| 系統素材庫:內建(唯讀)+ 使用者可新增(第三階段) | 使用者確認(2026-09-18) |
| 「新增」產生一頁空白 A4;示範內容之後改成內建範本(第三階段) | 使用者確認(2026-09-18) |
| 復原提示只有「復原 / 捨棄」,沒有「稍後」 | 選稍後再開啟同一個專案並編輯時,下一次自動備份會覆蓋舊備份,等於悄悄丟掉 |
| 備份在正常關閉時由 Rust 的 `WindowEvent::Destroyed` 刪除 | 當機時不會觸發,不需要前端判斷「是否正常關閉」 |
| 主檔損壞時**自動**改用 `.bak` 開啟並提示(計畫原本是「詢問」) | 前端不持有路徑,詢問後再開需要多一輪往返;自動改用並標記未存檔,效果相同 |
| 使用者個人的 Claude Code 通用筆記**不放進 repo** | 和這個專案無關;只有專案相關的 hooks 說明會整理進 `07-dev-workflow.md` |

---

## 待辦

### 使用者

- [ ] 在 `npm run tauri dev` 手動測試檔案系統第一階段(Claude 無法操作系統對話框):
  - 另存新檔到中文路徑 → 關閉 App → 重新開啟,內容與圖片都在
  - 修改後標題出現 `●`;復原到存檔狀態後 `●` 消失
  - 有未存檔變更時按新增 / 開啟 / 關閉視窗,出現「儲存 / 不儲存 / 取消」
  - 把專案資料夾搬到別的位置,用「開啟」選 `project.magproj`,圖片正常顯示
  - 上傳面板拖放圖片、相片面板加入內建相片,存檔後重開仍在
- [ ] 讀 `docs/01-overview.md`,回答自我檢查題
- [ ] 讀 `docs/02-architecture.md`,回答自我檢查題
- [ ] 照 02 最後的閱讀順序,讀 1–7 號程式碼檔案
- [ ] 確認看懂後,請 Claude 寫 `03-document-model.md`
- [ ] 在 Claude Code 輸入 `/hooks` 一次(或重新啟動),讓 hook 設定生效
- [ ] 決定 `.claude/` 要不要 commit(和 `docs/` 同一個 commit 或分開)

### Claude(等使用者指示再做)

- [ ] 使用者讀完第一批後,commit `docs/` 和 `CLAUDE.md`
- [ ] 依序撰寫 `03` → `07`,每次一份
  - `03-document-model.md`:pt 單位、座標定義、為什麼不存 scale
  - `04-state-and-undo.md`:reducer、`commit`、復原/重做、`reconcileSelection`
  - `05-canvas-viewport.md`:捲動與縮放、兩個 `useLayoutEffect` 的順序
  - `06-rust-ipc.md`:SQLite、commands、`DbError`
  - `07-dev-workflow.md`:測試、hooks、`permissions.deny`、Claude Code 使用流程
- [ ] 每寫完一份,更新 `docs/README.md` 的進度表和這份檔案
- [ ] `02-architecture.md` 的目錄表與閱讀順序補上 `lib/menu/`、`app-menubar.tsx`、`lib/project/`、`src-tauri/src/project/`(`home-page.tsx` 也因此從約 60 行變長)
- [ ] `03-document-model.md` 要說明 `ImageElement.src` 是專案相對路徑,以及為什麼圖片要複製進專案
- [ ] `06-rust-ipc.md` 要涵蓋 `AppError`、`ProjectState`、「前端不傳路徑」的設計
- [ ] 使用者確認第一、二階段後,進行檔案系統第三階段(系統素材庫與範本)

---

## 尚未驗證 / 已知問題

- **Hook 還沒在實際對話中觸發過:** 腳本用模擬輸入測試過(通過、略過、型別錯誤三種情況都正確),但設定是在對話中途建立的,需要 `/hooks` 或重新啟動才會載入。
- **Hook 的「測試失敗」路徑沒有實際測過:** 現有測試都會通過;處理方式和型別檢查失敗相同。
- **`README.md`、`src-tauri/Cargo.toml` 在 `git status` 顯示已修改:** 內容沒有變,只是換行符號 (LF/CRLF) 不同,不用處理。
- **第二階段已用 Windows UI Automation 端對端驗證:** 啟動時出現復原提示 → 復原後標題為未存檔、內容正確 → 60 秒內覆寫備份 → 強制結束後備份與暫存資料夾保留 → 正常關閉並選「不儲存」後備份刪除 → 捨棄會刪除備份與暫存資料夾,並清除殘留的暫存資料夾。
- **檔案系統第一階段只做了自動化測試與啟動檢查:** Rust 24 個、vitest 61 個測試通過;實際啟動確認會建立未命名專案、資料庫升級到 v2、視窗標題正確、第二個 App 會立即結束。對話框、存檔、開啟、圖片顯示、關閉提示還沒有人工實測。
- **Konva 讀取 asset protocol 的圖片沒有設定 `crossOrigin`:** 畫布可能被標記為 tainted,之後實作「匯出 PNG」時要處理。
- **根目錄 `README.md` 還是 Tauri 範本內容:** 沒有專案說明,之後可以考慮改寫或指向 `docs/`。
