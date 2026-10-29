# 專案進度

> **用途：** 交接用。開新對話時讀這份檔案，就知道目前在做什麼、還有什麼待辦。
> **維護規則（上限 6 000 字元）：**
> - 完成的工作只留**一行摘要 + commit + 計畫連結**；逐步紀錄寫在計畫文件（`*-實作.md`），不寫在這裡。
> - 超過上限時，把最舊的完成摘要搬到 `docs/progress-archive/<年-月>.md`（原文，不改寫）。
> - archive 只在需要查歷史時才讀。
> - repo 是 public：不要寫個人資訊、本機路徑或金鑰。

最後更新：2026-10-29（重構迭代 7 大檔拆分）

---

## 目前在做什麼

- **上傳翻頁書到網站＋匯出翻頁書 zip**（2026-10-29 起）：`docs/13-Plans-電子書上傳/5-desktop上傳-實作-V2.md`。步驟 1（網址驗證、回應分類、`AppError::Upload`，`602ed9f`）完成；步驟 2（登入與書單，`51e8c68`）完成；步驟 3（打包、封面、匯出翻頁書 zip）程式完成，等使用者在桌面版試匯出 zip。步驟 0（web-magazine 白名單加 `gif`、`txt`）還沒做。步驟 3 之前要先在 web-magazine 做步驟 0（白名單加 `gif`、`txt`）。
- **專案重構（降低 context 用量）全部完成**（2026-10-28～29）：迭代 0–6 見 `docs/12-Plans-重構/1-專案重構-實作.md` §8（根 CLAUDE.md 102.5k → 6.1k token、`.claude/rules/`、四個 skills）。迭代 7 大檔拆分見 `2-大檔拆分-實作.md`：`project/format/`、`export/render/tests.rs`、`lib/editor/reducer/`、`editor-reducer-*.test.ts`（`f059640`…`e024bee`），只搬程式、對外路徑不變、測試數不變。

## 最近完成（全部已 commit；`main` 比 origin 多 12 個 commit，沒有 push）

| 日期 | 項目 | commit | 計畫 |
|---|---|---|---|
| 10-22 | MCP `import_library_item`（匯入本機圖片到素材庫） | `e3ca24d` | `docs/11-Plans-匯入/1-McpServer沒有匯入圖片功能-實作.md` |
| 10-21 | 匯出 PowerPoint（簡報尺寸、每頁一張滿版圖片） | `c5df28a` `d480b91` | `docs/03-Plans-匯出檔案/03-匯出PowerPoint 檔案-實作.md` |
更早的（圖片框 v17、文件範本、段落縮排 v16…）、完整的決定表與逐項驗證清單：`docs/progress-archive/2026-10.md`。

## 待辦

### 使用者：桌面版（`npm run tauri dev`）人工驗證

Claude 只在瀏覽器模式 / 無頭 Edge / 疊圖比對驗證過。每項要點什麼，見 archive 的「待辦 → 使用者」或該功能的計畫文件。

- [ ] 匯出 PowerPoint（選單停用 / 可用、`.pptx` 用 PowerPoint 開）
- [ ] 圖形照片：經原生對話框的匯出
- [ ] 文件範本：用有專案字型與圖片的專案建立範本並新增專案
- [ ] 「專案管理」選單：Alt+P / Alt+W、MCP `project.library`
- [ ] 段落縮排、contenteditable 編輯框（注音、貼上、Ctrl+Z）
- [ ] 圖形庫、線條 / 箭頭（存檔重開、匯出 PDF / 翻頁書）
- [ ] 工具面板重構、畫布右鍵選單、文件色票
- [ ] 跨頁物件、單頁 / 雙頁、主頁與動態變數、頁面排序（Ctrl+Shift+PageUp / PageDown）
- [ ] 設定選單（Alt+S 是否自動聚焦第一項）、文字屬性、頁碼管理、偏好設定、多選與框選
- [ ] 檔案系統第一階段的對話框、型別重構、字型與頁籤列（字寬、安裝檔 +75 MB 可否接受）、調色板、匯出 PDF
- [ ] EPUB 產生器：`epub_preview` + epubcheck、閱讀器開啟
- [ ] （選做）翻頁書用 Firefox 開、上傳到網站空間

### 使用者：其他

- [ ] Claude Code `/mcp` 重新連線 magazine-editor（橋接程式重編過多次），`list_commands` 確認；之後可刪 `src-tauri/target/debug/magazine-mcp*.old*`
- [ ] 讀 `docs/01-overview.md`、`docs/02-architecture.md` 回答自我檢查題，照 02 的順序讀程式碼，確認後請 Claude 寫 `03-document-model.md`
- [ ] 決定 `.claude/` 要不要 commit

### Claude（等使用者指示再做）

- 中文換行：Konva `word` 換行放不下時退回最後一個空白、沒有避頭點；建議另開任務（要重做疊圖比對）
- 段落之後：段前 / 段後距、左右對齊（justify）、項目符號 / 編號清單
- 圖形庫之後：調整把手、有洞的圖形、每個圖形自己的文字區、SVG 轉圖形（`docs/06-Plans-繪圖/01-繪圖-實作.md` §0）
- `docs/` 學習路徑：依序寫 `03`～`07`，一次一份，每份更新 `docs/README.md`（各份要涵蓋的重點見 archive）
- 暫緩：EPUB 封面（重新開始前先討論）、檔案系統第三階段（重新開始時先問 archive 裡的四題）

## 仍有效的全域決定

（只列跨功能的；其他在計畫文件與 archive。）

- npm，不用 pnpm。`0-Task/` 不 commit；`docs/`、`docs/progress-archive/` 要 commit（repo 是 public）。
- `CLAUDE.md`（給 Claude 的規則）和 `docs/`（給人看的原因）分開、互相連結；`docs/` 是學習路徑，使用者看懂一份才寫下一份。
- `docs-website/` 用手寫 inline SVG（不用 Mermaid / CDN）。
- 排版與輸出以 EPUB 3 固定版面為主，PDF / 翻頁書 / PowerPoint 由同一份排版衍生；換行由編輯器量測。
- 匯出不要求先存檔、不自動開啟、沒有快捷鍵。
- App 偏好存 localStorage，不進專案檔、不進 SQLite。
- 字型隨 App 自備（靜態字重），不做 App 字型庫；授權只提醒不阻擋。

## 尚未驗證 / 已知問題

- **全形標點擠壓三端不一致**：畫布把相鄰全形標點擠成半寬，EPUB / 翻頁書與 Typst 行中不擠；Typst 另外擠行首 / 行尾括號。建議另開任務（`docs/05-Plans-字型/02-字型管理問題-實作.md` 步驟 7）。
- 型別檢查用 `npx tsc --noEmit -p tsconfig.json` 或 `npm run build`，**不要用 `tsc -b`**（會在根目錄產生檔案）。
- `cargo clippy` 有 1 個警告（`project/recovery.rs` 建議 `sort_by_key`），未處理。
- Konva 讀 asset protocol 的圖片沒設 `crossOrigin`：之後做「匯出 PNG」時畫布可能是 tainted。
- 圖形內文字一律外框內縮 4 pt，橢圓 / 星形靠邊的文字可能超出。
- Hook 還沒在實際對話中觸發過；根目錄 `README.md` 還是 Tauri 範本內容。
