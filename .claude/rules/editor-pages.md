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

精簡前的完整原文（UI 細節、決定）：`docs/progress-archive/rules-2026-10/editor-pages.md`。計畫：`docs/Plans/imp-page-settings.html`、`imp-page-switch.md`、`imp-edit-crose-page.md`、`imp-頁面調整.html`、`imp-master-pages.md`、`imp-fix-master.md`。

## 匯出時的展開（`buildExportRequest`，只在副本上）

- 每頁疊放順序（畫布相同）：頁面背景 → 最上層祖先主頁 → … → `masterId` 的主頁 → **對頁跨過書背的複本** → 頁面自己的物件 → 頁碼。
- 展開後的 id：主頁物件 `master:<頁序>:<第幾個>`（`masterCopyId`）、跨頁複本 `spill:<頁序>:<第幾個>`（`spilloverCopyId`）、頁碼 `page-number:<pageId>`。**Rust `require_id` 只收 64 字以內**，不能用 `<UUID>/<UUID>`。
- **Rust render / PDF 模板 / EPUB 都不讀 `masters`、頁碼規則**：主頁、變數、頁碼、跨頁都在前端展開。
- `referenced_assets` 要包含主頁上的圖片，否則只用在主頁的圖片會被開檔清理刪掉。

## 頁碼（`page-numbers.ts` / `page-numbers-dialog.tsx`）

- 規則跟著**頁序**（第 1 頁是奇數頁）；沒有規則涵蓋的頁不顯示。驗證 `isPageNumberRules` 和 Rust 同規則。
- 頁碼 = 虛擬圖形（`pageNumberShape()`：透明矩形 + `stroke` + `label`），**不新增物件類型、Rust 不用改**；不能選取、不在圖層面板、不算捲動範圍。
- 外框寬度由呼叫端**量測**（`MeasureTextWidth`），不要估算（太窄 Konva 會折成兩行），另加 `WRAP_SLACK_PT`。
- 左中 / 右中是直書（字間插 `\n`）。`showPageNumbers` 是 App 偏好、只影響畫布，匯出不讀。
- 對話框是草稿，「確定」一次 `document/setPageNumbering`。

## 單頁 / 雙頁與跨頁物件（`spreads.ts` / `canvas-sheet.tsx`）

- 模式是 App 偏好 `Preferences.pageView`（不進專案、不進復原）。配對：第 1 頁單獨在右，之後 2–3、4–5…（`pageSide`，和頁碼奇偶一致）。編輯主頁一律單頁。
- 對頁的物件畫成 `StaticElement listening`：按下 = `page/select` 再 `selection/set`，事件要 `cancelBubble`；要拖得按第二次。建立工具建在**按下處那一頁**（`pageAt`）。
- 物件只屬於一頁，跨過書背的部分在對頁畫複本（`spilloverInto`，包在 `spineClip` 裡，單頁模式也畫）；雙頁時自己的物件在書背裁切（`clipAtSpine`），**拖曳 / 縮放中目前頁不裁切**且最後畫。
- 匯出的跨頁複本**一律依雜誌配對**，和畫面單頁 / 雙頁無關。
- 放下時整組外框中心過書背 → `element/moveToPage`（`pageAcrossSpine`）；單頁模式與縮放不換頁。Transformer 只掛目前頁的節點。

## 頁面排序（`page-order.ts` / `use-page-tab-drag.ts` / `page-menu.tsx`）

- 三種入口（拖頁籤、`˅` 選單、Ctrl+Shift+PageUp / PageDown）最後都是一次 `page/reorder`，目前頁不變。
- 拖曳插入位置用 `lib/dock` 的 `insertionSlot`，再 `slotToIndex`；邊緣捲動 `edgeScrollDelta`。頁籤列上下 48 px 外放開 = 取消。
- 「頁面」面板不能拖曳排序。

## 主頁（`master-pages.ts` / `pages-panel.tsx` / `page-dialogs.tsx`）

- 只做單頁主頁。**背景不繼承**（主頁背景只在編輯主頁時看、新增頁面時當預設）。主頁物件在頁面上不能選取、不在圖層面板。
- `parentId` 不可循環、最多 `MASTER_DEPTH_MAX` 層（TS `canSetParent` / `isMasterGraphValid` ↔ Rust `validate_master_graph`）。刪除主頁時，套用它的頁面與子主頁改接到它的父主頁。
- 編輯主頁 = `page/select` 主頁 id；這時不畫頁碼（`pageIndex` = -1）、變數照原文。
- 「頁面」面板：兩區的標題列與內容區是**同一層的 flex 子元素**，不量測高度；面板自己捲動（`PANEL_DEFINITIONS` 的 `scroll: "self"`）。拖曳分隔時**直接改 `style.flex`**（不 render），放開才寫回。版面存 localStorage `magazine-editor.pagesPanel.v1`（`parsePagesPanelLayout`）。
- 縮圖（`sheet-thumbnail.tsx`）捲進畫面才建立、`memo`；主頁內容與變數要快取，參考才穩定。**`SheetTile` 不要傳每個方塊各自的 inline handler 或 JSX**（用共用的 `TileActions`）：否則改一頁就讓幾百個方塊重畫（`docs/00-需求分析/06-系統極限測試-報告.md`）。
- `PageDialogsProvider` 包在 `home-page.tsx` 的 `EditorLayout` 外，`usePageDialogs()` 開啟。

## 動態變數（`variables.ts`）

- `TEXT_VARIABLES` 是單一資料來源；只取代完全相符的 token，其他大括號原樣保留。
- 文件只存原文，畫布與縮圖顯示時才換（`resolveElementsVariables`）；**文字編輯框編輯原文**，`bakeTransform` 只回寫位置尺寸，不會把值寫回文字。
