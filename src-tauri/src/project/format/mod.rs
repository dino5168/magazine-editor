//! `project.magproj` file format. Mirrors `src/lib/editor/types.ts`; the shared fixture
//! `tests/fixtures/sample.magproj` is round-tripped by both `cargo test` and vitest to catch drift.

pub const FORMAT_ID: &str = "magazine-editor/project";
/// v2: element colors (`fill`) may carry alpha as `#rrggbbaa`. Page backgrounds stay `#rrggbb`.
/// v3: `rect` / `ellipse` / `polygon` / `star` merged into `shape` (box + geometry, `x` / `y` at the
/// top-left corner) with optional `stroke` and `label`. Older files are upgraded on read.
/// v4: `document.margins` (guides only). Older files and backups without it read as all 0; the
/// version bump stops older apps from opening (and silently dropping) it.
/// v5: `document.pageNumberRules`. Missing in older files and backups → no page numbers.
/// v6: text styles (text elements, shape labels, page numbers) gain `italic` / `underline` /
/// `strikethrough` / `shadow`. Missing in older files and backups → plain text.
/// v7: `document.masters` and `Page.masterId`.
/// v8: `document.textStyles` (style sheet) and `styleId` on text elements and shape labels. Older
/// files and backups read as the built-in styles (`default_text_styles`) with nothing linked.
/// v9: `lineHeight` / `letterSpacing` on text elements, shape labels and text styles (not page
/// numbers). Missing in older files and backups → 1.2 / 0, the values that used to be fixed.
/// v10: `align` may be `distributed` (首尾置中). No new fields; older apps cannot read the value, so
/// the version tells them the file is newer.
/// v11: a rectangle's `cornerRadius` may be four numbers (top-left, top-right, bottom-right,
/// bottom-left) when the corners differ. Older files and backups keep their single number.
/// v12: `document.swatches` (named opaque colors) and a link next to every color: `fillSwatchId`
/// (texts, shape labels, text styles, page numbers, shapes), `swatchId` (strokes, text shadows),
/// `backgroundSwatchId` (pages, master pages). Uses keep their own color, so the exporters never
/// read the swatches. Missing in older files and backups → no swatches, nothing linked.
/// v13: `document.fonts` (project fonts: TTF / OTF files in `assets/fonts/`). Texts still store a
/// CSS `fontFamily`; a project font's family is `project-font-<id>`. Missing in older files and
/// backups → none.
/// v14: shape geometry `{ kind: "preset", preset, params }`, a shape from the editor's shape
/// library; the editor computes its outline for export. Older files have none.
/// v15: stroke `dash` may be `dashDot`（點劃線）; line elements follow (`docs/06-Plans-繪圖/03-自由繪圖-實作.md`).
/// Older files have neither.
/// v16: paragraph indents `indentLeft` / `indentRight` / `indentFirstLine` (multiples of the font
/// size) on text elements, shape labels and text styles (not page numbers). Missing in older files
/// and backups → 0 (`docs/07-Plans-物件屬性與事件/01-新增文字框屬性-實作.md`).
/// v17: shapes may hold a photo (`image`, an image frame). Missing in older files and backups →
/// none (`docs/07-Plans-物件屬性與事件/03-圖形照片-實作.md`).
pub const SCHEMA_VERSION: u32 = 17;
pub const PROJECT_FILE_NAME: &str = "project.magproj";
/// Largest stroke width (pt); same as `STROKE_WIDTH_MAX` in `src/lib/editor/validation.ts`.
pub const STROKE_WIDTH_MAX: f64 = 100.0;
/// Most polygon sides / star points a file may contain (each is drawn as vertices); same as
/// `MAX_VERTEX_COUNT` in `src/lib/editor/validation.ts`.
pub const MAX_VERTEX_COUNT: u32 = 1000;
/// Most points a line may have; same as `MAX_LINE_POINTS` in `src/lib/editor/validation.ts`.
pub const MAX_LINE_POINTS: usize = 500;
/// Largest zoom of a photo in a shape; same as `SHAPE_IMAGE_ZOOM_MAX` in `src/lib/editor/validation.ts`.
pub const SHAPE_IMAGE_ZOOM_MAX: f64 = 10.0;
/// Largest |coordinate| of a line point (pt); same as `LINE_COORDINATE_MAX` in TS.
pub const LINE_COORDINATE_MAX: f64 = 1e6;
/// Arrowhead size factor range; same as `LINE_END_SCALE_MIN` / `MAX` in TS.
pub const LINE_END_SCALE_MIN: f64 = 0.5;
pub const LINE_END_SCALE_MAX: f64 = 5.0;
/// Longest shape-library id and parameter name; same as `SHAPE_PRESET_ID_MAX_LENGTH` in
/// `src/lib/editor/validation.ts`.
pub const SHAPE_PRESET_ID_MAX_LENGTH: usize = 32;
/// Most parameters a shape-library shape may store; same as `SHAPE_PRESET_PARAMS_MAX` in
/// `src/lib/editor/validation.ts`.
pub const SHAPE_PRESET_PARAMS_MAX: usize = 8;
/// Largest page margin (pt), 2000 mm; same as `MARGIN_MAX_PT` in `src/lib/editor/validation.ts`.
pub const MARGIN_MAX_PT: f64 = 2000.0 * 72.0 / 25.4;
/// Font size range (pt); same as `FONT_SIZE_MIN` / `FONT_SIZE_MAX` in `src/lib/editor/validation.ts`.
/// Only page numbers are checked against it; elements rely on the UI.
pub const FONT_SIZE_MIN: f64 = 6.0;
pub const FONT_SIZE_MAX: f64 = 400.0;
/// Largest page number range end / start value; same as `PAGE_NUMBER_MAX` in `src/lib/editor/page-numbers.ts`.
pub const PAGE_NUMBER_MAX: u32 = 99999;
/// Longest chain of master pages, counting the top one; same as `MASTER_DEPTH_MAX` in `src/lib/editor/master-pages.ts`.
pub const MASTER_DEPTH_MAX: usize = 8;
/// Longest page number prefix / suffix (characters); same as `PAGE_NUMBER_AFFIX_MAX_LENGTH`.
pub const PAGE_NUMBER_AFFIX_MAX_LENGTH: usize = 20;
/// Largest text shadow offset either way (pt); same as `TEXT_SHADOW_OFFSET_MAX` in `src/lib/editor/validation.ts`.
pub const TEXT_SHADOW_OFFSET_MAX: f64 = 50.0;
/// Line height of files before v9 (× font size); same as `DEFAULT_LINE_HEIGHT` in `src/lib/editor/text-style.ts`.
pub const DEFAULT_LINE_HEIGHT: f64 = 1.2;
/// Line height range; same as `LINE_HEIGHT_MIN` / `_MAX` in `src/lib/editor/text-style.ts`.
pub const LINE_HEIGHT_MIN: f64 = 0.5;
pub const LINE_HEIGHT_MAX: f64 = 3.0;
/// Letter spacing range (1/1000 of the font size); same as `LETTER_SPACING_MIN` / `_MAX` in
/// `src/lib/editor/text-style.ts`.
pub const LETTER_SPACING_MIN: f64 = -200.0;
pub const LETTER_SPACING_MAX: f64 = 1000.0;
/// Largest indent (multiples of the font size); same as `TEXT_INDENT_MAX` in `src/lib/editor/text-indent.ts`.
pub const TEXT_INDENT_MAX: f64 = 20.0;
/// Longest text style name (characters, after trimming); same as `TEXT_STYLE_NAME_MAX_LENGTH` in
/// `src/lib/editor/style-sheet.ts`.
pub const TEXT_STYLE_NAME_MAX_LENGTH: usize = 50;
/// Longest swatch name (characters, after trimming); same as `SWATCH_NAME_MAX_LENGTH` in
/// `src/lib/editor/validation.ts`.
pub const SWATCH_NAME_MAX_LENGTH: usize = 50;
/// Longest project font name (characters, after trimming); same as `FONT_NAME_MAX_LENGTH` in
/// `src/lib/editor/validation.ts`.
pub const FONT_NAME_MAX_LENGTH: usize = 50;
/// Longest name read from a font file (display only); same as `FONT_FILE_NAME_MAX_LENGTH`.
pub const FONT_FILE_NAME_MAX_LENGTH: usize = 200;
/// Largest ascent / descent / Apple baseline shift (em); same as `FONT_METRIC_MAX`.
pub const FONT_METRIC_MAX: f64 = 4.0;
pub const ASSET_DIR: &str = "assets/images";
/// Text assets (`.txt` / `.md`) of the asset library.
pub const TEXT_ASSET_DIR: &str = "assets/texts";
/// Audio assets of the asset library (not placeable on pages).
pub const AUDIO_ASSET_DIR: &str = "assets/audio";
/// Project font files (`document.fonts`).
pub const FONT_ASSET_DIR: &str = "assets/fonts";

