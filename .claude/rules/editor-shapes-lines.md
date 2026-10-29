---
paths:
  - "src/lib/editor/shape-*.ts"
  - "src/lib/editor/line-*.ts"
  - "src/lib/editor/corner-radius.ts"
  - "src/lib/editor/stroke.ts"
  - "src/components/editor/shape-*.tsx"
  - "src/components/editor/shape-options.ts"
  - "src/components/editor/line-*.tsx"
  - "src/components/editor/use-canvas-line.ts"
  - "src/components/editor/canvas-elements.tsx"
  - "src/components/editor/panels/elements-panel.tsx"
  - "src/components/editor/panels/draw-panel.tsx"
  - "src/lib/export/line-export.ts"
  - "src-tauri/src/project/shape.rs"
---

# 編輯器：圖形庫、圖片框、線條

精簡前的完整原文（範圍、決定、疊圖比對）：`docs/progress-archive/rules-2026-10/editor-shapes-lines.md`。計畫：`docs/06-Plans-繪圖/`、`docs/07-Plans-物件屬性與事件/03-圖形照片-實作.md`。

## 共通

- 多邊形 / 星形頂點拉伸到碰到外框四邊：`shape-geometry.ts` 與 Rust `project/shape.rs` **同公式**。
- 虛線樣式 `dashPattern`（`stroke.ts`）和 Rust `render.rs` 同數字。
- 路徑只輸出 **M / L / C / Z**（三端行為一致；弧線先轉三次曲線，`PathBuilder.arc`）。
- **避免線段原路折返的尖角**：miter 無限長，畫布 / Typst / SVG 截斷方式不同。

## 圖形庫（`shape-presets.ts` / `shape-path.ts` / `shape-options.ts`）

- 不引入 draw.io / mxGraph；定義自己寫。只做框型圖形（填色外框 + 只描邊的細節線）。
- `ShapePreset` 的 id 與參數名稱存進檔案：**發布後不改名**。參數 `ratio`（0–1，跟著拉伸）或 `pt`（固定長度，公式裡夾到放得下）。
- 公式直接算 pt（不靠 Konva scale）。外框路徑要碰到四邊、細節線在外框內：測試對每個圖形自動檢查。曲線多的用 SVG path + `svgpath` + `fitPaths`。
- 檔案存所有參數（改預設不影響舊圖形）；畫的時候 `resolvePresetParams`（缺 → 預設、超出 → 夾、不認得 → 丟掉）。
- 不認得的 id：畫布畫 `MissingShape`、匯出略過並提示數量（`skippedShapeCount`）；檔案驗證不檢查 id 在不在圖形庫。
- `ShapeChoice` = 基本 5 種的 `ShapeKind` 或 `preset:<id>`；元素面板、底部工具列、屬性面板「換成」都用 `SHAPE_OPTION_GROUPS`，icon 由同一個 `presetPath` 畫（新增圖形不用另做 icon）。

## 圖片框（`shape-image.ts` / `shape-photo-fields.tsx`）

- 圖片框 = **圖形填入照片**（`ShapeElement.image`），不是圖片加遮罩。畫的順序：填色 → 照片 → 邊框 → 細節線 → 圖形內文字。
- `referenced_assets`（開檔清理）與範本的 `imageSources` **都要算進圖形照片**。Rust `validate_shape_image` 另檢查 `src` 在 `assets/images/`。
- **位置只有一個公式** `photoPlacement`：畫布直接用；匯出放進 `ExportRequest.shapePhotos[id]`，**Rust 不重寫公式**。
- 畫布用 Konva `fillPatternImage`：用**解碼後**的圖片尺寸算縮放；**橢圓的 pattern 原點是圓心**，要減 (w/2, h/2)。升級 Konva 時重測。
- PDF：照片是外框大小的 `tiling` 當填色；EPUB：inline SVG 的 `<clipPath>`，id `photo-<頁序>-<第幾個>`（翻頁書整本一份 HTML，id 要全書唯一）。
- 拖素材到圖形上：`shapeAtPoint`（看外框）；素材面板用 `getSnapshot()` 讀文件，不訂閱編輯器狀態。

## 線條（`line-*.ts` / `use-canvas-line.ts` / `line-handles.tsx` / `lib/export/line-export.ts`）

- 線條**不是**圖形庫的框型圖形；兩者並存。
- **路徑只有一份** `linePaths(line)`：畫布、圖示、匯出共用。箭頭永遠是實線；外框用 `lineLocalBounds`（曲線鼓出點外也算）。雙線只給 straight。
- 畫布：點擊範圍至少 `LINE_HIT_PX` 螢幕 px（所以 `ElementNode` / `StaticElement` 收 `zoom`）；Transformer 對線條不畫控制點，改用 `LineHandles`（拖曳中只畫預覽、放開一筆 `element/update`）。
- 畫線中的按鍵在 capture 階段 `stopImmediatePropagation`，否則編輯器的 Backspace / Esc 也會觸發。
- 匯出：`buildExportRequest` 把線條換成路徑圖形；Rust render / Typst / EPUB 都不認識線條。
- MCP `update_element`：`points` 不能和 x / y 同時給、`stroke` 不能 null。

## 檔案（看檔名猜不到的）

- `line-kinds.ts`：線條工具的種類與 `toolLineStroke`；`line-presets.ts`：「繪圖」面板的常用線條。
- `shape-label.ts`：圖形內文字的框（`labelFrame`：橢圓 / 多邊形 / 星形取形狀內最大的同比例矩形，結果以 geometry 快取；圖形庫的圖形還是用外框）、垂直對齊、轉成 `TextElement`（量測 / 編輯 / 匯出共用）。
- `stroke.ts` 也有畫布參考線屬性 `guideLineAttrs`（螢幕 px ÷ zoom）。`corner-radius.ts` 的驗證 `isCornerRadius` 在 `validation.ts`。
