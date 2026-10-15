# 專案進度

> **用途:** 交接用。`CLAUDE.md` 已要求 Claude 開始工作前先讀這份檔案,開新對話時不用重新探索整個專案。
> **更新時機:** 每段工作結束前(或 `/clear` 之前),請 Claude 更新這份檔案。
> **注意:** repo 是 public,不要在這裡寫個人資訊、本機路徑或金鑰。

最後更新:2026-10-15(自由繪圖評估)

---

## 目前階段

- **自由繪圖（線條、箭頭、鉛筆）（2026-10-15，步驟 0–7 commit `c482485`（未推送）；步驟 8 起進行中）**：任務檔 `docs/06-Plans-繪圖/03-自由繪圖-需求分析。.md`，評估 `03-自由繪圖-需求分析-評估.md`。結論可行：新物件類型 `line`（端點定義），畫布與匯出共用 `line-path.ts` 的路徑，匯出時展開成虛擬圖形（同頁碼），Rust render / Typst / EPUB 不改。使用者決定：鉛筆這次一起做、直線 → 折線 → 曲線（逐點自動平滑）、點劃線 + 雙線（可選，只給直線 / 折線）、底部工具列「線條」（L）+「繪圖」面板常用組合、分叉箭頭做成圖形庫圖形。實作計畫 `03-自由繪圖-實作.md` 已完成（步驟 0 點劃線 → 1 模型 v15 → 2 路徑 → 3 畫布 → 4 端點把手 → 5 線條工具 → 6 屬性面板 → 7 匯出 → 8 折線 → 9 曲線 → 10 鉛筆 → 11 繪圖面板＋分叉箭頭 → 12 雙線（可選）→ 13 MCP 與文件）。**步驟 0 完成（點劃線，v15，還沒 commit）**：`Stroke.dash` 加 `dashDot`、`DashPattern` 改成一串長度、`STROKE_DASHES` 單一清單；疊圖 PDF / EPUB 容許 0.5 pt 時差異 0。**步驟 1 完成（`LineElement` 模型，v15，還沒 commit）**：TS / Rust 型別與驗證、reducer 檢查整條線、`createLineElement` / `describeLine`、所有 exhaustive switch 的最小實作（畫布暫不畫）、fixture 主頁 B 的箭頭線；vitest 974、cargo 203。**步驟 2 完成**（`line-path.ts` 路徑與箭頭、`line-geometry.ts` 長度 / 角度 / 正規化；箭頭比例長 4、寬 3.5 倍線寬，使用者確認；vitest 986）。**步驟 3 完成**（畫布畫線條：`LineBody` 三個 Path、細線點擊範圍 8 螢幕 px、線條不能旋轉 / 縮放只能移動、圖層 icon、示範文件加兩條線；無頭 Edge 10 項全過）。**步驟 4 完成**（端點把手 `line-handles.tsx`：拖曳中只畫預覽、放開一筆復原、Shift 45°、吸附格線；無頭 Edge 8 項全過）。**步驟 5 完成**（線條工具：`L` 鍵、底部工具列按鈕與「更多圖形與線條」選單、拖曳建立 / 點一下 150 pt / Shift 45° / 吸附 / Esc 取消；新線條 1 pt `#171717` 連「文字」色票；vitest 991、無頭 Edge 8 項全過）。**步驟 6 完成**（屬性面板「線條」分頁：顏色 / 線寬 / 線型、兩端箭頭與大小；「調整」的長度 / 角度；水平線填滿寬度 = 分隔線、垂直線填滿高度；vitest 995、無頭 Edge 9 項全過）。**步驟 7 完成**（匯出：`line-export.ts` 把線條換成 `x-line` / `x-line-heads` 路徑圖形，Rust 不改；疊圖 9 條線 PDF / EPUB 容許 0.5 pt 差異 0；vitest 1000、cargo 203）。「直線 + 箭頭」整條路完成，使用者要求先 commit（`c482485`，CLAUDE.md / progress 裡上一段「MCP 工具清單」的修改沒有放進去，仍未 commit）。**步驟 8 完成（還沒 commit）**（折線：逐點點擊、點最後一點或 Enter 完成、Backspace / Esc；雙擊線段加點；點把手選中再 Delete 刪點；尖角疊圖三端一致；vitest 1002、無頭 Edge 12 項全過）。**步驟 9 完成（還沒 commit）**（曲線：Catmull-Rom → 三次貝茲、箭頭沿切線、沿曲線縮短、曲線外框含鼓出部分；工具「曲線」逐點點擊；疊圖三端一致；vitest 1006、無頭 Edge 6 項全過）。**步驟 10 完成（還沒 commit）**（鉛筆：P 鍵、按住拖曳、放開簡化（RDP 1.5 px、上限 500 點）成平滑曲線；疊圖三端一致；vitest 1009、無頭 Edge 8 項全過）。**步驟 11 完成（還沒 commit）**（「繪圖」面板 12 種常用線條與箭頭、分隔線橫跨內容區；圖形庫加「分叉箭頭」（28 個）；vitest 1020、無頭 Edge 6 項全過）。**步驟 12 完成（還沒 commit）**（雙線：兩條各 1/3 線寬的平行線、尖角斜切、曲線不給；屬性面板開關、「雙線分隔線」；疊圖三端一致；vitest 1024、無頭 Edge 4 項全過）。**步驟 13 完成（還沒 commit）**（MCP：`add_line`、`update_element` 線條欄位、`get_element` 的 `pagePoints`；`CLAUDE.md`「線條」小節；vitest 1030）。**整個任務（步驟 0–13）完成**。待辦：橋接程式 `magazine-mcp.exe` 要在 Claude Code 中斷 MCP 後重編（`cargo build --bin magazine-mcp`）才看得到 `add_line`，之後做 MCP 實測；桌面版人工驗證（存檔 / 開檔帶線條、匯出 PDF / EPUB / 翻頁書）。

- **元素面板改成 Accordion（2026-10-15，四個步驟全部完成，commit `076bec6`（已推送））**：沒有任務檔（使用者需求：分類全部展開 → Accordion、單一展開）。計畫 `docs/06-Plans-繪圖/02-元素面板-Accordion-實作.md`（每一步的結果都在那裡）。用 shadcn `accordion`（`npx shadcn@4.21.0 add accordion`，底層 `radix-ui`，沒有新套件）`type="single" collapsible`。使用者決定：記住上次展開的分類（第一次「基本」；localStorage `magazine-editor.elementsPanel.v1`，`lib/dock/elements-panel-layout.ts`）、可以全部收起（也記住）、標題顯示數量、工具列「更多圖形」選單不改。滑過標題的底線是 shadcn 預設，保留。驗證：vitest 965、build 通過；無頭 Edge 10 項（單一展開、全部收起、重新載入後記得、鍵盤、動畫、點圖形加入）。**要 commit 的範圍**：`src/components/ui/accordion.tsx`（新）、`src/components/editor/panels/elements-panel.tsx`、`src/lib/dock/elements-panel-layout.ts`（新）與 `__tests__/elements-panel-layout.test.ts`（新）、`CLAUDE.md`、`docs/progress.md`、計畫 `02-元素面板-Accordion-實作.md`。

- **繪圖：圖形庫（仿 draw.io 的多樣圖形）（2026-10-15，步驟 0–9 全部完成，commit `6537598`（已推送）；桌面版人工驗證與 MCP 實測待做）**：任務檔 `docs/06-Plans-繪圖/01-繪圖.md`，評估 `01-繪圖-評估.md`，計畫 `01-繪圖-實作.md`（每一步的實測、決定與結果都在那裡）。27 個參數化的框型圖形（基本 8、方塊與流程 10、箭頭 4、標註與旗幟 5），加上原本 5 種共 32 個，在「元素」面板、底部工具列「更多圖形」（可在畫布拖曳建立）、屬性面板「換成」。使用者決定：圖形庫放元素面板（繪圖面板留給自由繪圖）、只做框型圖形（含細節線）、參數用屬性面板數字（調整把手另排）、定義自己寫參考 draw.io、線條 / 箭頭物件另開任務、連接線不做、第一批 27 個、細節線沒邊框時用填色加深 1 pt、要做「換成」。做法：檔案格式 v14 `ShapeGeometry` 加 `{ kind: "preset", preset, params }`（兩邊只驗證格式）；公式只寫在 TS（`shape-presets.ts` / `shape-path.ts`，`svgpath` 2.6.0 只用來把 SVG path 換成 M / L / C / Z）；匯出時前端把路徑放進 `ExportRequest.shapePaths`，Rust 驗證後畫成 `RenderKind::Path`（`PathSegment::Close`、多子路徑、細節線）；不認得的圖形畫虛線外框、匯出略過並提示；MCP `list_shapes`、`add_shape` / `update_element` 的 `shape` / `params`。和計畫不同處：略過的圖形由前端計數；工具列不加「打開元素面板」（選單列出全部圖形）；`update_element` 多了 `shape`（換成）；「資料儲存」改成不會原路折返的曲線。驗證：cargo 200、vitest 960、build 通過；無頭 Edge 各步驟實測；疊圖（一頁 27 個圖形）EPUB 和畫布只差一排反鋸齒與點線、PDF 外形相同、曲線上的點線約差 1 pt（已知限制）。橋接程式已重編（**要在 Claude Code `/mcp` 重新連線**；舊的 `src-tauri/target/debug/magazine-mcp.exe.old-20261015` 可刪）。**要 commit 的範圍**：`package.json` / `package-lock.json`（svgpath）、`src-tauri/`（`mcp-tools.json`、`src/export/{render,pdf,mod,template.typ,test_support}.rs`、`src/export/html/markup.rs`、`src/project/format.rs`）、`src/`（`lib/editor/`：`shape-path.ts` 新、`shape-presets.ts` 新、`types.ts`、`validation.ts`、`element-factory.ts`、`editor-reducer.ts`、`tools.ts`、`shape-geometry.ts` 與測試（`shape-path.test.ts` / `shape-presets.test.ts` 新）；`lib/export/`、`lib/automation/`、`lib/project/use-project-commands.ts` 與測試；`components/editor/`：`shape-preset-icon.tsx` 新、`shape-options.ts`、`canvas-elements.tsx`、`bottom-toolbar.tsx`、`number-field.tsx`、`use-canvas-create.ts`、`panels/{elements,layers,properties}-panel.tsx`）、`tests/fixtures/sample.magproj`、`CLAUDE.md`、`docs-website/types.html`、`docs/02-architecture.md`、`docs/progress.md`、`docs/06-Plans-繪圖/01-繪圖-評估.md`、`01-繪圖-實作.md`；任務檔 `01-繪圖.md` 與 `DrawIO.png` 照往例不 commit（待使用者確認）；根目錄 `README.md` 與 `docs/00-需求分析/` 的修改不在範圍內。

- **專案字型(2026-10-14,八個步驟全部完成,commit `b5640d4`(已推送);桌面版驗證 2026-10-14 使用者完成)**:沒有任務檔(來自討論「加入更多字型」,使用者選方案 C)。計畫 `docs/05-Plans-字型/01-專案字型-實作.md`(每一步的實測、決定與結果都在那裡)。使用者把有授權的 TTF / OTF 匯入專案(`assets/fonts/`,檔案格式 v13 `document.fonts`),「設定 → 文件 → 字型...」對話框管理(草稿、確定一次套用),字型選單分內建 / 專案兩區;畫布、PDF、EPUB、翻頁書用同一個檔案。使用者決定:一般必要、粗體可選;`fsType` 禁止嵌入 / 只能點陣圖拒絕、其他提醒;畫布用 asset URL 載入(CSP `font-src` 加 asset);Apple 裝置基線偏移列為已知限制、匯入時提示;MCP 有 `list_fonts` 與用名稱選用,不能匯入。做法:家族名稱一律 `project-font-<id>`(Typst FontBook 與 `FontFace` 都照這個名稱登記,不改字型檔)、沒有粗體檔時一般檔也登記成 700(不登記時 Chromium 會模擬加粗)、`@font-face` 寫畫布的 ascent / descent override。驗證:cargo 195、vitest 687、build 通過;headless Edge UI 測試約 30 項、疊圖比對(Calibri)PDF / 翻頁書和畫布每行 ≤ 0.5 pt。橋接程式已重編(**要在 Claude Code `/mcp` 重新連線**)。**要 commit 的範圍**:`src-tauri/`(`Cargo.toml`、`tauri.conf.json`、`mcp-tools.json`、`src/commands/{mod,fonts}.rs`、`src/lib.rs`、`src/project/{assets,fonts,format,io,mod}.rs`、`src/export/`(`document_fonts.rs` 新、`world.rs`、`pdf.rs`、`mod.rs`、`test_support.rs`、`html/`、`epub/`、`flipbook/`))、`src/`(`lib/editor/`:`types.ts`、`validation.ts`、`fonts.ts`、`use-fonts-ready.ts`、`project-fonts.ts` 新、`font-draft.ts` 新、`editor-reducer.ts`、`element-factory.ts` 與測試;`lib/project/`、`lib/automation/`、`lib/preferences/settings-pages.ts`、`lib/menu/__tests__`、`lib/export/__tests__`;`components/`:`settings/fonts-dialog.tsx` 新、`editor/manage-fonts.tsx` 新與其他修改;`pages/home-page.tsx`)、`tests/fixtures/sample.magproj`、`fonts/README.md`、`CLAUDE.md`、`docs-website/types.html`、`docs/progress.md`、計畫 `docs/05-Plans-字型/01-專案字型-實作.md`;根目錄 `README.md` 與 `docs/00-需求分析/` 的修改不在範圍內。

- **換程式的圖示(2026-10-14,四個步驟全部完成,使用者選 A 翻開的雜誌;commit `b27cc1d`(已推送);桌面版第一次確認圖示沒換:exe 沒重新編譯(圖示編譯時內嵌,cargo 沒發現變更),已 `cargo clean -p magazine-editor` 重編;桌面版驗證 2026-10-14 使用者完成(新圖示))**:任務檔 `docs/04-Plans-畫面顯示/01-換程式的圖示.md`,計畫 `01-換程式的圖示-實作.md`。把 Tauri 預設圖示換掉。使用者決定:來源用 SVG、三個不同概念(A 翻開的雜誌 / B 雜誌封面 / C 排版版面,靛藍色系)、網頁 favicon 一起換並刪掉 `public/tauri.svg`、`vite.svg`。候選在 `docs/04-Plans-畫面顯示/icons/`(`preview.html` 比較 16–128 px)。來源 `src-tauri/app-icon.svg` → `npx tauri icon` 產生 `src-tauri/icons/`(刪掉多出的 android / ios / 64x64,檔名和原本相同,`tauri.conf.json` 不變;ICO 含 16–256 px);favicon `public/app-icon.svg`。cargo check、build 通過。

- **匯出翻頁電子書修正 01(2026-10-14,三個步驟全部完成;步驟 1 完成(`viewer.js` 的 `layoutBook`:`#book` 剛好是書的大小並置中,另外清掉 page-flip 寫在 `#book` 上的 min-width / min-height / width: 100%;兩本參考書的直式封面貼著書背、橫式封面不上移,舊測試全過);步驟 2 完成(滾輪翻頁:只在翻頁區、往下 / 觸控板往左滑 = 下一頁、一次手勢只翻一頁、Ctrl+滾輪不攔;無頭 Edge 18 項);步驟 3 完成(`CLAUDE.md`、`docs/01`);commit `73ce5b4`(已推送);桌面版驗證 2026-10-14 使用者完成(重新匯出兩本書:滾輪翻頁、直式封面貼著書背、橫式封面不上移))**:任務檔 `docs/03-Plans-匯出檔案/02-匯出HTML5-翻頁電子書-修正01.md`,計畫 `02-匯出HTML5-翻頁電子書-修正01-實作.md`。滾輪翻頁、A4 直式翻封面時和書背有間隔、A4 橫式翻封面時先上移。原因:page-flip 的硬頁(封面 / 最後一頁)與 `flipNext` 假設書在翻頁區左上角,我們的 `#book` 佔滿畫面、書置中時有空位;修法是 `#book` 剛好是書的大小(不改 vendor 的 page-flip)。使用者確認:滾輪往下 = 下一頁、觸控板左右滑也翻;只在書上作用。三個步驟(版面 → 滾輪 → 文件)。

