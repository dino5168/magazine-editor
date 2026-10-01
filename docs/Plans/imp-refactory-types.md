# 型別重構與屬性面板實作計畫

> 對應任務：`docs/Plans/2026-10-01-自由繪圖.md`（參考圖 `docs/images/DrawIO屬性參考圖。.png`）
> 狀態：**全部完成**（2026-10-01），已 commit（一個 commit）
> 撰寫日期：2026-10-01

## 1. 任務要回答的問題

| # | 任務檔的問題 | 回答 |
|---|---|---|
| 1–2 | `types.ts` 之後要繼續擴充繪畫型別 | 目前每種圖形各自一個型別，而且**定位方式不一致**（見 2.1），每加一種圖形要改十個以上的地方。建議先整理型別，再擴充 |
| 3 | 形狀內無法輸入文字 | 對。文字只能是獨立的 `text` 物件，圖形沒有文字欄位 |
| 4 | 參考 draw.io，需要重新設計型別嗎？ | **需要，但不照抄 draw.io**。draw.io 用一個 `style` 字串（`rounded=1;fillColor=#fff;...`）描述所有東西，彈性大但沒有型別檢查。建議保留目前的 discriminated union，把共通的部分（外框、邊框、圖形內文字）抽成共用結構，見第 3 節 |
| 5 | 屬性目前顯示在畫面上方？ | 對。`SelectionToolbar`（`selection-toolbar.tsx`）在系統控制列下方，只有字級、文字顏色、粗體、對齊、填色、上下移一層、刪除 |
| 6 | 點選物件時顯示屬性表？ | 建議改成 draw.io 式的**屬性面板**（樣式 / 文字 / 調整三個分頁），做成工具面板之一（預設停靠右側），內容跟著目前選取的物件變化，見第 3.4 節 |

## 2. 現況

### 2.1 型別

```ts
TextElement    { x, y = 左上角; width; fontSize; fontFamily; fontStyle; align; fill; text }
RectElement    { x, y = 左上角; width; height; cornerRadius; fill }
EllipseElement { x, y = 中心;   radiusX; radiusY; fill }
PolygonElement { x, y = 中心;   sides; radius; fill }          // 只能等比例縮放
StarElement    { x, y = 中心;   numPoints; innerRadius; outerRadius; fill }  // 只能等比例縮放
ImageElement   { x, y = 左上角; width; height; src }
```

問題：

1. **兩種定位方式**：rect / text / image 用左上角 + 寬高，ellipse / polygon / star 用中心 + 半徑。屬性面板要顯示「位置 / 大小」時得分別換算；圖形內文字的框也要分別算。
2. **沒有共用的樣式**：每個圖形各自有 `fill`，沒有邊框（stroke）；要加邊框就得在四個型別各加一次。
3. **多邊形與星形不能拉成長方形**：只有 `radius`，Transformer 縮放時只取 `scaleX`。draw.io 的圖形都可以自由拉伸。
4. **新增圖形類型的成本高**：CLAUDE.md 列出的必改處有 `types.ts`、`geometry`、`canvas-elements`（renderer + `bakeTransform`）、`TRANSFORMER_OPTIONS`、`describeElement`、`TYPE_LABELS`、`TYPE_ICONS`、`format.rs`、`render.rs`、`template.typ`、EPUB `xhtml.rs`。

### 2.2 有利的地方

- Rust 的 `RenderPolygon` 已經是 `rx` / `ry`（半寬、半高）+ 頂點，匯出端本來就能畫「拉伸過的多邊形」。
- 開檔一律經過 Rust `parse_project`（復原備份也是），**舊版檔案的升級只要在 Rust 做一次**，前端拿到的永遠是新格式。
- `fill` 已經支援 `#rrggbbaa`（調色板），邊框顏色可以沿用同一套驗證與調色板。

## 3. 設計（建議案，細節依第 4 節的回覆調整）

### 3.1 新的型別（schema v3）

