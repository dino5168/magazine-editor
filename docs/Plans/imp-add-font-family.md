# 字型選擇與字級上下鈕實作計畫

> 對應任務：`docs/Plans/2026-10-01-addfontfamily.md`（參考圖 `docs/Plans/Images/add-font-family.png`）
> 狀態：**全部完成**（2026-10-01），已 commit（一個 commit）；還沒有桌面版的人工驗證
> 撰寫日期：2026-10-01

## 1. 現況

### 1.1 為什麼「字型」沒有選項

屬性面板的「字型」只是區塊標題（`properties-panel.tsx` 的 `TextStyleControls`），底下只有字級、粗體、對齊、顏色，**沒有選字型的控制項**。文件模型其實已經有欄位：

- `TextStyle.fontFamily: string`，存的是 CSS 的 font-family 字串，目前所有文字都是 `DEFAULT_FONT_FAMILY` = `"Geist", "Noto Sans TC", sans-serif`。
- Rust `format.rs` 照存、不驗證內容；匯出時 `font_families()` 把它拆成字族清單（去掉 `sans-serif` 等泛用名稱、套用 `LEGACY_FAMILIES`）。

### 1.2 為什麼不能直接列出系統字型

畫面、PDF、EPUB **必須用同一批字型檔**（`fonts/README.md`），換行位置才會一致：

- 前端：`src/index.css` 的 `@font-face` 載入 `fonts/` 的檔案；`editor-canvas.tsx` 的 `useFontsReady` 等字型載入完才建立畫布。
- Rust：`export/fonts.rs` 的 `BUNDLED_FONTS` 用 `include_bytes!` 內嵌同一批檔案；PDF 交給 Typst，EPUB 把用到的字族放進 `OEBPS/fonts/`。
- **不讀系統字型**：匯出結果在每台機器上都一樣，EPUB 也能把字型帶給讀者。

所以「可以選字型」= **再內嵌幾套字型**，讓使用者在這幾套之間選，不是列出 Windows 裡安裝的字型。目前只有一套（Geist + Noto Sans TC，等於「黑體」）。

### 1.3 字級

字級是 `NumberField`（Enter / 失焦才寫入，一次 = 一筆復原），只能打字，沒有上下鈕。範圍 6–400 pt（`clampFontSize`）。

## 2. 設計

### 2.1 字型清單（單一資料來源）

新增 `lib/editor/fonts.ts`：

```ts
export const FONT_OPTIONS = [
  { id: "sans",  label: "黑體", family: '"Geist", "Noto Sans TC", sans-serif', faces: [...] },
  { id: "serif", label: "明體", family: '"…", "Noto Serif TC", serif',          faces: [...] },
  …
] as const;
```

- `family` 就是寫進文件的 `fontFamily` 字串；**文件模型與檔案格式不用改**（不升 `SCHEMA_VERSION`）。
- `faces` 列出要預先載入的字族與樣本字，`useFontsReady` 改成依清單載入，不再寫死四行。
- 文件裡的 `fontFamily` 不在清單中（舊專案、手改的檔案）時，下拉選單顯示「其他」，照常顯示與匯出。

### 2.2 新增一套字型要改的地方

1. 字型檔放進 `fonts/`（Regular + Bold 靜態字重，授權允許嵌入與再散布），更新 `fonts/README.md`。
2. `src/index.css` 加 `@font-face`。
3. Rust `export/fonts.rs` 的 `BUNDLED_FONTS` 加兩筆（已有測試檢查每個字族都有 Regular + Bold）。
4. `lib/editor/fonts.ts` 加一筆選項。
5. EPUB `xhtml.rs` 的 `font_family()` 目前最後一律接 `sans-serif`，改成依原本字串的泛用名稱（`serif` / `sans-serif`）決定。
6. 跑 `cargo test baseline_matches_css_line_box`（字型度量檢查）與疊圖比對。

### 2.3 屬性面板

- 「字型」區塊第一列加字型下拉選單（shadcn `Select`，已在 `components/ui/`），每個選項用該字型顯示自己的名稱。
- 字級：`NumberField` 加可省略的 `step`（以及 `min` / `max`），有值時兩側顯示 − / ＋。按一下立即寫入（一下 = 一筆復原），輸入框照舊 Enter / 失焦才寫入。

### 2.4 代價

- 每套中文字型 Regular + Bold 約 10–20 MB，會讓安裝檔、執行檔（Rust `include_bytes!`）與 `dist/` 都變大；畫布第一次載入要等的字型也變多（只等清單裡的，或改成用到才載入，見問題 2）。
- 匯出的 EPUB 只放文件**實際用到**的字族，不受影響。

## 3. 不重複造輪子

- 下拉選單用既有的 shadcn `Select`；字級上下鈕擴充既有的 `NumberField`（加可省略的 `step` 屬性），不另外做一個數字元件，其他數字欄位之後也能用。
- 字型載入沿用 `document.fonts.load`（用到才載入時，載入完成後讓 Konva 重新量測，做法在步驟 2 決定：沿用 `useFontsReady` 的模式，把「已載入的字族」放進 state）；匯出端沿用 `BUNDLED_FONTS` / `font_families()`，不新增機制。

## 4. 決定（2026-10-01 使用者回覆）

