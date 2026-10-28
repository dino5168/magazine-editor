<!-- 迭代 2（commit 8959b47）的 .claude/rules/editor-shapes-lines.md 原文；迭代 3 精簡前封存，不再更新 -->

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

### 圖形庫（`lib/editor/shape-presets.ts` / `shape-path.ts` + `shape-options.ts` / `shape-preset-icon.tsx`）

評估、計畫與每一步的結果：`docs/06-Plans-繪圖/01-繪圖-評估.md`、`01-繪圖-實作.md`。仿 draw.io「一般」分類的參數化圖形；**不引入 draw.io / mxGraph**（引擎衝突、破壞所見即所得），定義是自己寫的、外觀參考 draw.io。

- **範圍**（使用者決定）：只做框型圖形（填色外框 + 只描邊的細節線，例如圓柱頂部）；參數在屬性面板輸入數字（畫布上的調整把手、線條 / 箭頭物件、連接線、有洞的圖形、每個圖形自己的文字區、SVG 轉圖形之後另排）；圖形庫放「元素」面板，「繪圖」面板留給自由繪圖。
- **定義**（`ShapePreset`）：id（存進檔案，**發布後不改名**）、名稱、分類（`SHAPE_CATEGORIES`：基本 / 方塊與流程 / 箭頭 / 標註與旗幟）、點一下的預設大小、參數（`ShapePresetParam`：名稱（存檔用，不改名）、說明、`ratio`（存 0–1、面板顯示 %、跟著拉伸）或 `pt`（固定長度，公式裡夾到外框放得下）、範圍、預設）、`path(box, params) → { outline, details }`。
- **公式直接算 pt**（不靠 Konva scale，拉伸時線不變粗），只輸出 M / L / C / Z（三端行為一致；弧線先轉三次曲線）。外框路徑在任何外框與參數下都要碰到四邊、細節線在外框內：測試對「每個圖形 × 三種外框 × 最小 / 預設 / 最大參數」都檢查，新增圖形自動涵蓋。曲線多的形狀（雲、心形）用 SVG path 字串 + `svgpath` + `fitPaths`。**避免線段原路折返的尖角**（miter 無限長，畫布 / Typst / SVG 截斷方式不同；「資料儲存」踩過）。
- **參數**：檔案存所有參數（新圖形存預設值，之後改預設不會改到舊圖形）；畫的時候 `resolvePresetParams`（缺少 → 預設、超出 → 夾、不認得的名稱丟掉）。
- **細節線**（`detailStroke`）：有邊框跟邊框；沒有邊框時 1 pt 實線、填色 RGB × 0.55、保留填色透明度（填色全透明時 `#525252`，使用者決定）。
- **不認得的 id**（新版檔案、日後移除的圖形）：畫布畫灰色虛線外框（`MissingShape`，可選取）、匯出略過並由前端提示數量（`skippedShapeCount`）。檔案驗證（TS / Rust）只檢查格式，不檢查 id 在不在圖形庫。
- **選擇**：`ShapeChoice`（基本 5 種的 `ShapeKind`，或 `preset:<id>`；`presetChoice` / `choicePreset`）；`createShapeElement` / `createShapeInBox` 收它（點一下 = 預設大小、拖曳 = 填滿拖曳框）。元素面板、底部工具列「更多圖形」選單（可直接在畫布拖曳建立）、屬性面板「換成」都用 `SHAPE_OPTION_GROUPS`；icon 由同一個 `presetPath` 畫（`ShapePresetIcon`），新增圖形不用另做 icon。
- **屬性面板**「樣式 → 形狀」：「圖形」下拉 = **換成**（`choiceGeometry`：新圖形的預設，位置 / 大小 / 樣式 / 文字不變，一筆復原；`shapeChoiceOf` 找目前的選項，三邊以外的正多邊形沒有對應選項）＋ 該圖形的欄位（圖形庫參數：`presetParamToField` / `presetParamFromField`，夾在範圍內）。
- **匯出**：見「匯出 PDF」的圖形庫圖形。

### 圖片框（圖形照片）（`lib/editor/shape-image.ts` + `shape-photo-fields.tsx` + 匯出）

