# 主頁（Master Pages）與動態變數：實作計畫

- 任務檔：`docs/01-Plans/07-階層式主頁.md`（不 commit）；參考截圖 `docs/images/Affinity-Master-Pages.png`、`docs/Plans/Images/Affinity-addpages.png`
- 狀態：**八個步驟全部完成（2026-10-07）**，尚未 commit；桌面版人工驗證待做（見 `docs/progress.md`）。決定見第 6 節，進度與和計畫不同的地方見第 7 節。
- 建立：2026-10-07

---

## 1. 目標

仿照 Affinity Publisher：

1. **主頁**：一頁放「每頁都要有」的東西（頁首、頁尾、刊頭、色塊、頁碼），一般頁面套用它，主頁改一次所有頁面跟著變。
2. **階層式主頁（子主頁）**：主頁也可以套用另一個主頁（例如「Master B 以 Master A 為基礎，再多一個側欄」）。
3. **動態變數**：文字裡放 `{頁碼}`、`{總頁數}` 這類欄位，畫到每一頁時換成該頁的值；放在主頁上就是「每頁自動有正確頁碼的頁尾」。
4. **新增頁面改成對話框**（Add Pages）：選主頁、頁數、插在第幾頁之前 / 之後。**操作順序**：先新增主頁 → 新增頁面時選要套用哪個主頁。新增主頁時也能選以哪個主頁為基礎。
5. 這次只做**單頁**；Affinity 的跨頁（spread）、「Spread wrapping」先不做，看結果再調整。

## 2. 現況（和這次有關的部分）

| 項目 | 現況 |
|---|---|
| 模型 | `EditorDocument.pages: Page[]`，`Page` = id / name / 尺寸 / 背景 / `elements`。沒有任何「共用內容」的概念 |
| 新增頁面 | 頁籤列「+」與頁面選單「插入頁面」直接 dispatch `page/add`（沿用目前頁的尺寸與背景），沒有對話框 |
| 頁碼 | `pageNumberRules`：文件只存規則，畫布與匯出時算成「虛擬圖形」（`page-numbers.ts`），不是物件 |
| 匯出 | `buildExportRequest` 在前端把頁碼加進每頁的**副本**再交給 Rust；Rust render 只認 `pages[].elements` |
| 編輯 | reducer 所有 `element/*` action 都作用在 `activePageId` 指到的頁面 |
| 先前的決定 | 2026-10-06 頁面排序時使用者說「**不要『頁面』工具面板（縮圖清單）**」——但這次要仿 Affinity 的 Pages 面板，見待討論 Q1 |

## 3. 設計（建議案）

### 3.1 文件模型

```ts
/** 頁面與主頁共有的部分（畫布、格線、捲動範圍只需要這些） */
interface Sheet {
  id; name; width; height; background;
  elements: CanvasElement[];
}
interface Page extends Sheet {
  /** 套用的主頁；null = 不套用 */
  masterId: PageId | null;
}
interface MasterPage extends Sheet {
  /** 以哪個主頁為基礎（子主頁）；null = 最上層 */
  parentId: PageId | null;
}
interface EditorDocument {
  ...;
  masters: MasterPage[];   // 新增
  pages: Page[];
}
```

- 主頁放在**另一個陣列**：頁碼規則、頁序、換頁鍵、頁籤列、匯出頁數都只看 `pages`，不用到處排除主頁。
- 頁面與主頁的 id 在整份文件中唯一（`activePageId` 可以指到任何一個）。
- **繪製順序**（下 → 上）：頁面背景 → 最上層祖先主頁的物件 → … → 直接套用的主頁物件 → 頁面自己的物件 → 頁碼（既有）。
- **背景**：頁面背景仍是頁面自己的（主頁的背景只在編輯主頁、以及新增頁面時當作預設值）。理由：背景面板與 `page/setBackground` 不用改語意。（見 Q4）
- **尺寸**：主頁也有寬高，`document/setPageSetup` 一併改主頁。所有頁面目前本來就同尺寸。
- 主頁上的物件在一般頁面上**不能選取、不在圖層面板**（和頁碼一樣是靜態節點）；要改就切去編輯主頁。Affinity 的「Detach / 在頁面上編輯主頁物件」這次不做。
- 階層限制：不可形成循環；深度上限（建議 8 層）；TS 與 Rust 用同一規則驗證。
- `SCHEMA_VERSION` 7：舊檔缺 `masters` → 空陣列、缺 `masterId` → null（serde 預設，不需要升級步驟）。

