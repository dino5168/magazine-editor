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

前端與 Rust 各有一份、**改一邊要改兩邊**（兩邊的測試用同一組數字守著）。精簡前原文：`docs/progress-archive/rules-2026-10/cross-language.md`。

- 圓角（每個角 ≤ 短邊的一半，照 Konva）：`properties.ts` 的 `clampCornerRadius` / `render.rs` 的 `RenderRect.corner_radii`、`rounded_rect_path`；驗證 `isCornerRadius` / `validate_geometry`。
- 對齊的值：`text-style.ts` 的 `TEXT_ALIGNS` / `format.rs` 的 `Align`（`distributed` 見 `editor-text.md`）。
- 行距 / 字距：`DEFAULT_LINE_HEIGHT = 1.2`（舊檔的行距）、`LINE_HEIGHT_MIN/MAX`（0.5–3）、`LETTER_SPACING_MIN/MAX`（−200–1000 ‰）：`text-style.ts` / `format.rs`（`validate_text_spacing`）。
- 段落縮排：`TEXT_INDENT_MAX`（20 字）與「首行 ≥ −左縮排」：`hasValidTextIndent` / `validate_text_indent`；每行起點 `alignedLineStart` / `render.rs` 的 `layout_line_start`。
- `LABEL_PADDING_PT = 4`：`shape-label.ts` / `render.rs`。
- 虛線樣式：`stroke.ts` 的 `dashPattern` / `render.rs` 的 `dash_pattern`（虛線 3w + 3w；點線 0 + 2w 圓頭；點劃線 4w + 2w + w + 2w 平頭）。樣式清單 `validation.ts` 的 `STROKE_DASHES`（選單、MCP schema、偏好都讀它）。
- 多邊形 / 星形頂點：`shape-geometry.ts` / `project/shape.rs`。四分之一圓的 `KAPPA`：`shape-path.ts` / `render.rs`。
- 上限 `STROKE_WIDTH_MAX`、`MAX_VERTEX_COUNT`、`MARGIN_MAX_PT`、`TEXT_SHADOW_OFFSET_MAX`、`FONT_SIZE_MIN` / `FONT_SIZE_MAX`：`validation.ts` / `format.rs`。頁碼 `PAGE_NUMBER_MAX` / `PAGE_NUMBER_AFFIX_MAX_LENGTH`（`page-numbers.ts`）/ `validate_page_number_rules`。
- 圖片框：`SHAPE_IMAGE_ZOOM_MAX`（10）、`SHAPE_IMAGE_FITS`、`isShapeImage` / `validate_shape_image`；照片位置只在前端（`photoPlacement`），Rust 讀 `ExportRequest.shapePhotos`。
- 圖形庫 geometry：`SHAPE_PRESET_ID_MAX_LENGTH`（32，英數與 `-`）、`SHAPE_PRESET_PARAMS_MAX`（8）：`isShapePresetName` / `isShapeGeometry` / `is_preset_name` / `validate_geometry`。
- 主頁鏈深度 `MASTER_DEPTH_MAX`（8）與引用規則：`master-pages.ts` / `format.rs`。
- 文字樣式：`TEXT_STYLE_NAME_MAX_LENGTH`（50）、名稱 / id 規則與引用（`style-sheet.ts` / `validate_text_styles`、`require_style`）；內建三個樣式 `defaultTextStyles` / `default_text_styles` 共用 `tests/fixtures/default-text-styles.json`。
- 文件色票：`SWATCH_NAME_MAX_LENGTH`（50）、小寫 `#rrggbb`、id / 名稱不重複、連結存在（`isSwatchList` / `isSwatchLink` / `validate_swatches` / `require_swatch`）。
- 素材庫：`LIBRARY_DEPTH_MAX`（8）、名稱上限、`TEXT_EXCERPT_MAX_CHARS`（`lib/library/types.ts`、`library-validation.ts` / `project/library.rs`，共用 `sample-library.json`）；`TEXT_ASSET_MAX_BYTES`（200 KB）、`AUDIO_ASSET_MAX_BYTES`（50 MB）（`types.ts` / `assets.rs`）。
- 文件範本：`TEMPLATE_NAME_MAX_LENGTH`（50）、`TEMPLATE_DESCRIPTION_MAX_LENGTH`（200）與名稱規則（`lib/templates/types.ts`、`template-content.ts` / `project/templates.rs`）。
- 匯出：翻頁書目錄的 `is_default_page_name` / 編輯器 `nextPageNames` 的預設頁名；PowerPoint 尺寸 `pptxExportProblem` / `pptx::slide_size`；內建字型 `FONT_OPTIONS` / `BUNDLED_FONTS`（見 `export.md`）。
- 底線 / 刪除線公式與模擬斜體的斜率**只在 Rust**（`render.rs`），對應的是 Konva 與瀏覽器本身的行為：升級 Konva 時重查（`editor-text.md`）。