```ts
interface BaseElement {
  readonly id: ElementId;
  readonly x: number;          // 一律是外框左上角（旋轉前）
  readonly y: number;
  readonly rotation: number;   // 繞 (x, y) 順時針
}

/** 文字樣式：獨立文字與圖形內文字共用 */
interface TextStyle {
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly fontStyle: "normal" | "bold";
  readonly align: "left" | "center" | "right";
  readonly fill: string;       // 文字顏色
}

interface Stroke {
  readonly color: string;      // #rrggbb / #rrggbbaa
  readonly width: number;      // pt
  readonly dash: "solid" | "dashed" | "dotted";
}

/** 圖形內的文字（draw.io 的 label） */
interface ShapeLabel extends TextStyle {
  readonly text: string;
  readonly verticalAlign: "top" | "middle" | "bottom";
}

/** 各圖形自己的參數；新增圖形 = 在這裡加一個成員 */
type ShapeGeometry =
  | { readonly kind: "rect"; readonly cornerRadius: number }
  | { readonly kind: "ellipse" }
  | { readonly kind: "polygon"; readonly sides: number }
  | { readonly kind: "star"; readonly numPoints: number; readonly innerRatio: number };  // 內徑 / 外徑

interface ShapeElement extends BaseElement {
  readonly type: "shape";
  readonly width: number;
  readonly height: number;
  readonly geometry: ShapeGeometry;
  readonly fill: string;
  readonly stroke: Stroke | null;      // null = 無邊框
  readonly label: ShapeLabel | null;   // null = 沒有文字
}

interface TextElement extends BaseElement, TextStyle { readonly type: "text"; readonly text: string; readonly width: number }
interface ImageElement extends BaseElement { readonly type: "image"; readonly src: string; readonly width: number; readonly height: number }

type CanvasElement = TextElement | ShapeElement | ImageElement;
```

重點：

- **四種圖形合併成一個 `shape` 型別**，共用外框（`x, y, width, height`）、填色、邊框、文字；差異只在 `geometry`。外層 `type` 只剩 3 種，大部分程式（選取、對齊、屬性面板的大小 / 位置、圖形內文字）只需要處理「一個框」。
- **多邊形 / 星形的頂點由外框算出**（半徑 1 的正多邊形拉伸到頂點碰到外框四邊），所以可以自由拉伸；舊檔案升級時外框 = 舊圖形頂點的實際範圍，外觀不變。
- 之後擴充：
  - 新的「框型」圖形（箭頭、對話框、六邊形…）→ 加一個 `ShapeGeometry` 成員。
  - 不是框的東西（自由繪圖的筆畫、直線 / 連接線）→ 加新的外層 `type`（例如 `path { points[] }`），這次只預留，不實作。
- 物件層級的不透明度（draw.io 的「不透明度」）**這次不加**：填色與邊框各自的 `#rrggbbaa` 已經能做半透明；圖片的不透明度之後再說。
- 斜體、底線**不做**：字型只內嵌 Regular / Bold（`fonts/README.md`），加斜體要另外加字型檔。

### 3.2 檔案格式與升級

- `SCHEMA_VERSION` 升為 3。`parse_project` 遇到 v1 / v2 時先把 JSON（`serde_json::Value`）升級成 v3 再轉成 serde 型別：
  - `rect` → `shape` + `{ kind: "rect", cornerRadius }`，位置不變。
  - `ellipse` / `polygon` / `star` → `shape`，中心點換算成**旋轉後仍在原位的左上角**：`(x, y) = 中心 + R(θ)·(−w/2, −h/2)`。
  - `stroke: null`、`label: null`。
- `format.rs`、`tests/fixtures/sample.magproj`（改成 v3 內容，另外留一份 v2 的 fixture 測升級）、`types.ts` 同步修改；`docs-website/types.html` 同步更新圖與說明卡。
- 舊版 App 打不開 v3 檔案（顯示版本太新），和調色板升 v2 時相同。

### 3.3 畫布

- 圖形用 Konva `Group`（外框原點在左上角）包住「圖形節點 + 文字節點」，Transformer 掛在 Group 上；`bakeTransform` 把 scale 換算回 `width` / `height`，文字不跟著拉伸。
- 圖形節點：rect → `Rect`；ellipse → `Ellipse`（中心 = 框中心）；polygon / star → 用和 Rust 相同公式算出的頂點畫 `Line closed`。頂點計算寫成 `lib/editor` 的純函式並補測試，和 Rust `regular_points` 對照。
- 邊框：`strokeScaleEnabled = false`，縮放時線寬不變。
- **圖形內文字的編輯**：雙擊圖形 → 沿用 `text-editor-overlay`，框大小 = 圖形外框，依 `verticalAlign` 定位；文字寬度 = 圖形寬度 − 左右內距。

### 3.4 屬性面板

- 新增工具面板 `properties`「屬性」，預設停靠右側（在圖層上方），用 `PANEL_DEFINITIONS` 現有機制加入；不需要新的版面機制。
- 三個分頁，對照 draw.io：