- **匯出 HTML5 翻頁電子書(2026-10-14,全部步驟完成(0–7,viewer 拆成 3 / 3a / 3b / 3c),commit `65cfc1f`(已推送);桌面版人工驗證 2026-10-14 使用者完成,Firefox 未測)**:任務檔 `docs/03-Plans-匯出檔案/01-匯出HTML5-翻頁電子書.md`,計畫 `docs/03-Plans-匯出檔案/01-匯出HTML5-翻頁電子書-實作.md`(每一步的結果與決定都在那裡)。「檔案 → 匯出為 → 翻頁電子書(HTML5)...」輸出一個自帶 viewer 的資料夾,瀏覽器開 `index.html` 翻頁。使用者確認:資料夾自帶 viewer、輸出資料夾(不做 ZIP)、頁面用真文字(重用 EPUB 的頁面標記)、viewer 基本款 + 縮圖列 + 放大檢視 + 目錄 / 搜尋、目錄只列改過名的頁面、尺寸不同頁面的留白是淺灰。做法:翻頁引擎 StPageFlip(`page-flip` 2.0.7,MIT)vendor 在 `src-tauri/src/export/flipbook/vendor/`;`export/epub/` 和格式無關的部分抽到 `export/html/`(EPUB 輸出位元組不變);`export_pdf_choose_path` 改名 `export_choose_path(format, …)`(`ExportFormat { Pdf, Flipbook }`)、新增 `export_flipbook`;寫入先寫隱藏暫存資料夾再 rename,絕不覆蓋有內容的資料夾。和計畫不同處:放大檢視用按鈕 / Z 鍵進入(雙擊會讓 page-flip 翻兩頁)、不做拖曳移動(和選取文字衝突)。驗證:cargo 179、vitest 661、build 通過;無頭 Edge / Chrome 各步驟共約 130 項;真實匯出內容 7 頁和 EPUB 逐像素相同、書裡位置 ≤ 0.03 pt;200 頁載入 0.47 秒、翻頁最長一格 28 ms、搜尋 15 ms。橋接程式已重編(**要在 Claude Code `/mcp` 重新連線**)。**要 commit 的範圍**:`src-tauri/src/export/`(`html/` 新、`epub/xhtml.rs` 以 `git mv` 移成 `html/markup.rs` 後重寫的新 `epub/xhtml.rs`、`epub/` 其他檔、`flipbook/` 新(含 `vendor/` 與 `viewer/`)、`mod.rs`)、`src-tauri/src/commands/export.rs`、`src-tauri/src/lib.rs`、`src-tauri/mcp-tools.json`、`src/lib/menu/commands.ts`、`menu-structure.ts`、`src/lib/project/project-api.ts`、`project-types.ts`、`use-project-commands.ts`、`src/pages/home-page.tsx`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、計畫 `01-匯出HTML5-翻頁電子書-實作.md`;任務檔 `01-匯出HTML5-翻頁電子書.md` 照往例不 commit(待使用者確認);根目錄 `README.md` 與 `docs/00-需求分析/` 的修改不在範圍內。

- **工具面板重構(2026-10-14,五個步驟全部完成,commit `1af8e75`(已推送);桌面版人工驗證待做,見「待辦 → 使用者」)**:任務檔 `docs/02-Plans-操作/02-工具面板-重構.md`,計畫 `docs/02-Plans-操作/02-工具面板-重構-實作.md`。使用者確認:預設與重設版面都只有左 [頁面]、右 [屬性];從選單打開的面板和同類別放一組,沒有就依類別順序另開一組;選單分三類(加入內容 ─ 屬性與樣式 ─ 頁面與圖層)只用分隔線;「相片」面板併入素材面板的「內建範例」(用到時才複製進專案、加入未分類);「繪圖」佔位照舊。步驟 1 `PANEL_CATEGORIES` 與選單分隔線;步驟 2 `DEFAULT_DOCK_LAYOUT` 與 `togglePanel` 依類別;步驟 3 `lib/library/bundled-photos.ts`、素材面板「內建範例」(拖曳共用 `Placeable`);步驟 4 刪「相片」面板(`photos-panel.tsx`)、舊版面裡的 `photos` 由 `parseDockLayout` 丟掉(新測試)、`mcp-tools.json` 重產(`run_command` 少 `panel.photos`)、橋接程式已重編(**要在 Claude Code `/mcp` 重新連線**);步驟 5 文件(`CLAUDE.md`、`docs/01`/`02`)。vitest 661、`npm run build`、`cargo test bundled_sample_photos` 通過;無頭 Edge 共 21 項。**要 commit 的範圍**:`lib/dock/panels.ts`、`dock-layout.ts` 與測試、`lib/menu/menu-structure.ts` 與測試、`lib/library/bundled-photos.ts`(新)、`components/editor/panels/library-panel.tsx`、`panels/index.ts`、`components/dock/panel-icons.ts`、刪除 `panels/photos-panel.tsx`、`src-tauri/mcp-tools.json`、`src-tauri/src/export/pdf.rs`(註解)、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、計畫 `02-工具面板-重構-實作.md`;任務檔 `02-工具面板-重構.md` 不 commit(使用者決定)。之後另排:左側只有頁面時的「＋」打開面板、選單的類別標題、管理視窗顯示內建範例、`upload` → `library` id 改名。

- **畫布物件的右鍵選單(2026-10-14,四個步驟全部完成,commit `52439d8`(已推送);桌面版人工驗證待做,見「待辦 → 使用者」)**:任務檔 `docs/02-Plans-操作/01-繪圖物件ContextMenu.md`,計畫 `docs/02-Plans-操作/01-繪圖物件ContextMenu-實作.md`。右鍵物件 = 先選取再開選單,內容是屬性面板「調整」分頁的圖層順序(4)與對齊內容區(填滿 2 + 對齊 6),一層攤平。使用者確認:圖形 / 文字 / 圖片都要;只做單選(多選時說明 + 停用);填滿照面板預設的寬高比(圖片保持);選單攤平;所有工具下都開。步驟 1 抽出共用(`lib/editor/layer-order.ts` 的 `canReorder` + 4 個測試、`components/editor/element-arrange.ts`;屬性面板與底部 `⋮` 改用,畫面不變);步驟 2 shadcn `context-menu` + `element-context-menu.tsx`(只包 Stage、有選取才開、`modal={false}`、關閉後焦點留在 body);步驟 3 無頭 Edge 51 項全過(含雙頁對頁、跨書背複本、編輯主頁、主頁內容、旋轉、多選、文字編輯框),程式未修改;步驟 4 文件(`CLAUDE.md` 新增「右鍵選單」一節、`docs/01`/`02`)。vitest 657、`npm run build` 通過。**要 commit 的範圍**:`layer-order.ts` 與測試、`editor-reducer.ts`、`element-arrange.ts`、`element-context-menu.tsx`、`components/ui/context-menu.tsx`、`editor-canvas.tsx`、`properties-panel.tsx`、`bottom-toolbar.tsx`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、計畫 `01-繪圖物件ContextMenu-實作.md`;任務檔 `01-繪圖物件ContextMenu.md` 不 commit(使用者決定)。之後另排:多選的對齊 / 圖層順序、剪下 / 複製 / 刪除項目、上移 / 下移快捷鍵、圖層面板右鍵。

- **「頁面」面板方塊 memo(2026-10-13,commit `c11c8f2`(已推送))**:200 頁 MCP 壓力測試發現每次修改文件都重畫所有頁面方塊(各帶 Radix 選單);`pages-panel.tsx` 的 `SheetTile` 改 `memo` + 共用穩定的 `TileActions`,開發版每次 MCP 呼叫 154 → 45 ms(204 頁)。另發現開發版 React 的 `performance.measure` 越用越慢(只影響 `tauri dev`)。報告與數據:`docs/00-需求分析/06-系統極限測試-報告.md`。release build 重跑 200 頁:672 次呼叫 7.9 秒全部成功、每次約 8 ms 不變慢、物件 667 / 667 全部保留。桌面版人工確認(2026-10-13,完成):頁面面板的選單(套用主頁 / 以…為基礎 / 改名 / 複製 / 刪除)照常。報告、任務檔 `05`/`06`/`07`、`story-*.txt`、`Story-Test.png` 與 `tools/` 已在 `c64fe9a`、`d4ebf8c`、`49ff7de` commit。
- **文件色票(2026-10-12,八個步驟全部完成,commit `50b957e`(已推送);`magazine-mcp.exe` 待重編並在 Claude Code 實測色票工具;桌面版人工驗證見「待辦 → 使用者」;**v12 存檔後舊版 App 無法開啟**)**:步驟 1 型別與檔案格式 v12、2 純邏輯 `swatches.ts`、3 reducer、4 調色板「文件色票」區、5「設定 → 文件 → 色票...」對話框、6 新文件預設色票、7 MCP 色票工具、8 文件(`CLAUDE.md` 改寫「調色板」並新增「文件色票」、`docs/01`/`02`、`03-系統設計優先順序建議.md` 進度紀錄、`Color-System.html` 狀態)。**要 commit 的範圍**:程式碼與測試(含新檔 `swatches.ts`、`swatch-draft.ts`、`document-swatches.tsx`、`swatches-dialog.tsx` 與三個測試檔)、`src-tauri/src/project/format.rs`、`export/`(`pdf.rs`、`render.rs`、`epub/tests.rs` 補欄位)、`tests/fixtures/`、`src-tauri/mcp-tools.json`、`docs-website/types.html`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、`docs/00-需求分析/03-系統設計優先順序建議.md`、`docs/Plans-Color-System/`、計畫 `17-文件色票-實作.md`;根目錄 `README.md` 的修改與 `tsconfig*.tsbuildinfo`、`vite.config.js` / `.d.ts`(誤用 `tsc -b` 的產物)不在範圍內。原本的說明:規劃 `docs/Plans-Color-System/01-色票系統規劃.md` → 評估 `Color-System.html`(PANTONE / ICC / Token 引擎這一輪不做,沿用文字樣式的「存實際值 + 連結 id」模式,匯出端不用改)→ 計畫 `docs/01-Plans-2026-10/17-文件色票-實作.md`(8 步)。使用者確認:只做文件色票(sRGB);Tailwind 保留為原色庫;色票不透明、透明度在使用處;自訂 hex 只在「設定 → 文件 → 色票...」對話框;同色不同連結算覆寫;刪除使用中的色票先問替換;新文件帶「文字 / 黑 / 白」且內建文字樣式連到「文字」;第一版不做即時預覽。取代 2026-09-30「只能從 Tailwind 選」的決定(步驟 8 改 `CLAUDE.md`)。
- **素材支援 SVG(2026-10-12,五個步驟全部完成,commit `a3c19a9`(已推送);桌面版人工驗證待做:匯入、存檔重開、匯出 PDF / EPUB 外觀)**:任務檔 `docs/01-Plans-2026-10/16-素材可以支援 SVG.md`(不 commit),計畫 `docs/01-Plans-2026-10/16-素材可以支援 SVG-實作.md`(要 commit)。現況:Rust 匯入、縮圖、PDF(Typst)本來就支援 SVG(內建相片就是 SVG),擋住的是前端白名單(`ALLOWED_IMAGE_TYPES`、`KIND_OF_EXTENSION`)與 EPUB 的 `image_type`。使用者確認:只有 viewBox 時用 viewBox 的寬高;原檔照存、Rust 改用 XML 解析確認根元素是 `<svg>`;SVG 內文字字型列為已知限制;素材卡片顯示「SVG」標籤。共五個步驟(1 實測 Typst / EPUB、2 Rust、3 前端、4 畫面驗證、5 文件)。步驟 1 完成(實測:Typst 讀不了的 SVG(壞 XML、寬高 0、連到絕對路徑或專案外的圖片)會讓整份 PDF 失敗 → 步驟 2 先用 Typst 的 `SvgImage::with_fonts_images` 逐張檢查、失敗的略過;SVG 文字用沒內嵌的字型(如 Arial)在 PDF 消失 → 模板畫圖片時給預設黑體當退回字型;`<img>`(畫布 / EPUB)不載入 SVG 連結的外部圖片、不執行 script)。步驟 2 完成(Rust:`assets.rs` 的 `is_svg` 用 roxmltree 確認根元素是 SVG namespace 的 `<svg>`(roxmltree 移到 dependencies);EPUB `image_type` 改用 `detect_extension`、加 `image/svg+xml`;PDF `drop_undrawable_svgs` 用 Typst 的 `SvgImage::with_fonts_images` 先檢查、讀不了的略過(新增 `comemo` 依賴,typst 用的同一版);模板給 SVG 文字退回字型 `data.svgFonts`;匯出略過圖片的提示文字改寫;新增 5 個測試,cargo 160)。步驟 3 完成(前端:`ALLOWED_IMAGE_TYPES` 加 `image/svg+xml`、`KIND_OF_EXTENSION` 加 `svg`;`image.ts` 的 `svgViewBoxSize` / `svgIntrinsicSize`:沒有絕對寬高時用 viewBox 的大小,匯入 SVG 時使用;素材卡片 `kindBadge` 顯示「SVG」;vitest 604)。步驟 4 完成(瀏覽器模式無頭 Edge 12 項:拖放匯入只收真的 SVG、SVG 標籤、viewBox-only 放成 viewBox 大小、放大後仍是向量、工具列「圖片」與面板「匯入...」接受 SVG、拖到畫布)。步驟 5 完成(`CLAUDE.md`、`docs/01`)。**要 commit 的範圍**:`src-tauri/Cargo.toml` / `Cargo.lock`、`assets.rs`、`export/`(`pdf.rs`、`world.rs`、`mod.rs`、`template.typ`、`epub/mod.rs`、`epub/tests.rs`)、前端 `validation.ts`、`library-files.ts`、`image.ts`、`use-library-import.ts`、`library-card.tsx`、`use-project-commands.ts`、`project-types.ts` 與測試(含新檔 `image.test.ts`)、`CLAUDE.md`、`docs/01`/`progress.md`、計畫 `16-素材可以支援 SVG-實作.md`;任務檔不 commit。

- **屬性 → 樣式 → 圓角四角分開(2026-10-12,七個步驟全部完成,commit `2ef73a9`(已推送);桌面版人工驗證待做:四角輸入、存檔重開 v11、匯出外觀;**v11 存檔後舊版 App 無法開啟**)**:任務檔 `docs/01-Plans-2026-10/15-屬性-樣式-圓角.md`(不 commit),計畫 `docs/01-Plans-2026-10/15-屬性-樣式-圓角-實作.md`(要 commit)。使用者確認:一個「圓角」欄位 + 切換鈕展開成照角位置排的 2 × 2 四欄位(四角不同時收起顯示「混合」);`cornerRadius` 四角一樣存數字、不同才存 `[左上, 右上, 右下, 左下]`(檔案格式 v11);MCP 一起做。畫布 Konva 本來就收陣列;PDF 有邊框 `rect_path` 改四半徑、無邊框 Typst radius 字典;EPUB CSS 四值 / SVG path。共七個步驟。步驟 1 完成(Konva 實測:順序 [左上, 右上, 右下, 左下]、每角各自夾到短邊一半(不是 CSS 的等比例)、路徑起點與單一半徑相同);步驟 2 完成(`lib/editor/corner-radius.ts`:四值展開、正規化、每角限制、改一角、驗證;`types.ts` 的 `CornerRadii` / `CornerRadius`;7 個測試,vitest 600);步驟 3 完成(TS `cornerRadius: CornerRadius`、`isCornerRadius` 移到 `validation.ts`;Rust `CornerRadius` untagged enum、`SCHEMA_VERSION` 11、`RenderRect.corner_radii` 每角夾到短邊一半;fixture 封面矩形 `[12, 12, 0, 4]`;畫布已畫四角,面板暫時顯示左上、PDF / EPUB 暫用最大角;cargo 153、vitest 600);步驟 4 完成(屬性面板 `CornerRadiusFields`:一個欄位 + `Scan` 切換鈕、2 × 2 照角的位置、四角不同時收起顯示「混合」;`NumberField` 加 `mixed`;無頭 Edge 11 項);步驟 5 完成(PDF:`render.rs` 共用的 `rounded_rect_path`(四半徑、起點同 Konva)、有邊框用它、無邊框 Typst `radius` 字典;疊圖 6 個矩形 0 個明顯不同像素;cargo 154);步驟 6 完成(EPUB:無邊框 CSS `border-radius` 四值、有邊框且四角不同用 SVG `<path>`(和 PDF 同一條 `rounded_rect_path`);疊圖 6 個矩形 0 個明顯不同像素;cargo 155);步驟 7 完成(MCP `update_element` 的 `cornerRadius` 收四個數字並實測;`CLAUDE.md`、`docs/01`、`docs/02`)。**要 commit 的範圍**:程式碼與測試(含 `template.typ`)、`tests/fixtures/sample.magproj`、`src-tauri/mcp-tools.json`、`docs-website/types.html`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、計畫 `15-屬性-樣式-圓角-實作.md`;任務檔不 commit。之後另排:畫布上拖曳圓角控制點、常用組合按鈕。

- **物件屬性增加填滿寬度 / 高度與對齊內容區(2026-10-12,三個步驟全部完成,commit `0812d36`(已推送);桌面版人工驗證待做:屬性面板的填滿、對齊、復原)**:任務檔 `docs/01-Plans-2026-10/14-物件屬性增加填滿寬度、高度.md`(不 commit),計畫 `docs/01-Plans-2026-10/14-物件屬性增加填滿寬度、高度-實作.md`(要 commit)。屬性面板「調整」分頁新增「對齊內容區」區塊:填滿寬度 / 高度(一次性動作、一筆復原;旋轉先歸零;照限制寬高比;文字只有寬度)+ 靠左 / 水平置中 / 靠右 / 靠上 / 垂直置中 / 靠下(只移動;旋轉的物件用旋轉後的外框;文字高度用 Konva 量測)。內容區沿用 `contentGuides().area`、大小沿用 `resizePatch`;不改檔案格式與 Rust。共三個步驟。步驟 1 完成(`geometry.ts` 抽出 `rotatedBoxBounds`;新檔 `lib/editor/content-align.ts`:`contentArea` / `fillContentPatch` / `alignContentPatch` / `fillContentDisabledReason`,12 個測試,vitest 593);步驟 2 完成(`properties-panel.tsx` 的 `ContentAlignSection`:填滿兩個按鈕 + 六個對齊 icon,文字高度用 `measureTextLayout`(變數先換成顯示值);無頭 Edge 20 項含雙頁右頁與編輯主頁);步驟 3 完成(`CLAUDE.md`、`docs/01`、`docs/02`)。**要 commit 的範圍**:`content-align.ts` 與測試、`geometry.ts`、`properties-panel.tsx`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、計畫 `14-物件屬性增加填滿寬度、高度-實作.md`;任務檔不 commit。之後另排:填滿到頁面(出血)、多選一起填滿 / 對齊。

