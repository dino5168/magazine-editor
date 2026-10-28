<!-- 迭代 2（commit 8959b47）的 .claude/rules/editor-pages.md 原文；迭代 3 精簡前封存，不再更新 -->

---
paths:
  - "src/lib/editor/page-*.ts"
  - "src/lib/editor/spreads.ts"
  - "src/lib/editor/master-pages.ts"
  - "src/lib/editor/variables.ts"
  - "src/lib/editor/add-pages.ts"
  - "src/components/editor/canvas-sheet.tsx"
  - "src/components/editor/editor-page-bar.tsx"
  - "src/components/editor/use-page-tab-drag.ts"
  - "src/components/editor/page-*.tsx"
  - "src/components/editor/master-edit-banner.tsx"
  - "src/components/editor/sheet-thumbnail.tsx"
  - "src/components/editor/panels/pages-panel.tsx"
  - "src/components/editor/panels/use-section-resize.ts"
  - "src/components/app/settings/page-numbers-dialog.tsx"
  - "src/lib/dock/pages-panel-layout.ts"
---

# 編輯器：頁面（頁碼、跨頁、排序、主頁與變數）

### 頁碼管理（`settings/page-numbers-dialog.tsx` + `lib/editor/page-numbers.ts`）

計畫與決定：`docs/Plans/imp-page-settings.html`。

- **模型**：`PageNumberRule` = 一段頁面（`from`–`to`，1 起算、含兩端，`to` 可以超過目前頁數）+ `start`（第 `from` 頁顯示的數字）+ `odd` / `even`（各自的 `position` 與 `prefix` / `suffix`）+ `style`（字型、字級、粗體、斜體 / 底線 / 刪除線 / 陰影、顏色、`stroke` 框線，整段共用）。第 1 頁是奇數頁；規則跟著**頁序**，不跟著某一頁。沒有規則涵蓋的頁面不顯示頁碼。
- **頁碼 = 虛擬圖形**：`pageNumberShape()` 把規則算成一個 `ShapeElement`（透明矩形 + `stroke` + `label`，id `page-number:<pageId>`），畫布與匯出都沿用既有的圖形 / 圖形內文字路徑，**不新增物件類型、Rust 的 render 不用改**。
  - 畫布：`editor-canvas` 用 `StaticShape`（`listening={false}`）畫在物件之上、邊界參考線之下；不能選取、不在圖層面板、不算進捲動範圍。字型載入前不計算；`usedFontFamilies` 包含頁碼字型。
  - 匯出：`buildExportRequest(document, measureTextLayout, measureLineWidth)` 展開主頁內容之後，用 `withPageNumbers` 把頁碼加到每頁**最上層**（只在匯出的副本，不寫回文件），所以 PDF / EPUB 都有頁碼。匯出不讀 `showPageNumbers`。
- **外框寬度由呼叫端量測**（`MeasureTextWidth`，App 用 `measureLineWidth`），不用估算：估得太窄 Konva 會把頁碼折成兩行。另加 1 pt（`WRAP_SLACK_PT`）防止捨入造成換行。
- **位置**：上 / 下放在邊界區（頁緣到邊界線）正中；左 / 右欄靠左 / 靠右，**文字**（不是外框）對齊內容區的邊，中欄置中於頁面；左中 / 右中**直書**（字與字之間插入 `\n`，每字一行，外框寬一個字），置中於左 / 右邊界區與頁面中線。邊界為 0 或放不下時改用距頁緣 10 mm（`PAGE_NUMBER_FALLBACK_INSET_PT`）。加框線時，框線比文字多出 4 pt 內距（`LABEL_PADDING_PT`）。
- **對話框**：「設定 → 文件 → 頁碼管理...」（`settings.pageNumbers`，`components/app/settings/page-numbers-dialog.tsx`，外框與頁尾用共用的 `SettingsDialog` / `SettingsDialogFooter`）。表單與列表都是草稿，「確定」一次 dispatch `document/setPageNumbering`（一筆復原），「取消」/ Esc 放棄。「加入設定」以表單新增一段、「修改設定」覆寫選中的那段（表單沒變時停用）、「刪除」、「新的一段」（範圍接在最後一段之後，`nextPageNumberRange`）。重疊等錯誤由 `pageNumberRuleError` 給中文訊息並停用按鈕。表單改了沒按「修改設定」就按「確定」不會套用（頁尾有提示）。
- **「在編輯畫面顯示頁碼」**是 App 偏好 `showPageNumbers`（預設開），在這個對話框切換、「確定」才寫入；只影響畫布。
- 字型 / 顏色 / 框線控制項和屬性面板共用 `components/editor/style-controls.tsx`（頁碼不顯示對齊按鈕，對齊由位置決定）。前後置文字只能單行、最多 20 個字（`PAGE_NUMBER_AFFIX_MAX_LENGTH`）。

