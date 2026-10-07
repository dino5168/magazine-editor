# 調色板實作計畫

> 對應任務：`docs/01-Plans/05-調色板.md`
> 狀態：**全部完成**（2026-09-30），尚未 commit
> 撰寫日期：2026-09-30

## 1. 目標

把目前的顏色選取（瀏覽器原生的 `<input type="color">`）換成參考 Tailwind CSS 色彩系統的調色板。依任務檔的畫面設計，調色板由上到下三列：

```
┌──────────────────────────────────────────────┐
│ ① 色系：red-500、orange-500、amber-500、…     │  點選色系
├──────────────────────────────────────────────┤
│ ② 深淺：red-50、red-100、…、red-950（11 格） │  點選套用顏色
├──────────────────────────────────────────────┤
│ ③ 透明度 slider（0–100%）                     │  放開時套用
└──────────────────────────────────────────────┘
```

## 2. 現況

| 項目 | 現況 |
|---|---|
| 顏色元件 | `components/editor/color-input.tsx`：原生 color input，聽原生 `change` 事件，選定才寫入一次（不會塞滿復原歷史） |
| 使用位置 | `selection-toolbar.tsx` 的「文字顏色」與「填色」；`background-panel.tsx` 的「自訂背景色」（面板另有 12 個固定色票） |
| 顏色格式 | 只接受 6 位 hex `#rrggbb`。TS：`validation.ts` 的 `isHexColor`；Rust：`project/format.rs` 的 `require_color`（讀檔、存檔都會檢查） |
| 匯出 | PDF：`template.typ` 用 `rgb(el.fill)`；EPUB：CSS `color` / `background` 與 SVG `fill` 直接放 hex |
| 需要的 UI 元件 | 專案還沒有 shadcn 的 `popover`、`slider`，要用 `npx shadcn@4.21.0 add popover slider` 加入 |

**影響最大的是透明度**：目前的格式沒有透明度，加入透明度就是**檔案格式變更**，會牽動 TS 驗證、Rust 驗證、`SCHEMA_VERSION`、共用 fixture 與兩種匯出。

## 3. 待決事項（需要使用者決定）

| # | 問題 | 建議 |
|---|---|---|
| 1 | 透明度存在哪裡？ | **顏色字串改成可以是 8 位 hex `#rrggbbaa`**。不用新增欄位；Konva、Typst、CSS、SVG 都直接支援這個格式。另一個做法是物件加 `opacity` 欄位（整個物件半透明），要改 `types.ts`、`format.rs` 與所有匯出路徑，改動更大 |
| 2 | 保留「自訂顏色」嗎？ | **保留**：調色板最下方放 hex 輸入框（和原生選色器），Tailwind 沒有的顏色（例如企業色）仍然選得到 |
| 3 | 頁面背景也換成調色板嗎？ | **換成同一個調色板，但沒有透明度 slider**（頁面是紙張，半透明沒有意義）。背景面板原本的 12 個色票移除，改用調色板 |
| 4 | 色系要放哪些？ | **任務檔裡的全部 26 個色系 + 黑、白**（含 Tailwind v4 新增的 mauve / olive / mist / taupe） |

**使用者回覆（2026-09-30）：**

1. 透明度：採建議，顏色改用 `#rrggbbaa`。
2. 自訂顏色：**不保留**，只能從 Tailwind 色票選。已經存在、但不在色票裡的顏色（舊專案、示範內容、`element-factory` 的預設顏色）照常顯示與匯出，只是打開調色板時不會標示目前位置。
3. 頁面背景：採建議，換成調色板、不含透明度，背景面板原本的 12 個色票移除。
4. 色系：**經典 22 個 + 黑、白**（去掉 mauve / olive / mist / taupe）。

## 4. 設計

### 4.1 色票資料（`lib/editor/palette.ts`）

- 資料照抄任務檔的 Tailwind `@theme`（oklch），在程式裡用純函式 `oklchToHex()` 轉成 hex。**模型仍然存 hex**：Rust 驗證、PDF、EPUB 都不用認識 oklch。
- Tailwind v4 的部分顏色超出 sRGB（例如飽和的 lime、fuchsia），轉換時裁切到 sRGB 範圍；在廣色域螢幕上會比 Tailwind 官網略淡，這是 hex 格式本身的限制。
- `findPaletteColor(hex)`：目前顏色若是某個色票，反查出色系與深淺，調色板打開時標示目前選取的位置。
- 補測試：色系與深淺數量、全部是合法 hex、幾個已知顏色的轉換結果、反查。

### 4.2 顏色格式（若第 1 題採建議）