### 3.2 動態變數

- 寫法：文字（文字物件、圖形內文字）裡的 `{頁碼}`、`{總頁數}`、`{文件名稱}`、`{頁面名稱}`。只取代**完全相符**的這幾個，其他大括號原樣保留（不需要跳脫規則）。
- `{頁碼}` 的值：**頁碼規則算出的數字**（含起始值）；該頁不在任何規則範圍內時用實體頁序（第幾頁）。（見 Q3）
- 文件只存含 `{…}` 的原文；畫布與匯出時才換成該頁的值（`lib/editor/variables.ts`，純函式）。
  - 在一般頁面上畫：換成該頁的值。
  - 編輯主頁時：照原文顯示 `{頁碼}`（看得出是欄位）。
  - 文字編輯框（textarea）顯示原文。
- 插入方式：屬性面板「文字」分頁加「插入變數 ▾」選單（附加到文字尾端）；也可以直接打字輸入。

### 3.3 介面

1. **「頁面」工具面板**（仿 Affinity Pages 面板，預設在右側）：
   - 上半「主頁」、下半「頁面」，各自有「新增 / 複製 / 刪除」按鈕。
   - 每一列：縮圖（見 Q2）+ 名稱；頁面列另外標出套用的主頁（例如角落的「A」）。
   - 點一下 = 切換到該頁 / 進入編輯該主頁；雙擊名稱 = 改名。
   - 右鍵（或 `⋮`）選單：頁面「套用主頁 ▸」；主頁「改名 / 以…為基礎 ▸ / 刪除」。
2. **新增頁面對話框**（頁籤列「+」、頁面選單「插入頁面」、面板的「新增頁面」都開它）：
   - 主頁（下拉：無 / 各主頁）、頁數（1–100）、插入（之前 / 之後）、頁（第幾頁，預設目前頁）。
   - 確定 = 一次 `page/addMany`（一筆復原），切到第一個新頁。
3. **新增主頁對話框**：名稱（預設 `Master A`、`Master B`…）、以哪個主頁為基礎（無 / 各主頁）。
4. **編輯主頁時**：畫布上方顯示「正在編輯主頁：Master A（套用於 N 頁）」與「回到頁面」按鈕；頁籤列沒有任何頁籤被選取，頁碼輸入框顯示「–」；不畫頁碼。

### 3.4 reducer 新 action（全部進復原歷史；新 id 由呼叫端帶入，維持純函式）

| action | 說明 |
|---|---|
| `master/add { master }` | 加一個主頁（可帶 `parentId`），切過去編輯 |
| `master/rename { id, name }` | |
| `master/setParent { id, parentId }` | 會造成循環或超過深度時 no-op |
| `master/delete { id }` | 套用它的頁面 → 改套它的父主頁（沒有父主頁就變成 null）；以它為基礎的子主頁同樣接到它的父主頁（見 Q4） |
| `master/duplicate { id, newId, elementIds }` | 複製主頁（含物件） |
| `page/addMany { pages, index }` | 新增頁面對話框：一次插入多頁 |
| `page/setMaster { ids, masterId }` | 套用主頁（可多頁） |
| `page/duplicate { id, newId, elementIds }` | 面板的「複製頁面」 |

- `page/select` 改成可以選主頁；`selectActivePage` 回傳 `Sheet`（頁面或主頁），既有 `element/*` 不用改就能編輯主頁的物件。
- `reconcileSelection`：復原後 `activePageId` 若是已刪除的主頁 → 回到第一頁。
- 既有的 `page/add`（直接加一頁）保留給測試與內部使用，UI 改走對話框。

### 3.5 匯出

