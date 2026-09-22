# 專案進度

> **用途:** 交接用。`CLAUDE.md` 已要求 Claude 開始工作前先讀這份檔案,開新對話時不用重新探索整個專案。
> **更新時機:** 每段工作結束前(或 `/clear` 之前),請 Claude 更新這份檔案。
> **注意:** repo 是 public,不要在這裡寫個人資訊、本機路徑或金鑰。

最後更新:2026-09-22

---

## 目前階段

**檔案系統第一、二階段與「匯出 PDF」已完成並推送到 GitHub(`main`)。檔案系統第三階段(系統素材庫與範本)由使用者決定暫緩(2026-09-18),不要主動開始。**

- 第一、二階段:存檔 / 開啟、自動備份與當機復原。第一階段的對話框流程(開啟 / 另存)還沒有正式的人工測試紀錄;使用者已經在實際使用(建立過自己的專案)。
- **匯出 PDF(2026-09-18 實作)**:內嵌 Typst 把所有頁面排版成 PDF,換行位置由編輯器量測後交給 Typst,規則寫在 `CLAUDE.md`「匯出 PDF」一節。**人工驗證(字型嵌入、中文可搜尋、疊圖比對)還沒有紀錄**,見下方「待辦 → 使用者」。
- 第三階段**暫緩**:使用者重新提出前不要實作。重新開始時,先問下方「待辦 → Claude」列的四個規格問題。
- 同時仍在理解追趕期:前端編輯器 v1 加上檔案系統的程式碼超過了使用者目前的理解程度,正在透過 `docs/` 的學習文件追上。**建議:** 讀完 `04-state-and-undo.md` 之前,先不要新增功能。
- 檔案系統計畫共三階段(專案存取 → 自動備份 → 系統素材庫與範本),每個階段完成後等使用者確認才進行下一個。計畫檔放在 `0-Task/plan-filesystem.md`(不在 repo)。

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
| 2026-09-18 | 第一階段程式碼 review(reuse / 簡化 / 效能 / 架構層級四個面向)並修正:project commands 全部改 async、`savedDocument` 移進 reducer(`selectIsDirty`)、關閉提示共用未存檔流程、圖片並行匯入等 |
| 2026-09-18 | **檔案系統第二階段**:每 60 秒自動備份未存檔內容、啟動時詢問復原 / 捨棄、存檔 / 切換專案 / 正常關閉時刪除備份 |
| 2026-09-18 | 以上全部推送到 GitHub(`9cecb41..58da274`) |
| 2026-09-18 | **匯出 PDF**(任務 `0-Task/03-Export PDF.md`、計畫 `0-Task/plan-export-pdf.md`):內嵌 `typst` 0.15.1、`src-tauri/src/export/`(模板 + `World` + 字型)、`src/lib/export/`(Konva 量測分行)、啟用選單與工具列的匯出按鈕 |
| 2026-09-22 | 檢核與 GitHub 的同步狀態,補上匯出 PDF 的文件(`CLAUDE.md` 新增「匯出 PDF」一節、Tech Stack、目錄結構;`docs/01-overview.md`、`docs/progress.md`) |

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
| Typst **以 crate 內嵌**,不用外部執行檔 / sidecar | 安裝檔大小差不多,但不必多管理一個外部程序;代價是 exe 變大(約 10–20 MB)。使用者確認(2026-09-18) |
| PDF 的**換行位置由編輯器決定**,Typst 只負責定位 | 所見即所得:畫面上看到的斷行就是 PDF 的斷行。代價是文字要逐行 `place`,而且前後端的行高常數必須一致 |
| 使用者的文字以 **`data.json` 資料**傳給固定模板,不拼接 `.typ` 字串 | 否則文件內容會被當成 Typst 程式碼執行(`#panic(...)` 之類) |
| 中文用**系統的微軟正黑體**,只內嵌 Geist | 微軟正黑體約 40 MB 而且不可轉散布;讀不到就明確失敗,不產生缺字的 PDF |
| 匯出**不要求先存檔**,匯出的是目前畫面的內容 | 使用者想先看 PDF 再決定要不要存;路徑仍然只留在 Rust 端 |
| 匯出後**不自動開啟** PDF,只在成功訊息上放「開啟」按鈕 | 使用者確認(2026-09-18) |
| 匯出**沒有快捷鍵** | 選單與工具列按鈕足夠;之後要加建議用 Ctrl+E(目前沒被占用) |

---

## 待辦

### 使用者

- [ ] 在 `npm run tauri dev` 手動測試檔案系統第一階段(Claude 無法操作系統對話框),有問題告訴 Claude:
  - 另存新檔到中文路徑 → 關閉 App → 重新開啟,內容與圖片都在
  - 修改後標題出現 `●`;復原到存檔狀態後 `●` 消失
  - 有未存檔變更時按新增 / 開啟 / 關閉視窗,出現「儲存 / 不儲存 / 取消」
  - 把專案資料夾搬到別的位置,用「開啟」選 `project.magproj`,圖片正常顯示
  - 上傳面板拖放圖片、相片面板加入內建相片,存檔後重開仍在
