# 專案進度

> **用途:** 交接用。`CLAUDE.md` 已要求 Claude 開始工作前先讀這份檔案,開新對話時不用重新探索整個專案。
> **更新時機:** 每段工作結束前(或 `/clear` 之前),請 Claude 更新這份檔案。
> **注意:** repo 是 public,不要在這裡寫個人資訊、本機路徑或金鑰。

最後更新:2026-10-07(主頁與動態變數完成)

---

## 目前階段

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
| 顏色**只能從 Tailwind v4 色票選**(經典 22 色系 + 黑白),不保留自訂顏色;頁面背景也用調色板 | 使用者確認(2026-09-30),見 `docs/01-Plans/imp-color-picker.md` |
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

- [ ] 在 `npm run tauri dev` 手動驗證**跨頁物件**:雙頁模式把圖片拖到一半跨過書背 → 兩頁都看得到、接得起來;實際按「匯出 PDF」看第 2、3 頁是否接得起來;拖到中心過書背放開 → 改成屬於另一頁,Ctrl+Z 一次回去;**注意:以前單頁模式下剛好超出內側(左頁右緣 / 右頁左緣)的物件,現在匯出會出現在隔壁頁**
- [ ] 在 `npm run tauri dev` 手動驗證**單頁 / 雙頁**(Claude 只用瀏覽器模式驗證過):「頁面」標題列中間切到雙頁 → 第 1 頁單獨在右、之後兩頁並排;點另一頁的物件直接選到;在另一頁用圖形 / 文字工具建立;開吸附時在右頁拖曳仍落在格線上;切回單頁;重開 App 模式仍在
- [ ] 在 `npm run tauri dev` 手動驗證**主頁與動態變數**(Claude 只用瀏覽器模式、`export_preview` / `epub_preview` 驗證過):
  - 已存過版面的 App 看不到「頁面」面板:從「設定 → 工具面板 → 頁面」打開(或「重設版面」)
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