| 分頁 | 內容（第一版） | 適用 |
|---|---|---|
| 樣式 | 填色（`ColorPicker`，含不透明度）、邊框（開關、顏色、線寬、實線 / 虛線 / 點線）、圓角（矩形）、邊數（多邊形）、角數與內徑比例（星形） | 圖形；文字物件只有「文字顏色」所以不顯示此頁 |
| 文字 | 字型、字級、粗體、水平對齊、垂直對齊（圖形內文字）、文字顏色 | 文字物件、圖形（沒有文字時顯示「雙擊圖形輸入文字」） |
| 調整 | 移到最上 / 最下 / 上移 / 下移一層、位置 X / Y、大小 W / H、限制寬高比、旋轉角度、刪除 | 全部 |

- 數字欄位 Enter / 失焦才寫入（和現在的字級輸入框相同），一次編輯 = 一筆復原。
- 沒有選取時顯示提示文字（頁面屬性仍在「背景」面板，「尺寸」面板之後再做）。
- 上方的 `SelectionToolbar` 在屬性面板完成後移除（見待決事項 2）。

### 3.5 匯出（PDF / EPUB）

- `render.rs`：`RenderKind` 的 Rect / Ellipse / Polygon 改為接受邊框；圖形內文字轉成一個額外的 `RenderText`（和獨立文字同一條路徑），位置由外框與垂直對齊算出。
- **換行仍由編輯器決定**：`measureTextLayout` 也要量圖形內文字，結果放進 `ExportRequest.textLayouts`（key 可以用 `<element id>#label`）。
- PDF：`template.typ` 的 `draw` 加上 `stroke`（Typst 的 `stroke: (paint, thickness, dash)`）。
- EPUB：矩形與橢圓目前是 CSS `background` + `border-radius`。CSS border 畫在框內，Konva 的 stroke 畫在邊線兩側，位置會差半個線寬，所以**有邊框的圖形改成一律輸出 inline SVG**（和多邊形相同的做法）。

## 4. 待決事項（需要使用者決定）

| # | 問題 | 建議 |
|---|---|---|
| 1 | 型別要怎麼改？ | **四種圖形合併成 `shape` + `geometry`，統一用外框定位**（3.1）。另一個做法是保留六個型別，各自加 `stroke` / `label` 欄位：改動小，但定位方式不一致的問題留著，之後每加一種圖形仍要改十幾個地方 |
| 2 | 屬性顯示在哪裡？ | **新的「屬性」工具面板（右側，三個分頁），完成後移除上方的選取工具列**。也可以保留上方工具列放最常用的幾個按鈕，但同一個屬性兩個地方都能改，維護成本比較高 |
| 3 | 圖形內的文字超出圖形時？ | **照常顯示超出的部分**（和「物件可以超出頁面、不裁切」一致，draw.io 預設也是如此）。其他選項：裁切；或自動把圖形撐高 |
| 4 | 自由繪圖（畫筆）這次要做嗎？ | **這次不做，只在型別上預留**。先完成型別整理、屬性面板、圖形內文字；畫筆是新的物件類型（`path`），需要另外的工具、平滑化與匯出設計，建議另開任務 |

**使用者回覆（2026-10-01）**：四題都採建議。

1. 四種圖形合併成 `shape` + `geometry`，統一用外框定位，`SCHEMA_VERSION` 升為 3。
2. 新的「屬性」工具面板（右側、三個分頁），完成後移除上方的選取工具列。
3. 圖形內文字超出圖形時照常顯示。
4. 自由繪圖這次不做，只在型別上預留。

## 5. 步驟

每一步完成後停下來，等使用者說「繼續」。

| 步驟 | 內容 | 驗證 |
|---|---|---|
| 1 | **型別重構（不加新功能）**：`types.ts` 改成 3.1 的結構（`stroke` / `label` 欄位先有、但都是 `null` 不畫）；`format.rs` v3 + v1/v2 升級；fixture；`geometry`、`element-factory`、`canvas-elements`、`editor-canvas`、reducer、各面板、`render.rs` 全部改用新型別 | vitest、`cargo test`；升級測試（v2 fixture → v3 位置與尺寸）；`export_preview` 的 PDF 點陣圖和改之前相同；無頭 Edge 確認畫面不變、拖曳 / 縮放 / 旋轉正常 |
| 2 | **屬性面板骨架**：`properties` 面板 + 三個分頁，把選取工具列現有的功能搬進去，加上位置 / 大小 / 旋轉數字欄位與圖層順序；移除 `SelectionToolbar` | 無頭 Edge：選取切換、數字欄位寫入與復原、快捷鍵不在輸入框內觸發 |
| 3 | **邊框**：樣式分頁的邊框設定；畫布、PDF、EPUB 都畫出邊框；TS / Rust 驗證規則一致 | vitest、`cargo test`、PDF / EPUB 疊圖比對 |
| 4 | **圖形內文字**：畫布顯示、雙擊編輯（含輸入法）、文字分頁套用到圖形內文字；匯出量測與繪製 | 同上；中文換行在畫布與 PDF / EPUB 一致 |
| 5 | **多邊形 / 星形參數**：邊數、角數、內徑比例的設定；`elements-panel` / 底部工具列的圖形清單改成 `geometry` | 無頭 Edge |
| 6 | 文件：`CLAUDE.md`（文件模型、「新增物件類型時要改的地方」、屬性面板）、`docs-website/types.html`、`docs/02-architecture.md`、`docs/progress.md` | — |

