# CLAUDE.md

雜誌編輯軟體（`magazine-editor`）是 Windows 桌面應用程式，由 `../setup-tauri-reactv3.ps1` 產生專案骨架。

- 長期目標：**排版與輸出以 EPUB 3 固定版面（Fixed Layout）為主，PDF 是由同一份排版資料衍生的輸出**；Konva.js 做前端自由拖放編輯器（類似 Canva）。方向於 2026-09-22 由「Typst 負責排版與 PDF 輸出」調整而來：固定版面 EPUB 的渲染引擎和 Konva 量測文字同源，「所見即所得」從「盡量接近」變成「本來就一樣」。
- 目前階段：前端編輯器 v1（畫布、工具面板、文字 / 圖形 / 線條 / 圖片框、主頁、樣式與色票、專案字型、素材庫、文件範本）+ 檔案系統第一、二階段 + 匯出 PDF / 翻頁電子書 / PowerPoint + MCP（Claude Code 連線）與 Python SDK。
- 正在依 `0-Task/plan-epubv2.md` 重構成 EPUB 為主（共五個階段，階段 0 字型自備化已完成）。計畫：`../../3_系統設計文件/imp-ui-homepage.md`、`0-Task/plan-filesystem.md`、`0-Task/plan-export-pdf.md`、`0-Task/plan-epubv2.md`（後三份本機限定，不在 repo）。
- 每個功能的開發歷史（日期、檔案格式版本）：`docs/progress-archive/2026-10.md` 與各計畫文件；檔案格式各版的變更見 `.claude/rules/project-files.md`。
- Bundle identifier：`com.mycompany.magazineeditor`
- 視窗標題：`雜誌編輯軟體`（設定在 `src-tauri/tauri.conf.json`，預設最大化，最小尺寸 1024×640）
- 給人閱讀的說明文件在 `docs/`（依編號分批撰寫，進度見 `docs/README.md`）。修改架構或資料流程時，同步更新對應的文件。
  - 各計畫資料夾的內容：見 `.claude/rules/docs-layout.md`。
- **開始工作前先讀 `docs/progress.md`**（目前在做什麼、待辦、仍有效的決定、已知問題）；完成工作或做出決定後更新它（照檔頭的維護規則：一行摘要、上限 6 000 字元；收尾流程見 skill `iteration-end`）。**不要讀 `docs/progress-archive/`**（已完成的逐步紀錄），除非需要查歷史。
- `docs/00-需求分析/`：需求分析與可行性報告。**這裡的進度記在各報告自己的「進度紀錄」，不寫進 `docs/progress.md`**。
  - 各報告：見 `.claude/rules/docs-layout.md`。
- `docs-website/` 是 HTML 版說明（入口 `index.html`），負責「結構與關係」這類適合用圖說明的內容；`docs/` 負責「為什麼這樣設計」，兩邊互相連結、不重複撰寫。
  - 頁面必須自給自足：CSS 內嵌、手寫 inline SVG，不引用 CDN 或外部資源，用 `file://` 可以離線開啟。
  - `types.html` 對應 `src/lib/editor/types.ts`：**修改 `types.ts` 時要同步更新**圖、說明卡，以及頁首的對應 commit。
- `0-Task/` 是使用者的任務檔與計畫檔（已加入 `.gitignore`，內容含本機路徑，不可 commit）。

## Tech Stack