- **文字對齊加入首尾置中(2026-10-12,八個步驟全部完成,commit `7adf23b`(已推送);桌面版人工驗證待做:屬性面板操作、雙擊編輯、存檔重開 v10、匯出外觀;**v10 存檔後舊版 App 無法開啟**)**:任務檔 `docs/01-Plans-2026-10/13-文字對齊加入首尾置中.md`(不 commit),計畫 `docs/01-Plans-2026-10/13-文字對齊加入首尾置中-實作.md`(要 commit)。`align` 新增 `"distributed"`(分散對齊,檔案格式 v10);換行沿用 Konva,畫布用自訂 `sceneFunc` 逐字放,匯出沿用字距的逐字路徑(每行各自的字距)。使用者確認:每一行都分散(含最後一行)、英文逐字元分散、單字行置中、這次不做左右對齊、按鈕「分散對齊(首尾置中)」。共八個步驟。步驟 1 完成(實測 Konva 10.5.0:`justify` 對中文無效;自訂 `sceneFunc` 可行;字寬要逐字加總);步驟 2 完成(`lib/editor/text-distribute.ts`:`splitGraphemes` / `distributeLine` / `distributeText`,8 個測試,vitest 576;`tsconfig` 的 `lib` 加 `ES2022.Intl`);步驟 3 完成(`TextAlign` / `TEXT_ALIGNS` / `konvaAlign`、Rust `Align::Distributed`、`SCHEMA_VERSION` 10、fixture「標題」樣式改 distributed、`types.html`、MCP schema 與 `mcp-tools.json`;vitest 580、cargo 149;**v10 存檔後舊版 App 無法開啟**;目前首尾置中畫成、匯出成靠左);步驟 4 完成(畫布:`lib/editor/distributed-text.ts` 的自訂 `sceneFunc` `drawDistributedText`,`canvas-elements.tsx` 經 `konvaAlignAttrs`;文字編輯框 / 樣式預覽用 `cssTextAlign`(CSS justify 近似);無頭 Edge 13 項;vitest 581;匯出仍靠左);步驟 5 完成(`style-controls.tsx` 第四個對齊按鈕「分散對齊(首尾置中)」;按鈕列改成三組 `ButtonGroup`,預設寬度一行放得下、圖形內文字的垂直對齊整組換行;無頭 Edge 13 項);步驟 6 完成(PDF:`TextLayout.lineGaps` 由 `measureTextLayout` 帶出,Rust `RenderText.line_gaps`、`line_start` 單字置中,`template.typ` 逐字放每行自己的間距;疊圖比對發現 Typst 會把剛好等於框寬的行尾字折到下一行,改成有 `lineStarts` 的行 box 不受框寬限制;72 字 ≤ 0.5 pt;cargo 151);步驟 7 完成(EPUB:每行 `letter-spacing` 用這行的間距、靠左放在起點、`white-space:nowrap`(字距的行也加);72 字左右 ≤ 0.5 pt,上下 1 pt 是既有的基線取整;cargo 152);步驟 8 完成(橋接程式重編;MCP 實測 add_text 帶 distributed → get_element → undo;`CLAUDE.md` 新增「首尾置中」一節、`docs/01` / `docs/02`)。**要 commit 的範圍**:程式碼與測試(含 `template.typ`、`tsconfig.json`)、`tests/fixtures/sample.magproj`、`src-tauri/mcp-tools.json`、`docs-website/types.html`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、計畫 `13-文字對齊加入首尾置中-實作.md`;任務檔 `13-文字對齊加入首尾置中.md` 不 commit。之後另排:左右對齊(justify,最後一行靠左)。

- **文字行距與字距(2026-10-11,全部步驟完成,commit `e1fc88e`(已推送);桌面版人工驗證待做:屬性面板操作、存檔重開 v9、匯出外觀;MCP 已在 Claude Code 實測。**要 commit 的範圍**:程式碼(前端與 Rust,含 `template.typ`)、`tests/fixtures/sample.magproj`、`default-text-styles.json`、`src-tauri/mcp-tools.json`、`docs-website/types.html`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、計畫 `docs/01-Plans-2026-10/12-新增文字屬性-行高與字距-實作.md`;任務檔 `12-新增文字屬性-行高與字距.md` 不 commit。**v9 存檔後舊版 App 無法開啟。** 經過:步驟 1、2、4 完成:步驟 2 併入檔案格式 v9,行距已接上畫布 / PDF / EPUB,新「內文」行距 1.5;步驟 4 畫布與編輯框畫出字距(經 `konvaTextStyle`);步驟 5 屬性面板與樣式對話框的「行距」「字距」欄位(頁碼沒有);步驟 6 PDF 字距:每行起點用編輯器行寬算、逐字元叢集放 `h(字距)`(Typst `tracking` 在換字型處少一個字距,不用),疊圖 15 段 ≤ 0.5 pt;步驟 7 EPUB 字距(CSS `letter-spacing` + 每行 `margin-left` 起點,疊圖 ≤ 0.5 pt);步驟 8 MCP 工具加 `lineHeight` / `letterSpacing`(已重編橋接程式,Claude Code 實測待做);下一步是步驟 9 文件;vitest 568、cargo 148)**:任務檔 `docs/01-Plans-2026-10/12-新增文字屬性-行高與字距.md`(不 commit),計畫 `docs/01-Plans-2026-10/12-新增文字屬性-行高與字距-實作.md`(要 commit)。`TextStyle` 加 `lineHeight`(倍數,舊檔 1.2)與 `letterSpacing`(1/1000 字,舊檔 0),經 `konvaTextStyle` 一次套到畫布 / 圖形內文字 / 量測;檔案格式 v9(Rust `TextSpacing` flatten,缺欄位用預設、不需升級步驟)。使用者確認:行距倍數、字距 ‰、內建「內文」改 1.5、頁碼這次不加。共九個步驟,步驟 1 先實測 Konva 字距(行尾字距、是否逐字畫失去 kerning),決定 PDF / EPUB 置中靠右的抵銷方式。

- **MCP 素材庫工具(2026-10-10,五個步驟全部完成,已推送)**:`list_library_items`(列出素材庫的資料夾與素材,唯讀)、`place_library_item`(把素材庫的圖片放到頁面 / 主頁,id 或名稱指定,只有 `width` 依原圖比例,尺寸規則同素材面板;文字檔、音訊、垃圾桶拒絕)。`ToolContext.library` 由 `getLibrary()` 每次呼叫時取。已在桌面版實測(`mcp-server.webp` 放到 Page-6)。任務檔 `docs/01-Plans-2026-10/10-mcpserver-測試文字.md`(不 commit),計畫 `docs/01-Plans-2026-10/11-mcpserver-addimage-實作.md`(要 commit)。注意:改了工具清單後,橋接程式被 Claude Code 佔用時要先改名再編,並在 `/mcp` 重新連線。

- **樣式系統(2026-10-10,八個步驟全部完成,commit `36d8f5c`(已推送);桌面版人工驗證待做:`lib/editor/style-sheet.ts` 純邏輯;檔案格式 v8(`textStyles`、`styleId`,TS / Rust / fixture / `types.html`);reducer `textStyle/*` 與 `element/applyTextStyle`;屬性面板「文字樣式」區塊(`text-style-link.tsx`,無頭 Edge 17 項);「樣式」工具面板與編輯對話框(`styles-panel.tsx`、`text-style-dialog.tsx`,無頭 Edge 25 項);「文字」面板列出文件樣式、文字工具連到「內文」、內建「內文」改靠左(使用者決定,無頭 Edge 11 項);MCP 樣式工具(`list_text_styles` / `add_text_style` / `update_text_style` / `delete_text_style` / `apply_text_style`,`add_text` / `add_shape` 的 `style`;已重編並在 Claude Code 實測);`CLAUDE.md`「文字樣式」一節、`docs/01` / `docs/02`;vitest 554、cargo 143;`CLAUDE.md` 的格式說明留到步驟 8)**:任務檔 `docs/01-Plans-2026-10/09-樣式系統.md`(不 commit),計畫 `docs/01-Plans-2026-10/09-樣式系統-實作.md`(要 commit)。現況:沒有樣式系統,文字物件把字型 / 字級 / 顏色存在自己身上,`TEXT_PRESETS` 只是建立時的初始值。使用者確認:物件照存實際值 + `styleId`,覆寫由比對得出(畫布與匯出不用改);只做「文字樣式」(字元樣式等富文字);文件色票另開任務檔;編輯樣式用對話框、確定才寫入。共八個步驟(純邏輯 → 檔案格式 v8 → reducer → 屬性面板 → 樣式面板 → 文字面板 → MCP → 文件)。

- **設計方式探討(2026-10-10,只討論、沒改程式)**:任務檔 `docs/01-Plans-2026-10/08-設計方式探討.md`,總結 `08-設計方式總結.md`。決定:「雙向建構」方向對,但本專案是固定版面,不另建自動排版引擎;下一步順序 = **樣式系統(段落 / 字元樣式、文件色票)** → 主頁上的欄格線 / 版心 → 範本 → 內容系統(富文字 → 文字框串接 / 溢排 → 文章匯入)。樣式的細節實作時再討論。素材管理只做人工驗證、不擴充。待確認:樣式系統與 EPUB 重構(`plan-epubv2` 階段 1 起)的先後。

- **軟體增加 MCP Server(2026-10-09,第一階段六個步驟全部完成;步驟 6 = 偏好設定開關(預設關)、TopBar 狀態圖示、`CLAUDE.md`「MCP」一節:步驟 1–3(查詢工具、App 端 named pipe、橋接程式 `magazine-mcp.exe`(rmcp =3.5.1)、`.mcp.json`)commit `f23f5f0`;步驟 4 選單指令工具 `list_commands` / `run_command`、步驟 5 編輯工具(新增文字 / 圖形、修改、刪除、頁面、文件名稱、復原 / 重做;reducer 的 `element/*` 加可選 `pageId`)、步驟 6 commit `fe856f3`(已推送到 GitHub `main`);Claude Code 本身的實測待使用者做;下一步是第二階段:隨新功能補工具;2026-10-10 第二階段:`add_master`(新增主頁,預設與規則同「新增主頁」對話框)、`set_page_master`(頁面套用 / 取消主頁,不切換畫面),commit `95a3105`(已推送到 GitHub `main`))**:任務檔 `docs/01-Plans-2026-10/07-軟體增加McpServer.md`(不 commit),計畫 `docs/01-Plans-2026-10/07-軟體增加McpServer-實作.md` 與流程圖 `Claude-McpServer-System.html`(要 commit)。Claude Code 以 stdio 啟動橋接程式 `magazine-mcp.exe`(Rust + `rmcp`),經 named pipe 轉給開著的 App,由前端的自動化指令層(zod 驗證)執行。使用者確認:「系統命令」= App 選單指令 + 編輯;MCP 預設關、偏好設定開;AI 修改直接套用、一次呼叫一筆復原;加入 zod 4。第一階段六個步驟。取代 `docs/01-Plans/eval-mcp-server.md` 的「HTTP 內嵌」建議。

- **工具面板停靠區改成 Tabs(2026-10-09,五個步驟全部完成,commit `b79ede6`,已推送;桌面版人工驗證待做)**:任務檔 `docs/01-Plans-2026-10/06-畫面調整-工具面板停靠區.md`(不 commit),計畫 `docs/01-Plans-2026-10/06-畫面調整-工具面板停靠區-實作.md`(要 commit)。參考 Affinity:一側由上到下好幾個群組,每組一排頁籤。使用者確認:多組堆疊;舊版面(v2)改用新預設、只留寬度;背景頁籤卸載;頁籤放不下時水平捲動;新預設 = 左 [範本 文字 相片 元素 素材 背景] / [頁面]、右 [屬性] / [圖層]。
  - 步驟 1(完成):`lib/dock` 的群組模型、純函式與測試、storage v3;UI 暫時每組只畫目前頁籤(還沒有頁籤列)。vitest 467 個。
  - 步驟 2(完成):頁籤列(`DockPanelGroup`:收合、切換、關閉、只掛目前頁籤),選單打開 / 關閉 / 重設照常。無頭 Edge 19 項。拖曳頁籤目前只能另成一組(併入別組在步驟 3)。
  - 步驟 3(完成):拖曳頁籤:指到頁籤列 = 併入(直線提示),其他地方 = 另成一組(橫線提示);跨側、空白側、Esc、原位不提示(`dropMovesPanel`)。vitest 469 個,無頭 Edge 15 項。
  - 步驟 4(完成):頁籤列水平捲動(滾輪、目前頁籤捲進畫面、拖曳靠邊自動捲動,和頁面頁籤列共用 `edgeScrollDelta`)、背景頁籤的關閉鈕不佔寬度、← → / Home / End、Affinity 式外觀(目前頁籤不加粗)。無頭 Edge 14 項,步驟 2 / 3 重跑全過。
  - 步驟 5(完成):`CLAUDE.md`(目前階段、目錄結構、「工具面板」一節改寫、頁面排序的自動捲動)、`docs/01`、`docs/02`。`docs-website` 沒有提到停靠區,不用改。
  - 已 commit:程式碼與測試、`CLAUDE.md`、`docs/01` / `docs/02` / `progress.md`、計畫檔 `docs/01-Plans-2026-10/06-畫面調整-工具面板停靠區-實作.md`;任務檔 `06-畫面調整-工具面板停靠區.md` 與 `Images/` 不 commit。
  - 桌面版人工驗證待做(`npm run tauri dev`):原本存過的版面會變成新預設、寬度保留;拖頁籤併組 / 拆組 / 跨側;觸控板橫向捲動頁籤列;「頁面」面板放在頁籤群組裡,兩區收合與拖曳高度照常。

- **工具面板提升為主選單(2026-10-09,三個步驟全部完成,commit `16c5681`,已推送)**:任務檔 `docs/01-Plans-2026-10/05-畫面調整-設定-工具面板.md`(不 commit),計畫 `docs/01-Plans-2026-10/05-畫面調整-設定-工具面板-實作.md`(要 commit)。「設定 → 工具面板 ▸」改成選單列的「工具面板(P)」,順序改為檔案 / 設定 / 視圖 / 工具面板。使用者確認:助記鍵 Alt+P;順序照任務檔(曾建議慣例的「檔案、視圖、工具面板、設定」)。只改 `MENUS` 資料,指令與 handler 不變。
  - 步驟 1(完成):`menu-structure.ts` 新增 `panels` 選單並調整順序,設定選單移除子選單;`menu-structure.test.ts` 改為檢查選單順序、工具面板選單內容、設定只剩文件 / 偏好設定 / 外觀、Alt+P。vitest 455 個,build 通過。
  - 步驟 2(完成):無頭 Edge 驗證選單列順序、Alt+P、取消勾選面板與重設版面、Alt+S / Alt+V / Alt+F。
  - 步驟 3(完成):`CLAUDE.md`(目前階段、目錄結構、「選單列與指令」、快捷鍵表)、`docs/01`。
  - 已 commit:程式碼與測試、`CLAUDE.md`、`docs/01`/`progress.md`、計畫檔;任務檔 `05-畫面調整-設定-工具面板.md` 與 `Images/` 不 commit。

- **格線、邊界參考線與對齊線的樣式設定(2026-10-08,八個步驟全部完成,commit `9661f87`,已推送)**:任務檔 `docs/01-Plans-2026-10/03-增加格線邊界線的設定.md`(不 commit),計畫 `docs/01-Plans-2026-10/03-增加格線邊界線的設定-實作.md`(要 commit)。使用者確認:格線 / 內容區對齊線 / 邊界參考線各自的顏色(含不透明度)、線型、粗細(螢幕 px);對齊線一組樣式(1/2 自動較明顯)且有自己的開關(對話框、視圖選單、TopBar);對話框即時預覽(不存檔的預覽值,取消還原);「設為預設」存我的預設、「恢復預設」回到我的預設、「原廠設定」回到原廠。共八個步驟,不改檔案格式。
  - 步驟 1(完成,畫面不變):`Preferences` 加 `showContentGuides`(舊紀錄 = `grid.visible`)、`lineStyles`、`lineStyleDefaults`,`FACTORY_LINE_STYLES`(原本的外觀,顏色取色票);`stroke.ts` 的 `guideLineAttrs` / `CONTENT_GUIDE_EMPHASIS`。vitest 384 個。
  - 步驟 2(完成):`page-guides.tsx` 三種線照偏好的樣式畫(新的 `ContentGuides`),`canvas-sheet.tsx` 對齊線改看 `showContentGuides`。無頭 Edge 12 項,原廠外觀與之前一致。過渡期:對齊線的開關要到步驟 3 / 5 才有 UI。
  - 步驟 3(完成):`VIEW_TOGGLES` 加 `contentGuides`(視圖選單「內容區對齊線」、TopBar `Crosshair` 按鈕,沒有快捷鍵)。vitest 385 個,無頭 Edge 9 項。
  - 步驟 4(完成,行為不變):`style-controls.tsx` 抽出 `LineStyleFields`(顏色 / 粗細 / 樣式,粗細欄位由 `LineWidthField` 設定),`StrokeFields` 改用它。無頭 Edge 11 項(屬性面板邊框、頁碼框線)。
  - 步驟 5(完成):「格線與參考線」對話框分格線 / 內容區對齊線 / 邊界參考線三區,各有顯示開關與顏色 / 粗細(px)/ 線型;內容區可捲動。無頭 Edge 12 項(含 640 px 高的視窗、Esc 先關選色器)。
  - 步驟 6(完成):即時預覽。`PreferencesProvider` 的不存檔預覽值(`useSetPreviewPreferences`);對話框靠右、遮罩透明不模糊(`SettingsDialog` 的 `seeThrough` + `index.css` 規則)。build 通過,無頭 Edge 12 項。
  - 步驟 7(完成):對話框頁尾左側「恢復預設」「設為預設」(立即存)「原廠設定」(`defaultLineStyles` / `sameLineStyles`、`SettingsDialogFooter` 的 `start`)。vitest 387 個,無頭 Edge 13 項。
  - 步驟 8(完成):`CLAUDE.md`(目錄結構、「偏好設定與頁面設定」的對話框 / 即時預覽 / 預設值 / 新的「線條樣式」、視圖選單)、`docs/01`。
  - 已 commit:程式碼(含 `index.css` 與測試)、`CLAUDE.md`、`docs/01`/`progress.md`、計畫檔 `docs/01-Plans-2026-10/03-增加格線邊界線的設定-實作.md`;任務檔 `03-增加格線邊界線的設定.md` 與 `Images/` 不 commit(使用者決定)。