### 單頁 / 雙頁（跨頁）（`spreads.ts` + `canvas-sheet.tsx` + `pages-panel.tsx`）

計畫與決定：`docs/Plans/imp-page-switch.md`。

- **切換**：「頁面」面板「頁面」標題列中間的 `PageViewToggle`（單頁 / 雙頁兩個 `IconButton`，`aria-pressed`）。模式是 App 偏好 `Preferences.pageView`（localStorage，不存進專案、不進復原歷史、不改檔案格式）。
- **配對**：雜誌慣例，**第 1 頁（封面）單獨在右**，之後 2–3、4–5…；頁數是偶數時最後一頁單獨在左。奇數頁在右（`pageSide`），和頁碼的奇偶頁一致。頁面上緣對齊，左頁 x = 0、右頁 x = 左頁寬；單獨一頁位移 0。
- **畫布**（雙頁模式）：畫目前頁所在的跨頁（`canvasSheets`），換頁時跟著換跨頁；同一跨頁內換頁時範圍不變、畫面不跳。書背虛線 `SpreadSpine`（兩頁之間；封面畫在左緣、最後一頁單獨時畫在右緣）；兩頁並排時用主色框出目前頁。**編輯主頁一律單頁**（主頁沒有左右頁）。
- **編輯**：選取只屬於目前頁（規則不變）。
  - 對頁的物件畫成 `StaticElement listening`（不是 `ElementNode`）：按下物件 = `page/select` 再 `selection/set`（一次點選）；按下對頁背景 = 只切頁。事件 `cancelBubble`，不會清空選取或開始框選。**要拖曳對頁的物件得按第二次**（切頁後才重畫成可拖曳的節點）。
  - 建立工具建在**按下處的那一頁**：`use-canvas-create` 的 `pageAt(screen)` 回傳那一頁與換到它頁面座標的函式，放開時先 `page/select` 再建立（文字草稿也跟著到那一頁）。
  - **跨頁物件**（計畫：`docs/Plans/imp-edit-crose-page.md`）：物件仍只屬於一頁（模型不變），但**跨過書背的部分在對頁也畫、也匯出**，兩頁接得起來（Affinity 的做法）。`spilloverInto(pages, pageIndex)` 找出對頁跨過書背（含旋轉外框，只看書背那一側；單獨一頁沒有）的物件與位移（左頁 → 右頁 `−左頁寬`、右頁 → 左頁 `+左頁寬`）。
    - 疊放順序（畫布與匯出相同）：主頁內容 → **對頁跨過來的複本** → 這一頁自己的物件 → 頁碼。複本的變數用**物件所屬頁**的值。
    - 畫布：複本是 `StaticElement`，包在書背側裁切的 Group（`spineClip`：左頁裁右緣、右頁裁左緣，其他三邊用很大的範圍等於不裁）裡；**單頁模式也畫**（匯出一律套用）。雙頁時每頁自己的物件也在書背處裁切（`clipAtSpine`），跨過去的部分只由對頁的複本顯示；**拖曳 / 縮放中目前頁不裁切**（`interacting`，Layer 的 drag 事件與 Transformer 的 transform 事件），而且目前頁最後畫，拖的時候看得到整個物件。
    - 按複本 = 到物件所屬頁並選取（`onPickElsewhere`）；那一段不能直接拖（從所屬頁那一側或控制點拖）。
    - 匯出：`buildExportRequest` 的 `exportedPage` 加複本，id `spill:<頁序>:<第幾個>`（`spilloverCopyId`），**一律依雜誌配對套用**，和畫面用單頁或雙頁無關。
  - **放下時中心過書背就換頁**（取代原本的「不換頁」）：`handleMoveEnd` 在兩頁都看得到時，用放下的整組外框中心問 `pageAcrossSpine`，過了就送 `element/moveToPage`（一筆復原；開吸附時以被拖的物件為準對齊新頁的格線，因為頁寬不一定是間距的倍數）。單頁模式拖出頁面不換頁；縮放不換頁。
  - Transformer 只掛目前頁的節點，不會兩頁物件一起拖。