| 層 | 技術 |
|---|---|
| Desktop shell | Tauri v2（`protocol-asset` feature）· `tauri-plugin-opener` · `tauri-plugin-dialog`（只在 Rust 端呼叫）· `tauri-plugin-single-instance` |
| Frontend | React 19 · TypeScript ~6.0（strict）· Vite 8 |
| 編輯畫布 | `konva` 10 · `react-konva` 19 · `use-image` · `svgpath` **2.6.0**（MIT，沒有相依套件；只用在圖形庫：把 SVG path 換成 M / L / C / Z，`lib/editor/shape-path.ts`） |
| Styling | Tailwind CSS v4（`@tailwindcss/vite`，沒有 `tailwind.config`）· `tw-animate-css` |
| UI | shadcn/ui（style `radix-nova`、base color `neutral`、`radix-ui` 單一套件）· Lucide icons · sonner |
| 自動化 / MCP | `zod` 4（MCP 工具參數的 schema 與驗證，只用在 `src/lib/automation`）· Rust `rmcp` **`=3.5.1`**（官方 MCP SDK，只用在橋接程式 `magazine-mcp.exe`）· `tokio`（named pipe） |
| 測試 | vitest 5（node 環境，只測 `src/lib/**` 的純邏輯）· `cargo test`（`tempfile`）· 共用 fixture `tests/fixtures/sample.magproj`、`tests/fixtures/sample-library.json` |
| Backend | Rust 2021 · `rusqlite 0.40`（`bundled`）· `thiserror 2` · serde · `sha2` · `uuid` · `time` · `image 0.25`（素材縮圖；typst 本來就依賴同一版）· `roxmltree`（匯入時確認 SVG）· `comemo`（匯出前用 typst 的 SVG 解析檢查，版本跟 typst）· `reqwest` 0.13（只用在「下載免費字型」；tauri 本來就依賴同一版；TLS 用 Windows 的 Schannel：`native-tls`，不用 rustls（0.13 預設的 aws-lc-rs 在 Windows 要 cmake / NASM）） |
| 翻頁書 | StPageFlip（npm `page-flip` **2.0.7**，MIT，沒有相依套件）：**vendor** 在 `src-tauri/src/export/flipbook/vendor/`（`include_str!`，匯出時原樣複製進書裡，不從網路載入；版本、SHA-256 與升級方式見那裡的 `README.md`）。不在 `package.json` |
| 字型 | 自備靜態字型，放在 `fonts/`（黑體 Geist + Noto Sans TC、明體 Noto Serif TC、楷體霞鶩文楷 TC、圓體源泉圓體，各 Regular / Bold，皆為 SIL OFL）；畫面與匯出**共用同一批檔案** |
| PDF 排版 | 內嵌 `typst` / `typst-layout` / `typst-pdf` / `typst-render` **`=0.15.1`**（版本必須一致，Typst 的 crate API 每版都會變，所以鎖定 `=`；`typst-render` 把頁面畫成點陣圖：匯出 PowerPoint 與疊圖比對） |

## Commands

套件管理器是 **npm**（專案已有 `package-lock.json`，不要混用 pnpm）。