需求、評估、計畫與每一步的結果：`docs/07-Plans-物件屬性與事件/03-圖形照片-評估計畫.md`、`03-圖形照片-實作.md`。

- **方案**（使用者決定）：圖片框 = **圖形填入照片**（`ShapeElement.image`，v17），不是圖片加遮罩：所有 geometry（矩形 / 四角圓角、橢圓、多邊形、星形、圖形庫）、邊框、圖形內文字、「換成」、對齊、圖層都沿用圖形。照片裁在外形裡，**畫的順序：填色 → 照片 → 邊框 → 細節線 → 圖形內文字**（「完整顯示」的留白處看得到填色）。
- **模型**：`ShapeImage { src, imageWidth, imageHeight, fit: "cover" | "contain", focusX, focusY, zoom }`；像素尺寸在選照片時從素材庫取（三端都不用先解碼）；對焦 0–1（照片比框大時保留哪一段）、縮放 1–`SHAPE_IMAGE_ZOOM_MAX`（10）。TS `isShapeImage` / Rust `validate_shape_image`（多檢查 `src` 在 `assets/images/`）。**`referenced_assets` 與範本的 `imageSources` 都算進圖形照片**（否則開檔清理會刪掉、範本不會帶走）。
- **位置只有一個公式**：`photoPlacement(width, height, image)`（cover / contain × zoom，多出來的照對焦分；`-0` 換成 0）。畫布直接用；匯出時 `buildExportRequest` 放進 `ExportRequest.shapePhotos[id]`（主頁 / 跨頁的複本有自己的 id），**Rust 不重寫公式**（`render_photo`：沒有位置或不合理 → `InvalidInput`；照片檔不見 → 只畫填色、算進略過的圖片）。
- **畫布**（`canvas-elements.tsx`）：外形 `ShapeOutline`（`OutlinePaint` = 填色或照片）；有照片時同一外形畫兩次（底層填色不帶邊框、上層照片＋邊框），圖形庫 `PresetShapeBody` 同樣、細節線最後。照片是 Konva `fillPatternImage` + `photoPatternAttrs`：**用解碼後的圖片尺寸算縮放**；**橢圓的 pattern 原點是圓心**（Konva 10.5 實測），要減掉 (w / 2, h / 2)。`useShapePhoto` 經 `useResolveSrc`（範本縮圖用範本資料夾）。升級 Konva 時重測。
- **PDF**（`template.typ`）：四種外形收成 `shape-outline(el, fill, stroke)`，都放進外框大小的 `box`；照片是 `tiling(size: 外框, relative: "self", place(dx, dy, image(...)))` 當填色（外形四邊都碰到外框，格子剛好是外框）。PDF 裡是原圖、同一張只嵌入一次。`drop_undrawable_svgs` 也檢查 SVG 照片（讀不了 → 拿掉照片、保留圖形）。
- **EPUB / 翻頁書**（`markup.rs`）：有照片的圖形一律 inline SVG：`<clipPath>`（`outline_tag`，同一條外形）→ 填色外形 → `<image preserveAspectRatio="none" clip-path>` → 只有邊框的外形 → 細節線。clipPath id = `photo-<頁序>-<第幾個>`（`page_div` 的 `page_index`：翻頁書整本在一份 HTML）；`has_svg`、`collect_images` 都算照片。
- **疊圖比對**（6 種圖片框，2 px/pt）：照片位置（色帶中心的次像素量測）PDF ≤ 0.17 pt、EPUB ≤ 0.002 pt。逐像素的 PDF 差異是照片邊緣的內插（瀏覽器平滑、typst-render 沒有），不是位置。
- **UI**：屬性面板「樣式 → 填滿」的「照片」區（`ShapePhotoFields`：選擇照片的 Popover 列素材庫的圖片、更換（保留外觀）/ 移除、填滿 / 完整顯示、水平 / 垂直對焦 %、縮放 %）；素材面板**拖到圖形上**放進圖形（`geometry.ts` 的 `shapeAtPoint`：最上層、含旋轉、看外框；用 `getSnapshot()` 讀文件，面板不訂閱編輯器狀態；標籤「放開即放進圖形」）；圖片右鍵「**轉成圖片框**」（`imageToFrame` + reducer `element/replace`：同 id、同位置大小、透明矩形，之後用「換成」改形狀）。
- **MCP**：`add_shape` / `update_element` 的 `image`（`{ item, fit, focusX, focusY, zoom }`，`null` = 移除）、`get_element` 的 `photoItem`。
- 不做（之後另排）：元素面板「圖片框」佔位、畫布上拖曳調整照片位置（雙擊已是編輯圖形內文字）、照片連色票、精確到外形（星形凹處）的拖放命中。