- **「頁面」面板**：雙頁模式時縮圖固定兩欄、欄間不留空，最前面一個空格讓第 1 頁落在右欄，左頁靠右、右頁靠左，兩頁貼在一起。
- **匯出**仍是一頁一頁；跨過書背的物件會出現在兩頁（見上面的跨頁物件）。頁碼、動態變數、主頁內容都以頁為單位，兩頁並排各自正確。

### 頁面排序（`page-order.ts` + `editor-page-bar.tsx` + `page-menu.tsx`）

計畫與決定：`docs/Plans/imp-頁面調整.html`。

- 三種入口，最後都是一次 `page/reorder`（一筆復原），目前頁不變：
  - **拖曳頁籤**（`use-page-tab-drag.ts`）：按在選單 / 刪除按鈕上或改名中不開始拖曳；4 px 門檻，點擊與雙擊改名照常；只在放下會改變順序時畫插入線；頁籤列上下 48 px 外放開 = 取消；靠近左右邊緣 40 px 自動捲動（`pointer-drag.ts` 的 `edgeScrollDelta`，停靠區的頁籤列也用）。插入位置用 `lib/dock` 的 `insertionSlot`（任一軸），空隙換算新位置用 `slotToIndex`。
  - **目前頁籤的 `˅` 選單**：向左 / 向右 / 移到最前 / 移到最後（`shiftedPageOrder` 回傳 `null` 時停用）；`≡` 選單沒有這些項目。
  - **Ctrl+Shift+PageUp / PageDown**：往前 / 往後一格（`use-editor-shortcuts.ts`，在換頁之前判斷）。
- 頁碼規則跟著**頁序**：頁面換位置後頁碼依新位置重新計算。
- 不做「頁面排序」對話框。2026-10-06 時使用者不要「頁面」工具面板；**2026-10-07 為了主頁改成要**（Affinity 式，見「主頁與動態變數」）。面板目前不能拖曳排序，排序仍用上面三種入口。

### 主頁與動態變數（`master-pages.ts` / `variables.ts` / `add-pages.ts` + `pages-panel.tsx` / `page-dialogs.tsx`）

計畫與決定：`docs/Plans/imp-master-pages.md`。參考 Affinity Publisher，**只做單頁**（沒有跨頁 / spread）。

- **模型**：見「文件模型」的主頁。**繪製順序**（下 → 上）：頁面背景 → 最上層祖先主頁的物件 → … → `masterId` 指的主頁的物件 → 頁面自己的物件 → 頁碼。`masterChain` / `inheritedElements` 算出要畫哪些主頁內容。
  - **背景不繼承**：頁面背景是頁面自己的；主頁背景只在編輯主頁時看到，以及新增頁面時當預設值。
  - **主頁物件在頁面上不能選取**、不在圖層面板、不算進捲動範圍；要改就切去編輯主頁。Affinity 的 Detach / 在頁面上改主頁物件不做。
  - 階層：`parentId` 不可循環，一條鏈最多 8 層（`MASTER_DEPTH_MAX`，TS `canSetParent` / `isMasterGraphValid` 與 Rust `validate_master_graph` 同規則）。
  - 刪除主頁：直接套用它的頁面與以它為基礎的子主頁，改接到它的父主頁（沒有就變成「無」）。
