# 專案進度

> **用途：** 交接用。開新對話時讀這份檔案，就知道目前在做什麼、還有什麼待辦。
> **維護規則（上限 6 000 字元）：**
> - 完成的工作只留**一行摘要 + commit + 計畫連結**；逐步紀錄寫在計畫文件（`*-實作.md`），不寫在這裡。
> - 超過上限時，把最舊的完成摘要搬到 `docs/progress-archive/<年-月>.md`（原文，不改寫）。
> - archive 只在需要查歷史時才讀。
> - repo 是 public：不要寫個人資訊、本機路徑或金鑰。

最後更新：2026-11-02（多媒體：步驟 10 本機開檔說明層完成 `8fda375`）

---

## 目前在做什麼

- **多媒體（影片超連結 → 音訊）**：`docs/15-Pland-Mp4/1-加入hyperlink-Mp4-實作.md`。影片階段（步驟 1–9）完成、使用者測試 OK；步驟 10（本機開檔改成說明層，不自動開新視窗）完成（`8fda375`，待使用者雙擊 `index.html` 驗證）。**下一步：步驟 11**（App 內預覽翻頁書）。音訊改由下一項的計畫取代 A1–A3。**網站上的書內播放**：使用者會把 `docs/15-Pland-Mp4/2-web-magazine-書內播放-建議.md` 交給 web-magazine（伺服器與閱讀頁 iframe 的 sandbox / allow）。
- **音訊素材**：`docs/16-Plans-Audio/02-Audio-素材-實作.md`（2026-11-05 計畫定案：`media` 加 `source: file`（v19）、先只做 mp3、小喇叭按鈕、翻頁書播放列翻頁就停、顯示時間長度、「檔案 → 匯入 → 音訊...」）。步驟 1（試聽與時間長度、CSP `media-src`）`e25387f`，**待使用者在桌面版素材管理試聽 mp3、拖進度條**；步驟 2（v19）`5c264e6`；步驟 3（放到頁面、畫布喇叭、「音訊」分頁）`68986ad`；步驟 4（選單 + 工具列）`799872c`；步驟 5（PDF / PPTX）`05bae98`；步驟 6（翻頁書播放列）`03f8d39`；步驟 8 決定 EPUB 只畫圖示（未 commit）。**有音訊的書暫時不能上傳**：步驟 7 要先把 `docs/16-Plans-Audio/03-web-magazine-音訊上傳-建議.md` 交給 web-magazine，回報後本機加 `mp3`。下一步：步驟 9（MCP）。
- **上傳翻頁書到網站**：`docs/13-Plans-電子書上傳/5-desktop上傳-實作-V2.md`。剩下步驟 0（另開 web-magazine 工作階段：上傳白名單加 `gif`、`txt`，同步改 `桌面上傳API.md` 與測試；沒做之前 GIF 圖片與 `page-flip.LICENSE.txt` 上傳後會被網站略過）與步驟 6（使用者的人工驗證，見下方待辦）。規則：`.claude/rules/upload.md`。

## 最近完成（全部已 commit；11-01 的還沒 push）

| 日期 | 項目 | commit | 計畫 |
|---|---|---|---|
| 11-01 | YouTube 影片：v18 `media` 物件、插入對話框 / Ctrl+V / 拖曳、PDF 連結、翻頁書開新分頁與書內播放、素材庫 v2 影片、MCP `add_video` | `193766f`…`c419229` | `docs/15-Pland-Mp4/1-加入hyperlink-Mp4-實作.md` |
| 10-31 | MCP 看見畫面：文字回傳量測高度、`check_layout`（超出 / 重疊 / 超出頁面與邊界）、`render_page`（typst 畫成圖片） | `75ec560`…`c981dc0` | `docs/14-Plan-ClaudeCode看見畫面/1-看見畫面-實作.md` |
| 10-29 | 中文換行避頭點（`text-wrap.ts`，推出；中英混排不再退回空白；疊圖 19 行 ≤ 1 px） | `ce625c5` | `docs/05-Plans-字型/04-避頭點換行-實作.md` |
| 10-29 | 全形標點三端都不擠（畫布 `space-all` + 量字 canvas 放進 DOM、PDF 行首 / 行尾 `edge-guard`；疊圖 ≤ 1 px） | `b54a3e4` | `docs/05-Plans-字型/03-全形標點擠壓-實作.md` |
更早的（圖片框 v17、文件範本、段落縮排 v16…）、完整的決定表與逐項驗證清單：`docs/progress-archive/2026-10.md`。

## 待辦

### 使用者：桌面版（`npm run tauri dev`）人工驗證

Claude 只在瀏覽器模式 / 無頭 Edge / 疊圖比對驗證過。每項要點什麼，見 archive 的「待辦 → 使用者」或該功能的計畫文件。

- [ ] YouTube 影片（計畫各步驟的「待使用者驗證」）：插入對話框抓到封面與標題、從瀏覽器拖網址 / 分頁進畫布、畫布 Ctrl+V 貼網址、「在瀏覽器開啟」、存檔重開（v18）；PDF 點影片；匯出翻頁書用瀏覽器開點影片開新分頁；素材管理「影片連結」抓封面、存檔重開素材庫還在（`library.json` v2）；`/mcp` 重新連線後試 `add_video`
- [ ] 上傳到網站：計畫 §5「步驟 6 的人工驗證清單」（公開書提醒、ADMIN、取消、同時上傳、斷網、第一次連線）；匯出翻頁電子書（Zip）解壓後開 `index.html`
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

- [ ] Claude Code `/mcp` 重新連線 magazine-editor（橋接程式重編過多次，新工具 `add_video`），`list_commands` 確認；之後可刪 `src-tauri/target/debug/magazine-mcp*.old*`
- [ ] 讀 `docs/01-overview.md`、`docs/02-architecture.md` 回答自我檢查題，照 02 的順序讀程式碼，確認後請 Claude 寫 `03-document-model.md`
- [ ] 決定 `.claude/` 要不要 commit

### Claude（等使用者指示再做）

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

- 之後做「匯出 PNG」：Konva 的 `toDataURL` / `toCanvas` / `cache` 在不在 DOM 的 canvas 重畫，全形標點會被擠（`editor-text.md`）。
- 型別檢查用 `npx tsc --noEmit -p tsconfig.json` 或 `npm run build`，**不要用 `tsc -b`**（會在根目錄產生檔案）。
- `cargo clippy --all-targets` 剩 5 個警告，刻意保留：`format/elements.rs` 的 `Element` 變體大小差很多（`large_enum_variant`，要 Box 會動到全部匯出程式）、`format/tests.rs` 4 處 `type_complexity`（只在測試）。
- 圖形庫的圖形（雲、箭頭、對話框…）內文字還是排在外框內縮 4 pt，可能超出形狀（橢圓 / 多邊形 / 星形已改成形狀內的最大矩形）。
- Hook（`.claude/hooks/post-edit-check.ps1`，編輯後跑 `tsc`）2026-11-05 實際觸發過：連續 Edit 時中間狀態也會報錯（例如先加用法、後加 import），最後一次 Edit 通過即可。