- [ ] 手動驗證**匯出 PDF**(Claude 無法操作系統對話框,也無法開 PDF 檢視器):
  - 在 Edge / Acrobat 開啟匯出的 PDF,確認字型已嵌入、中文可以選取、複製、搜尋
  - 旋轉過的物件、超出頁面的物件(應被紙張邊界裁掉)、多頁文件都正確
  - 文字的斷行位置和畫面一致,置中 / 靠右的文字沒有明顯偏移
  - 匯出到中文路徑;未命名專案匯出時預設位置是「文件\雜誌編輯軟體」
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
- [ ] `02-architecture.md` 的目錄表與閱讀順序補上 `lib/menu/`、`app-menubar.tsx`、`lib/project/`、`lib/export/`、`src-tauri/src/project/`、`src-tauri/src/export/`(`home-page.tsx` 也因此從約 60 行變長)
- [ ] 之後撰寫的文件要涵蓋匯出 PDF:`03-document-model.md` 說明 pt 單位和 Typst 的對應;`06-rust-ipc.md` 說明 `ExportWorld` 為什麼是沙箱、為什麼換行由前端量測
- [ ] `03-document-model.md` 要說明 `ImageElement.src` 是專案相對路徑,以及為什麼圖片要複製進專案
- [ ] `06-rust-ipc.md` 要涵蓋 `AppError`、`ProjectState`、「前端不傳路徑」的設計
- [ ] **檔案系統第三階段(系統素材庫與範本)——暫緩,等使用者重新提出**。重新開始時先問以下四題(括號內是建議):
  1. 套用範本時:**插入為新頁面**(在目前頁面之後,可復原)還是取代目前頁面?(建議:插入)
  2. 內建範本:把 8 個漸層佔位換成**3–4 個真正可套用的簡單版面**(含原本的示範內容),還是 8 個全部做成真的、或只放示範內容?(建議:3–4 個)
  3. 頁面背景圖片:**cover / contain 可切換**(預設 cover),還是只有 cover?(建議:可切換;需要 `Page.background` 改結構、`schemaVersion` 升為 2)
  4. **拆成兩批**(3a:素材庫機制、圖片、背景圖片、範本套用與另存為範本;3b:匯入其他專案的頁面、「最近開啟」選單),還是一次做完?(建議:拆兩批)

---

## 尚未驗證 / 已知問題

- **Hook 還沒在實際對話中觸發過:** 腳本用模擬輸入測試過(通過、略過、型別錯誤三種情況都正確),但設定是在對話中途建立的,需要 `/hooks` 或重新啟動才會載入。
- **Hook 的「測試失敗」路徑沒有實際測過:** 現有測試都會通過;處理方式和型別檢查失敗相同。
- **換行符號:** `.gitattributes` 設定 `text=auto`(repo 內一律 LF),Windows 工作目錄是 CRLF,所以 `git diff` 會出現 `LF will be replaced by CRLF` 的警告。這是正常的,不用處理。
- **第二階段已用 Windows UI Automation 端對端驗證:** 啟動時出現復原提示 → 復原後標題為未存檔、內容正確 → 60 秒內覆寫備份 → 強制結束後備份與暫存資料夾保留 → 正常關閉並選「不儲存」後備份刪除 → 捨棄會刪除備份與暫存資料夾,並清除殘留的暫存資料夾。
- **目前的自動化測試:** Rust 38 個(另有 1 個 `#[ignore]` 的疊圖預覽)、vitest 65 個全部通過(2026-09-22 重跑確認)。
- **匯出 PDF 只有自動化測試,沒有人工驗證紀錄:** Rust 測試涵蓋六種物件都能編譯成 PDF、頁數與頁面尺寸、圖片缺檔會略過、`World` 拒讀其他路徑、Typst 特殊字元原樣輸出、非法 layout 資料會被拒絕。字型嵌入、中文搜尋、和畫布的疊圖比對還需要使用者確認(見「待辦 → 使用者」)。
- **`typst` 版本鎖在 `=0.15.1`:** `typst` / `typst-layout` / `typst-pdf` / `typst-render` 四個版本必須一致,升級時 `World` trait 的 API 會變動,要一起改 `export/world.rs`。
- **檔案系統第一階段的對話框流程沒有正式人工測試紀錄:** 實際啟動確認過會建立未命名專案、資料庫升級到 v2、視窗標題正確、第二個 App 會立即結束;第二階段的 UI Automation 測試也順帶驗證了「正常關閉 → 未存檔提示 → 不儲存」。開啟 / 另存對話框、圖片在搬移後的顯示還需要使用者確認。
- **Konva 讀取 asset protocol 的圖片沒有設定 `crossOrigin`:** 畫布可能被標記為 tainted,之後實作「匯出 PNG」時要處理。
- **根目錄 `README.md` 還是 Tauri 範本內容:** 沒有專案說明,之後可以考慮改寫或指向 `docs/`。