### 線條（`lib/editor/line-*.ts` + `use-canvas-line.ts` / `line-handles.tsx` / `line-controls.tsx` + `lib/export/line-export.ts`）

評估、計畫與每一步的結果：`docs/06-Plans-繪圖/03-自由繪圖-需求分析-評估.md`、`03-自由繪圖-實作.md`。

- **模型**：見「文件模型」的線條。線條**不是**圖形庫的框型圖形（兩端可以自由拖、水平線外框高 0）；圖形庫的粗箭頭是填色的框型箭頭，兩者並存。
- **路徑只有一份**：`linePaths(line) → { stroke, fills, outlines }`（相對於 x / y，只有 M / L / C / Z）——畫布（`LineBody`）、工具列 / 面板圖示、匯出都用它。
  - 箭頭尖端在端點上、方向 = 端點的切線；實心三角時線縮短藏進三角形；開放箭頭的折點往回退，miter 尖角剛好在端點；**箭頭永遠是實線**。大小：長 4、寬 3.5 個 `max(線寬, 1.5)` 再乘倍數，UI 小 / 中 / 大 = 0.7 / 1 / 1.5。
  - `path: "smooth"`：均勻 Catmull-Rom → 三次貝茲，穿過每個點；箭頭的縮短沿曲線量。外框用 `lineLocalBounds`（曲線鼓出點外的部分也算）。
  - 雙線（`isDoubleLine`，只給 straight）：兩個平移 ±1/3 線寬的子路徑，畫的寬度 `lineStrokeWidth` = 線寬 / 3；尖角（miter 比 > 10）斜切。
- **畫布**：`LineBody` 三個 Konva Path，點擊範圍至少 8 螢幕 px（`LINE_HIT_PX`，所以 `ElementNode` / `StaticElement` 收 `zoom`）。Transformer 對線條沒有控制點、不能旋轉、單選時不畫框；改畫 `LineHandles`（拖曳中只畫預覽、放開一筆 `element/update`）。雙擊線段加點（`handleEditText` 對線條改成 `insertLinePoint`）。
- **工具**：`L` = 線條（`EditorState.lineKind`：直線 / 箭頭 / 雙向箭頭拖曳畫；折線 / 曲線逐點點擊，點最後一點或 Enter 完成、Backspace / Esc），`P` = 鉛筆（放開時 `simplifyPoints` 1.5 px、上限 500 點 → 平滑曲線）。新線條 1 pt `#171717`，連內建「文字」色票（`toolLineStroke`）。畫線中的按鍵在 capture 階段 `stopImmediatePropagation`，編輯器的 Backspace / Esc 不會跟著觸發。
- **屬性面板**：「線條」分頁（`LineStyleFields`、雙線、兩端箭頭與大小）；「調整」分頁兩點直線的長度 / 角度（起點不動，90° 的倍數用精確值）；水平線「填滿寬度」= 內容區寬的分隔線、垂直線「填滿高度」（`content-align.ts`）。
- **匯出**：`buildExportRequest` 把線條換成路徑圖形（見「匯出 PDF」的線條），Rust render / Typst / EPUB 都不認識線條。疊圖比對（直線、折線尖角、曲線、鉛筆、雙線）PDF / EPUB 容許 0.5 pt 差異 0。
- **MCP**：`add_line`（頁面座標的 points、path、compound、color、width、dash、start / end）、`update_element` 的線條欄位（points 換掉所有點、不能和 x / y 同時給；stroke 不能 null）、`get_element` 多 `pagePoints`。
- 已知限制：半透明線在實心箭頭下的那一小段疊兩次色（三端一樣）；雙擊曲線加點時照點連成的折線找最近一段；拖把手中途不能 Esc 取消。之後另排：鋸齒 / 波浪花樣、線帽選項、鉛筆壓力、連接線（不做）。