```powershell
npm run tauri dev      # 開發（Vite dev server :1420 + Tauri 視窗）
npm run dev            # 只跑前端（瀏覽器，沒有 Tauri IPC；編輯器可完整操作）
npm run build          # tsc + vite build（前端型別檢查 + 打包）
npm test               # vitest run（src/**/__tests__/*.test.ts）
npx vitest run src/lib/editor/__tests__/editor-reducer-pages.test.ts   # 只跑單一測試檔（`npx vitest run editor-reducer` 跑檔名含它的全部）
npm run tauri build    # 打包 Windows installer / .exe
cargo check --manifest-path src-tauri/Cargo.toml    # Rust 型別檢查
cargo test --manifest-path src-tauri/Cargo.toml     # Rust 測試
npx shadcn@4.21.0 add <component>                    # 新增 shadcn 元件（鎖定和 scaffold 相同的版本）

# 程式圖示：改了 src-tauri/app-icon.svg 之後重新產生 src-tauri/icons/，再刪掉多產生的 android/、ios/、64x64.png，
# 並把同一張 SVG 複製到 public/app-icon.svg（網頁 favicon）。圖示是編譯時內嵌的，cargo 不一定發現它變了：
# 要 clean 主程式再編，否則 tauri dev 的 exe / 視窗還是舊圖示
npx tauri icon src-tauri/app-icon.svg
cargo clean --manifest-path src-tauri/Cargo.toml -p magazine-editor

# MCP：橋接程式（`tauri dev` 只編主程式，改了 Rust 或工具清單後要自己編）與工具清單
cargo build --manifest-path src-tauri/Cargo.toml --bin magazine-mcp
npx vitest run mcp-tools -u      # 改了 src/lib/automation/tool-definitions.ts 後更新 src-tauri/mcp-tools.json
cd sdk/python; uv run python scripts/generate.py   # 接著由 mcp-tools.json 重新產生 Python SDK 的 magazine/_tools.py
cd tools; uv run pytest          # 開發用腳本（壓力測試、範本）的測試；用法見 tools/README.md
cd sdk/python; uv run pytest     # Python SDK（MCP 用戶端）的測試；Python ≥ 3.13（editable 的 .pth 含中文路徑）

# 匯出 PDF 的疊圖比對：把每頁算成 PNG（2 px/pt）放到 <dir>，用來對照畫布
$env:EXPORT_PREVIEW_DIR = "<dir>"
cargo test --manifest-path src-tauri/Cargo.toml export_preview -- --ignored
# 翻頁電子書寫到 <dir>/flipbook/（可加 EXPORT_REQUEST_JSON；FLIPBOOK_PAGES 指定 fixture 複製幾頁）
# 三個 preview（export_preview / epub_preview / flipbook_preview）都可以加 EXPORT_PROJECT_DIR=<專案資料夾>：讀那裡的圖片與專案字型，不用暫存資料夾
cargo test --manifest-path src-tauri/Cargo.toml flipbook_preview -- --ignored
# PowerPoint：pptx_preview 寫 <dir>/preview.pptx（沒給請求時是 fixture 改成 16:9）；slides_preview 寫每頁的圖片到 <dir>/slides/ 並印出時間
# 兩個都收 EXPORT_REQUEST_JSON / EXPORT_PROJECT_DIR；slides_preview 另收 FLIPBOOK_PAGES（複製成幾頁，量速度）
cargo test --manifest-path src-tauri/Cargo.toml pptx_preview -- --ignored
```

目前沒有設定 ESLint / Prettier。

## 目錄結構（頂層）

```
src/
  pages/home-page.tsx   # 版面與選單 handlers（Provider 順序：EditorProvider → LibraryProvider → ProjectProvider）
  components/           # app/（選單、對話框、settings/）、dock/、editor/（畫布、面板 panels/）、library/、templates/、ui/（shadcn，vendor）
  lib/                  # 不含 UI 的邏輯：editor/（文件模型與編輯器核心）、project/、library/、templates/、menu/、dock/、preferences/、export/、automation/（MCP）
src-tauri/
  src/                  # lib.rs、error.rs、db/、project/（檔案格式）、export/（PDF / EPUB / 翻頁書 / PPTX）、mcp/、commands/、bin/magazine-mcp.rs
  tauri.conf.json · capabilities/ · app-icon.svg · mcp-tools.json（產生的） · fonts-catalog.json
fonts/                  # 畫面與匯出共用的字型檔（fonts/README.md）
sdk/python/             # Python SDK（MCP 用戶端）
tools/                  # 開發用腳本（不打包）
tests/fixtures/         # Rust 與 vitest 共用的 fixture
docs/ · docs-website/   # 給人看的說明（見上）
```

逐檔說明：各主題的規則檔（下面的「規則索引」）裡的「檔案」一節；`lib/utils.ts` re-export `cn`（來自 `cn` 套件，不是 clsx + tailwind-merge）。

`@/*` alias 指向 `src/*`，`tsconfig.json` 的 paths 和 `vite.config.ts` 的 resolve.alias 兩處必須一致。

## 規則索引（`.claude/rules/`，碰到對應的檔案時自動載入）

還沒碰到檔案、但要做某個主題時，先讀對應的規則檔。