| # | 問題 | 決定 |
|---|---|---|
| 1 | 要加哪幾套字型 | **明體**（思源宋體 Noto Serif TC）、**楷體**（霞鶩文楷 TC）、**圓體**（候選：jf open 粉圓）。加上現有的黑體共四套 |
| 2 | 字型何時載入 | **用到才載入**：啟動只等黑體；開檔或選了其他字型時，才載入該字型，載入完再重畫（換行要用正確的字寬重算） |
| 3 | 字級上下鈕的樣式 | **兩側的 − / ＋ 按鈕**：`字級 [−][ 20 ][＋] pt` |
| 4 | 每按一下改多少 | **固定 1 pt**，到 6 / 400 pt 時對應按鈕停用 |

### 步驟 3 的決定（2026-10-01）

- 圓體換成有粗體的 **源泉圓體 GenSenRounded2 TW**（v2.100，OFL；TW = 台灣教育部標準字形）。
- **霞鶩文楷 TC 官方沒有 Bold**（Light / Regular / Medium）：粗體用 **Medium**。
- 源泉圓體與霞鶩文楷的 `hhea` 與 win 度量不一致：**修正內嵌的字型檔**（`fonts/patch_font.py`）。
- 四套合計約 86 MB：**可以接受**，不縮減字集。
- 實作時另外發現並修正：Typst 把霞鶩文楷讀成「霞鶩文楷 TC」（新增 `typst_family`）；源泉圓體每個字重各自是一個家族，Typst 找不到粗體（`patch_font.py --style` 改寫 name 表）。兩者都由新測試 `typst_sees_the_declared_family_and_weight` 守著。

### 步驟 3 開始前還要確認的事（已處理，保留紀錄）

- **圓體沒有粗體**：jf open 粉圓只有一個字重，但規則要求每套字型都有 Regular + Bold（`BUNDLED_FONTS` 的測試也檢查這點）。畫布（Konva）會用演算法把字加粗，Typst 不會，PDF 會變成細字，畫面與輸出就對不上。做法候選：選圓體時停用粗體按鈕；或換一套有粗體的圓體。
- **西文字型的搭配**：黑體是 Geist（西文）+ Noto Sans TC（中文）。其他三套建議直接用中文字型內建的西文字形（不另外搭配），檔案最少，也不會有兩套西文字型風格不一致的問題。
- 實際的檔案大小與下載來源，在步驟 3 下載後記錄在 `fonts/README.md`。

## 5. 實作步驟（每步完成後停下來，等使用者確認）

1. **字級上下鈕**：擴充 `NumberField`，屬性面板的字級使用。
2. **字型清單與下拉選單**（先只有現有的黑體）：`lib/editor/fonts.ts`、`useFontsReady` 改用清單、屬性面板加下拉選單、「其他」的處理；補 vitest。
3. **加入新字型**：依問題 1，每套字型照 2.2 的步驟加入（字型檔、`@font-face`、`BUNDLED_FONTS`、`FONT_OPTIONS`、EPUB 泛用名稱）；跑 Rust 測試與疊圖比對。
4. **文件**：`CLAUDE.md`、`fonts/README.md`、`docs/progress.md`、本計畫的狀態。

## 6. 進度

| 步驟 | 狀態 |
|---|---|
| 1 | 完成：`NumberField` 加可省略的 `step: { size, min, max }`，有值時兩側顯示 − / ＋（`variant="outline"`），每按一下寫入一次、到上下限停用；屬性面板字級用 `FONT_SIZE_STEP`（1 pt，6–400）。headless Edge 驗證：＋＋−、Ctrl+Z 一次只退一下、輸入 6 後 − 停用 |
| 2 | 完成：`lib/editor/fonts.ts`（`FONT_OPTIONS` 只有黑體、`findFontOption` 忽略引號 / 空白 / 大小寫、`usedFontFamilies`、`fontOptionsFor`、`fontLoadRequests`，vitest 7 筆）；`DEFAULT_FONT_FAMILY` 改由清單提供；`use-fonts-ready.ts`（每個選項只載入一次、失敗也放行）取代 `editor-canvas` 寫死的四行；屬性面板「字體」下拉選單（選項用自己的字型顯示、不在清單時顯示停用的「其他字型」、先載入再寫入）。`CLAUDE.md`、`fonts/README.md` 已同步。headless Edge 驗證 |
| 3 | 完成：`fonts/` 加三套字型（明體原檔；楷體、圓體經 `patch_font.py` 修正）、`index.css` 六個 `@font-face`、`BUNDLED_FONTS` 加 `generic` / `typst_family` 欄位與六筆、`typst_family()`（PDF 資料）、EPUB `font_family` 依字族接 `serif` / `sans-serif`、`FONT_OPTIONS` 加三筆。Rust 測試 82 筆、vitest 190 筆通過。疊圖比對：四套字型的一般 / 粗體，畫布與 PDF 換行與基線一致 |
| 4 | 完成：`CLAUDE.md`（Tech Stack、目錄結構、字型載入、匯出 PDF 的字型規則）、`fonts/README.md`（來源表、修改說明、新增字型步驟）、`docs-website/types.html`（`fontFamily` 說明）、`docs/progress.md`、本計畫 |