- 沿用頁碼的做法：`buildExportRequest` 在**副本**上把每頁的主頁物件（含祖先）展開到頁面物件最下面、變數換成該頁的值，再量測換行。**Rust render、PDF 模板、EPUB 都不用改。**
- 展開後的物件 id 改成 `<pageId>/<原 id>`：同一個主頁物件出現在很多頁，而且變數換完每頁文字不同，`textLayouts` 以 id 為 key 不能共用。
- Rust `format.rs` 仍要認得 `masters` / `masterId`（存檔與驗證），只是 render 不讀 `masters`。

## 4. 步驟

每一步做完停下來，等使用者說「繼續」。

| 步驟 | 內容 | 畫面變化 | 驗證 |
|---|---|---|---|
| **1. 模型與 reducer** | `types.ts`（`Sheet` / `MasterPage` / `masterId` / `masters`）；`lib/editor/master-pages.ts`（祖先鏈、展開物件、循環與深度檢查、下一個主頁名稱）；新 action；`selectActivePage` 回傳 `Sheet`；`createSampleDocument` / `createPage` 補欄位 | 無 | vitest |
| **2. 檔案格式 v7** | Rust `format.rs`（`MasterPage`、`master_id`、驗證：引用存在、無循環、深度、id 唯一）、`SCHEMA_VERSION` 7、舊檔預設值、備份檔；TS 對應的驗證；fixture 加一個子主頁；`types.html` | 無 | Rust + vitest（**必須在任何 UI 能產生主頁之前完成**，否則存檔會靜默丟掉主頁，因為 Rust 會略過不認得的巢狀欄位） |
| **3. 畫布** | 一般頁面畫出主頁物件（新的 `StaticElement`：文字 / 圖形 / 圖片都能靜態畫，不攔事件）；字型載入涵蓋主頁物件；編輯主頁模式（橫幅、「回到頁面」、頁籤列狀態、不畫頁碼） | 先用 fixture / 測試資料看得到 | 無頭 Edge |
| **4. 「頁面」工具面板** | `PANEL_DEFINITIONS` 加 `pages`；主頁 / 頁面兩區、新增（暫時直接加）/ 複製 / 刪除、點選切換、改名、套用主頁、以…為基礎；縮圖依 Q2 | 有 | 無頭 Edge |
| **5. 新增頁面 / 新增主頁對話框** | 兩個對話框；頁籤列「+」、「插入頁面」、面板按鈕改開對話框；`page/addMany` | 有 | 無頭 Edge |
| **6. 動態變數** | `variables.ts`（解析與取代）；畫布顯示；屬性面板「插入變數 ▾」 | 有 | vitest + 無頭 Edge |
| **7. 匯出** | `buildExportRequest` 展開主頁與變數（id 加前綴）；PDF `export_preview` 疊圖、EPUB 截圖比對 | PDF / EPUB 有主頁內容 | Rust + vitest + 疊圖 |
| **8. 文件同步** | `CLAUDE.md` 新增「主頁與動態變數」一節並同步目錄結構、文件模型、「新增物件類型要改的地方」；`docs/01`/`02`；`progress.md` | 無 | — |

## 5. 規劃檢核（發現的問題與處理方式）

1. **Rust 會丟掉不認得的巢狀欄位**（只保留最上層未知欄位）：如果先做 UI 再改格式，存檔會讓主頁消失 → 步驟 2 排在任何 UI 之前。
2. **`selectActivePage` 回傳型別改變**：有不少地方的參數型別寫 `Page`（`getContentBounds`、`PageGrid`、`MarginGuide`、`pageNumberShape`…）。改成吃 `Sheet`；只有頁碼、頁籤列真的需要 `Page`。`tsc` 會列出所有要改的地方。
3. **`activePageId` 指到主頁時**：頁籤列的 `activeIndex` 會是 −1（`<` `>`、頁碼輸入框、`˅` 選單要處理）；換頁鍵（PageUp…）從主頁按下時跳到第一頁；`pageNumberShape` 用的 `pageIndex` 也是 −1 → 不畫頁碼。
4. **匯出的 id 衝突**：同一個主頁物件會出現在多頁，`textLayouts` 以 id 為 key → 展開時加 `<pageId>/` 前綴（3.5）。
5. **既有 `page/add` 不純**（reducer 內呼叫 `createId`）：新 action 一律由呼叫端帶 id，舊的不動。
6. **刪除主頁的連鎖**：頁面與子主頁都要接到父主頁，否則會留下指向不存在主頁的引用 → reducer 一次處理，Rust 驗證也會擋。
7. **捲動範圍**：主頁物件不能選取，暫不算進捲動範圍（和頁碼一致）；超出頁面的主頁物件在一般頁面上可能捲不到，可接受（要改就去編輯主頁）。
8. **頁碼規則與 `{頁碼}` 並存**：兩者都能在頁面上顯示頁碼，使用者可能重複放。維持兩者並存，`{頁碼}` 的數字跟著頁碼規則（見 Q3）。
9. **縮圖效能**：頁數多時每頁一個 Konva Stage 很重；建議先用「離畫面的 Stage 產生小圖並快取（文件變了才重畫）」，或第一版只畫頁面色塊 + 名稱（見 Q2）。
10. **與 2026-10-06 決定衝突**：當時使用者明確說不要「頁面」工具面板（縮圖清單）。這次的 Affinity Pages 面板就是這種面板 → 必須先確認（Q1）。