| 主題 | 規則檔 |
|---|---|
| 文件模型、reducer 狀態、新增物件類型 / geometry、檔案格式升級 | `editor-model.md` |
| 文字裝飾、行距字距、首尾置中、段落縮排、文字樣式 | `editor-text.md` |
| 圖形庫、圖片框、線條 | `editor-shapes-lines.md` |
| 頁碼、單頁 / 雙頁、頁面排序、主頁與動態變數 | `editor-pages.md` |
| 調色板、文件色票、專案字型 | `editor-color-fonts.md` |
| 畫布捲動縮放、多選框選、右鍵選單、工具、尺規、字型載入、快捷鍵 | `canvas-ui.md` |
| 設定對話框、偏好與頁面設定、選單列與指令、工具面板 | `app-shell.md` |
| 素材管理、文件範本、檔案系統（專案資料夾、存檔、備份、schema 各版） | `project-files.md` |
| 匯出 PDF / 翻頁電子書 / PowerPoint | `export.md` |
| TS ↔ Rust 必須一致的常數 | `cross-language.md` |
| MCP 與 Python SDK | `mcp.md` |
| Rust ↔ Frontend IPC、DB、CSP | `ipc.md` |
| docs/ 資料夾與需求分析報告 | `docs-layout.md` |

## Skills（`.claude/skills/`，多步驟流程）

| 什麼時候 | skill |
|---|---|
| 改會存進專案檔的欄位（提升 `SCHEMA_VERSION`） | `bump-file-format` |
| 新增 / 修改 MCP 工具（名稱、說明、參數） | `add-mcp-tool` |
| 在瀏覽器 / 桌面版實際操作驗證 UI（無頭 Edge + CDP，驅動程式 `cdp.mjs`） | `ui-verify` |
| 結束工作階段：更新 progress.md 與計畫文件、檢查大小、提醒 `/clear` | `iteration-end` |

## 不可移除的設定

- `tauri.conf.json` 的 `dangerousDisableAssetCspModification: ["style-src"]`：Radix / sonner 注入 `<style>`，Tauri 的 nonce 會讓 `'unsafe-inline'` 失效。
- `tauri.conf.json` 的 `dragDropEnabled: false`：否則 Windows 上收不到 HTML5 檔案拖放（素材匯入）。
- 載入外部資源前必須更新 CSP，否則會被靜默阻擋。細節見 `ipc.md`。

## 慣例

- `src/components/ui/` 由 shadcn CLI 管理，客製化時優先在外層包裝；直接修改會在 `add --overwrite` 時被覆蓋。
- 顏色使用 design tokens（`bg-background`、`bg-muted`、`text-muted-foreground`…）。Dark mode 用 `.dark` class 切換（`@custom-variant dark`），目前還沒有切換入口。
- Tailwind v4 的漸層寫法是 `bg-linear-to-*`（不是 `bg-gradient-to-*`）；動態 class 必須以完整字串出現在原始碼中，才會被掃描到。
- 錯誤處理使用 `Result<T>`（`{ data, error }`，定義在 `lib/editor/validation.ts`）或 toast，不要直接 throw 未型別化的錯誤。Context hook 在 Provider 外使用時才 throw。
- `shadcn` 必須留在 `dependencies`：`index.css` 會 `@import "shadcn/tailwind.css"`。
- TypeScript 6：**不要**在 `tsconfig.json` 加 `baseUrl`（已 deprecated，會讓 `tsc` 失敗）。
- `tsconfig` 開啟了 `noUnusedLocals` / `noUnusedParameters`，未使用的 import 會讓 `npm run build` 失敗。
- lucide-react 1.x 的 icon 名稱和舊版不同（例如 `Trash`、`TextAlignStart`，而不是 `Trash2`、`AlignLeft`），使用前先確認 `node_modules/lucide-react/dist/lucide-react.d.ts`。
- 用 PowerShell 5.1 讀寫含中文的檔案時，務必明確指定 UTF-8 編碼。
- Git：remote 是 `https://github.com/dino5168/magazine-editor`（**public**），預設分支 `main`。`.gitattributes` 設定 `text=auto`，repo 內一律以 LF 儲存。
- 本 repo 只包含 `magazine-editor/`。上層的設計文件（`../../3_系統設計文件/`）與 scaffold 腳本（`../setup-tauri-reactv3.ps1`）不在 repo 內。