步驟 1 是最大的一步（約 20 個檔案），但它只是「換一種寫法存同樣的東西」，可以用「輸出和改之前完全相同」來驗證。之後的步驟都是在新型別上加功能。

### 步驟 1 完成紀錄（2026-10-01）

- **Rust**
  - `project/format.rs`：`SCHEMA_VERSION` 3；`Element` 只剩 `Text` / `Shape` / `Image`；新增 `ShapeElement`、`ShapeGeometry`（`#[serde(tag = "kind")]`）、`Stroke`、`ShapeLabel`、`VerticalAlign`、`StrokeDash`。驗證多檢查邊框顏色與圖形內文字顏色。
  - v1 / v2 檔案在 `parse_project` 裡以 `upgrade_shapes_to_v3` 改寫（`serde_json::Value`）：中心定位換算成「旋轉後仍在原位的左上角」，外框 = 舊圖形頂點的實際範圍。
  - **當機復原的備份檔也要升級**（計畫沒有寫到）：備份檔沒有 `schemaVersion`，舊版 App 當機留下的備份如果不升級，會被當成損壞的檔案略過，未存檔的內容就不見了。`recovery::read` 也呼叫 `upgrade_shapes_to_v3`；它不會動已經是 `shape` 的元素，重複套用沒問題。
  - 新增 `project/shape.rs`：頂點公式（`polygon_unit_points` / `star_unit_points` / `fit_to_box`），升級與匯出共用。
  - `export/render.rs`：`RenderElement` 的 `x` / `y` 一律是外框左上角；`RenderEllipse` / `RenderPolygon` 改成 `width` / `height`，頂點以左上角為原點。`template.typ` 刪掉 `at-center`；EPUB 刪掉 `.c`（繞中心旋轉）class。
  - 邊框與圖形內文字**還不畫**（步驟 3、4）。
- **前端**
  - `types.ts` 依 3.1 改寫；新增 `lib/editor/shape-geometry.ts`（頂點公式，與 Rust 相同）。
  - `canvas-elements.tsx`：圖形畫成 `Group`（原點在外框左上角）＋ `Rect` / `Ellipse` / `Line closed`；`bakeTransform` 對所有圖形只換算 `width` / `height`。
  - `editor-canvas.tsx`：`TRANSFORMER_OPTIONS` 只剩三種，**多邊形與星形可以自由拉伸**（8 個控制點、不鎖比例）。
  - `element-factory.ts`：`SHAPE_PRESETS`（UI 的五種圖形 → geometry + 預設大小）；新增 `describeShape`。點一下建立的三角形 / 星形改成「外框中心」對準點擊處（原本是外接圓圓心，三角形會往上偏約 17 pt）；拖曳建立維持「保持比例、置中於拖曳框」。
  - `layers-panel` 的圖示與 `selection-toolbar` 的名稱改依 `geometry.kind` 決定。
- **Fixture**：`tests/fixtures/sample.magproj` 改成 v3，內容就是舊 fixture 升級後的結果；橢圓另外加上邊框與圖形內文字，兩種情況都測得到。舊內容另存為 `tests/fixtures/sample-v2.magproj`，給升級測試用。
- **測試**：Rust 68 個（新增：v2 升級後位置與尺寸不變、旋轉 90° 的中心換算、邊框 / 文字顏色驗證、舊備份可復原、頂點貼齊外框）；vitest 140 個（新增 `shape-geometry.test.ts`，用 Rust 匯出 EPUB 的星形頂點交叉比對；fixture 測試檢查 geometry / stroke / label 的欄位名稱）。
- **輸出比對**：`export_preview` 的 PDF 點陣圖和改動前 **hash 完全相同**；EPUB 只有定位寫法不同（例如星形 `left:231.066px` + 頂點 `66.574,0` = 原本的 `left:227.64px` + `70,0`）。
- **畫面驗證**（無頭 Edge + CDP，瀏覽器模式的示範文件）：4 個圖形都是 Group、星形顏色正確、點選後 8 個控制點、拖曳位移等於滑鼠距離、拉右側控制點只變寬且 scale 烘焙回 1、Ctrl+Z 兩次回到原狀、三角形的選取框貼合圖形（寬高比 √3 : 1.5）、O 鍵拖曳建立的橢圓填滿拖曳框、console 沒有錯誤。
- **還沒同步的文件**（步驟 6 一起做）：`docs-website/types.html` 的型別圖、`CLAUDE.md` 的「文件模型」與「新增物件類型時要改的地方」。