- 物件顏色（文字、圖形的 `fill`）：`#rrggbb` 或 `#rrggbbaa`。完全不透明時一律存 6 位，舊檔案不受影響。
- 頁面背景：維持只接受 `#rrggbb`。
- TS：`validation.ts` 新增 `isColor` / `colorAlpha` / `withAlpha` 等純函式 + 測試。
- Rust：`require_color` 分成「物件顏色」與「背景顏色」兩種檢查；`SCHEMA_VERSION` 升為 2（`migrate()` 從 1 到 2 不需要改內容），讓舊版 App 開到新檔案時顯示「版本太新」，而不是「檔案損壞」。
- `tests/fixtures/sample.magproj` 加一個半透明物件，兩邊的測試都會讀到。

### 4.3 匯出

- PDF：Typst 的 `rgb("#rrggbbaa")` 直接支援透明度，模板不用改；加一個測試確認半透明物件能編譯，並用 `export_preview` 疊圖確認。
- EPUB：CSS 與 SVG 都接受 8 位 hex；加測試確認輸出正確。

### 4.4 調色板元件（`components/editor/color-picker.tsx`）

- 觸發按鈕：和現在一樣的小色塊（半透明時底下畫棋盤格）；點擊打開 Popover。
- ① 色系列：每個色系顯示 500 的色塊，點選只切換第 ② 列，不改顏色。
- ② 深淺列：11 格，點選就套用（寫入一次復原歷史）。
- ③ 透明度 slider：拖曳時只更新預覽，**放開才寫入**（和畫布「dragend 才 dispatch」同一原則）。
- 焦點在 Popover 內時，編輯器快捷鍵（Delete 等）不應觸發；實作時確認 `use-editor-shortcuts` 的判斷涵蓋這種情況。
- 沒有自訂顏色的輸入框或原生選色器（第 3 節第 2 題）。
- 取代 `ColorInput` 的所有使用處後，刪除 `color-input.tsx`（`CLAUDE.md` 裡提到 `ColorInput` 的地方一起改）。

## 5. 步驟

每一步完成後停下來，等使用者說「繼續」。

| 步驟 | 內容 | 驗證 |
|---|---|---|
| 1 | 色票資料 `palette.ts` + 測試 | vitest；畫面不變 |
| 2 | 顏色格式支援透明度（TS 驗證、Rust 驗證、`SCHEMA_VERSION` 2、fixture） | vitest、`cargo test`；畫面不變 |
| 3 | 匯出支援透明度（PDF、EPUB 測試） | `cargo test`、`export_preview` 疊圖 |
| 4 | 調色板元件，取代選取工具列的「文字顏色」與「填色」 | 無頭 Edge + CDP：開關、選色、slider 放開才寫入、復原一次撤銷 |
| 5 | 頁面背景面板改用調色板（無透明度），刪除 `color-input.tsx` | 同上 |
| 6 | 文件：`CLAUDE.md`、`docs/progress.md`、這份計畫的狀態 | — |

### 步驟 1 完成紀錄（2026-09-30）

- 新增 `src/lib/editor/palette.ts`：`PALETTE_FAMILIES`（22 色系，資料照抄任務檔的 oklch）、`PALETTE_BASICS`（黑、白）、`oklchToHex`、`getPaletteHex`、`findPaletteColor`；5 個測試（`__tests__/palette.test.ts`）。
- **超出 sRGB 的顏色用「降低彩度」處理**，不是直接裁切各通道：保持明度與色相，二分搜尋仍在 sRGB 內的最大彩度。灰階和大部分顏色和 Tailwind 官方的 hex 相同（例如 red-500 `#fb2c36`、blue-600 `#155dfc`、neutral-500 `#737373`）；少數飽和顏色與官方 hex 差幾個數值（例如 red-600 是 `#e40016`，官方是 `#e7000b`，官方的 hex 是直接裁切算出來的），色相比較接近 oklch 原色。
- zinc-50 與 neutral-50 是同一個顏色（`#fafafa`），`findPaletteColor` 回傳排在前面的 zinc。
- `findPaletteColor` 已經會忽略 `#rrggbbaa` 的透明度部分，步驟 2 不用再改它。
- 畫面沒有變化（還沒有元件使用 `palette.ts`）。

### 步驟 2 完成紀錄（2026-09-30）