## 6. 待討論

| # | 問題 | 建議 |
|---|---|---|
| Q1 | 主頁 / 頁面的管理介面要放哪裡？（之前說過不要「頁面」工具面板） | 新增仿 Affinity 的「頁面」工具面板（主頁 + 頁面兩區），**底部頁籤列保留** |
| Q2 | 面板上的縮圖 | 真的縮圖（離畫面算圖並快取） |
| Q3 | `{頁碼}` 顯示的數字 | 跟頁碼規則（含起始值）；沒有規則涵蓋時用實體頁序 |
| Q4 | 刪除主頁時，套用它的頁面與子主頁怎麼辦？背景要不要繼承？ | 接到它的父主頁（沒有就變成「無」）；背景不繼承，只當新增頁面時的預設值 |

**使用者決定（2026-10-07）：四題都採用建議。**

- Q1：新增「頁面」工具面板（主頁 + 頁面兩區），底部頁籤列保留。這次是使用者主動要求，取代 2026-10-06「不要頁面工具面板」的決定。
- Q2：真的縮圖（離畫面算圖並快取，文件變了才重畫）。
- Q3：`{頁碼}` 跟頁碼規則（含起始值），沒有規則涵蓋時用實體頁序；頁碼規則保留。
- Q4：刪除主頁時，套用它的頁面與子主頁接到它的父主頁（沒有就變成「無」）；背景不繼承，主頁背景只當新增頁面的預設值。

## 7. 進度

### 步驟 1（2026-10-07，完成）

- `types.ts`：`Sheet`（頁面與主頁共有）、`Page.masterId`、`MasterPage.parentId`、`EditorDocument.masters`。
- `lib/editor/master-pages.ts`：`findSheet` / `isMasterId`、`masterChain` / `inheritedElements`、`canSetParent`（循環、深度 `MASTER_DEPTH_MAX` = 8）、`isMasterGraphValid`（步驟 2 和 Rust 對照用）、`deleteMaster`、`nextMasterName`、`copyElements`。
- `element-factory.ts`：`createPage` 多一個 `masterId` 參數、`createMasterPage`、`nextPageNames`（從 reducer 搬出來，新增頁面對話框也要用）。
- reducer：`page/addMany`、`page/duplicate`、`page/setMaster`、`master/add`、`master/duplicate`、`master/setParent`、`master/delete`；`page/select` 可以選主頁；`selectActivePage` 回傳 `Sheet`，`element/*` 不用改就能編輯主頁；`document/setPageSetup` 一併改主頁尺寸；`page/add` 沿用目前頁的主頁（編輯主頁時套用該主頁）。
- **和計畫不同**：
  - 沒有 `master/rename`：`page/rename` 與 `page/setBackground` 改成頁面、主頁都適用（背景面板在編輯主頁時就是改主頁背景）。
  - Rust `format.rs` 的 serde 欄位（`masters`、`masterId`、`MasterPage`，缺少時預設空 / null）**提前在這一步加入**：共用 fixture 必須和 TS 模型同欄位（vitest 守著），而 Rust 的 round-trip 測試會擋下「讀進來再存會丟欄位」。順便讓桌面版讀舊檔時前端一定拿得到 `masters: []`。驗證、`SCHEMA_VERSION` 7、fixture 的子主頁、`types.html` 仍在步驟 2。