- **視圖:格線與參考線的開關(2026-10-08,四個步驟全部完成,commit `bf2b202`,已推送;桌面版人工驗證待做)**:任務檔 `docs/01-Plans-2026-10/02-視圖.md`(不 commit),計畫 `docs/01-Plans-2026-10/02-視圖-實作.md`(要 commit)。使用者確認:「視圖」選單加格線(Ctrl+')、邊界參考線(Ctrl+;)、吸附格線(Ctrl+Shift+');TopBar 縮放左邊直接放三個切換鈕與間距下拉(間距 + 更多設定...),不另加 ToolBar。共四個步驟,開關的讀寫集中在 `VIEW_TOGGLES` 一張表,選單與 TopBar 共用。
  - 步驟 1(完成,畫面不變):`lib/preferences/view-toggles.ts`(`VIEW_TOGGLES`、`getViewToggle`),「尺規」改用它。vitest 376 個;尺規選單腳本 7 項重跑全過。
  - 步驟 2(完成):「視圖」選單加格線(Ctrl+')、邊界參考線(Ctrl+;)、吸附格線(Ctrl+Shift+'),指令由 `VIEW_TOGGLES` 產生(`viewCommandId`);勾選項目原本不畫快捷鍵,`app-menubar.tsx` 補上。vitest 376 個,無頭 Edge 16 項。
  - 步驟 3(完成):`components/editor/view-toggle-buttons.tsx`(TopBar 縮放左邊:格線 / 邊界參考線 / 吸附格線切換鈕 + 間距 Popover 與「更多設定...」);TopBar 用 container query,中欄窄時「匯出 PDF」只剩 icon,名稱才放得下。build 通過,無頭 Edge 16 項(含 1024 px 視窗)。
  - 步驟 4(完成):`CLAUDE.md`(目前階段、目錄結構、「偏好設定與頁面設定」的快速切換、選單列「視圖」、快捷鍵表)、`docs/01`。
  - 已 commit:程式碼、`CLAUDE.md`、`docs/01`/`progress.md`、計畫檔 `docs/01-Plans-2026-10/02-視圖-實作.md`;任務檔 `02-視圖.md` 與 `Images/` 不 commit(使用者決定)。桌面版人工驗證待做:Ctrl+' / Ctrl+; / Ctrl+Shift+' 在桌面版(含注音輸入法啟用時)是否正常。
- **修改新增專案流程(2026-10-08,五個步驟全部完成,commit `3213673`,已推送;桌面版人工驗證待做)**:任務檔 `docs/01-Plans-2026-10/01-修改新增專案流程.md`,計畫 `docs/01-Plans-2026-10/01-修改新增專案流程-實作.md`。「檔案 → 新增」先開「新增文件」對話框(左:紙張卡片分組;右:直橫 / 寬高 / 邊界,和頁面設定共用欄位),按「建立」才進入編輯。使用者確認:啟動時沒有上次的專案仍直接建立 A4;保留寬高輸入;瀏覽器模式維持「僅在桌面版可用」;不記憶上次的紙張。共五個步驟,不改 Rust 與檔案格式。
  - 步驟 1(完成):`createBlankDocument(setup = DEFAULT_NEW_PAGE_SETUP)`、`DEFAULT_NEW_PAGE_SETUP`(在 `element-factory.ts`,避免和 `page-setup.ts` 循環 import)、`page-setup.ts` 的 `PageSetup` 型別(頁面設定對話框改用它)。vitest 371 個。畫面不變。
  - 步驟 2(完成,行為不變):頁面設定的直橫 / 寬高 / 邊界 / 錯誤訊息抽成 `components/app/settings/page-setup-fields.tsx` 的 `PageSetupFields`(受控;紙張下拉與尺寸不一致提示由呼叫端以 `paperPicker` / `sizeNote` 傳入)。無頭 Edge 12 項。
  - 步驟 3(完成,還沒接到選單):`components/app/paper-preset-grid.tsx`(紙張卡片,分組、依比例的外框、跟著直橫轉、radio group 方向鍵)、`components/app/new-document-dialog.tsx`(`useNewDocumentDialog`,Promise 回傳 `PageSetup | null`)、`SettingsDialogFooter` 的 `applyLabel`、型別 `ChooseNewSetup`。用暫時的測試頁驗證(已刪),無頭 Edge 17 項。
  - 步驟 4(完成):「檔案 → 新增」= 未存檔提示 → 新增文件對話框(取消就結束)→ `createNew(setup)`;`useProjectCommands(confirmUnsaved, chooseNewSetup)`。啟動時照舊 A4。build 通過、vitest 371 個;瀏覽器模式無頭 Edge 5 項(「新增」仍只顯示僅在桌面版可用)。**桌面版人工驗證待做**:Ctrl+N 選 B5 橫式、邊界 20 → 建立後頁面設定顯示相同值;取消時文件不變;有未存檔時先問儲存。
  - 步驟 5(完成):`CLAUDE.md`(目前階段、目錄結構、「設定對話框」、「檔案系統」的新增專案)、`docs/01`。
  - 已 commit:程式碼、`CLAUDE.md`、`docs/01`/`progress.md`、計畫檔 `docs/01-Plans-2026-10/01-修改新增專案流程-實作.md`;任務檔 `01-修改新增專案流程.md` 與 `docs/01-Plans-2026-10/Images/` 不 commit(使用者決定)。
- **視圖 → 尺規(2026-10-07,五個步驟全部完成,已 commit 並推送;桌面版人工驗證待做)**:任務檔 `docs/Plans/2026-10-07-Ruler-尺規.md`(不 commit),計畫 `docs/Plans/imp-view-ruler.md`(要 commit)。選單列加「視圖(V) → 尺規」勾選項目,畫布上方 / 左方顯示 Affinity 式尺規。使用者確認:單位固定 mm;原點 = 目前頁左上角;一起做滑鼠位置與選取範圍標示;不加快捷鍵;預設顯示、淺色主題配色。共五個步驟(純邏輯 → 偏好與選單 → 畫尺規 → 標示 → 文件),不新增套件。
  - 步驟 1(完成):`lib/editor/ruler.ts`(`rulerScale` 依縮放選 1–2–5 級數的主刻度與細分、`rulerTicks` 產生可見刻度、`rulerOrigin` 目前頁左上角的螢幕位置)。vitest 364 個。畫面不變。
  - 步驟 2(完成):`Preferences.showRulers`(預設顯示,舊紀錄缺欄位讀成 true)、選單「視圖(V) → 尺規」(`view.rulers` 勾選項目,`home-page.tsx` 的 handler 切換偏好、`isChecked` 讀偏好)。vitest 366 個,無頭 Edge 7 項。畫布還沒有尺規。
  - 步驟 3(完成):`components/editor/canvas-ruler.tsx`(一般 2D canvas、依 devicePixelRatio、顏色字型讀 CSS tokens;垂直尺規數字轉 90°;角落 `mm`);`EditorCanvas` 外層改成 2×2 grid,尺規在捲動容器外(`ResizeObserver` 自動更新 viewport,縮放 / 捲動 / 座標換算不用改);編輯主頁的橫幅開尺規時下移。無頭 Edge 19 項。
  - 步驟 4(完成):尺規上的滑鼠位置標示線(pointermove 直接改 DOM,不 setState;離開畫布隱藏)與選取範圍色帶(`selectionSpans`,來自文件,拖曳中不動、放開後更新);顏色用選取框的靛藍色。vitest 369 個,無頭 Edge 15 項。
  - 步驟 5(完成):`CLAUDE.md` 新增「尺規」一節,同步目前階段、目錄結構、偏好(`showRulers`)、選單「視圖」與 Alt+V;`docs/01`(功能表、畫面對應圖)。
  - 之後要 commit 的範圍:程式碼、`CLAUDE.md`、`docs/01`/`progress.md`、`docs/Plans/imp-view-ruler.md`;任務檔 `docs/Plans/2026-10-07-Ruler-尺規.md` 與參考圖不 commit。桌面版人工驗證待做。
  - 之後另排:從尺規拖出參考線、改原點、切換單位、深色主題的尺規配色。
- **跨頁編輯(2026-10-07,六個步驟全部完成,commit `99c57d8`,已推送;桌面版人工驗證待做)**:任務檔 `docs/Plans/2026-10-07-跨頁編輯.md`(不 commit),計畫 `docs/Plans/imp-edit-crose-page.md`(要 commit)。問題:雙頁時左頁物件跨過書背的部分被右頁背景蓋住、匯出也被裁掉。使用者確認:做「跨頁物件」(物件仍屬一頁,跨過書背的部分在對頁也畫、也輸出;模型不變),圖片「在書背切開」之後另排任務;匯出一律依雜誌配對;放開時中心在另一頁就換頁(**推翻**單頁 / 雙頁計畫的「不換頁」);對頁上跨過來的部分可以點(切頁＋選取)。共六個步驟,先做匯出再做畫布。
  - 步驟 1(完成):`spilloverInto(pages, pageIndex)`(對頁跨過書背、要畫進這一頁的物件與位移;含旋轉;只看書背側;單獨一頁沒有)。vitest 349 個。畫面不變。
  - 步驟 2(完成):匯出時對頁加上跨過書背的物件複本(`spill:` id、變數用所屬頁的值);PDF 第 2、3 頁拼起來書背兩側像素一致,EPUB 也有。vitest 350 個。畫布還沒變。
  - 步驟 3(完成):畫布每頁畫對頁跨過來的複本(書背側裁切,單頁模式也畫);雙頁時自己的物件在書背處裁切,拖曳 / 縮放中目前頁不裁切且最後畫。無頭 Edge 13 項(取像素),舊測試 41 項重跑全過。
  - 步驟 4(完成):按對頁上跨過來的部分 = 到物件所屬頁並選取(`onPickElsewhere`);那一段不能直接拖曳(已知限制)。無頭 Edge 9 項,舊測試 54 項全過。
  - 步驟 5(完成):雙頁時放下的整組中心過書背就搬到對頁(reducer `element/moveToPage`,一筆復原;開吸附時對齊新頁格線);單頁模式不換頁。vitest 355 個,無頭 Edge 13 項,舊測試 63 項全過。
  - 步驟 6(完成):`CLAUDE.md`「單頁 / 雙頁」加「跨頁物件」與「放下時中心過書背就換頁」,同步狀態(`element/moveToPage`)、主頁一節的匯出、目錄結構;`docs/01`。
  - 之後要 commit 的範圍:程式碼、`CLAUDE.md`、`docs/01`/`progress.md`、`docs/Plans/imp-edit-crose-page.md`;任務檔 `docs/Plans/2026-10-07-跨頁編輯.md` 與參考圖不 commit。
  - 之後另排任務:圖片「在書背切開」成兩個物件(使用者選「先 A,之後再加」)。
- **單頁 / 雙頁模式(2026-10-07,六個步驟全部完成,commit `556b962`,已推送;桌面版人工驗證待做)**:任務檔 `docs/Plans/2026-10-07-雙頁編輯顯示.md`(不 commit),計畫 `docs/Plans/imp-page-switch.md`(要 commit)。「頁面」標題列中間加單頁 / 雙頁切換。使用者確認:畫布兩頁並排編輯、面板縮圖兩兩一列;第 1 頁單獨在右(2–3、4–5…);兩頁都能直接點選編輯、拖過書背不換頁;模式存這台電腦(`Preferences.pageView`)。共六個步驟,步驟 3 先重構畫布座標(行為不變)再加雙頁。
  - 步驟 1(完成):`lib/editor/spreads.ts`(跨頁配對、位移、`slotAt`)、`Preferences.pageView`。vitest 341 個。畫面不變。
  - 步驟 2(完成):「頁面」標題列中間的單頁 / 雙頁切換(`PageViewToggle`,寫入偏好);雙頁時縮圖兩兩一列(封面在右欄)。無頭 Edge 13 項。畫布還沒變。
  - 步驟 3(完成,行為不變):`canvasSheets` + `canvas-sheet.tsx`(每頁一個位移的 Group);畫布 Layer 改成跨頁座標,建立 / 框選 / 文字編輯框 / 捲動範圍 / 符合畫面 / 捲到選取經過頁面位移,吸附改以物件所在頁的 Group 為準。vitest 344 個;單頁回歸 12 項 + 舊測試 27 項全過。
  - 步驟 4(完成):雙頁模式畫整個跨頁(書背虛線、目前頁主色框、兩頁各自的主頁內容與頁碼);對頁畫成靜態,按下就切成目前頁。無頭 Edge 17 項 + 單頁回歸 12 項。
  - 步驟 5(完成):對頁物件一次點選(切頁＋選取;要拖曳需再按一次);建立工具建在按下處的那一頁(`pageAt` / `canvasSlotAt`),文字草稿跟著到那一頁。無頭 Edge 11 項,步驟 4(17)與單頁回歸(12)重跑全過。
  - 步驟 6(完成):`CLAUDE.md` 新增「單頁 / 雙頁」一節,同步「畫布捲動與縮放」(跨頁座標)、偏好設定(`pageView`)、吸附、目錄結構;`docs/01`/`02`。
  - 之後要 commit 的範圍:程式碼、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、`docs/Plans/imp-page-switch.md`;任務檔 `docs/Plans/2026-10-07-雙頁編輯顯示.md` 與參考圖不 commit。
- **「頁面」面板調整(2026-10-07,五個步驟全部完成,commit `6900765`,已推送)**:任務檔 `docs/Plans/2026-10-07-Master頁面調整.md`(不 commit),計畫 `docs/Plans/imp-fix-master.md`(要 commit)。「主頁」「頁面」兩區各自收合、按住「頁面」標題列拖曳調整兩區高度。使用者確認:收合與高度記在這台電腦(localStorage);「頁面」收合時標題列貼在面板底部。共五個步驟,重用 `startPointerDrag`、`getBrowserStorage`、shadcn `ScrollArea`,不加 resizable 套件。
  - 步驟 1(完成):`lib/dock/pages-panel-layout.ts`(收合、拖曳換算與最小高度、比例、parse、localStorage 讀寫)。vitest 334 個。畫面不變。
  - 步驟 2(完成):`PanelDefinition.scroll: "self"`(只有 `pages`)、`DockPanel` 對它不包捲動區;共用的捲動區抽成 `DockScrollArea`。無頭 Edge 9 項,畫面不變。
  - 步驟 3(完成):兩區標題列各有收合鈕、內容各自捲動,高度用 flex-grow 依比例分配(不量測);收起的「頁面」標題列貼底;狀態存 localStorage。刪掉用不到的 `sectionHeights`。vitest 333 個,無頭 Edge 12 項。
  - 步驟 4(完成):`use-section-resize.ts`(按住「頁面」標題列拖曳、拖曳中直接改 DOM、放開才存、Esc 取消、雙擊還原、↑ / ↓);`startPointerDrag` 加可選 `cursor`;收合鈕縮成只有箭頭,標題文字可以拖。無頭 Edge 16 項。
  - 步驟 5(完成):`CLAUDE.md`(「頁面」面板、工具面板的 `scroll: "self"`、目錄結構)、`docs/01`。
  - 之後要 commit 的範圍:程式碼、`CLAUDE.md`、`docs/01`/`progress.md`、`docs/Plans/imp-fix-master.md`;任務檔 `docs/Plans/2026-10-07-Master頁面調整.md` 與參考圖不 commit。