### 步驟 2 完成紀錄（2026-10-01）

- **屬性面板** `components/editor/panels/properties-panel.tsx`（`PANEL_DEFINITIONS` 新增 `properties`「屬性」，icon `SlidersHorizontal`）：
  - 上方是物件名稱與分頁，**固定在面板頂端**（sticky），內容往下捲時仍能切換分頁。驗證時發現分頁列會隨內容捲走，所以加上這個設定（計畫沒有寫）。
  - 分頁依物件類型：圖形 = 樣式 / 調整，文字 = 文字 / 調整，圖片 = 調整。圖形的「文字」分頁等步驟 4 完成後再加。切換物件時保留目前分頁，新物件沒有這個分頁就顯示它的第一個分頁。
  - 樣式：填色。文字：字級、粗體、對齊、文字顏色（原本選取工具列的功能）。調整：圖層順序（移到最上 / 最下、上移 / 下移一層）、寬 / 高（文字只有「行寬」）、限制寬高比、位置 X / Y（外框左上角）、旋轉角度、刪除。
  - 沒有選取時顯示原本選取工具列上的提示文字。
- **限制寬高比**是面板上的編輯選項，不存進文件；圖片預設開啟、圖形預設關閉，切換物件時重設。
- **數字欄位** `components/editor/number-field.tsx`：Enter 或失焦才寫入（一次編輯 = 一筆復原），沒改內容不寫入，不合法的文字還原，Esc 取消。驗證時抓到 Esc 的 bug：`blur()` 觸發的 `onBlur` 讀到的是舊草稿，會把剛取消的值寫進去，改用 ref 標記「已取消」。
- **lib**：
  - `properties.ts`：`parseNumberDraft`、`formatNumber`（最多 2 位小數）、`normalizeRotation`（換成 −180 到 180°）、`resizePatch`（最小 4 pt、限制比例、文字只改行寬）、`hasEditableHeight`，加上 9 個測試。
  - `MIN_ELEMENT_SIZE_PT` 移到 `geometry.ts`，畫布與面板共用。
  - reducer：`element/reorder` 新增 `top` / `bottom`；`element/update` 拒絕 NaN / Infinity。
- **移除** `selection-toolbar.tsx`（上方選取工具列）。底部工具列的 ⋮ 與圖層面板的上下移照舊。
- **版面記憶**：預設右側改成「屬性 + 圖層」。`localStorage` key 換成 `v2`；只有 v1 時沿用使用者原本的版面，並把屬性面板加到右側最上方一次（舊的選取工具列一直都看得到，升級後不能讓屬性消失）。v2 存在時以 v2 為準，使用者關掉屬性面板就不會再被打開。新增 2 個測試。
- **測試**：vitest 151 個通過，`npm run build` 通過。
- **畫面驗證**（無頭 Edge + CDP，29 項全部通過）：
  - 版面：v1 版面遷移、預設版面、舊工具列已移除、沒有選取時的提示。
  - 星形：名稱與分頁、寬度、限制比例、X、旋轉 370° → 10°、不合法文字還原、Esc 取消、Esc 不取消選取、欄位內按 Delete 不刪物件、分頁列固定在頂端、每個欄位一筆復原。
  - 圖層順序：移到最上 / 最下，邊界時按鈕停用。
  - 文字：保留「調整」分頁、只有行寬、切到「文字」改字級與粗體。
  - 刪除按鈕刪除物件、刪除後回到提示，console 沒有錯誤。

### 步驟 3 完成紀錄（2026-10-01）

- **規則（三邊一致）**：
  - 邊線畫在外框線的中心（Konva、Typst、SVG 本來就都是如此）。
  - 線寬必須大於 0、最多 100 pt：TS `isStroke` / `STROKE_WIDTH_MAX` 與 Rust `STROKE_WIDTH_MAX` 一致；面板把輸入限制在 0.25–100 pt。
  - 虛線：線段 3w、間隔 3w、平頭；點線：線段 0、間隔 2w、圓頭。TS `stroke.ts` 的 `dashPattern` 與 Rust `render.rs` 的 `dash_pattern` 各一份，兩邊的測試用同一組數字。
  - 轉角 miter，限制值 10（canvas 預設）；Typst 與 SVG 的預設是 4，匯出時明確設為 10。