- Rust `format.rs`：`SCHEMA_VERSION` 升為 2；`require_color` 拆成 `require_element_color`（`#rrggbb` / `#rrggbbaa`）與 `require_background_color`（只收 `#rrggbb`）。版本判斷改成接受 `1..=SCHEMA_VERSION`：**v1 → v2 只放寬顏色格式，v1 內容原樣就是合法的 v2，所以沒有升級步驟**（計畫原本寫「`migrate()` 從 1 到 2」，程式裡其實沒有 `migrate()` 函式，版本判斷就在 `parse_project` 裡）。存檔一律寫入 2。新增 2 個測試（v1 檔案可開啟、物件顏色可帶透明度但背景不行）。
- TS：`validation.ts` 新增 `isElementColor`（規則與 Rust 相同）；`palette.ts` 新增 `colorAlpha` / `withAlpha`（完全不透明時寫回 6 位）；reducer 的 `element/update` 遇到不合法的 `fill` 直接 no-op（原本沒有檢查），`page/setBackground` 仍只收 `#rrggbb`。新增 5 個測試，其中一個確認 slider 的 0–100% 存成一個位元組再讀回不會跑掉。
- fixture `tests/fixtures/sample.magproj`：`schemaVersion` 改 2，矩形的 `fill` 改成 `#e0e7ffcc`（80% 不透明）。匯出測試也讀這份 fixture，所以 **PDF 與 EPUB 的既有測試已經在處理半透明顏色並且通過**（Typst 接受 `rgb("#rrggbbaa")`）；輸出是否真的半透明留到步驟 3 驗證。
- `types.ts` 沒有改（`fill` 仍是 `string`），`docs-website/types.html` 不用同步。`CLAUDE.md`「檔案系統」的 `schemaVersion` 說明已更新。
- 畫面沒有變化。

### 步驟 3 完成紀錄（2026-09-30）

- **PDF**：`template.typ` 不用改，Typst 的 `rgb("#rrggbbaa")` 直接支援。新增 2 個測試（`pdf.rs`）：
  - `element_alpha_blends_with_the_page`：白底上 200×100 pt 的矩形，用 `typst-render` 算成 1 px/pt 點陣圖取中心像素：`#ff0000` → (255,0,0)、`#ff000080` → 約 (255,127,127)、`#ff000000` → 白色。
  - `pdf_carries_the_alpha`：半透明時 PDF 裡有 `/ca`（填色不透明度的圖形狀態），不透明時沒有。這一項檢查的是真正寫出的 PDF 檔，不只是 Typst 的排版結果。
- **EPUB（和計畫不同）**：計畫原本寫「CSS 與 SVG 都接受 8 位 hex」，實作時改成**輸出前轉換**：CSS（文字 `color`、矩形與橢圓的 `background`）用 `rgba(r,g,b,a)`，SVG（多邊形、星形）用 `fill="#rrggbb" fill-opacity="a"`。原因：8 位 hex 是 CSS Color 4 才有的寫法，SVG 1.1（EPUB 3 引用的版本）也不允許，換成這兩種寫法，較舊的閱讀引擎也看得懂。完全不透明時照舊輸出 `#rrggbb`，EPUB 內容和以前相同。`xhtml.rs` 新增 `split_alpha` / `css_color` / `svg_fill` + 1 個測試，`renders_every_element_type` 加上檢查 fixture 的半透明矩形輸出成 `rgba(224,231,255,0.800)`、8 位 hex 不會出現在 EPUB 裡。
- **疊圖比對**：`export_preview`（PDF，2 px/pt）與 `epub_preview` 的頁面在 headless Edge 的截圖（2 倍解析度），在 fixture 半透明矩形的同一點取樣，兩邊都是 (230,236,255)，等於理論值 80% × `#e0e7ff` + 20% × 白。截圖上被矩形蓋住的「副標」會透出來。
- Rust 64 個測試通過（另有 2 個 `#[ignore]` 的預覽）。`cargo clippy --all-targets` 有 1 個警告在 `project/recovery.rs:113`（`sort_by` → `sort_by_key`），是新版 clippy 的規則，和這次修改無關，沒有處理。

### 步驟 4 完成紀錄（2026-09-30）

- `npx shadcn@4.21.0 add popover slider` 新增 `components/ui/popover.tsx`、`slider.tsx`。
- 新增 `components/editor/color-picker.tsx`（`ColorPicker`）：觸發按鈕是小色塊（底下畫棋盤格，半透明看得出來）；Popover 內由上到下是標題列（名稱與目前的 `red-500 · 50%`）、色系兩列（22 色系的 500 + 黑、白，12 欄）、深淺一列（11 格）、不透明度 slider。
  - 點色系只切換深淺列；點深淺或黑白就套用，並**保留目前的透明度**；調色板不會關閉，可以連續試色。
  - 每次打開時跳到目前顏色所在的色系；不在色票裡的顏色預設顯示 neutral。
  - slider 拖曳時只更新百分比與按鈕色塊，放開（`onValueCommit`）才寫入。用鍵盤方向鍵調整時，每按一下寫入一次（Radix 的行為）。
  - `allowAlpha` 參數給步驟 5 的頁面背景用（不顯示 slider）。