- **主頁與動態變數(2026-10-07,八個步驟全部完成,commit `b9ed0c3`,已推送;桌面版人工驗證待做)**:任務檔 `docs/01-Plans/07-階層式主頁.md`(不 commit),計畫 `docs/Plans/imp-master-pages.md`(要 commit)。仿 Affinity:主頁(可以主頁為基礎形成階層)、`{頁碼}` 等動態變數、新增頁面 / 新增主頁對話框;只做單頁。使用者確認:新增「頁面」工具面板(主頁 + 頁面,真縮圖,頁籤列保留,**取代 2026-10-06「不要頁面面板」的決定**);`{頁碼}` 跟頁碼規則;刪除主頁時接到父主頁;背景不繼承。共八個步驟,每步做完等使用者說「繼續」;步驟 2(檔案格式 v7)必須在任何 UI 能產生主頁之前完成。
  - 步驟 1(完成):模型(`Sheet` / `MasterPage` / `masterId` / `masters`)、`lib/editor/master-pages.ts`、reducer 七個新 action、`selectActivePage` 回傳 `Sheet`;Rust 只先加 serde 欄位(預設空),驗證與 v7 在步驟 2。vitest 303 個、Rust 97 個通過。畫面不變。
  - 步驟 2(完成):Rust `SCHEMA_VERSION` 7、主頁驗證(`validate_master_graph`)、`referenced_assets` 包含主頁圖片(否則開檔清理會刪掉)、fixture 兩層主頁、`types.html`。vitest 304 個、Rust 100 個通過。畫面不變。**v7 存檔後舊版 App 無法開啟。**
  - 步驟 3(完成):畫布畫出主頁內容(`StaticElement`,不能選取)、編輯主頁模式(`master-edit-banner.tsx`、`lastPageId` / 「回到頁面」、頁籤列與頁碼欄的狀態)、字型含主頁。vitest 306 個,無頭 Edge 15 項。還沒有 UI 能建立主頁(步驟 4)。
  - 步驟 4(完成):「頁面」工具面板(`pages-panel.tsx`,預設左側範本下方):主頁 / 頁面兩區、真縮圖(`sheet-thumbnail.tsx`,捲進畫面才建立、memo)、新增 / 複製 / 刪除、雙擊改名、`⋮` / 右鍵選單(套用主頁、以…為基礎)。無頭 Edge 17 項。新增仍是直接加(步驟 5 改對話框)。
  - 步驟 5(完成):「新增頁面」(主頁 / 頁數 / 之前・之後 / 頁)與「新增主頁」(名稱 / 以…為基礎)對話框(`page-dialogs.tsx`、純邏輯 `add-pages.ts`);頁籤列「+」、「插入頁面...」、面板按鈕都開對話框。vitest 315 個,無頭 Edge 15 項。
  - 步驟 6(完成):動態變數 `{頁碼}` `{總頁數}` `{文件名稱}` `{頁面名稱}`(`variables.ts`;`{頁碼}` 依頁碼規則,`displayedPageNumber`);畫布與頁面縮圖換成各頁的值、主頁照原文、編輯框是原文;屬性面板「插入變數」。vitest 322 個,無頭 Edge 12 項。
  - 步驟 8(完成):`CLAUDE.md` 新增「主頁與動態變數」一節並同步目錄結構、文件模型、狀態、頁面排序、檔案系統(v7)、匯出;`docs/01`/`02`。
  - 之後要 commit 的範圍:程式碼(前端與 Rust)、`tests/fixtures/sample.magproj`、`docs-website/types.html`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、`docs/Plans/imp-master-pages.md`;任務檔 `docs/01-Plans/07-階層式主頁.md` 與參考截圖不 commit。**v7 存檔後舊版 App 無法開啟。**
  - 步驟 7(完成):`buildExportRequest` 把主頁內容展開到每頁最下面並換變數(id 用 `master:<頁序>:<n>`,因為 Rust 限制 id ≤ 64 字),Rust 不用改。vitest 324 個;用瀏覽器擷取的真實匯出內容跑 `export_preview` / `epub_preview`,PDF 與畫布一致、EPUB 各頁頁尾數字正確。
- **頁面排序(2026-10-06,四個步驟全部完成,commit `f3ec788`,已推送;桌面版人工驗證待做)**:任務檔 `docs/Plans/2026-10-06-頁面調整.md`(不 commit),計畫 `docs/Plans/imp-頁面調整.html`(要 commit)。使用者確認:拖曳頁籤、目前頁籤 `˅` 選單的「向左 / 向右 / 移到最前 / 移到最後」、Ctrl+Shift+PageUp / PageDown;不做排序對話框;**不要「頁面」工具面板**。共四個步驟。
  - 步驟 1:`lib/editor/page-order.ts`(`movePage` / `shiftPage` / `slotToIndex`)與 reducer `page/reorder`。vitest 273 個通過。畫面不變。
  - 步驟 2:目前頁籤 `˅` 選單的「向左 / 向右 / 移到最前 / 移到最後」、Ctrl+Shift+PageUp / PageDown。vitest 276 個通過,無頭 Edge 16 項。注意:一般瀏覽器會攔下 Ctrl+Shift+PgUp / PgDn(移動瀏覽器分頁),要在桌面版確認快捷鍵。
  - 步驟 3:拖曳頁籤(`use-page-tab-drag.ts`,插入線、邊緣自動捲動、Esc 取消);工具面板拖曳的通用部分抽成 `components/pointer-drag.ts` 與 `components/drag-ghost.tsx`,兩邊共用。無頭 Edge 15 項通過(含工具面板拖曳回歸)。
  - 步驟 4:`CLAUDE.md` 新增「頁面排序」一節並同步各節;`docs/01`/`02`;`imp-bug-fixed.md` 標註排序已完成。
  - 之後要 commit 的範圍:程式碼、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、`docs/Plans/imp-頁面調整.html`、`docs/Plans/imp-bug-fixed.md`、`docs/Plans/imp-偏好設定調整.html`(上次補的 commit 編號);任務檔 `2026-10-06-頁面調整.md` 不 commit。
- **偏好設定調整(2026-10-05,四個步驟全部完成,commit `e76dd9f`,已推送;桌面版人工驗證待做)**:任務檔 `docs/Plans/2026-10-05-偏好設定調整.md`(不 commit),計畫 `docs/Plans/imp-偏好設定調整.html`(要 commit)。使用者確認:選單改成「設定 → 文件 ▸(頁面設定...、頁碼管理...)」與「設定 → 偏好設定 ▸(格線與參考線...,Ctrl+,)」,每項一個對話框;紙張加 A3 / A5 / A6、JIS B4 / B6、16 開、32 開、Legal、Tabloid、電子書 3:4 / 9:16。共四個步驟。
  - 步驟 1:`lib/preferences/settings-pages.ts`(設定頁清單)→ 指令 `settings.pageSetup` / `settings.pageNumbers` / `settings.grid`(Ctrl+,)與「文件 ▸」「偏好設定 ▸」子選單;`settings.preferences` 移除。暫時仍打開舊對話框的對應分頁。vitest 262 個通過,無頭 Edge 9 項。
  - 步驟 2:`components/app/settings/`(共用外框 `SettingsDialog` / `SettingsDialogFooter`、`PageSetupDialog`、`GridDialog`、搬進來的 `PageNumbersDialog`、`SETTINGS_DIALOGS`);刪除 `preferences-dialog.tsx`;`home-page.tsx` 只剩 `openSettings`。無頭 Edge 14 項通過。
  - 步驟 3:14 種紙張分五組(`units.ts` 的 `PAGE_SIZE_GROUPS` / `PAGE_SIZE_PRESETS`),下拉選單分組並附尺寸。vitest 265 個通過,無頭 Edge 11 項。
  - 步驟 4:`CLAUDE.md` 新增「設定對話框」一節並同步各節;`docs/01`/`02`。
  - 之後要 commit 的範圍:程式碼(含 `git mv` 的 `page-numbers-dialog.tsx` 與刪除的 `preferences-dialog.tsx`)、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、`docs/Plans/imp-偏好設定調整.html`;任務檔 `2026-10-05-偏好設定調整.md` 不 commit。
- **文字屬性調整(2026-10-05,六個步驟全部完成,commit `06c8290`,已推送;桌面版人工驗證待做)**:任務檔 `docs/Plans/2026-10-05-文字屬性調整.md`(不 commit),計畫 `docs/Plans/imp-text-attribute.html`(要 commit)。使用者確認:新增斜體、底線、刪除線、硬陰影(無模糊),加在 `TextStyle`,頁碼也有;背景 / 邊框、直書不做。共六個步驟,每步做完等使用者說「繼續」。
  - 步驟 1:`TextStyle` 加 `italic` / `underline` / `strikethrough` / `shadow`(`TextShadow`),`lib/editor/text-style.ts` 放預設值;TS / Rust 驗證(陰影偏移 ±50 pt,`TEXT_SHADOW_OFFSET_MAX`);Rust `SCHEMA_VERSION` 6,舊檔讀成全部關閉;fixture、`types.html`。vitest 254 個、Rust 89 個通過。畫面還沒有變化。**v6 存檔後舊版 App 無法開啟。**
  - 步驟 2:畫布(文字、圖形內文字、頁碼)、量測、文字編輯框套用新屬性(`text-style.ts` 的 `konvaTextStyle` 等共用函式)。vitest 261 個通過,無頭 Edge 15 項:換行與選取框不變、陰影也落在底線 / 刪除線上、旋轉後陰影仍朝頁面右下。還沒有 UI 按鈕(步驟 3)。
  - 步驟 3:`TextStyleFields` 加斜體 / 底線 / 刪除線按鈕與陰影(開關、顏色、水平 / 垂直偏移),屬性面板與頁碼對話框共用。無頭 Edge 21 項通過(一次操作 = 一筆復原)。**匯出(PDF / EPUB)還不會畫這些效果**(步驟 4、5)。
  - 步驟 4:PDF 畫出斜體(Typst `skew`,斜率 0.25 = 瀏覽器模擬斜體)、底線 / 刪除線(照 Konva 10.5.0 的公式,`TextLayout.lineWidths` 傳行寬)、硬陰影(有線時整段一個陰影在最下面,和 Konva 的 buffer canvas 一樣)。Rust 96 個通過;畫布與 PDF 疊圖墨跡相差 ≤ 0.5 pt。已知限制:半透明陰影在有線的文字上,重疊處 PDF 較深。**EPUB 還不會畫**(步驟 5)。
  - 步驟 5:EPUB 斜體用每行 `skewX`(不用 `font-style`,斜率才固定)、線用絕對定位的 span(位置同 PDF)、文字陰影用 `text-shadow`(不複製文字)、線的陰影 `z-index: -1`。Rust 97 個通過;EPUB 截圖和畫布比對墨跡外框 ≤ 0.5 pt(一處 1 pt)。
  - 步驟 6:`CLAUDE.md` 新增「文字裝飾」一節並同步各節;`fonts/README.md`、`docs/01`/`02`。
  - 之後要 commit 的範圍:程式碼(前端與 Rust)、`tests/fixtures/sample.magproj`、`docs-website/types.html`、`CLAUDE.md`、`fonts/README.md`、`docs/01`/`02`/`progress.md`、`docs/Plans/imp-text-attribute.html`;任務檔 `2026-10-05-文字屬性調整.md` 與 `docs/Plans/Images/` 不 commit。
  - 測試腳本注意:從 React fiber 讀 state 時要從 `root[__reactContainer$…].stateNode.current` 開始,直接用 `root[key]` 會讀到交替的舊樹。
- **頁碼管理(2026-10-04,七個步驟全部完成,commit `5a99008`,已推送;桌面版人工驗證待做)**:任務檔 `docs/Plans/2026-10-04-頁碼管理.md`(不 commit),計畫 `docs/Plans/imp-page-settings.html`(要 commit)。規則寫在 `CLAUDE.md`「頁碼管理」一節。
  - 步驟 1:`lib/editor/page-numbers.ts`(規則 → 虛擬圖形、驗證、對話框用的說明與錯誤訊息)。
  - 步驟 2:`EditorDocument.pageNumberRules`、reducer `document/setPageNumbering`、Rust `format.rs` 驗證、`SCHEMA_VERSION` 5、fixture、`types.html`。
  - 步驟 3:「設定 → 頁面設定...」改成「頁碼管理...」(`settings.pageNumbers`)、`components/app/page-numbers-dialog.tsx`。
  - 步驟 4:畫布以 `StaticShape` 畫頁碼、`measureLineWidth`、偏好 `showPageNumbers`。
  - 步驟 5:`components/editor/style-controls.tsx`(從屬性面板抽出,共用);對話框的頁碼型態與前後置文字。
  - 步驟 6:`buildExportRequest` 匯出前把頁碼加成每頁最上層的圖形(Rust render 不用改);PDF 點陣圖與畫布相差 ≤ 0.5 pt,EPUB 也有頁碼。
  - 步驟 7:`CLAUDE.md`、`docs/01`/`02`、這份檔案。
  - 測試:vitest 251 個、Rust 87 個通過;無頭 Edge 驗證共 46 項。**注意:v5 存檔後舊版 App 無法開啟。**
  - 之後要 commit 的範圍:程式碼、`tests/fixtures/sample.magproj`、`docs-website/types.html`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、`docs/Plans/imp-page-settings.html`;任務檔 `2026-10-04-頁碼管理.md` 不 commit。
- **偏好設定(2026-10-04,已完成,commit `ab3b23c` + `0605fe6`,已推送)**:任務檔 `docs/Plans/2026-10-04-偏好設定.md`(不 commit),計畫 `docs/Plans/imp-settings.html`(要 commit)。七個步驟全部完成:
  - 步驟 1:`lib/preferences/`(偏好資料、localStorage)與 `snapToGrid`。
  - 步驟 2:偏好設定對話框骨架;Ctrl+, 與「頁面設定...」接上;移除「尺寸」面板。
  - 步驟 3:`EditorDocument.margins`、`document/setPageSetup`、Rust `SCHEMA_VERSION` 4、fixture、`types.html`。
  - 步驟 4:「頁面」分頁(紙張、直橫、邊界),`lib/editor/page-setup.ts`。
  - 步驟 5:畫布格線與邊界參考線,`components/editor/page-guides.tsx`。
  - 步驟 6:吸附格線(拖曳 / 多選整組 / 縮放 / 建立)。
  - 步驟 7:`CLAUDE.md` 新增「偏好設定」一節、`01-overview.md` / `02-architecture.md` 同步。
  - 測試:vitest 226 個、Rust 84 個通過;無頭 Edge 驗證共 41 項。**還沒有桌面版的人工驗證**(見「待辦 → 使用者」)。
  - **追加(與 `ab3b23c` 分開 commit)**:格線改虛線;內容區(邊界以內)寬、高的 1/4、1/2、3/4 畫靛藍虛線對齊線,1/2 較明顯(`geometry.ts` 的 `contentGuides`、`page-guides.tsx`)。vitest 228 個通過,無頭 Edge 6 項。對齊線只是視覺參考,吸附仍只對齊格線。
  - 之後要 commit 的範圍:程式碼、`tests/fixtures/sample.magproj`、`docs-website/types.html`、`CLAUDE.md`、`docs/01`/`02`/`progress.md`、`docs/Plans/imp-settings.html`;任務檔 `2026-10-04-偏好設定.md` 不 commit。
- **多選與一起移動(2026-10-03,已完成,commit `c2af9e6`,已推送)**:任務檔 `docs/Plans/2026-10-03.md`(不 commit),計畫 `docs/Plans/imp-muiti-select-move.md`(已和使用者確認:多選只移動不縮放旋轉;Delete / 方向鍵 / Ctrl+D 作用在整組;圖層面板也能 Ctrl + 點擊;這次一起做框選)。五個步驟,**步驟 1(reducer:`selectedIds`、`selection/toggle`、`element/updateMany`、多選刪除 / 複製)已完成**;**步驟 2(畫布 Ctrl + 點擊多選、整組拖曳、多選隱藏縮放 / 旋轉控制點)已完成**,無頭 Edge 驗證通過;**步驟 3(框選:完全包住才選、Ctrl 框選加入、Esc 取消)已完成**,vitest 200 個通過;**步驟 4(Delete / 方向鍵 / Ctrl+D / 動作列作用在整組、屬性面板「已選取 N 個」、圖層面板 Ctrl + 點擊)已完成**,vitest 202 個通過;**步驟 5(文件同步:`CLAUDE.md` 新增「多選與框選」一節、`types.html` / `02-architecture.md` 的 `EditorState`、`01-overview.md` 功能表)已完成**。五個步驟全部完成;還沒有桌面版的人工驗證(見「待辦 → 使用者」)。

**2026-10-01 工作段落結束:目前沒有進行中的工作,等使用者指定下一項。** 頁籤列修正(`fdfddde`)與字型選擇(`777c752`)已推送到 GitHub `main`。

- **字型選擇與字級上下鈕(2026-10-01,已完成)**:任務檔 `docs/Plans/2026-10-01-addfontfamily.md`(不 commit),計畫 `docs/Plans/imp-add-font-family.md`(四個步驟全部完成)。字級 − / ＋;屬性面板「字體」選單有黑體 / 明體 / 楷體 / 圓體,字型用到才載入;楷體、圓體的字型檔經 `fonts/patch_font.py` 修正(見 `fonts/README.md`)。還沒有桌面版的人工驗證。
- **暫停:頁籤列修正(2026-10-01)**,任務檔 `docs/Plans/2026-10-01-bug-fixed.md`(不 commit),計畫 `docs/Plans/imp-bug-fixed.md`(commit `fdfddde`;已和使用者確認規格;六個步驟中步驟 1–3 與 3a(頁碼輸入框、鍵盤換頁)已完成;步驟 4–6 暫停,跨頁之後再討論)。 型別重構與屬性面板已完成並推送(`881ef71` 在 GitHub `main`)。以下都**暫緩,不要主動開始**:自由繪圖(畫筆、`path` 物件,等使用者另開任務);匯出 EPUB 階段 3(封面,待討論做法)與階段 4(command 與前端接線,使用者要先處理其他事);檔案系統第三階段;MCP server。

- **型別重構與屬性面板(2026-10-01,已完成)**:任務檔 `docs/Plans/2026-10-01-自由繪圖.md`(不 commit),計畫 `docs/Plans/imp-refactory-types.md`。六個步驟全部完成,commit `881ef71`(已推送)。
  - rect / ellipse / polygon / star 合併成 `shape` + `geometry`,所有物件以外框左上角定位;`SCHEMA_VERSION` 3,舊檔與舊備份開啟時自動升級。
  - draw.io 式「屬性」工具面板(樣式 / 文字 / 調整)取代上方選取工具列;`localStorage` 版面 key 換成 v2。
  - 圖形可加邊框、可輸入圖形內文字;多邊形 / 星形可自由拉伸,也能調邊數、角數、內徑與圓角。
  - 規則寫在 `CLAUDE.md`「文件模型」「工具面板」「匯出 PDF」各節,型別圖在 `docs-website/types.html`。
  - **還沒有桌面版的人工驗證**,見「待辦 → 使用者」。
