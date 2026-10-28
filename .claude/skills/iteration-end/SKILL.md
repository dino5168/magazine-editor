---
name: iteration-end
description: 結束一個工作階段 / 迭代 / 計畫步驟時的收尾：更新 docs/progress.md（一行摘要、上限 6 000 字元、超過就搬 archive）、更新計畫文件的狀態、檢查規則檔大小、確認沒有誤改與不該 commit 的檔案，最後提醒使用者 /clear。使用者說「收尾」「結束這個迭代」「更新進度」時使用。
---

# 工作階段收尾

一個迭代 = 一個工作階段。收尾後專案狀態必須一致（沒有「搬了一半」），下一個工作階段只讀 `docs/progress.md` 就能接手。

## 步驟

1. **確認變更範圍**：`git status --short`、`git diff --stat`。
   - 只該有這次工作的檔案；文件類的工作不應該動到程式檔。
   - `0-Task/` 不可 commit（含本機路徑）；任務檔（例如 `docs/NN-Plans-*/N-<名稱>.md`，不含 `-實作`）與 `Images/` 照使用者的習慣不 commit，`*-實作.md` 要 commit。
   - repo 是 **public**：progress、計畫、archive 不寫本機路徑、個人資訊、金鑰。
2. **驗證**（有改程式時）：`npx tsc --noEmit -p tsconfig.json`、`npm test`、`cargo test --manifest-path src-tauri/Cargo.toml`；失敗就照實寫進 progress 的已知問題，不要說完成。
3. **計畫文件**（`*-實作.md`）：該迭代 / 步驟的狀態改成完成，記日期、做了什麼、量測數字、commit（還沒 commit 就寫「未 commit」，commit 後再補）。逐步細節寫在這裡，**不寫進 progress.md**。
4. **`docs/progress.md`**（照檔頭的維護規則）：
   - 「目前在做什麼」：更新到下一步。完成的工作在「最近完成」只留**一行**：日期、項目、commit、計畫連結。
   - 待辦 / 已知問題：新增使用者要做的人工驗證、刪掉已解決的。
   - 「最後更新」改日期。
   - 量大小：`wc -m docs/progress.md`（或 PowerShell `(Get-Content docs/progress.md -Raw -Encoding utf8).Length`）。**超過 6 000 字元**時，把最舊的完成摘要**原文**搬到 `docs/progress-archive/<年-月>.md` 末尾（不改寫）。
5. **規則檔大小**（這次有改 `.claude/rules/` 或根 `CLAUDE.md` 時）：
   ```bash
   wc -m CLAUDE.md .claude/rules/*.md .claude/skills/*/SKILL.md
   ```
   規則檔目標 ≤ 5 000 字元（多主題的檔案可到約 9 000）；新功能的歷史、日期、實測數字寫在計畫文件，規則檔只加規則與陷阱。搬移或刪減時跑資訊沒遺失檢查：`node docs/12-Plans-重構/check-moved.mjs <基準 commit> <舊檔…>`。
6. **Commit 只在使用者要求時做**。要求時：在 `main` 上依專案習慣（`docs(...)` / `feat(...)` 等英文 conventional commit），結尾加 Co-Authored-By；commit 後把 hash 補進計畫文件與 progress.md，再用一個 `docs(progress): record … commit` 的 commit 記錄。不 push，除非使用者要求。
7. **回報並提醒**：用幾行說明完成了什麼、驗證結果、還沒做的；提醒使用者「可以 `/clear` 開始下一個工作階段」（開頭可先 `/context` 量 Memory files）。
