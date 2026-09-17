# 專案進度

> **用途:** 交接用。`CLAUDE.md` 已要求 Claude 開始工作前先讀這份檔案,開新對話時不用重新探索整個專案。
> **更新時機:** 每段工作結束前(或 `/clear` 之前),請 Claude 更新這份檔案。
> **注意:** repo 是 public,不要在這裡寫個人資訊、本機路徑或金鑰。

最後更新:2026-09-17

---

## 目前階段

**理解追趕期。** 前端編輯器 v1 的程式碼(約 3,500 行需要理解)超過了使用者目前的理解程度,正在透過 `docs/` 的學習文件追上。

- **建議:** 讀完 `04-state-and-undo.md` 之前,先不要新增功能。

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

---

## 已做的決定

| 決定 | 原因 |
|---|---|
| 套件管理器使用 **npm**,不用 pnpm | repo 已有 `package-lock.json` |
| `docs/` 採**學習路徑型**,分批撰寫 | 文件的速度也不能超過理解的速度;使用者確認看懂一份才寫下一份 |
| `CLAUDE.md` 和 `docs/` **分開,互相連結** | `CLAUDE.md` 是給 Claude 的規則;`docs/` 用白話解釋原因給人看。規則不搬走,避免 Claude 漏掉 |
| `docs/` **commit 到 repo**(public) | 跟著程式碼一起做版本管理 |
| 使用者個人的 Claude Code 通用筆記**不放進 repo** | 和這個專案無關;只有專案相關的 hooks 說明會整理進 `07-dev-workflow.md` |

---

## 待辦

### 使用者

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

---

## 尚未驗證 / 已知問題

- **Hook 還沒在實際對話中觸發過:** 腳本用模擬輸入測試過(通過、略過、型別錯誤三種情況都正確),但設定是在對話中途建立的,需要 `/hooks` 或重新啟動才會載入。
- **Hook 的「測試失敗」路徑沒有實際測過:** 現有測試都會通過;處理方式和型別檢查失敗相同。
- **`README.md`、`src-tauri/Cargo.toml` 在 `git status` 顯示已修改:** 內容沒有變,只是換行符號 (LF/CRLF) 不同,不用處理。
- **根目錄 `README.md` 還是 Tauri 範本內容:** 沒有專案說明,之後可以考慮改寫或指向 `docs/`。