- **未 commit 的變更**:`docs/progress.md`(這份,記錄 2026-10-01 下午段落的結束);`README.md`(使用者自己加的段落);`docs/README.md`(對話開始前就有修改,目前看起來只剩換行符號差異)。`.claude/`、`.obsidian/` 要不要 commit 仍待使用者決定。`docs/01-Plans/imp-color-picker.md` 開頭寫「尚未 commit」已過時(實際已 commit),下次改到時一併修正。
- **匯出 EPUB**:計畫在 `docs/01-Plans/Imp-Plan-ExportEpub.md`(已經使用者檢核),階段 1(`RenderModel` 抽出)、階段 2(EPUB 產生器)已完成;階段 3、4 暫緩(見上)。檔案系統第一、二階段與「匯出 PDF」已完成並推送。

- **畫面調整(2026-09-30,已完成)**:任務檔 `docs/01-Plans/03-畫面調整.md`,計畫 `docs/01-Plans/imp-tool-bar.md`。左側按鈕列改成 Krita 式工具面板(`設定 → 工具面板` 勾選、左右停靠、拖曳移動、三欄 + 分隔條、版面記在 `localStorage`)。七個步驟全部完成並 commit(`4fe677d`,已快轉合併到 `main` 並推送),規則寫在 `CLAUDE.md`「工具面板」一節;任務檔與參考截圖(`docs/images/`)不 commit。下一步回到匯出 EPUB 階段 2。
- **底部工具列(2026-09-30,已完成)**:任務檔 `docs/01-Plans/04-tldraw.md`,計畫 `docs/01-Plans/imp-tldraw-bar.md`。參考 tldraw 在畫布下方加浮動工具列(工具模式:選取 / 手形 / 文字 / 圖形 / 圖片,點擊或拖曳建立)與動作列(復原 / 重做 / 刪除 / 複製 / ⋮),手形 / 空白鍵 / 中鍵平移。五個步驟全部完成,規則寫在 `CLAUDE.md`「底部工具列與畫布工具」一節。下一步回到匯出 EPUB 階段 3(封面)。
- **調色板(2026-09-30 起)**:任務檔 `docs/01-Plans/05-調色板.md`,計畫 `docs/01-Plans/imp-color-picker.md`。把原生選色器換成 Tailwind 色票(22 色系 × 11 深淺 + 黑白)與透明度 slider;透明度存成 `#rrggbbaa`(檔案格式變更,`SCHEMA_VERSION` 升為 2);頁面背景也用調色板但不含透明度;不保留自訂顏色。六個步驟**全部完成**,commit `c3ce372`(已推送);規則寫在 `CLAUDE.md`「調色板」一節。
- **MCP server 評估(2026-09-30)**:`docs/01-Plans/eval-mcp-server.md`。結論:不需要先做腳本功能;先做「自動化指令層」,再在 Rust 端內嵌只接受本機連線的 MCP server。**只是評估,尚未排入實作**,等匯出 EPUB 告一段落後由使用者決定;文件第 9 節有待決定的問題。
- 第一、二階段:存檔 / 開啟、自動備份與當機復原。第一階段的對話框流程(開啟 / 另存)還沒有正式的人工測試紀錄;使用者已經在實際使用(建立過自己的專案)。
- **匯出 PDF(2026-09-18 實作)**:內嵌 Typst 把所有頁面排版成 PDF,換行位置由編輯器量測後交給 Typst,規則寫在 `CLAUDE.md`「匯出 PDF」一節。**人工驗證(字型嵌入、中文可搜尋、疊圖比對)還沒有紀錄**,見下方「待辦 → 使用者」。
- **方向調整(2026-09-22)**:使用者決定把**排版與輸出的主軸改成 EPUB 3 固定版面**,PDF 降為衍生輸出。重構方案在 `0-Task/plan-epubv2.md`(不在 repo,目前這台機器上也沒有);**階段 0(字型自備化)已完成**。
- **匯出 EPUB(2026-09-23 起)**:計畫 `docs/01-Plans/Imp-Plan-ExportEpub.md`(任務檔 `docs/01-Plans/Task-Plan-ExportEpub.md`),共五個階段:① `RenderModel` 抽出 ② EPUB 產生器 ③ 封面 ④ command 與前端接線 ⑤ 文件同步。**階段 1 已完成**,PDF 輸出經比對未改變。
- 檔案系統第三階段**暫緩**:使用者重新提出前不要實作。重新開始時,先問下方「待辦 → Claude」列的四個規格問題。
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
| 2026-09-22 | EPUB 可行性評估(`0-Task/plan-epub.md`)→ 使用者改為「以 EPUB 3 固定版面為主」→ 重構方案(`0-Task/plan-epubv2.md`) |
| 2026-09-22 | **EPUB 重構階段 0:字型自備化**。新增 `fonts/`(Geist + Noto Sans TC,Regular/Bold,皆 SIL OFL),畫面與 Rust 匯出共用同一批檔案;移除對系統微軟正黑體的依賴與「找不到字型」的失敗路徑;`font_families()` 加 `LEGACY_FAMILIES` 讓舊專案仍能正確對應 |
| 2026-09-23 | 從 GitHub pull 同步(`b7255ed..99cdfc3`:匯出 PDF、EPUB 選單項目、字型自備化);`CLAUDE.md` 的長期目標改寫成以 EPUB 3 固定版面為主 |
| 2026-09-23 | **匯出 EPUB 實作計畫**(`docs/01-Plans/Imp-Plan-ExportEpub.md`)並經使用者檢核 |
| 2026-09-23 | **匯出 EPUB 階段 1:`RenderModel` 抽出**。`src-tauri/src/export/` 拆成 `render.rs`(文件 → 可繪製元素,含分行、頂點、字型對應、圖片略過)、`pdf.rs`(render model → Typst 的 `data.json`)、`mod.rs`(共用型別);測試 fixture 抽到 `test_support.rs`。`ExportOutput.pdf` 改名 `bytes`。PDF 輸出未改變(以 `export_preview` 的點陣圖 hash 比對) |
| 2026-09-30 | **工具面板步驟 1**:新增 `src/lib/dock/`(`panels.ts` 面板定義、`dock-layout.ts` 停靠版面純函式與 `parseDockLayout`、19 個測試);`SIDER_BUTTONS` 與 `PANELS` 改由 `PanelId` 推導。畫面不變 |
| 2026-09-30 | **工具面板步驟 2**:`MenuNode` 新增 `checkbox`(勾選狀態由 `AppMenubar` 的 `isChecked` 傳入);`COMMANDS` 由面板定義產生 9 個 `panel.<id>`;`設定 → 工具面板` 子選單。暫時接到原本的單一面板(勾選 = 開啟該面板) |
| 2026-09-30 | **工具面板步驟 3**:移除左側按鈕列(`AppSiderButton` 不再被引用,檔案保留到步驟 7 處置);新增 `components/dock/`(`DockArea`、`DockPanel`、`panel-icons.ts`),左右停靠區可同時開多個面板、上下堆疊、可收合 / 關閉,寬度暫時固定 320px;修正 ScrollArea 內長文字撐寬面板的問題(圖層面板的按鈕原本會被推出面板外) |
| 2026-09-30 | **工具面板步驟 4**:`DockSplitter`(拖曳 / 雙擊還原 / 鍵盤 ←→),拖曳期間只改 `DockArea` 的 local state,放開才寫回版面;`resizeDockWidth` 純函式 + 4 個測試;畫布欄最小 480px。以無頭 Edge + CDP 實際拖曳驗證寬度、上限、雙擊、鍵盤與畫布尺寸,縮放不受影響 |
| 2026-09-30 | **工具面板步驟 5**:拖曳標題列移動面板(`use-dock-drag.ts`、`DockDragGhost`、插入提示線、空白側放置區、Esc 取消);`dropPanel` / `insertionSlot` 純函式 + 4 個測試。以無頭 Edge + CDP 驗證跨側移動、拖到空白側、同側排序、原位放下、Esc、點擊收合 |
| 2026-09-30 | **工具面板步驟 6**:`lib/dock/dock-storage.ts`(`localStorage`,損壞 / 無法存取時回到預設)+ 5 個測試;`panel.resetLayout`「重設版面」放在 `設定 → 工具面板` 最下方。以無頭 Edge 驗證重新整理後保留、選單重設、損壞資料回到預設 |
| 2026-09-30 | **工具面板步驟 7**:刪除 `app-siderbutton.tsx`、`sider-panel.tsx`(使用者決定);`CLAUDE.md` 新增「工具面板」一節並更新目錄結構、狀態、選單列;`docs/01-overview.md` 的畫面對應圖、`docs/02-architecture.md` 的目錄表 / 例子 / 自我檢查題改成工具面板 |
| 2026-09-30 | 工具面板 commit `4fe677d`,連同 `f8ee3df`(EPUB 階段 1)推送到新的遠端分支 `refactor/render-model` |
| 2026-09-30 | **MCP server 評估文件**(`docs/01-Plans/eval-mcp-server.md`):現況盤點(`element/*` 不做執行時驗證、只作用在目前頁面、沒有批次復原)、架構選項、第一批工具草案、安全性、分階段建議 |
| 2026-09-30 | **匯出 EPUB 階段 2:EPUB 產生器**(`src-tauri/src/export/epub/`,尚未接 UI)。新增 `zip` 8.6(只開 `deflate-flate2`);字型清單抽到 `export/fonts.rs` 與 PDF 共用;17 個新測試(ZIP 結構、manifest 完整、XML 格式正確、使用者文字不變成標記、六種物件、略過圖片、只內嵌用到的字型、字型度量一致)。以 headless Edge 對照 PDF 點陣圖:文字位置相差 ≤ 0.5 pt。和計畫不同處記在計畫文件階段 2 |
| 2026-09-30 | EPUB 階段 2 commit `ee24f50` 並推送到 `main` |
| 2026-09-30 | **底部工具列步驟 1**:`EditorState` 加 `tool` / `shapeKind`,新增 `tool/set`、`element/duplicate`(新 id 由 action 帶入,reducer 保持純函式)、`lib/editor/tools.ts`(工具與快捷鍵的單一資料來源);12 個新測試。畫面不變 |
| 2026-09-30 | **底部工具列步驟 2**:`components/editor/bottom-toolbar.tsx`(主工具列:選取 / 手形 / 文字 / 最近用過的圖形 / 圖片 / 更多圖形;動作列:復原 / 重做 / 刪除 / 複製 / ⋮ 圖層順序)、`shape-options.ts`(與元素面板共用)、`use-choose-tool.ts`;快捷鍵 V / H / T / R / O、Ctrl+D、Esc 回到選取。文字 / 圖形工具暫時加到頁面中央。以無頭 Edge + CDP 驗證按鈕狀態、快捷鍵、複製、復原、圖形選單 |
| 2026-09-30 | **底部工具列步驟 3**:`use-canvas-pan.ts`,手形工具拖曳、按住空白鍵拖曳、中鍵拖曳平移畫布(capture 階段攔下 pointerdown,只改捲動位置);游標 grab / grabbing。以無頭 Edge + CDP 驗證三種平移、平移時物件不動也不被選取、選取工具拖曳物件仍正常、焦點在按鈕上時空白鍵照常觸發按鈕 |
| 2026-09-30 | 底部工具列步驟 1–3 commit `f9811e4`,步驟 4–5 另一個 commit,一起推送到 `main` |
| 2026-09-30 | **底部工具列步驟 4**:`use-canvas-create.ts`,文字 / 圖形工具在畫布上點擊或拖曳建立(預覽框、拖曳中 Esc 取消、建立後回到選取);`element-factory.ts` 加 `createShapeInBox` / `createToolText` / `boundsFromPoints` + 7 個測試;新文字以草稿編輯、輸入完成才加入文件(復原一次撤銷);刪除 `useChooseTool`;文字編輯框 `rows={1}`。以無頭 Edge + CDP 驗證點擊與拖曳的位置尺寸、在既有物件上建立、Esc、空白鍵平移優先 |
| 2026-09-30 | **底部工具列步驟 5**:上方系統控制列移除復原 / 重做(改在底部動作列);`CLAUDE.md` 新增「底部工具列與畫布工具」一節並更新目錄結構與快捷鍵;`docs/01-overview.md` 畫面對應圖、`docs/02-architecture.md` 的 `EditorState` 圖加上工具列 |
| 2026-09-30 | **修正與補齊 `docs/02-architecture.md`**:模組地圖加上 `lib/project` / `lib/menu` / `lib/dock` / `lib/export`、`components/app` / `dock` 與 Rust 的 `commands` / `project` / `export` / `db`;資料夾行數重新計算;`EditorState` 的 `uploads` 改為 `assets`、補 `savedDocument`;「漏改檢查」表補 `PANEL_ICONS`、`CommandHandlers`、Rust `render.rs`;Rust 簡介改寫(原本寫「3 個指令、前端未使用」);閱讀順序的行數更新 |
| 2026-09-30 | **調色板步驟 1**:`src/lib/editor/palette.ts`(Tailwind v4 經典 22 色系 oklch → hex,超出 sRGB 時降低彩度;`findPaletteColor` 反查)+ 5 個測試。畫面不變 |
| 2026-09-30 | **調色板步驟 2**:物件顏色可為 `#rrggbbaa`(頁面背景仍只收 `#rrggbb`);Rust `SCHEMA_VERSION` 升為 2,v1 檔案不需升級可直接開啟;TS `isElementColor`、`colorAlpha` / `withAlpha`,reducer 的 `element/update` 開始檢查 `fill`;fixture 的矩形改成半透明。Rust 61 個、vitest 127 個測試通過。畫面不變 |
| 2026-09-30 | **調色板步驟 3**:PDF 直接支援 `#rrggbbaa`(測試:點陣圖混色、PDF 內有 `/ca`);EPUB 輸出前把 8 位 hex 轉成 CSS `rgba()` 與 SVG `fill-opacity`(相容較舊的閱讀引擎)。PDF 與 EPUB(headless Edge)疊圖比對,半透明矩形像素兩邊一致。Rust 64 個測試通過 |
| 2026-09-30 | **調色板步驟 4**:shadcn `popover`、`slider`;`components/editor/color-picker.tsx`(色系 / 深淺 / 不透明度 slider,放開才寫入),取代選取工具列的文字顏色與填色。以無頭 Edge + CDP 讀畫布像素驗證選色、slider、Delete / Esc、復原。清除步驟 1 誤用 `tsc -b` 產生的建置檔 |
| 2026-09-30 | **調色板步驟 5**:`color-picker.tsx` 拆成 `ColorPalette`(本體)與 `ColorPicker`(按鈕 + Popover);背景面板改成內嵌 `ColorPalette`(沒有不透明度),移除原本 12 個色票;刪除 `color-input.tsx`,`CLAUDE.md` 同步。以無頭 Edge + CDP 驗證背景選色、復原,並重跑工具列測試 |
| 2026-09-30 | **調色板步驟 6**:`CLAUDE.md` 新增「調色板」一節、目錄結構加 `palette.ts`、修正不存在的 `migrate()` 說明、「匯出 PDF」補上半透明的處理 |
| 2026-09-30 | 調色板 commit `c3ce372`、`02-architecture.md` 修正與 EPUB 階段 3 暫緩 commit `d737844`,一起推送到 `main` |
| 2026-10-01 | **型別重構步驟 1**:rect / ellipse / polygon / star 合併成 `shape`(外框定位 + `geometry`,預留 `stroke` / `label`);`SCHEMA_VERSION` 3,v1 / v2 檔案與舊備份自動升級;多邊形與星形可自由拉伸。PDF 點陣圖與改動前 hash 相同。Rust 68 個、vitest 140 個測試通過,無頭 Edge 驗證畫布操作。細節見 `docs/Plans/imp-refactory-types.md` |
| 2026-10-01 | **型別重構步驟 2:屬性面板**。draw.io 式「屬性」工具面板(樣式 / 文字 / 調整),數字欄位 Enter / 失焦才寫入;新增圖層「移到最上 / 最下」、位置 / 大小 / 旋轉 / 限制寬高比;移除上方選取工具列;版面記憶升 v2。vitest 151 個通過,無頭 Edge 驗證 29 項 |
| 2026-10-01 | **型別重構步驟 3:邊框**。圖形可加邊框(顏色含透明度、線寬、實線 / 虛線 / 點線),畫布、PDF、EPUB 都畫在外框線中心、虛線數字一致;PDF 有邊框的矩形 / 橢圓改畫成和 Konva 同起點的路徑,虛線位置才對得上(疊圖重疊率 99%)。Rust 76 個、vitest 156 個通過 |
| 2026-10-01 | **型別重構步驟 4:圖形內文字**。雙擊圖形輸入文字(外框內縮 4 pt、上 / 中 / 下對齊、超出照常顯示、隨圖形旋轉),屬性面板的圖形多了「文字」分頁;換行由畫布量測後交給 Rust,PDF / EPUB 文字位置相差 ≤ 0.6 pt。Rust 78 個、vitest 166 個通過,無頭 Edge 驗證 19 項 |
| 2026-10-01 | **型別重構步驟 5:形狀參數**。「樣式」分頁的「形狀」區:矩形圓角、多邊形邊數、星形角數與內徑比例;TS / Rust 以相同規則驗證 geometry(舊檔不受影響)。Rust 79 個、vitest 172 個通過,無頭 Edge 驗證 11 項 |
| 2026-10-01 | **頁籤列修正(步驟 1–3、3a)**:「+」新增的頁面加在最後;外層 Grid 加 `grid-cols-[minmax(0,1fr)]`(頁面多時整個 App 被頁籤撐寬,是點不到頁面的主因);頁籤區滾輪橫捲、自動捲到目前頁籤、`<` `>`、頁碼輸入框、PageUp / PageDown / Ctrl+Home / Ctrl+End;`≡` 與 `˅` 頁面清單選單(`page-menu.tsx`)。步驟 4–6 暫停 |
| 2026-10-01 | **字型選擇與字級上下鈕**:`NumberField` 可選 − / ＋;`FONT_OPTIONS`(`lib/editor/fonts.ts`)與用到才載入(`use-fonts-ready.ts`);加入明體(Noto Serif TC)、楷體(霞鶩文楷 TC,粗體用 Medium)、圓體(源泉圓體 TW);`BUNDLED_FONTS` 加 `generic` / `typst_family`,新測試 `typst_sees_the_declared_family_and_weight`。Rust 82 個、vitest 190 個通過;四套字型的畫布 / PDF 疊圖比對一致 |
| 2026-10-03 | **多選與一起移動**(計畫 `docs/Plans/imp-muiti-select-move.md`):`selectedId` → `selectedIds`;Ctrl + 點擊多選(畫布與圖層面板)、整組拖曳交給 Konva Transformer(放開時一次 `element/updateMany` = 一筆復原)、多選隱藏縮放 / 旋轉;框選(完全包住才選、Ctrl 加入、Esc 取消);Delete / 方向鍵 / Ctrl+D / 動作列作用在整組;屬性面板「已選取 N 個」。vitest 202 個通過,無頭 Edge 驗證 41 項 |
| 2026-10-04 | **偏好設定**(計畫 `docs/Plans/imp-settings.html`):「偏好設定」對話框(Ctrl+, / 頁面設定...)取代「尺寸」工具面板;紙張尺寸套用到所有頁面、邊界存進文件(`schemaVersion` 4,只畫參考線不輸出);格線顯示 / 間距 / 吸附與邊界參考線開關存 localStorage;吸附涵蓋拖曳(多選整組依被拖曳的物件對齊)、縮放(旋轉 0°)、建立。vitest 226 個、Rust 84 個通過,無頭 Edge 驗證 41 項 |
| 2026-10-04 | **頁碼管理**(計畫 `docs/Plans/imp-page-settings.html`):「設定 → 頁碼管理...」取代「頁面設定...」;文件分段設定頁碼(範圍、起始值、奇偶頁位置與前後置文字、字型 / 顏色 / 框線),左中 / 右中直書;頁碼以虛擬圖形畫在畫布與匯出(PDF / EPUB),不是物件;「顯示頁碼」只影響畫布;`schemaVersion` 5。vitest 251 個、Rust 87 個通過,無頭 Edge 驗證 46 項 |
| 2026-10-05 | **文字屬性調整**(計畫 `docs/Plans/imp-text-attribute.html`):文字樣式加斜體(模擬斜切 0.25)、底線、刪除線(照 Konva 10.5.0 的公式)、硬陰影(方向以頁面為準、無模糊);屬性面板與頁碼對話框共用控制項;畫布、PDF、EPUB 一致(墨跡相差 ≤ 0.5 pt);`schemaVersion` 6。vitest 261 個、Rust 97 個通過 |
| 2026-10-06 | **頁面排序**(計畫 `docs/Plans/imp-頁面調整.html`):`page/reorder`;拖曳頁籤(插入線、邊緣自動捲動)、目前頁籤 `˅` 選單的移動項目、Ctrl+Shift+PageUp / PageDown;工具面板與頁籤拖曳共用 `pointer-drag.ts` / `drag-ghost.tsx`。vitest 276 個通過,無頭 Edge 驗證 31 項 |
| 2026-10-07 | **跨頁編輯**(計畫 `docs/Plans/imp-edit-crose-page.md`):物件跨過書背時,跨過去的部分在對頁也畫、也匯出(`spilloverInto`;畫布與匯出同一個疊放順序;雙頁時書背側裁切、拖曳中不裁);點對頁上的那一段選到它;放下時中心過書背就換頁(`element/moveToPage`,一筆復原)。PDF 兩頁拼起來書背兩側像素一致。vitest 355 個,無頭 Edge 新增 35 項 |
| 2026-10-07 | **單頁 / 雙頁(跨頁)**(計畫 `docs/Plans/imp-page-switch.md`):「頁面」標題列中間的切換(偏好 `pageView`);雙頁時畫布兩頁並排(第 1 頁單獨在右)、書背線、目前頁藍框,兩頁都能直接點選與建立物件,面板縮圖兩兩一列;畫布 Layer 改成跨頁座標、每頁一個位移的 Group(`canvas-sheet.tsx`)。vitest 344 個,無頭 Edge 共 51 項(含單頁回歸) |
| 2026-10-07 | **「頁面」面板調整**(計畫 `docs/Plans/imp-fix-master.md`):「主頁」「頁面」兩區各自收合(箭頭)、內容各自捲動;按住「頁面」標題上下拖曳調整兩區高度(Esc 取消、雙擊還原、↑ / ↓),記在這台電腦。vitest 333 個,無頭 Edge 37 項 |
| 2026-10-07 | **主頁與動態變數**(計畫 `docs/Plans/imp-master-pages.md`):主頁(`masters`,可以「以另一個主頁為基礎」形成階層,最多 8 層)、頁面以 `masterId` 套用;Affinity 式「頁面」面板(主頁 / 頁面縮圖、套用主頁、以…為基礎);「新增頁面」「新增主頁」對話框;動態變數 `{頁碼}` `{總頁數}` `{文件名稱}` `{頁面名稱}`;匯出時展開到每頁;`schemaVersion` 7。vitest 324 個、Rust 100 個通過,無頭 Edge 驗證 59 項,另以真實匯出內容比對 PDF / EPUB |
| 2026-10-05 | **偏好設定調整**(計畫 `docs/Plans/imp-偏好設定調整.html`):「設定」選單拆成「文件 ▸ / 偏好設定 ▸」,頁面設定、頁碼管理、格線與參考線各自一個對話框(共用外框,由 `SETTINGS_PAGES` 產生);紙張增加到 14 種並分組。vitest 265 個通過,無頭 Edge 驗證 34 項 |
| 2026-10-01 | **型別重構步驟 6:文件同步**。`docs-website/types.html` 重畫關係圖與 x / y 圖、改寫說明卡;`CLAUDE.md` 文件模型 / 工具面板 / 檔案系統 / 匯出各節(含「改一邊要改兩邊」的常數清單);`docs/01-overview.md`、`docs/02-architecture.md` 更新 |
| 2026-10-08 | **整理 `docs/`**:最上層的任務檔與計畫(`03-畫面調整`、`04-tldraw`、`05-調色板`、`07-階層式主頁`、`Task-Plan-ExportEpub`、`Imp-Plan-ExportEpub`、`imp-tool-bar`、`imp-tldraw-bar`、`imp-color-picker`、`eval-mcp-server`)搬到 `docs/01-Plans/`(有追蹤的用 `git mv`);`01-overview.md`、`02-architecture.md`、`progress.md`、`README.md` 與子資料夾 `Plans/`、`images/`、`參考文件/` 不動。`CLAUDE.md`、這份檔案(含歷史紀錄)、`docs/Plans/imp-master-pages.md`、`epub/mod.rs` 的註解改成新路徑 |