- **Rust**：
  - `format.rs`：驗證線寬範圍。
  - `render.rs`：`RenderStroke` / `DashPattern` 加進矩形、橢圓、多邊形。
  - PDF：`template.typ` 的 `stroke-of` 把資料轉成 Typst stroke。
  - EPUB：有邊框的矩形 / 橢圓改輸出 inline SVG（`svg_box`、`svg_stroke`，半透明用 `stroke-opacity`）；沒有邊框的維持 CSS，輸出不變。`has_svg` 也把有邊框的矩形 / 橢圓算進去。
- **和計畫不同：PDF 中有邊框的矩形與橢圓改畫成路徑**。疊圖比對時發現虛線位置不同：重疊率星形 / 三角形 99%，但圓角矩形只有 73%、橢圓 21%。
  - 原因是 Typst 內建的 `rect` / `ellipse` 路徑起點和 Konva、SVG 不同。Konva 與 SVG 的圓角矩形從 (r, 0) 往右畫，橢圓從最右點順時針畫；Typst 的橢圓從最左點開始。虛線的位置由路徑起點決定，所以整段錯開。
  - 修法：有邊框時，由 Rust（`pdf.rs` 的 `rect_path` / `ellipse_path`）算出相同起點、相同方向的路徑（直線 + 四分之一圓弧的三次貝茲曲線），模板用 Typst `curve` 畫。沒有邊框的圖形照舊用 `rect` / `ellipse`。
  - 修正後虛線重疊率：矩形 99.5%、橢圓 99%、星形 99%、三角形 99.3%。點線約 95%，差異是圓點邊緣的反鋸齒：Edge 畫出的點面積多約 4%，位置相同。
- **前端**：
  - `validation.ts`：`isStroke`、線寬上下限。reducer 拒絕不合法的 `stroke`。
  - 新增 `stroke.ts`：`dashPattern`、`konvaStroke`、`DEFAULT_STROKE`（#171717、1 pt、實線）。
  - 畫布：`ShapeBody` 套用邊線；Transformer 加 `ignoreStroke`，控制框貼著外框，拖曳換算的 scale 才對應 width / height。
  - 屬性面板「樣式」分頁新增「邊框」區：顯示邊框開關、顏色（調色板，含透明度）、線寬、樣式下拉（附線條預覽）。
- **測試**：Rust 76 個，新增：
  - 線寬範圍、圖形帶邊框、虛線數字。
  - PDF 點陣圖：邊線在外框線中心、虛線 / 點線有間隔。
  - 路徑起點與封閉、所有圖形加點線都能編譯、SVG 邊框屬性。
  vitest 156 個，新增 `stroke.test.ts` 與 reducer 邊框測試。fixture 的橢圓本來就有虛線邊框，EPUB 測試改成檢查它的 SVG 屬性。
- **疊圖比對方式**：自訂 `ExportRequest`，四種圖形分開放、不旋轉、4 pt 黑色虛線 / 點線。`export_preview`（2 px/pt）與 `epub_preview` 在 headless Edge 以 2 倍解析度截圖，逐圖形比對深色像素的重疊率。
- **畫面驗證**（無頭 Edge + CDP 讀畫布像素，取樣時隱藏控制框）：
  - 開啟邊框、線寬 10 pt：邊線在外框線兩側各 5 pt。
  - 虛線從 (r, 0) 往右開始（和 PDF / SVG 相同），點線是圓點，橢圓虛線從最右點往下。
  - 控制框不含邊線、復原一步一個變更、關閉邊框、console 沒有錯誤。

### 步驟 4 完成紀錄（2026-10-01）

- **版面規則**（TS `lib/editor/shape-label.ts` 與 Rust `render.rs` 的 `shape_label` 各一份，數字相同）：
  - 文字框 = 圖形外框往內縮 `LABEL_PADDING_PT`（4 pt），換行寬度 = 外框寬 − 8 pt。
  - 文字區塊高度 = 行數 × 字級 × 1.2，依垂直對齊（上 / 中 / 下）放在文字框內，**超出時照常顯示**（置中時上下平均超出）。
  - 文字框隨圖形繞圖形的定位點旋轉。
  - 所有圖形都用外框矩形當文字框，包括橢圓、星形、三角形。和 draw.io 對橢圓、三角形的內縮不同，靠邊對齊的文字可能碰到弧線外。這次先維持簡單一致的規則，之後需要時可以依 geometry 調整內縮量。