- **畫布**（`canvas-sheet.tsx` 的 `CanvasSheet`）：主頁內容用 `StaticElement`（`canvas-elements.tsx`，預設不攔事件，文字屬性和 `ElementNode` 共用 `textAttrs`）畫在頁面物件之下；編輯子主頁時父主頁的內容也畫在底下。`usedFontFamilies` 包含主頁。
- **編輯主頁模式**：`page/select` 主頁的 id。畫布上方 `MasterEditBanner`（主頁名稱、以誰為基礎、`pagesUsingMaster` 幾頁使用、「回到頁面」→ `selectReturnPageId`）；頁籤列沒有頁籤被選取、頁碼欄顯示「–」；不畫頁碼（`pageIndex` = -1）；變數照原文顯示。
- **「頁面」面板**（`pages-panel.tsx`，預設左側範本下方）：上半主頁、下半頁面，各有新增 / 複製 / 刪除；點縮圖切換、雙擊名稱改名、`⋮` 或右鍵選單（頁面：套用主頁 ▸；主頁：以…為基礎 ▸，會循環或太深的選項停用）。刪除前 AlertDialog 說明後果。計畫：`docs/Plans/imp-fix-master.md`。
  - **兩區各自收合**：標題列最左邊的箭頭是收合鈕（**只有箭頭**是按鈕，標題是一般文字，才抓得到標題拖曳）。收起的區只剩標題列，另一區佔滿；收起的「頁面」標題列貼在面板底部；兩區都收起時標題列靠上。
  - **高度分配**：兩區的標題列與內容區是**同一層的 flex 子元素**（`Section` 回傳 header + 內容，不包外層），內容區 `flex: <比例> 1 0px` 分配標題列以外的高度、各自用 `DockScrollArea` 捲動，**不量測高度**。這需要面板自己處理捲動：`PANEL_DEFINITIONS` 的 `scroll: "self"`，`DockPanel` 對它不包共用捲動區。
  - **拖曳**（`use-section-resize.ts`）：只有兩區都展開時可拖「頁面」標題列（按在按鈕上不算）；走 `startPointerDrag`（`cursor: "row-resize"`）；拖曳中**直接改兩個內容區的 `style.flex`**（不 render、縮圖不重畫），放開才寫回、Esc 改回原值；雙擊還原 0.35（`MASTERS_RATIO_DEFAULT`）；標題列上緣的 `role="separator"` 可用 ↑ / ↓ 每次 16 px；兩區內容各至少 80 px（`PAGES_SECTION_MIN_PX`，`resizeMastersRatio`）。
  - **記憶**：`PagesPanelLayout`（`mastersCollapsed` / `pagesCollapsed` / `mastersRatio`，存比例不存 px）是 App 偏好，localStorage `magazine-editor.pagesPanel.v1`，讀取過 `parsePagesPanelLayout`；不進復原歷史、不存進專案。
  - **縮圖**（`sheet-thumbnail.tsx`）：小 Konva Stage 畫 `StaticElement`，**捲進畫面才建立**（`IntersectionObserver`），`memo` 只在 sheet / 內容參考改變時重畫；主頁內容由 `masterContent` 依主頁快取、頁面的變數依文件快取，參考才穩定。縮圖不畫頁碼。
  - **頁面方塊**（`SheetTile`）也是 `memo`：props 只有原始值、文件物件與共用的 `TileActions`（以 id 為參數、`useMemo([dispatch])`），選單內容在方塊裡依 `kind` 組出來。**不要再傳每個方塊各自的 inline handler 或 JSX**：改一頁就會讓幾百個方塊（各帶 Radix 選單）全部重畫（200 頁壓力測試，見 `docs/00-需求分析/06-系統極限測試-報告.md`）。
- **對話框**（`page-dialogs.tsx`，`PageDialogsProvider` 包在 `home-page.tsx` 的 `EditorLayout` 外，`usePageDialogs()` 開啟；外框沿用 `SettingsDialog`）：
  - 新增頁面（頁籤列「+」= 加在最後；「插入頁面...」與面板 = 目前頁之後）：主頁、頁數 1–100（`ADD_PAGES_MAX`）、之前 / 之後、第幾頁 → 一次 `page/addMany`（一筆復原）。預設主頁 = 正在編輯的主頁 → 目前頁的主頁 → 第一個主頁。新頁面背景用主頁的背景。名稱照 `nextPageNames`（建立順序編號，不跟位置）。
  - 新增主頁：名稱（`nextMasterName`：Master A、B…）、以…為基礎（編輯某主頁時預設以它為基礎）→ `master/add`，切過去編輯。
- **動態變數**（`variables.ts`）：`{頁碼}`（`displayedPageNumber`：有頁碼規則涵蓋就依規則與起始值，否則第幾頁）、`{總頁數}`、`{文件名稱}`、`{頁面名稱}`；`TEXT_VARIABLES` 是單一資料來源。文字物件與圖形內文字都可以用；**只取代完全相符的 token**，其他大括號原樣保留（不需要跳脫）。
  - 文件只存原文。畫布與頁面縮圖顯示時才換（`resolveElementsVariables`，沒變時回傳同一個參考）；主頁上照原文；**文字編輯框編輯的是原文**（`page.elements`），畫布顯示的是換過的副本，`bakeTransform` 只回寫位置與尺寸所以不會把值寫回文字。
  - 屬性面板「文字」分頁的「插入變數」按鈕把 token 加在文字最後（一筆復原）。
  - 頁碼規則與 `{頁碼}` 並存：同一頁兩者都用會出現兩次，由使用者決定，程式不擋。