---

## 已做的決定

| 決定 | 原因 |
|---|---|
| 套件管理器使用 **npm**,不用 pnpm | repo 已有 `package-lock.json` |
| **不做匯出 PPT**(2026-10-13) | 保持功能單一:輸出只有 EPUB 3 固定版面與由同一份排版衍生的 PDF。原本的需求與評估(`04-匯出PPT*.md`)已刪除、沒有 commit |
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
| ~~中文用**系統的微軟正黑體**,只內嵌 Geist~~ | **已於 2026-09-22 推翻**(見下方字型自備化):改成 EPUB 為主之後,輸出必須自給自足 |
| 匯出**不要求先存檔**,匯出的是目前畫面的內容 | 使用者想先看 PDF 再決定要不要存;路徑仍然只留在 Rust 端 |
| 匯出後**不自動開啟** PDF,只在成功訊息上放「開啟」按鈕 | 使用者確認(2026-09-18) |
| 匯出**沒有快捷鍵**(PDF 與 EPUB 都沒有) | 選單與工具列按鈕足夠。使用者再次確認(2026-09-23) |
| **排版與輸出以 EPUB 3 固定版面為主**,PDF 為衍生輸出 | 使用者決定(2026-09-22)。固定版面 EPUB 的渲染引擎(閱讀器內的 WebKit/Chromium)和 Konva 量測文字同源,「所見即所得」從「盡量接近」變成「本來就一樣」 |
| 字型**隨 App 自備**(Geist + Noto Sans TC,皆 SIL OFL),不再向系統借 | EPUB 是會被散布的檔案,必須自給自足;系統字型的 EULA 也不允許。順帶讓 PDF 不再依賴使用者機器裝了微軟正黑體 |
| 只放**靜態**字重,不用可變字型 | 模型的 `fontStyle` 只有 normal/bold;可變字型與靜態實例的度量可能不同,混用會讓畫面與輸出對不上 |
| 畫面與匯出**共用 `fonts/` 的同一批檔案** | 只要有一邊用到不同的檔案,換行位置就會不一樣 |
| EPUB 的頁面用**真文字 + CSS 絕對定位**(形狀用 inline SVG),不是每頁一張圖 | 文字可選取 / 搜尋 / 複製,檔案也小。使用者確認(2026-09-23) |
| EPUB **先全量內嵌**用到的字型家族,字型子集化列為後續優化 | 實作單純、風險低;子集化不改變檔案格式,之後可獨立進行。代價是 EPUB 多約 11.5 MB |
| EPUB 的中繼資料與封面**全自動,不加 UI** | 標題=文件名稱、語言 `zh-TW`、UUID、`dcterms:modified`=匯出時間;封面用 Typst 算第 1 頁。不需要動 `types.ts` / `format.rs` / `SCHEMA_VERSION` |
| 工具列**不做「匯出」下拉**,直接並排兩顆按鈕 | 兩個輸出都一鍵可及。使用者確認(2026-09-23) |
| 語言碼這次固定 `zh-TW`,但**集中在單一常數** | 文件模型還沒有語言欄位;後續要做多語系,集中定義才不用全域搜尋替換 |
| PDF 與 EPUB **共用 `RenderModel`**,格式專屬的細節不進模型 | 座標、旋轉、分行、字型對應、圖片略過只定義一次;媒體型別之類的打包細節留在各自的產生器 |
| 工具面板:9 個工具**各自是獨立面板**,同側**上下堆疊**,三欄之間是**可拖曳的分隔條**(不是縮放滑桿),**自行實作不加套件** | 使用者確認(2026-09-30),見 `docs/01-Plans/imp-tool-bar.md` |
| 工具面板版面記在 **`localStorage`**,不進專案檔、不進 SQLite | 是 App 偏好不是文件內容;SQLite 的 `settings` 資料表還沒做,等偏好設定實作時再搬。計畫中的建議值,使用者未提出異議(2026-09-30) |
| ~~顏色**只能從 Tailwind v4 色票選**(經典 22 色系 + 黑白),不保留自訂顏色~~;頁面背景也用調色板 | 使用者確認(2026-09-30),見 `docs/01-Plans/imp-color-picker.md`。**「只能從 Tailwind 選」已於 2026-10-12 被文件色票取代**(下一列) |
| **文件色票**:文件裡的具名 sRGB 顏色(不透明,透明度存在使用處),自訂 hex 只在「設定 → 文件 → 色票...」輸入;各顏色欄位存實際值 + 連結 id,改色票時連結處一起變;Tailwind 保留為原色庫(選了 = 不連);文字同色但連結不同算覆寫;刪除使用中的色票先問替換;新文件帶「文字 / 黑 / 白」、內建文字樣式連到「文字」,舊檔沒有色票;不做即時預覽;PANTONE / CMYK / ICC 不做(檔案格式 v12) | 使用者確認(2026-10-12),見 `docs/Plans-Color-System/Color-System.html`、`docs/01-Plans-2026-10/17-文件色票-實作.md` |
| 透明度存成顏色字串 **`#rrggbbaa`**(不另加 `opacity` 欄位),頁面背景不可透明;`SCHEMA_VERSION` 升為 2 | 不用改 `types.ts`,Konva / Typst 直接支援。使用者確認(2026-09-30) |
| EPUB 輸出前把 8 位 hex 轉成 CSS `rgba()` / SVG `fill-opacity` | SVG 1.1 不允許 8 位 hex,較舊的閱讀引擎也不支援 |
| rect / ellipse / polygon / star 合併成 **`shape` + `geometry`**,所有物件以外框左上角定位;draw.io 式**屬性面板**取代上方選取工具列;圖形內文字超出時照常顯示;自由繪圖這次不做 | 使用者確認(2026-10-01),見 `docs/Plans/imp-refactory-types.md` |
| 偏好設定:紙張尺寸改**目前文件的所有頁面**(可復原,物件不動);邊界**存進文件、只當參考線**(`schemaVersion` 4);格線有**開關 + 間距 + 吸附**;App 偏好存 **localStorage**(不做 SQLite `settings` 表);「頁面設定...」與「偏好設定...」開**同一個對話框**;新文件邊界 15 mm、格線 5 mm、格線與吸附預設關、參考線預設開;按「確定」才生效 | 使用者確認(2026-10-04),見 `docs/Plans/imp-settings.html` |
| 沒動過頁面設定時按「確定」**不套用頁面**;多選拖曳吸附時**整組依被拖曳的物件對齊、相對位置不變** | 實作時決定(2026-10-04):前者避免只改格線就統一頁面尺寸;後者避免整組形狀被吸附打亂 |
| 頁碼:一段 = 一個頁面範圍(奇偶頁各自設位置與前後置文字);每段可設起始值(只有阿拉伯數字);上下放在邊界區正中;左中 / 右中每字上下排;「顯示頁碼」是只影響畫布的 App 偏好;「頁面設定...」改成「頁碼管理...」 | 使用者確認(2026-10-04),見 `docs/Plans/imp-page-settings.html` |
| 頁碼**不是物件**,文件只存規則,畫布與匯出時算成「虛擬圖形」(透明矩形 + 框線 + 圖形內文字) | 實作時決定(2026-10-04):沿用既有的圖形繪製、量測與 PDF / EPUB 匯出,Rust render 不用改;頁碼也不會被誤選、誤刪 |
| 文字新增**斜體 / 底線 / 刪除線 / 硬陰影**(加在 `TextStyle`,頁碼也有);斜體是 boolean、以模擬斜切呈現;陰影無模糊、方向固定朝頁面;文字背景 / 邊框不做(用圖形 + 圖形內文字) | 使用者確認(2026-10-05),見 `docs/Plans/imp-text-attribute.html` |
| 頁面排序:拖曳頁籤 + 目前頁選單的移動項目 + Ctrl+Shift+PageUp / PageDown;不做排序對話框;**不要「頁面」工具面板**(不是延後,不要主動提) | 使用者確認(2026-10-06),見 `docs/Plans/imp-頁面調整.html` |
| 跨頁物件:物件仍屬一頁,跨過書背的部分在對頁也畫、也匯出(依雜誌配對,和畫面模式無關);放開時中心在另一頁就換頁(**取代**單頁 / 雙頁時的「拖過書背不換頁」);圖片「在書背切開」另排任務 | 使用者確認(2026-10-07),見 `docs/Plans/imp-edit-crose-page.md` |
| 主頁:主頁另存 `masters`,頁面以 `masterId` 套用、主頁以 `parentId` 形成階層;主頁物件在頁面上不能選取;新增「頁面」工具面板(真縮圖,頁籤列保留,**取代上一列「不要頁面面板」**);`{頁碼}` 跟頁碼規則;刪除主頁接到父主頁;背景不繼承;只做單頁 | 使用者確認(2026-10-07),見 `docs/Plans/imp-master-pages.md` |
| 設定選單改成「文件 ▸(頁面設定、頁碼管理)/ 偏好設定 ▸(格線與參考線,Ctrl+,)」,每項一個對話框;設定頁由 `SETTINGS_PAGES` 清單推導;紙張 14 種分五組 | 使用者確認(2026-10-05),見 `docs/Plans/imp-偏好設定調整.html` |
| 底部工具列採 **tldraw 的工具模式**(先選工具再到畫布點擊 / 拖曳建立,建立後回到選取);第一版只做現有物件類型;復原 / 重做移到底部動作列 | 使用者確認(2026-09-30),見 `docs/01-Plans/imp-tldraw-bar.md` |

---

## 待辦

### 使用者