- **畫布**：
  - 圖形的 Group 裡加 Konva `Text`。垂直對齊需要行數，用和匯出相同的離畫面 `Konva.Text` 量測（`useMemo`，只有文字、樣式、寬度改變時才重算）。
  - **文字節點回報空的外框**（`excludeFromBounds`）。Konva 的 `Container.getClientRect` 會略過寬高為 0 的子節點，所以超出圖形的文字不會讓選取控制框變大；控制框大了，拖曳換算的 scale 就會錯。
- **編輯**：
  - 雙擊圖形開啟編輯框（沿用 `TextEditorOverlay`，含輸入法處理）。新增 `frame` 參數：外層 div = 文字框（旋轉、flex 垂直對齊），輸入時文字保持置中。
  - 沒有文字的圖形用預設樣式開始（14 pt、置中、垂直置中、#171717）。
  - 清空文字後確定 = 移除文字（`label: null`）。原本沒有文字、按 Esc 或空白確定，都不產生歷史。
  - 編輯中只隱藏該圖形的文字，圖形本身仍顯示。
- **屬性面板**：
  - 圖形多了「文字」分頁（字級、粗體、水平對齊、**垂直對齊**、文字顏色），沒有文字時顯示「雙擊畫布上的圖形即可輸入文字」。
  - 文字物件與圖形內文字共用 `TextStyleControls`。
- **驗證**：reducer 以 `isShapeLabel` 拒絕不合法的 `label`（字級範圍、對齊值、顏色）。
- **圖層面板**：有文字的圖形顯示「圓角矩形：文字開頭…」（和計畫不同的小改進，方便分辨）。
- **匯出**：
  - `buildExportRequest` 也量測圖形內文字，key 是 `<id>#label`。
  - Rust 把它變成一個 `RenderText` 元素，放在圖形的下一個（z 軸順序和畫布一樣），PDF 與 EPUB 不用另外處理，內嵌字型也自動涵蓋。
  - 沒有前端 layout 時退回以 `\n` 分行，和文字物件相同。
- **測試**：Rust 78 個（新增：文字框位置、垂直置中、旋轉、空白文字不畫；既有 EPUB 測試加入 fixture 橢圓的文字）；vitest 166 個（新增 `shape-label.test.ts`、圖形內文字的量測、reducer、圖層名稱）。
- **畫面驗證**（無頭 Edge + CDP，19 項全部通過）：
  - 編輯框：雙擊開啟空白編輯框、位置與大小貼合文字框、垂直置中。
  - 輸入與排版：輸入後的位置（y = 4 + (122 − 16.8) / 2）、靠上對齊、改字級。
  - 超出與縮放：40 pt 長文字超出圓形但控制框仍是 120 × 120 pt、拖曳加寬後重新換行。
  - 再次編輯、清空移除、Esc 不新增、復原、文字物件照常編輯、console 沒有錯誤。
- **疊圖比對**：在 dev server 頁面以動態 import 呼叫 `buildExportRequest` + `measureTextLayout`，用**編輯器真正量出的分行**產生 `ExportRequest`。測試內容是六種情況：靠上置左粗體、置中自動換行、靠下置右手動換行、星形紅字、旋轉 20°、超出圖形。
  - PDF 與 EPUB 的分行、位置肉眼一致；每個區域的文字重心相差 ≤ 0.6 pt（既有限制：字距由各自的字型引擎計算）。
  - 墨跡重疊率：單一大字 99%，多字區域 72–88%。瀏覽器的筆畫較粗，EPUB 的墨跡多 5–13%，不是位置差異。

### 步驟 5 完成紀錄（2026-10-01）

- **屬性面板「樣式」分頁最上方新增「形狀」區**：
  - 矩形：圓角（pt），寫入時限制在短邊的一半以內。若存更大的值，之後縮放圖形時圓角會跟著變，所以寫入時就限制。
  - 多邊形：邊數，四捨五入、3–24。
  - 星形：角數 3–24、內徑 10–90%（存成 `innerRatio`）。
  - 橢圓沒有參數，不顯示這一區。
  - 改邊數 / 角數時外框不變，頂點重新填滿外框（和 draw.io 相同）。
- **驗證分兩層**：
  - 檔案格式（Rust `validate_geometry`）與 reducer（TS `isShapeGeometry`）規則相同：圓角 ≥ 0、內徑比例在 0 到 1 之間（不含 0）、邊數 / 角數為整數且 ≤ `MAX_VERTEX_COUNT`（1000，避免一個檔案產生大量頂點）。
  - 少於 3 邊 / 2 角**不拒絕**：繪製時本來就會補足（`project/shape.rs`），舊檔不會因此打不開。
  - 面板的範圍（3–24、10–90%）是 UI 的選項，比檔案格式窄。