## 檔案（原 CLAUDE.md「目錄結構」）

```
      use-canvas-line.ts          # 線條工具（直線 / 箭頭：拖曳；折線 / 曲線：逐點點擊）與鉛筆（按住拖曳、放開簡化）在畫布上建立線條；預覽是 SVG path
      line-handles.tsx            # 單選線條時的端點把手（拖點、Shift 45°、吸附；點把手選中 + Delete 刪點）
      line-controls.tsx           # 屬性面板的線條分頁（線型、雙線、兩端箭頭）與長度 / 角度、ArrowheadIcon
      shape-options.ts            # 圖形選項：SHAPE_OPTIONS（基本 5 種，Lucide icon）、SHAPE_OPTION_GROUPS（依圖形庫分類，基本 5 種在「基本」最前面）、shapeOption(choice)；元素面板、底部工具列選單、屬性面板「換成」共用
      shape-preset-icon.tsx       # ShapePresetIcon：圖形庫圖形的 icon（同一個 presetPath 畫的 inline SVG，預設只有線，像 Lucide）
      shape-photo-fields.tsx      # 屬性面板「樣式 → 填滿」的「照片」區（ShapePhotoFields：選擇照片 Popover、更換 / 移除、填滿方式、對焦、縮放）
      shape-geometry.ts           # 多邊形 / 星形頂點（和 Rust project/shape.rs 同公式）
      shape-path.ts               # 路徑工具（不認得任何圖形）：PathCommand（M / L / C / Z）、PathBuilder（含 arc：每段 ≤ 90°、90° 倍數端點精確）、svgPathCommands（svgpath 正規化）、pathBounds（曲線真正的極值）、fitPaths、pathData
      shape-presets.ts            # 圖形庫（見「圖形庫」）：SHAPE_LIBRARY（28 個：2026-10-15 加「分叉箭頭」）、SHAPE_CATEGORIES、findShapePreset、resolvePresetParams、presetPath、detailStroke、參數欄位的換算
      line-geometry.ts            # 線條的幾何：點的外框、正規化（x / y = 點的外框左上角）、withLinePoints（含旋轉）、長度 / 角度、Shift 45°、加點 / 刪點、simplifyPoints（RDP，鉛筆）
      line-path.ts                # 線條與箭頭的路徑（畫布、圖示、匯出共用）：直線段 / Catmull-Rom 曲線、箭頭與縮短、雙線偏移、lineLocalBounds
      line-kinds.ts               # 線條工具的種類（直線 / 箭頭 / 雙向箭頭 / 折線 / 曲線）、箭頭大小與名稱、toolLineStroke
      line-presets.ts             # 「繪圖」面板的常用線條與箭頭（LINE_PRESETS、createPresetLine）
      shape-label.ts              # 圖形內文字的文字框、垂直對齊、轉成 TextElement（量測 / 編輯 / 匯出共用）
      stroke.ts                   # 邊框的虛線樣式（dashPattern，和 Rust render.rs 同數字）與 Konva 屬性；畫布參考線的 Konva 屬性（guideLineAttrs，螢幕 px ÷ zoom）與對齊線 1/2 / 1/4 的倍數（CONTENT_GUIDE_EMPHASIS）
      shape-image.ts              # 圖片框（圖形照片，見「圖片框」）：photoPlacement（照片在框裡的位置，畫布與匯出共用）、photoPatternAttrs（Konva 圖樣屬性，橢圓的原點是圓心）、shapeImageOf / imageToFrame、clampFocus / clampZoom
      corner-radius.ts            # 矩形圓角（一個數字或 [左上, 右上, 右下, 左下]）：cornerRadii、normalizeCornerRadius（四個一樣 → 數字）、clampCornerRadii / withCornerRadius（每角限制在短邊一半）、hasRoundedCorner、konvaCornerRadius、CORNER_NAMES；驗證 isCornerRadius 在 validation.ts
```