- [ ] 在 `npm run tauri dev` 手動驗證**圖形庫**：「工具面板 → 元素」點各種圖形、底部工具列「更多圖形」選一個到畫布拖曳、屬性面板「樣式 → 形狀」改參數與「換成」、存檔再開、匯出 PDF / 翻頁書看圖形（含虛線邊框、圓柱的細節線）；Claude Code `/mcp` 重新連線後試 `list_shapes` 與 `add_shape { shape: "cloud" }`
- [x] ~~在 `npm run tauri dev` 手動驗證**專案字型**:「設定 → 文件 → 字型...」匯入 .ttf / .otf(也試可變字型、.ttc、禁止嵌入的字型會被拒絕)、指定粗體檔、文字選用後畫布顯示、存檔關閉再開(`assets/fonts/`)、刪除使用中的字型換成別套、匯出 PDF / 翻頁書;Claude Code `/mcp` 重新連線後 `list_fonts`~~(2026-10-14 使用者完成;`list_fonts` 列出匯入的三套:ㄅ源泉注音圓體、Magneto、Broadway)
- [x] ~~在 `npm run tauri dev` 確認**新的程式圖示**~~(2026-10-14 使用者完成,重編之後)(視窗左上角、工作列、`src-tauri/target/debug/magazine-editor.exe` 在檔案總管的圖示;工作列還是舊的就重開 App 或清 Windows 圖示快取)
- [ ] 在 Claude Code 執行 `/mcp` 重新連線 magazine-editor(橋接程式 2026-10-14 已重編兩次,`run_command` 不再有 `panel.photos`、多了 `file.exportFlipbook`);`list_commands` 確認。舊的 `src-tauri/target/debug/magazine-mcp.old-*.exe` 斷線後可以刪掉
- [x] ~~在 `npm run tauri dev` 手動驗證**匯出翻頁電子書**~~(2026-10-14 使用者完成:匯出 PDF 照常、翻頁書的存檔對話框與資料夾、「開啟」、有內容的資料夾拒絕、圖片、全螢幕)
- [ ] (選做)翻頁書用 **Firefox** 開 `index.html`(這台沒裝,`file://` 字型未實測)、把資料夾上傳到網站空間開啟
- [ ] 在 `npm run tauri dev` 手動驗證**工具面板重構**(Claude 只用瀏覽器模式驗證過):
  - 你目前的版面:「相片」頁籤不見了,其他面板照舊、寬度不變
  - 「工具面板」選單:三類 + 分隔線,沒有「相片」;「重設版面」後只剩左「頁面」、右「屬性」
  - 從選單打開文字 / 元素 / 素材 → 在「頁面」上面同一組;打開圖層 → 在「屬性」下面;打開樣式 → 併進「屬性」那組
  - 「素材」面板選「內建範例」:點一下放到頁面中央、拖到頁面上;用過的相片出現在「未分類」;**存檔重開後圖片還在**(已複製進專案的 `assets/images/`);匯出 PDF 圖片正常
- [ ] 在 `npm run tauri dev` 手動驗證**畫布右鍵選單**(Claude 只用無頭 Edge 的合成事件驗證過):
  - 右鍵沒選取的物件:先選取、選單開在游標旁,沒有 WebView2 自己的右鍵選單(「上一頁 / 重新整理 / 檢查」那個)
  - 右鍵空白處、頁面背景、主頁內容、頁碼:什麼選單都不出現
  - 圖層順序 / 填滿 / 對齊各點幾個,結果和屬性面板相同,Ctrl+Z 各一次復原
  - 選單開著時右鍵另一個物件:換成選它、選單重開;按 Esc 或點別處關閉後,空白鍵平移、Delete 照常
  - 雙頁:右鍵對頁的物件與跨過書背的部分;雙擊文字編輯時,文字框裡右鍵是剪下 / 複製 / 貼上
  - 觸控板的雙指點按(右鍵)也一樣
- [ ] **重編 MCP 橋接程式並實測色票工具**:關掉 Claude Code 後執行 `cargo build --manifest-path src-tauri/Cargo.toml --bin magazine-mcp`(重編前 Claude Code 看到的是舊的工具清單),再到 Claude Code 試 `list_swatches` / `add_swatch` / `update_swatch` / `delete_swatch`,以及 `add_text` 的 `textColor: { swatch: "文字", opacity: 0.5 }`
- [ ] 在 `npm run tauri dev` 手動驗證**文件色票**(Claude 只用瀏覽器模式驗證過):
  - 「檔案 → 新增」的新文件:調色板有「文字 / 黑 / 白」;文字面板加的文字連到「文字」
  - 「設定 → 文件 → 色票...」新增「品牌紅」(輸入 hex)→ 文字、圖形填色、邊框、陰影、頁面背景、主頁上的物件、頁碼(「頁碼管理」)各連一處 → 改「品牌紅」的顏色,全部一起變;Ctrl+Z 一次回去
  - 半透明的填色連到色票後改色票,透明度保留
  - 存檔重開:色票、連結、排序都在;標題 `●` 的變化正確
  - 開一個 2026-10-12 之前存的專案(v11):沒有色票、顏色不變;調色板顯示「這份文件還沒有色票。」與「管理色票...」;存檔後**舊版 App 會拒絕開啟**(v12)
  - 實際按「匯出 PDF」/ EPUB:連到色票的顏色(含半透明)和畫面一致
  - 有未存檔的色票修改時等 60 秒以上再強制結束 App → 重開選「復原」:色票與連結都在
  - 刪除有人用的色票:換成另一個 / 不替換兩種都試;「格線與參考線」對話框的調色板沒有色票區

- [ ] 在 `npm run tauri dev` 手動驗證**跨頁物件**:雙頁模式把圖片拖到一半跨過書背 → 兩頁都看得到、接得起來;實際按「匯出 PDF」看第 2、3 頁是否接得起來;拖到中心過書背放開 → 改成屬於另一頁,Ctrl+Z 一次回去;**注意:以前單頁模式下剛好超出內側(左頁右緣 / 右頁左緣)的物件,現在匯出會出現在隔壁頁**
- [ ] 在 `npm run tauri dev` 手動驗證**單頁 / 雙頁**(Claude 只用瀏覽器模式驗證過):「頁面」標題列中間切到雙頁 → 第 1 頁單獨在右、之後兩頁並排;點另一頁的物件直接選到;在另一頁用圖形 / 文字工具建立;開吸附時在右頁拖曳仍落在格線上;切回單頁;重開 App 模式仍在
- [ ] 在 `npm run tauri dev` 手動驗證**主頁與動態變數**(Claude 只用瀏覽器模式、`export_preview` / `epub_preview` 驗證過):
  - 已存過版面的 App 看不到「頁面」面板:從「工具面板 → 頁面」打開(或「重設版面」;2026-10-09 前是「設定 → 工具面板 → 頁面」)
  - 新增主頁、在主頁上放刊頭與 `{頁碼}` 頁尾 → 「+」新增 3 頁並選這個主頁 → 每頁頁尾數字正確;Ctrl+Z 一次撤銷 3 頁
  - 子主頁(以…為基礎)、刪除主頁後頁面改接父主頁;存檔重開主頁仍在;只放在主頁上的圖片重開後沒有消失
  - 實際按「匯出 PDF」:主頁內容與變數和畫面一致
  - 存成 v7 後**舊版 App 會拒絕開啟**
- [ ] 在 `npm run tauri dev` 手動驗證**頁面排序**(Claude 只用瀏覽器模式驗證過):
  - 拖曳頁籤到前面 / 最後;頁面多時拖到頁籤列邊緣會自動捲動;Esc 取消;標題出現 `●`、Ctrl+Z 一次回去;存檔重開順序仍在
  - 目前頁籤 `˅` 選單的四個移動項目
  - **Ctrl+Shift+PageUp / PageDown 在桌面版有沒有作用**(瀏覽器分頁會被瀏覽器攔下,無頭測試碰不到這一層)
  - 有頁碼規則時,移動頁面後頁碼依新順序重新計算
- [ ] 在 `npm run tauri dev` 手動驗證**設定選單**(Claude 只用瀏覽器模式驗證過):
  - 「設定 → 文件 ▸」「設定 → 偏好設定 ▸」的三個項目各開自己的對話框;Ctrl+, 開「格線與參考線」
  - 頁面設定選 A5 橫式 → 標題出現 `●`、Ctrl+Z 一次回去;存檔重開仍是 A5
  - 用鍵盤 Alt+S 打開「設定」時,第一個項目有沒有自動被選取(無頭測試要再按 ↓,`CLAUDE.md` 寫會自動聚焦,桌面版確認哪個對)
- [ ] 在 `npm run tauri dev` 手動驗證**文字屬性**(Claude 只用瀏覽器模式、`export_preview`、`epub_preview` 驗證過):
  - 文字物件、圖形內文字、頁碼各試一次斜體 / 底線 / 刪除線 / 陰影,Ctrl+Z 一步一步回去;存檔重開仍在
  - 旋轉的文字加陰影:陰影應該一直朝頁面右下(不跟著轉)
  - 實際按「匯出 PDF」:斜體、線、陰影和畫面一致;半透明陰影 + 底線時,重疊處稍深是已知限制
  - 存成 v6 後**舊版 App 會拒絕開啟**
- [ ] 在 `npm run tauri dev` 手動驗證**頁碼管理**(Claude 只用瀏覽器模式與 `export_preview` 驗證過):
  - 「設定 → 頁碼管理...」加兩段(例如封面不設、第 3 頁起從 1 起算),奇偶頁位置不同、加前後置文字與框線 → 標題出現 `●`、Ctrl+Z 一次回去;存檔重開設定仍在
  - 實際按「匯出 PDF」:每頁頁碼的位置、字型、顏色、框線和畫面一致;關掉「在編輯畫面顯示頁碼」後匯出仍有頁碼
  - 存成 v5 後**舊版 App 會拒絕開啟**
  - 想一想:加框線時框線比邊界線多出約 4 pt(對齊的是文字,不是框)是否可以接受
- [ ] 在 `npm run tauri dev` 手動驗證**偏好設定**(Claude 只用瀏覽器模式驗證過):
  - 「頁面設定...」改紙張(B5 橫式)與邊界 → 標題出現 `●`、Ctrl+Z 一次回去;存檔重開尺寸與邊界仍在
  - 匯出 PDF:頁面尺寸是新紙張,沒有格線與邊界參考線
  - 開一個 2026-10-04 之前存的專案:沒有邊界參考線(全 0),其他內容不變;存檔後**舊版 App 會拒絕開啟**(v4)
  - 開啟吸附後拖曳、多選拖曳、縮放、用工具建立;旋轉過的物件縮放時不吸附(瀏覽器沒測)
  - 重開 App 後格線設定仍在

- [ ] 在 `npm run tauri dev` 手動驗證**多選與框選**(Claude 只用瀏覽器模式驗證過):Ctrl + 點擊多選、整組拖曳後 Ctrl+Z 一次回去、框選(含旋轉過的物件)、多選時 Delete / Ctrl+D / 方向鍵、圖層面板 Ctrl + 點擊;存檔重開位置正確
- [ ] 在 `npm run tauri dev` 手動測試檔案系統第一階段(Claude 無法操作系統對話框),有問題告訴 Claude:
  - 另存新檔到中文路徑 → 關閉 App → 重新開啟,內容與圖片都在
  - 修改後標題出現 `●`;復原到存檔狀態後 `●` 消失
  - 有未存檔變更時按新增 / 開啟 / 關閉視窗,出現「儲存 / 不儲存 / 取消」
  - 把專案資料夾搬到別的位置,用「開啟」選 `project.magproj`,圖片正常顯示
  - 上傳面板拖放圖片、相片面板加入內建相片,存檔後重開仍在
- [ ] **確認換字型後的畫面**(階段 0):中文從微軟正黑體換成 Noto Sans TC,既有專案打開後字寬會變、文字會位移。在 `npm run tauri dev` 開既有專案看看能否接受
- [ ] 手動驗證**EPUB 產生器**(階段 2,還沒有匯出按鈕):`EXPORT_PREVIEW_DIR=<dir> cargo test --manifest-path src-tauri/Cargo.toml epub_preview -- --ignored` 產生 `preview.epub`
  - 用 **epubcheck** 檢查(需要 Java,這台機器目前沒有),目標 0 error
  - 在 Thorium Reader / Calibre / Apple Books 開啟:固定版面、比例正確、中文可選取與搜尋、字型是內嵌的 Noto Sans TC
- [ ] 在 `npm run tauri dev` 手動驗證**型別重構與屬性面板**(Claude 只用瀏覽器模式驗證過):
  - 開一個 2026-10-01 之前存的專案:圖形位置、大小、旋轉都沒有跑掉;存檔後再開仍正確
  - 雙擊圖形用注音輸入文字(選字時按 Enter 不會結束編輯),上 / 中 / 下對齊;存檔重開文字仍在
  - 邊框(實線 / 虛線 / 點線)與圖形內文字匯出 PDF,位置和畫面一致
  - 屬性面板:改位置、大小、旋轉、圓角、邊數後 Ctrl+Z 一步一步復原
- [ ] 在 `npm run tauri dev` 手動驗證**字型與頁籤列**(Claude 只用瀏覽器模式驗證過):
  - 四種字體的一般 / 粗體,存檔後重開仍正確;開啟用到其他字體的專案時,畫布會先短暫空白再出現
  - 匯出 PDF:四種字體都正確嵌入(楷體的粗體是 Medium,只稍粗)
  - 頁面多時的頁籤列:滾輪、`<` `>`、頁碼輸入框、PageUp / PageDown、`≡` 選單
  - 安裝檔變大約 75 MB(字型)是否可以接受
- [ ] 在 `npm run tauri dev` 手動驗證**調色板**:文字 / 圖形選色與不透明度、頁面背景;存檔後重開半透明仍在;匯出 PDF 半透明正確(EPUB 還沒有匯出按鈕,可用 `epub_preview`)
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

- 圖形庫之後另排（`docs/06-Plans-繪圖/01-繪圖-實作.md` §0）：畫布上的調整把手（黃色菱形）、線條 / 箭頭物件（可拖端點，另開任務）、自由繪圖 / 鋼筆（「繪圖」面板）、有洞的圖形（fill rule）、每個圖形自己的文字區（平行四邊形、對話框的文字不壓到斜邊 / 尾巴）、SVG 轉成可改色的圖形
- [x] commit `docs/` 和 `CLAUDE.md`(commit `45c22de`):已合併到 `main`,`main` 和 `docs/learning-path` 都已 push
- [ ] 依序撰寫 `03` → `07`,每次一份
  - `03-document-model.md`:pt 單位、座標定義、為什麼不存 scale
  - `04-state-and-undo.md`:reducer、`commit`、復原/重做、`reconcileSelection`
  - `05-canvas-viewport.md`:捲動與縮放、兩個 `useLayoutEffect` 的順序
  - `06-rust-ipc.md`:SQLite、commands、`DbError`
  - `07-dev-workflow.md`:測試、hooks、`permissions.deny`、Claude Code 使用流程
- [ ] 每寫完一份,更新 `docs/README.md` 的進度表和這份檔案
- [ ] 之後撰寫的文件要涵蓋匯出 PDF:`03-document-model.md` 說明 pt 單位和 Typst 的對應;`06-rust-ipc.md` 說明 `ExportWorld` 為什麼是沙箱、為什麼換行由前端量測
- [ ] `03-document-model.md` 要說明 `ImageElement.src` 是專案相對路徑,以及為什麼圖片要複製進專案
- [ ] `06-rust-ipc.md` 要涵蓋 `AppError`、`ProjectState`、「前端不傳路徑」的設計
- [ ] **匯出 EPUB 階段 3(封面)——暫緩,待後續討論**(2026-09-30)。重新開始前先和使用者討論封面做法(原計畫:用 Typst + `typst-render` 把第 1 頁算成 PNG,失敗時略過封面),見 `docs/01-Plans/Imp-Plan-ExportEpub.md` 階段 3
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
- **目前的自動化測試:** Rust 100 個(另有 2 個 `#[ignore]` 的 PDF / EPUB 預覽)、vitest 355 個(2026-10-07)全部通過。`cargo clippy --all-targets` 有 1 個警告:`project/recovery.rs:118` 建議 `sort_by` 改 `sort_by_key`,是新版 clippy 的規則,和既有邏輯無關,尚未處理。
- **圖形內文字的已知限制(2026-10-01)**:
  - 文字框一律用外框矩形內縮 4 pt,橢圓 / 星形 / 三角形靠邊對齊的文字可能超出弧線或斜邊(draw.io 會依形狀多內縮)。
  - 超出圖形的文字不算進工作區的捲動範圍(`getContentBounds` 只看外框)。
  - PDF 與 EPUB 的文字位置相差 ≤ 0.6 pt,和既有的字距限制相同。
- **型別檢查用 `npx tsc --noEmit -p tsconfig.json`**(或 `npm run build`),不要用 `tsc -b`:會在專案根目錄產生 `vite.config.js`、`vite.config.d.ts`、`*.tsbuildinfo`,而且對 `vite.config.ts` 報一個既有的錯誤。
- **匯出 PDF 只有自動化測試,沒有人工驗證紀錄:** Rust 測試涵蓋六種物件都能編譯成 PDF、頁數與頁面尺寸、圖片缺檔會略過、`World` 拒讀其他路徑、Typst 特殊字元原樣輸出、非法 layout 資料會被拒絕。字型嵌入、中文搜尋、和畫布的疊圖比對還需要使用者確認(見「待辦 → 使用者」)。
- **`typst` 版本鎖在 `=0.15.1`:** `typst` / `typst-layout` / `typst-pdf` / `typst-render` 四個版本必須一致,升級時 `World` trait 的 API 會變動,要一起改 `export/world.rs`。
- **檔案系統第一階段的對話框流程沒有正式人工測試紀錄:** 實際啟動確認過會建立未命名專案、資料庫升級到 v2、視窗標題正確、第二個 App 會立即結束;第二階段的 UI Automation 測試也順帶驗證了「正常關閉 → 未存檔提示 → 不儲存」。開啟 / 另存對話框、圖片在搬移後的顯示還需要使用者確認。
- **Konva 讀取 asset protocol 的圖片沒有設定 `crossOrigin`:** 畫布可能被標記為 tainted,之後實作「匯出 PNG」時要處理。
- **根目錄 `README.md` 還是 Tauri 範本內容:** 沒有專案說明,之後可以考慮改寫或指向 `docs/`。