- `lib/editor/properties.ts` 新增 `clampCornerRadius`、`clampVertexCount`、`innerRatioFromPercent`。
- 圖層名稱：多邊形依邊數顯示三角形 / 四邊形 / 五邊形 / 六邊形 / n 邊形。
- **計畫中「元素面板 / 底部工具列的圖形清單改成 geometry」**：步驟 1 已經完成（`SHAPE_PRESETS` 把 UI 的五種圖形對應到 geometry），這一步沒有再改。
  - 注意名稱：`element-factory.ts` 的 `ShapeKind` 是 **UI 的圖形選項**（rect / roundedRect / ellipse / triangle / star）；`types.ts` 的 `GeometryKind` 是**文件模型**的 geometry 種類。兩者不同，步驟 6 寫進文件。
- **測試**：Rust 79 個（新增 geometry 驗證）；vitest 172 個（新增面板換算、`isShapeGeometry`、reducer geometry、多邊形名稱）。`npm run build` 通過。
- **畫面驗證**（無頭 Edge + CDP，11 項全部通過）：
  - 矩形：「形狀」區排在最前面、圓角 999 → 65、圓角 0 → 圖層名稱變成「矩形」。
  - 三角形：邊數 6 → 6 個頂點且外框不變、圖層名稱「六邊形」、2.4 → 3。
  - 星形：角數 8 + 內徑 60% → 16 個頂點、內外半徑比 0.6；內徑 5 → 10%。
  - 橢圓沒有「形狀」區、復原、console 沒有錯誤。

### 步驟 6 完成紀錄（2026-10-01）

- **`docs-website/types.html`**：
  - 關係圖下半部重畫：三種 Element、`ShapeElement` 組合 `ShapeGeometry` / `Stroke` / `ShapeLabel`，新增 `TextStyle`、`GeometryKind`。
  - extends 改寫在方框標題列（`TextElement` 同時 extends 兩個型別，畫線會交錯），圖例同步改。
  - x / y 示意圖改成「一律是外框左上角」，並註明舊檔的中心定位會自動換算。
  - 刪除四張舊圖形的說明卡，新增 `TextStyle`、`ShapeElement`、`ShapeGeometry`、`Stroke`、`ShapeLabel`、`GeometryKind`，「使用位置」依目前的 import 重寫。
  - `ElementPatch` 補上「物件欄位整個取代」與「reducer 執行時驗證」；常見誤解與自我檢查題也一併更新。
  - 頁首不寫 commit 編號（補編號需要再一次 commit），改成「和 `types.ts` 在同一個 commit 更新」，並附上查詢指令。
  - 以 headless Edge 截圖檢查兩張圖，頁內錨點沒有斷掉。
- **`CLAUDE.md`**：
  - 目前階段、目錄結構（新檔案、刪除 `selection-toolbar.tsx`、fixture v2）。
  - 「文件模型」改寫：外框定位、`ShapeElement`、`ShapeKind` 與 `GeometryKind` 的區別、圖形內文字、邊框、patch 整個取代、新增物件類型 / geometry 時要改的地方、舊檔升級。
  - 工具面板：屬性面板、10 個面板、版面 key v2。
  - 檔案系統：`schemaVersion` 3。
  - 匯出：前端與 Rust 各一份的常數清單、`<id>#label`、有邊框的矩形 / 橢圓在 PDF 畫成路徑、在 EPUB 輸出 SVG。
  - 順便修正兩處過時的描述：`build_data` → `to_data`、`export/mod.rs` → `render.rs`。
- **`docs/02-architecture.md`**：資料夾行數重新計算，「漏改檢查」表補 `ShapeBody` 與屬性面板，閱讀順序的行數更新並連到 `types.html`。
- **`docs/01-overview.md`**：功能表加入圖形內文字與屬性面板，畫面對應圖把上方選取工具列換成右側屬性面板。順便修正「復原 / 重做在上方按鈕」（早已移到底部動作列）。
- 舊的計畫文件（`docs/imp-*.md`）是當時的紀錄，裡面提到選取工具列的地方保留原樣。

## 6. 風險

- **步驟 1 牽動的檔案多**：前端與 Rust 必須同時改完才能開檔，中間狀態無法在桌面版執行。以 fixture 測試 + PDF 點陣圖 hash 比對確認沒有改變外觀。
- **舊檔升級的旋轉換算**：中心定位 → 左上角定位，旋轉過的橢圓 / 多邊形如果算錯會位移。要有旋轉不為 0 的升級測試。
- ~~多邊形的外框不貼合圖形~~：實作時改成頂點填滿外框（見步驟 1 完成紀錄），選取框貼合圖形。
- **舊版 App 打不開新檔案**（`SCHEMA_VERSION` 3）。