- 測試：vitest 303 個（新增 27 個）、Rust 97 個通過。畫面沒有變化。

### 步驟 2（2026-10-07，完成）

- Rust `format.rs`：`SCHEMA_VERSION` 7；`validate_content` 也驗證主頁（共用 `validate_sheet`：id、尺寸、背景、物件）；`validate_master_graph`（頁面與主頁 id 不重複、`masterId` / `parentId` 指向存在的主頁、鏈長 ≤ `MASTER_DEPTH_MAX` = 8，循環會在超過上限時被擋下）。v6 以前的檔案不需要升級步驟（serde 預設空）。
- **檢核時多發現的一處**：`referenced_assets` 原本只看頁面的圖片，開檔時會把「只用在主頁上的圖片」當成沒引用而刪掉 → 改成連主頁一起算（測試守著）。
- fixture：v7，`master-a`（色帶）→ `master-b`（頁尾文字 `{頁碼}` + 只在主頁用到的圖片），第 1 頁套用 `master-b`。
- vitest 的 fixture 測試：主頁欄位名稱和 `createMasterPage` 一致、`isMasterGraphValid` 通過、`masterChain` 是 A → B。
- `docs-website/types.html`：`EditorDocument.masters`、`Page`（extends `Sheet`，`masterId`）、新的主頁區（`Sheet` / `MasterPage` / 繪製順序說明），`Sheet` / `MasterPage` 說明卡。
- `CLAUDE.md` 的 `schemaVersion` 描述留到步驟 8 一起改。
- 測試：vitest 304 個、Rust 100 個通過。畫面沒有變化。**存成 v7 後舊版 App 無法開啟。**

### 步驟 3（2026-10-07，完成）

- 畫布：一般頁面先畫主頁（含父主頁）的物件，再畫頁面自己的物件；主頁物件用新的 `StaticElement`（`canvas-elements.tsx`，`listening={false}`，文字屬性和 `ElementNode` 共用 `textAttrs`，畫出來一樣）。編輯子主頁時，父主頁的物件同樣畫在底下、不能選取。
- 字型：`usedFontFamilies` 包含主頁上的文字。
- 編輯主頁模式：
  - 畫布上方的提示（`master-edit-banner.tsx`）：主頁名稱、以哪個主頁為基礎、幾頁使用（`pagesUsingMaster`，含透過子主頁使用的頁面）、「回到頁面」。
  - 「回到頁面」回到進入主頁前的那一頁：`EditorState.lastPageId`（UI 狀態，每次切到頁面時記下；`selectReturnPageId` 在那一頁被刪掉時改回第一頁）。
  - 頁籤列沒有頁籤被選取、頁碼輸入框顯示「–」、不畫頁碼；`≡` 選單的「插入頁面」在編輯主頁時加在最後（原本會因找不到目前頁而沒反應）。
- 測試：vitest 306 個；無頭 Edge 15 項（主頁內容畫在頁面上且不能點選、沒套用主頁的頁面不畫、提示文字、頁籤與頁碼欄、編輯 B 時 A 的內容仍在、B 的物件可選取、回到頁面、編輯主頁時新增的頁面套用該主頁、console 沒有錯誤）。
- 目前**還沒有 UI 能建立主頁**（步驟 4 的面板），所以這一步的畫面只能用測試腳本看到。

### 步驟 4（2026-10-07，完成）