- **匯出**：`buildExportRequest` 在副本上逐頁 `exportedPage`（主頁內容放最下面、接著對頁跨過書背的物件、再來頁面自己的物件，都換變數）再 `withPageNumbers`，**Rust render / PDF 模板 / EPUB 都不讀 `masters`**。展開後的主頁物件 id 是 `master:<頁序>:<第幾個>`（`masterCopyId`）：`textLayouts` 以 id 為 key、同一個主頁物件每頁文字不同，而 **Rust `require_id` 只接受 64 字以內**，`<UUID>/<UUID>` 會超過。
- **檔案**：`referenced_assets`（開檔清理沒引用的圖片）包含主頁上的圖片，否則只用在主頁的圖片會被刪掉。

## 檔案（原 CLAUDE.md「目錄結構」）

```
      page-numbers-dialog.tsx     # 「頁碼管理」：頁碼型態、套用頁面與起始值、奇偶頁位置與前後置文字、設定列表、「顯示頁碼」開關
      editor-page-bar.tsx         # draw.io 風格頁籤：新增（「+」開新增頁面對話框）/ 切換 / 雙擊改名 / 刪除（AlertDialog）/ 拖曳排序（插入線）、滾輪橫捲、`<` `>` 與頁碼輸入框（編輯主頁時顯示「–」）
      use-page-tab-drag.ts        # 拖曳頁籤調整順序：插入位置（insertionSlot）、頁籤列上下 48 px 內才算、左右邊緣自動捲動
      page-menu.tsx               # 頁面清單選單（`≡` 與目前頁籤的 `˅` 共用）：插入頁面...（新增頁面對話框）、切換頁面；`˅` 另有目前頁的向左 / 向右 / 移到最前 / 移到最後（pageActions）
      sheet-thumbnail.tsx         # 頁面 / 主頁縮圖：小 Konva Stage + StaticElement，捲進畫面才建立、memo
      page-dialogs.tsx            # PageDialogsProvider / usePageDialogs：「新增頁面」「新增主頁」對話框（頁籤列、頁面選單、頁面面板共用）
      master-edit-banner.tsx      # 編輯主頁時畫布上方的提示（主頁名稱、以誰為基礎、幾頁使用）與「回到頁面」
      page-numbers.ts             # 頁碼：規則 → 虛擬圖形（pageNumberShape / withPageNumbers）、驗證（isPageNumberRules，和 Rust 同規則）、對話框的說明與錯誤訊息
      page-navigation.ts          # 換頁的純邏輯：頁碼解析、上 / 下 / 第一 / 最後一頁、換頁按鍵與移動頁面的按鍵（Ctrl+Shift+PageUp / PageDown）
      page-order.ts               # 頁面排序的純邏輯：isPageOrder、movePage、shiftPage / shiftedPageOrder（選單與快捷鍵）、slotToIndex（拖曳的空隙 → 新位置）
      spreads.ts                  # 跨頁：pageSide（第 1 頁在右）、spreadIndexOf / spreadsOf / spreadOf（1 ／ 2–3 ／ 4–5…）、canvasSheets（畫布畫哪些頁、各自的位移）、canvasSlotAt（某一點落在哪一頁）、spilloverInto（對頁跨過書背的物件）、pageAcrossSpine（放下時中心過書背要搬去的頁）
      master-pages.ts             # 主頁：findSheet、masterChain / inheritedElements / masterContent（要畫哪些主頁內容）、canSetParent / isMasterGraphValid（循環與深度，和 Rust 同規則）、deleteMaster、pagesUsingMaster、nextMasterName
      variables.ts                # 動態變數：TEXT_VARIABLES（{頁碼} {總頁數} {文件名稱} {頁面名稱}）、variableValues（主頁回傳 null）、resolveElementsVariables
      add-pages.ts                # 新增頁面 / 主頁對話框的純邏輯：預設值、錯誤訊息、插入位置、建立新頁面
```
