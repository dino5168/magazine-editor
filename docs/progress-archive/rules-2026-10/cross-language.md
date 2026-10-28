<!-- 迭代 2（commit 8959b47）的 .claude/rules/cross-language.md 原文；迭代 5 精簡前封存，不再更新 -->

---
paths:
  - "src/lib/editor/**"
  - "src/lib/library/**"
  - "src/lib/templates/**"
  - "src/lib/export/**"
  - "src-tauri/src/project/**"
  - "src-tauri/src/export/**"
---

# TS ↔ Rust 必須一致的常數與規則

  - **前端與 Rust 各有一份、改一邊要改兩邊的常數**（兩邊的測試用同一組數字守著）：
    - 圓角的限制（每個角各自 ≤ 短邊的一半）：`properties.ts` 的 `clampCornerRadius`（輸入時）/ `render.rs` 的 `RenderRect.corner_radii` 與 `rounded_rect_path`（輸出時），都照 Konva 的規則；四角的驗證 `isCornerRadius` / `validate_geometry`。
    - 對齊的值：`text-style.ts` 的 `TEXT_ALIGNS` / `format.rs` 的 `Align`（`distributed` 見「首尾置中」）。
    - 行距 / 字距：`DEFAULT_LINE_HEIGHT = 1.2`（舊檔的行距）、`LINE_HEIGHT_MIN/MAX`（0.5–3）、`LETTER_SPACING_MIN/MAX`（−200–1000 ‰）：`text-style.ts` / `format.rs`（`validate_text_spacing`）。行距本身存在每個物件上（v9 起）。
    - 段落縮排：`TEXT_INDENT_MAX`（20 字）與「首行 ≥ −左縮排」：`text-indent.ts` 的 `hasValidTextIndent` / `format.rs` 的 `validate_text_indent`；每行的起點 `alignedLineStart` / `render.rs` 的 `layout_line_start`。
    - `LABEL_PADDING_PT = 4`：`shape-label.ts` / `render.rs`。
    - 虛線樣式：`stroke.ts` 的 `dashPattern` / `render.rs` 的 `dash_pattern`（都回傳一串長度 `segments`）。虛線 3w + 3w；點線 0 + 2w，圓頭；點劃線 4w + 2w + w + 2w，平頭。可選的樣式清單是 `validation.ts` 的 `STROKE_DASHES`（選單、MCP schema、偏好的參考線都讀它）。
    - 多邊形 / 星形頂點：`shape-geometry.ts` / `project/shape.rs`。
    - 線寬上限 `STROKE_WIDTH_MAX`、`MAX_VERTEX_COUNT`、邊界上限 `MARGIN_MAX_PT`、陰影偏移上限 `TEXT_SHADOW_OFFSET_MAX`：`validation.ts` / `format.rs`。
    - 圖片框：`SHAPE_IMAGE_ZOOM_MAX`（10）、`SHAPE_IMAGE_FITS`、照片的驗證（`validation.ts` 的 `isShapeImage` / `format.rs` 的 `validate_shape_image`）；照片位置只在前端（`photoPlacement`），Rust 讀 `ExportRequest.shapePhotos`。
    - 圖形庫 geometry 的格式：`SHAPE_PRESET_ID_MAX_LENGTH`（32，id 與參數名稱只能英數 `-`）、`SHAPE_PRESET_PARAMS_MAX`（8）：`validation.ts` 的 `isShapePresetName` / `isShapeGeometry` / `format.rs` 的 `is_preset_name` / `validate_geometry`。四分之一圓的 `KAPPA`：`shape-path.ts` / `render.rs`。
    - 主頁鏈的深度上限 `MASTER_DEPTH_MAX`（8）與主頁引用的規則：`master-pages.ts` / `format.rs`。
    - 文字樣式：`TEXT_STYLE_NAME_MAX_LENGTH`（50）、名稱 / id 規則與引用（`style-sheet.ts` / `format.rs` 的 `validate_text_styles` / `require_style`）；內建三個樣式（`defaultTextStyles` / `default_text_styles`，共用 `tests/fixtures/default-text-styles.json`）。
    - 文件色票：`SWATCH_NAME_MAX_LENGTH`（50）、色票顏色是小寫 `#rrggbb`、id / 名稱不重複、連結引用存在（`validation.ts` 的 `isSwatchList` / `isSwatchLink` / `format.rs` 的 `validate_swatches` / `require_swatch`）。
    - 素材庫：`LIBRARY_DEPTH_MAX`（8）、資料夾 / 素材名稱上限、`TEXT_EXCERPT_MAX_CHARS` 與驗證規則（`lib/library/types.ts`、`library-validation.ts` / `project/library.rs`，共用 `sample-library.json`）；`TEXT_ASSET_MAX_BYTES`（200 KB）、`AUDIO_ASSET_MAX_BYTES`（50 MB）（`types.ts` / `assets.rs`）。
    - 文件範本：`TEMPLATE_NAME_MAX_LENGTH`（50）、`TEMPLATE_DESCRIPTION_MAX_LENGTH`（200）與名稱規則（`lib/templates/types.ts`、`template-content.ts` / `project/templates.rs`）。
    - 底線 / 刪除線的公式與模擬斜體的斜率只在 Rust（`render.rs`），對應的是 **Konva 與瀏覽器本身的行為**，不是前端常數：升級 Konva 時重查（見「文字裝飾」）。
    - 字級範圍 `FONT_SIZE_MIN` / `FONT_SIZE_MAX`（`validation.ts`）、`PAGE_NUMBER_MAX` / `PAGE_NUMBER_AFFIX_MAX_LENGTH`（`page-numbers.ts`）：`format.rs` 的頁碼驗證（`validate_page_number_rules`）。