- `PANEL_DEFINITIONS` 加 `pages`「頁面」（icon `Files`），**預設在左側、範本下方**（和 Affinity 的 Pages 面板同側）。已經存過版面的使用者不會自動出現，要從「設定 → 工具面板 → 頁面」打開，或「重設版面」。
- `components/editor/panels/pages-panel.tsx`：
  - 上半「主頁」、下半「頁面」，各有新增 / 複製 / 刪除按鈕（主頁的複製 / 刪除作用在正在編輯的主頁，頁面的作用在目前頁）。沒有主頁時顯示說明。
  - 縮圖格子（96 px 寬，依頁面比例），點縮圖 = 切到該頁 / 編輯該主頁；雙擊名稱改名；頁面縮圖右下角標出套用的主頁、名稱前有頁序；主頁下方標「以 X 為基礎」。
  - `⋮`（或右鍵）選單：頁面「套用主頁 ▸（無 / 各主頁）/ 重新命名 / 複製頁面 / 刪除頁面」；主頁「以…為基礎 ▸（無 / 其他主頁，會循環或太深的停用）/ 重新命名 / 複製主頁 / 刪除主頁」。
  - 刪除前確認：主頁會說明「直接套用它的 N 頁與 M 個子主頁會改成套用 X / 不套用主頁」。
  - 「新增主頁」「新增頁面」暫時直接新增（步驟 5 改成對話框）。
- `components/editor/sheet-thumbnail.tsx`：真的縮圖。用和畫布相同的 `StaticElement` 畫在一個小 Konva Stage 裡；**捲進畫面才建立 Stage**（`IntersectionObserver`），`memo` 只在頁面或繼承內容變了才重畫（主頁內容由 `master-pages.ts` 新的 `masterContent` 依主頁快取，主頁沒變時陣列參考不變）。縮圖不畫頁碼。
- 測試（步驟 4）：vitest 306 個；無頭 Edge 17 項（預設開啟、說明文字、新增主頁、右鍵套用主頁、主頁標籤、點縮圖切頁、頁面縮圖含主頁內容、以…為基礎、循環選項停用、雙擊改名、複製頁面、刪除主頁的說明與結果、一次復原、console 沒有錯誤）。

### 步驟 5（2026-10-07，完成）

- `lib/editor/add-pages.ts`（純函式）：`addPagesDefaults`（主頁 = 正在編輯的主頁 → 目前頁的主頁 → 第一個主頁；位置 = 「+」在最後一頁之後、「插入頁面」在目前頁之後，編輯主頁時也是最後）、`addPagesError`（頁數 1–100 `ADD_PAGES_MAX`、頁 1–頁數、主頁存在，中文訊息）、`addPagesIndex`、`buildAddedPages`（`Page-N` 名稱、尺寸跟旁邊那一頁、背景用主頁的背景（沒選主頁時用旁邊那一頁的））、`addMasterError`（名稱、父主頁深度）。
- `components/editor/page-dialogs.tsx`：`PageDialogsProvider`（放在 `home-page.tsx` 的 `EditorLayout` 外層）與 `usePageDialogs()`，外框沿用設定對話框的 `SettingsDialog` / `SettingsDialogFooter`。
  - 新增頁面：主頁（無 / 各主頁）、頁數、插入（之前 / 之後）、頁（`/ 總頁數`）；錯誤時停用「確定」並顯示原因；Enter 送出；一次 `page/addMany` = 一筆復原，切到第一個新頁。
  - 新增主頁：名稱（預設 `nextMasterName`）、以…為基礎（無 / 各主頁；編輯某個主頁時預設以它為基礎）。
- 入口：頁籤列「+」→ 新增頁面（最後）；`≡` / `˅` 的「插入頁面...」→ 新增頁面（目前頁之後）；面板的「新增頁面」「新增主頁」→ 對話框。
- 已知：新頁面的名稱照建立順序編號（插在第 1 頁之前的新頁面可能叫 Page-2、Page-3），和原本「+」的命名規則相同。
- 測試：vitest 315 個（新增 9 個）；無頭 Edge 15 項（預設值、錯誤停用、多頁一次復原、Enter 送出、子主頁預設、插在第 1 頁之前並套用子主頁、console 沒有錯誤）。

### 步驟 6（2026-10-07，完成）