- `selection-toolbar.tsx` 的「文字顏色」與「填色」改用 `ColorPicker`。`color-input.tsx` 還被背景面板使用，步驟 5 再刪除。
- 編輯器快捷鍵不會在調色板內觸發：Radix Popover 的內容是 `role="dialog"`，`use-editor-shortcuts` 原本就會略過，不用改。
- **驗證**（headless Edge + CDP，讀畫布像素）：用 R 鍵建立矩形 → 打開填色 → 24 個色系、11 格深淺、1 個 slider → 點色系顏色不變 → 點 red-500 畫布變成 (251,44,54)、該格標示為選取、調色板保持開啟 → slider 拖到 50% 時顯示 50%、畫布不變 → 放開後畫布變成 (253,149,154)（50% 紅疊在白上）→ 調色板內按 Delete 不會刪除物件 → Esc 只關閉調色板、物件仍選取 → Ctrl+Z 一次回到不透明紅、再一次回到原本顏色 → console 沒有錯誤。
- 驗證時 `npm run dev` 的 1420 埠已經有這個專案的 Vite 在執行（使用者開的），直接使用，沒有另外啟動或關閉。
- 步驟 1 用 `tsc -b` 檢查時，在專案根目錄產生了 `vite.config.js`、`vite.config.d.ts`、`tsconfig*.tsbuildinfo`，這一步發現後已刪除（`vite.config.js` 可能蓋過 `vite.config.ts`）。之後型別檢查用 `npx tsc --noEmit -p tsconfig.json`。

### 步驟 5 完成紀錄（2026-09-30）

- **`color-picker.tsx` 拆成兩層**（和計畫不同，計畫原本只有 `ColorPicker`）：`ColorPalette` 是調色板本體（色系、深淺、不透明度 slider），`ColorPicker` 是按鈕 + Popover，裡面放 `ColorPalette`。這樣背景面板可以**直接內嵌調色板**，不用再多點一顆按鈕。
  - 顯示哪個色系改成在 `ColorPalette` mount 時從目前顏色決定：Popover 每次打開都會重新 mount，所以不再需要 `onOpenChange` 重設；背景面板用 `key={page.id}`，切換頁面時跳到新頁面背景所在的色系。
  - slider 拖曳中的預覽顏色由 `onPreview` 回傳給 `ColorPicker`，更新按鈕色塊。
- `background-panel.tsx`：移除原本的 12 個色票與自訂顏色，改成內嵌 `ColorPalette`（`allowAlpha={false}`，沒有 slider）。
- 刪除 `color-input.tsx`；`CLAUDE.md` 的目錄結構與「狀態」一節裡提到 `ColorInput` 的地方已改成調色板。
- **驗證**（headless Edge + CDP）：
  - 背景面板：24 個色系、11 格深淺、沒有 slider；白色背景時 white 標示為選取 → 點 sky 頁面不變 → 點 sky-100 頁面變成 (223,242,254)、標題列顯示 `sky-100`、沒有百分比 → Ctrl+Z 回到白色、white 再次標示為選取 → console 沒有錯誤。
  - 選取工具列（步驟 4 的測試重跑，全部通過）：另外加驗 slider 拖到 50% 時按鈕色塊是 `rgba(251, 44, 54, 0.5)`、畫布不變。
- vitest 127 個測試通過，型別檢查通過。

### 步驟 6 完成紀錄（2026-09-30）

- `CLAUDE.md`：
  - 新增「調色板」一節（只能從色票選、模型只存 hex、顏色格式與 TS / Rust 驗證要一致、`ColorPalette` / `ColorPicker` 的分工）。
  - 目錄結構加上 `palette.ts`、`validation.ts` 的說明補上兩個顏色檢查函式。
  - 「檔案系統」裡的 `migrate()` 改成實際的做法（在 `parse_project` 的版本判斷處升級舊版 JSON），並註明 v1 → v2 沒有升級步驟。
  - 「匯出 PDF」補上半透明顏色的處理（PDF 直接支援、EPUB 輸出前轉換），已知限制改成「RGB（可含透明度）」。
- `docs/progress.md`：已完成紀錄、已做的決定、測試數量。
- `docs/02-architecture.md` 沒有改：它只列資料夾層級（`lib/editor/` 約 1,600 行，加上 `palette.ts` 後約 1,850 行，仍在同一個量級），沒有提到顏色元件。

## 6. 風險

- **舊版 App 開不了新檔案**：升 `SCHEMA_VERSION` 後，用舊版開啟會被拒絕（顯示版本太新）。這是既定的格式規則。
- **顏色和 Tailwind 官網不完全一樣**：見 4.1，超出 sRGB 的顏色會被裁切。
- **EPUB 閱讀器**：很舊的閱讀器可能不支援 8 位 hex；目前的目標閱讀器（Thorium、Apple Books、Calibre）都是新版 Chromium / WebKit，支援。