mod document;
mod elements;
mod upgrade;
mod validate;
#[cfg(test)]
mod tests;

pub use document::*;
pub use elements::*;
pub use upgrade::*;
pub use validate::*;

use crate::error::{AppError, AppResult};
use serde::Deserialize;
use serde_json::Value;

/// Only the fields needed to decide whether the rest of the file can be read.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Header {
    format: Option<String>,
    schema_version: Option<u32>,
}

/// Parses and validates a project file.
///
/// # Errors
/// - `AppError::UnsupportedVersion` when the file is newer than this app.
/// - `AppError::InvalidProject` when the JSON is malformed or fails validation.
pub fn parse_project(json: &str) -> AppResult<ProjectFile> {
    let header: Header = serde_json::from_str(json)?;
    if header.format.as_deref() != Some(FORMAT_ID) {
        return Err(AppError::invalid_project("not a magazine-editor project file"));
    }
    let project: ProjectFile = match header.schema_version {
        Some(version) if version > SCHEMA_VERSION => return Err(AppError::UnsupportedVersion(version)),
        Some(SCHEMA_VERSION) => serde_json::from_str(json)?,
        // v1 → v2 只放寬顏色格式（沒有升級步驟）；v1 / v2 → v3 把四種圖形改寫成 shape
        Some(1..SCHEMA_VERSION) => {
            let mut value: Value = serde_json::from_str(json)?;
            if let Some(document) = value.get_mut("document") {
                upgrade_shapes_to_v3(document);
            }
            serde_json::from_value(value)?
        }
        _ => return Err(AppError::invalid_project("missing or unknown schemaVersion")),
    };
    validate_content(&project.document, &project.assets)?;
    Ok(project)
}