- `lib/editor/variables.ts`：`TEXT_VARIABLES`（`{頁碼}` `{總頁數}` `{文件名稱}` `{頁面名稱}`，單一資料來源）、`variableValues(document, pageId)`（主頁回傳 null）、`resolveVariables`（只取代完全相符的 token，其他大括號原樣）、`resolveElementVariables` / `resolveElementsVariables`（文字物件與圖形內文字；沒有變化時回傳同一個參考）。
- `page-numbers.ts` 新增 `displayedPageNumber`：有頁碼規則涵蓋就依規則（含起始值），否則用第幾頁；`pageNumberText` 也改用它（同一個算法）。
- 畫布：頁面上（主頁內容與頁面自己的物件）都換成該頁的值；編輯主頁時照原文顯示；**文字編輯框仍是原文**（編輯的是 `page.elements`），存進文件的也是原文。
- 縮圖：頁面縮圖換成各頁的值（面板依文件快取，文件沒變不重算），主頁縮圖照原文；`SheetThumbnail` 改成另外收 `elements`。
- 屬性面板：文字物件與圖形內文字的「文字」分頁多一區「插入變數」（四個按鈕，加在文字最後，一次 = 一筆復原）。
- 匯出在步驟 7 處理。
- 測試：vitest 322 個（新增 7 個）；無頭 Edge 12 項（依規則編號、沒有規則時用頁序、圖形內文字、主頁照原文、插入變數一筆復原、頁面縮圖與主頁縮圖、編輯框是原文、改文件名稱即時更新、console 沒有錯誤）。

### 步驟 7（2026-10-07，完成）

- `buildExportRequest`（`lib/export/export-request.ts`）在匯出的副本上，每一頁先 `withMasterContent`：主頁（含祖先）的物件放在最下面、變數換成該頁的值；頁面自己的物件也換變數；之後才照舊 `withPageNumbers` 加頁碼。**Rust render、PDF 模板、EPUB 都沒改**。
- **和計畫不同**：展開後的 id 不用 `<pageId>/<id>`，改成 `master:<頁序>:<第幾個>`（`masterCopyId`）。檢核時發現 Rust `require_id` 只接受 64 字以內的 id，`<UUID>/<UUID>` 有 73 字，整份匯出會被拒絕。元素 id 是 UUID（只有 0–9a–f），不會和 `master:` 開頭撞。
- 沒有主頁、變數、頁碼時回傳同一份文件（和原本一樣）。
- 驗證：
  - vitest 324 個（新增：主頁內容在最下面、每頁 id 不同、變數依頁換值、id ≤ 64、原文件不變、沒變化回傳同一份）。
  - 從瀏覽器用 App 的 `buildExportRequest` + `measureTextLayout` 擷取真實的匯出內容（兩層主頁、圖形內文字 `{文件名稱}`、頁尾 `{頁面名稱} · 第 {頁碼} 頁 / 共 {總頁數} 頁`、半透明側欄），交給 Rust 的 `export_preview` 與 `epub_preview`：Rust 驗證通過；PDF 第 2 頁和畫布並排比對內容與位置一致；EPUB 第 2、3 頁各有自己的頁尾數字，沒有主頁的第 1 頁沒有，任何頁都沒有殘留 `{頁碼}`。

### 步驟 8（2026-10-07，完成）

- `CLAUDE.md`：新增「主頁與動態變數」一節；同步「目前階段」、目錄結構（新檔案、10 個面板、fixture v7）、文件模型（主頁、`StaticElement` 列入新增物件類型要改的地方）、狀態（`Sheet`、`lastPageId`、新 action）、頁面排序（「不要頁面面板」改為已由使用者推翻）、頁碼管理的匯出順序、選單的面板數、檔案系統（`schemaVersion` 7、主頁圖片算引用）、改一邊要改兩邊的常數（`MASTER_DEPTH_MAX`）。
- `docs/01-overview.md`：功能表加「主頁」「動態變數」、新增頁面對話框；畫面對應圖加「頁面」面板與編輯主頁提示。
- `docs/02-architecture.md`：資料夾表加主頁相關檔案、`lib/export/` 的說明；`EditorState` 圖加 `lastPageId`、`activePageId` 可以是主頁。
- `docs/progress.md`：完成紀錄、決定、使用者待驗證項目、測試數。

## 8. 之後可以考慮（沒有排入）

- 跨頁（spread）與 Affinity 的 Spread wrapping。
- 在頁面上分離（Detach）或覆寫主頁物件。
- 「頁面」面板拖曳排序、多選頁面一起套用主頁（reducer 的 `page/setMaster` 已經支援多頁）。
- 新頁面依位置命名。
- 編輯框裡游標處插入變數（目前加在文字最後）。
