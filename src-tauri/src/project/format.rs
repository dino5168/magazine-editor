//! `project.magproj` file format. Mirrors `src/lib/editor/types.ts`; the shared fixture
//! `tests/fixtures/sample.magproj` is round-tripped by both `cargo test` and vitest to catch drift.

use super::shape;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

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
pub const SCHEMA_VERSION: u32 = 16;
pub const PROJECT_FILE_NAME: &str = "project.magproj";
/// Largest stroke width (pt); same as `STROKE_WIDTH_MAX` in `src/lib/editor/validation.ts`.
pub const STROKE_WIDTH_MAX: f64 = 100.0;
/// Most polygon sides / star points a file may contain (each is drawn as vertices); same as
/// `MAX_VERTEX_COUNT` in `src/lib/editor/validation.ts`.
pub const MAX_VERTEX_COUNT: u32 = 1000;
/// Most points a line may have; same as `MAX_LINE_POINTS` in `src/lib/editor/validation.ts`.
pub const MAX_LINE_POINTS: usize = 500;
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub format: String,
    pub schema_version: u32,
    pub id: String,
    pub created_at: String,
    pub modified_at: String,
    pub app_version: String,
    pub document: Document,
    pub assets: Vec<AssetInfo>,
    /// Top-level fields written by newer app versions; preserved on save.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Document {
    pub name: String,
    /// Canvas guides only; export ignores them. Missing in files before v4 → all 0.
    #[serde(default)]
    pub margins: Margins,
    /// Missing in files before v5 → no page numbers.
    #[serde(default, rename = "pageNumberRules")]
    pub page_number_rules: Vec<PageNumberRule>,
    /// Style sheet. Linked texts keep their own copy of every field, so the exporters never read
    /// it. Missing in files before v8 → the built-in styles.
    #[serde(default = "default_text_styles", rename = "textStyles")]
    pub text_styles: Vec<TextStyleDef>,
    /// Document colors. Uses keep their own copy of the color, so the exporters never read them.
    /// Missing in files before v12 → none.
    #[serde(default)]
    pub swatches: Vec<Swatch>,
    /// Project fonts, in menu order. Missing in files before v13 → none.
    #[serde(default)]
    pub fonts: Vec<ProjectFont>,
    /// Content shared by the pages that use it. The frontend draws it into each page before
    /// exporting, so the exporters never read it. Missing in older files → none.
    #[serde(default)]
    pub masters: Vec<MasterPage>,
    pub pages: Vec<Page>,
}

/// A named, opaque document color (TS `Swatch`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Swatch {
    pub id: String,
    pub name: String,
    /// `#rrggbb`, lowercase.
    pub color: String,
}

/// A font the user imported into the project (TS `ProjectFont`). Its CSS / Typst family is
/// `project-font-<id>` (`project_font_family`), whatever the files call themselves.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectFont {
    /// Letters, digits, `-` and `_` only: it becomes part of a CSS family name.
    pub id: String,
    /// Shown in the font menu; trimmed, unique among the project fonts.
    pub name: String,
    /// Fallback after the font (and the built-in Chinese font of the same kind).
    pub generic: GenericFamily,
    pub regular: FontFile,
    /// The face drawn for `fontStyle: "bold"`; any weight. `None` → bold draws the regular file.
    pub bold: Option<FontFile>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GenericFamily {
    Serif,
    SansSerif,
}

/// One imported font file and what was read from it at import.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FontFile {
    /// `assets/fonts/<hash>.ttf|otf`.
    pub src: String,
    /// Family and style names inside the file (display only).
    pub file_family: String,
    pub file_style: String,
    /// `OS/2` weight class (display only).
    pub weight: u16,
    pub embedding: FontEmbedding,
    /// The metrics Windows engines (and so the canvas) use, in em: `OS/2` typo when
    /// USE_TYPO_METRICS is set, win otherwise. Written as `ascent-override` / `descent-override`.
    pub ascent: f64,
    pub descent: f64,
    /// How far engines that ignore the overrides and read `hhea` (Apple) move the first baseline, in
    /// em (positive = down). 0 when both agree.
    pub apple_baseline_shift: f64,
}

/// `OS/2.fsType` embedding permission. Restricted and bitmap-only fonts are refused at import.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FontEmbedding {
    Installable,
    Editable,
    PreviewAndPrint,
}

/// The CSS / Typst family name of a project font.
pub fn project_font_family(id: &str) -> String {
    format!("project-font-{id}")
}

/// Where a page number sits on the page.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PageNumberPosition {
    TopLeft,
    TopCenter,
    TopRight,
    MiddleLeft,
    MiddleRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

/// Settings for the odd or the even pages of a page number rule.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PageNumberFace {
    pub position: PageNumberPosition,
    pub prefix: String,
    pub suffix: String,
}

/// Look of a page number.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageNumberStyle {
    pub font_size: f64,
    pub font_family: String,
    pub font_style: FontStyle,
    #[serde(flatten)]
    pub decoration: TextDecoration,
    pub fill: String,
    /// `Swatch.id` the fill follows. Missing in files before v12 → not linked.
    #[serde(default)]
    pub fill_swatch_id: Option<String>,
    pub stroke: Option<Stroke>,
}

/// Page numbering of pages `from..=to` (1-based). The frontend turns it into a shape per page
/// before exporting, so the exporters never read it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PageNumberRule {
    pub id: String,
    pub from: u32,
    pub to: u32,
    /// Number shown on page `from`.
    pub start: u32,
    pub odd: PageNumberFace,
    pub even: PageNumberFace,
    pub style: PageNumberStyle,
}

/// Page margins in pt, the same for every page.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
pub struct Margins {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Page {
    pub id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub background: String,
    /// Missing in files before v12 → not linked.
    #[serde(default, rename = "backgroundSwatchId")]
    pub background_swatch_id: Option<String>,
    pub elements: Vec<Element>,
    /// Master page drawn under the elements. Missing in older files → none.
    #[serde(default, rename = "masterId")]
    pub master_id: Option<String>,
}

/// A master page: like a page, plus the master page it is based on.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MasterPage {
    pub id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub background: String,
    #[serde(default, rename = "backgroundSwatchId")]
    pub background_swatch_id: Option<String>,
    pub elements: Vec<Element>,
    #[serde(default, rename = "parentId")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Base {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub rotation: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FontStyle {
    Normal,
    Bold,
}

/// Hard text shadow: the text drawn again at an offset, without blur.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextShadow {
    pub color: String,
    /// Missing in files before v12 → not linked.
    #[serde(default)]
    pub swatch_id: Option<String>,
    /// pt, towards the page's right / bottom whatever the element's rotation.
    pub offset_x: f64,
    pub offset_y: f64,
}

/// Italic / underline / strikethrough / shadow of a text style (TS `TextDecoration`). Missing in
/// files before v6, which read as plain text.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct TextDecoration {
    /// Slanted by the renderer: no italic font files are bundled.
    pub italic: bool,
    pub underline: bool,
    pub strikethrough: bool,
    pub shadow: Option<TextShadow>,
}

/// Line height and letter spacing of a text style (TS `TextSpacing`). Missing in files before v9,
/// which read as the values that used to be fixed.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct TextSpacing {
    /// Distance between baselines ÷ font size.
    pub line_height: f64,
    /// Extra space after every character, in 1/1000 of the font size (may be negative).
    pub letter_spacing: f64,
}

impl Default for TextSpacing {
    fn default() -> Self {
        Self { line_height: DEFAULT_LINE_HEIGHT, letter_spacing: 0.0 }
    }
}

/// Paragraph indents of a text style (TS `TextIndent`), in multiples of the font size. Every `\n`
/// starts a paragraph; its first line moves `indent_first_line` more (negative = hanging). Missing
/// in files before v16 → 0.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct TextIndent {
    pub indent_left: f64,
    pub indent_right: f64,
    pub indent_first_line: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Align {
    Left,
    Center,
    Right,
    /// 首尾置中（分散對齊）：每一行首字貼左緣、末字貼右緣（含最後一行，單字置中），換行同靠左。
    Distributed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextElement {
    #[serde(flatten)]
    pub base: Base,
    pub text: String,
    pub width: f64,
    pub font_size: f64,
    pub font_family: String,
    pub font_style: FontStyle,
    #[serde(flatten)]
    pub decoration: TextDecoration,
    #[serde(flatten)]
    pub spacing: TextSpacing,
    #[serde(flatten)]
    pub indent: TextIndent,
    pub align: Align,
    pub fill: String,
    /// Missing in files before v12 → not linked.
    #[serde(default)]
    pub fill_swatch_id: Option<String>,
    /// `TextStyleDef.id` it follows. Missing in files before v8 → not linked.
    #[serde(default)]
    pub style_id: Option<String>,
}

/// A named text style in the document's style sheet (TS `TextStyleDef`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextStyleDef {
    pub id: String,
    pub name: String,
    pub font_size: f64,
    pub font_family: String,
    pub font_style: FontStyle,
    #[serde(flatten)]
    pub decoration: TextDecoration,
    #[serde(flatten)]
    pub spacing: TextSpacing,
    #[serde(flatten)]
    pub indent: TextIndent,
    pub align: Align,
    pub fill: String,
    /// Missing in files before v12 → not linked.
    #[serde(default)]
    pub fill_swatch_id: Option<String>,
}

/// Font of the built-in styles (TS `DEFAULT_FONT_OPTION.family`).
const BUILT_IN_FONT_FAMILY: &str = "\"Geist\", \"Noto Sans TC\", sans-serif";

/// Built-in styles (標題 / 副標題 / 內文); same as TS `defaultTextStyles`. Both sides are checked
/// against `tests/fixtures/default-text-styles.json`.
pub fn default_text_styles() -> Vec<TextStyleDef> {
    let style = |id: &str, name: &str, font_size: f64, font_style: FontStyle, align: Align, line_height: f64| TextStyleDef {
        id: id.to_owned(),
        name: name.to_owned(),
        font_size,
        font_family: BUILT_IN_FONT_FAMILY.to_owned(),
        font_style,
        decoration: TextDecoration::default(),
        spacing: TextSpacing { line_height, letter_spacing: 0.0 },
        indent: TextIndent::default(),
        align,
        fill: "#171717".to_owned(),
        fill_swatch_id: None,
    };
    vec![
        style("text-style-heading", "標題", 32.0, FontStyle::Bold, Align::Center, DEFAULT_LINE_HEIGHT),
        style("text-style-subheading", "副標題", 20.0, FontStyle::Normal, Align::Center, DEFAULT_LINE_HEIGHT),
        // 中文內文比標題需要更大的行距
        style("text-style-body", "內文", 11.0, FontStyle::Normal, Align::Left, 1.5),
    ]
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAlign {
    Top,
    Middle,
    Bottom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StrokeDash {
    Solid,
    Dashed,
    Dotted,
    /// 點劃線（v15）.
    DashDot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Stroke {
    pub color: String,
    /// Missing in files before v12 → not linked.
    #[serde(default, rename = "swatchId")]
    pub swatch_id: Option<String>,
    pub width: f64,
    pub dash: StrokeDash,
}

/// Text inside a shape (draw.io's label).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShapeLabel {
    pub text: String,
    pub font_size: f64,
    pub font_family: String,
    pub font_style: FontStyle,
    #[serde(flatten)]
    pub decoration: TextDecoration,
    #[serde(flatten)]
    pub spacing: TextSpacing,
    #[serde(flatten)]
    pub indent: TextIndent,
    pub align: Align,
    pub vertical_align: VerticalAlign,
    pub fill: String,
    /// Missing in files before v12 → not linked.
    #[serde(default)]
    pub fill_swatch_id: Option<String>,
    /// Missing in files before v8 → not linked.
    #[serde(default)]
    pub style_id: Option<String>,
}

/// A rectangle's corner radius (pt): one number for four equal corners (stored that way whenever
/// they match), or four numbers in Konva's order (top-left, top-right, bottom-right, bottom-left,
/// v11) when they differ. Same as `CornerRadius` in `src/lib/editor/types.ts`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum CornerRadius {
    Uniform(f64),
    Corners([f64; 4]),
}

impl CornerRadius {
    /// The four radii: top-left, top-right, bottom-right, bottom-left.
    pub fn radii(self) -> [f64; 4] {
        match self {
            CornerRadius::Uniform(radius) => [radius; 4],
            CornerRadius::Corners(radii) => radii,
        }
    }
}

/// What is drawn inside a shape's box.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ShapeGeometry {
    Rect {
        #[serde(rename = "cornerRadius")]
        corner_radius: CornerRadius,
    },
    Ellipse,
    /// Regular polygon stretched to fill the box.
    Polygon { sides: u32 },
    /// Star stretched to fill the box; `inner_ratio` = inner radius / outer radius.
    Star {
        #[serde(rename = "numPoints")]
        num_points: u32,
        #[serde(rename = "innerRatio")]
        inner_ratio: f64,
    },
    /// A shape from the editor's shape library, stretched to fill the box. The file only stores the
    /// library id and the named parameters; the shapes themselves are defined in the editor
    /// (`src/lib/editor/shape-presets.ts`), so the id is not checked against a list here.
    Preset {
        preset: String,
        #[serde(default)]
        params: BTreeMap<String, f64>,
    },
}

/// Any box shape: `x` / `y` is the box's top-left corner, like every other element.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShapeElement {
    #[serde(flatten)]
    pub base: Base,
    pub width: f64,
    pub height: f64,
    pub geometry: ShapeGeometry,
    pub fill: String,
    /// Missing in files before v12 → not linked.
    #[serde(default, rename = "fillSwatchId")]
    pub fill_swatch_id: Option<String>,
    pub stroke: Option<Stroke>,
    pub label: Option<ShapeLabel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImageElement {
    #[serde(flatten)]
    pub base: Base,
    /// Project-relative path under `assets/images/`.
    pub src: String,
    pub width: f64,
    pub height: f64,
}

/// A point of a line, relative to the line's `x` / `y`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct LinePoint {
    pub x: f64,
    pub y: f64,
}

/// What a line end draws. Same values as `LineArrowhead` in `src/lib/editor/types.ts`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LineArrowhead {
    None,
    Open,
    Triangle,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct LineEnd {
    pub arrowhead: LineArrowhead,
    /// Arrowhead size factor (the editor turns it into pt with the stroke width).
    pub scale: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LinePath {
    /// Segments from point to point.
    Straight,
    /// A curve through every point.
    Smooth,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LineCompound {
    Single,
    /// Two parallel thin lines (straight lines only; a smooth one is drawn single).
    Double,
}

/// A line or arrow (v15), defined by its points. `x` / `y` is the top-left corner of the points'
/// bounding box. The editor turns lines into path shapes before exporting, so the exporters never
/// see one (`render.rs`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LineElement {
    #[serde(flatten)]
    pub base: Base,
    pub points: Vec<LinePoint>,
    pub path: LinePath,
    pub compound: LineCompound,
    pub stroke: Stroke,
    pub start: LineEnd,
    pub end: LineEnd,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Element {
    Text(TextElement),
    Shape(ShapeElement),
    Image(ImageElement),
    Line(LineElement),
}

/// An image stored in the project's `assets/images/` (listed in the upload panel).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AssetInfo {
    /// Project-relative path, e.g. `assets/images/<hash>.png`.
    pub src: String,
    /// Original file name shown to the user.
    pub name: String,
    /// Intrinsic size in pixels.
    pub width: f64,
    pub height: f64,
}

/// The editable part of a project, exchanged with the frontend on open / save.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectContent {
    pub document: Document,
    pub assets: Vec<AssetInfo>,
}

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

/// Rotates `(dx, dy)` clockwise (y down) by `degrees`.
fn rotate_offset(dx: f64, dy: f64, degrees: f64) -> (f64, f64) {
    let (sin, cos) = degrees.to_radians().sin_cos();
    (dx * cos - dy * sin, dx * sin + dy * cos)
}

/// Converts one v2 `rect` / `ellipse` / `polygon` / `star` element to a v3 `shape`.
///
/// Returns `None` (leaving the element untouched, so deserialization reports it) when a field is
/// missing or has the wrong type.
fn upgrade_shape(element: &Map<String, Value>) -> Option<Map<String, Value>> {
    let number = |key: &str| element.get(key).and_then(Value::as_f64);
    let count = |key: &str| element.get(key).and_then(Value::as_u64).map(|n| u32::try_from(n).unwrap_or(u32::MAX));
    let (x, y, rotation) = (number("x")?, number("y")?, number("rotation")?);

    // 舊版 ellipse / polygon / star 以中心定位，算出中心到外框左上角的位移與外框尺寸
    let (geometry, corner, width, height) = match element.get("type")?.as_str()? {
        "rect" => {
            let geometry = serde_json::json!({ "kind": "rect", "cornerRadius": number("cornerRadius")? });
            return Some(shape_fields(element, x, y, number("width")?, number("height")?, geometry));
        }
        "ellipse" => {
            let (rx, ry) = (number("radiusX")?, number("radiusY")?);
            (serde_json::json!({ "kind": "ellipse" }), (-rx, -ry), 2.0 * rx, 2.0 * ry)
        }
        "polygon" => {
            let (sides, radius) = (count("sides")?, number("radius")?);
            let [min_x, min_y, max_x, max_y] = shape::point_bounds(&shape::polygon_unit_points(sides));
            let geometry = serde_json::json!({ "kind": "polygon", "sides": sides });
            (geometry, (min_x * radius, min_y * radius), (max_x - min_x) * radius, (max_y - min_y) * radius)
        }
        "star" => {
            let (num_points, inner, outer) = (count("numPoints")?, number("innerRadius")?, number("outerRadius")?);
            let ratio = if outer > 0.0 { inner / outer } else { 0.5 };
            let [min_x, min_y, max_x, max_y] = shape::point_bounds(&shape::star_unit_points(num_points, ratio));
            let geometry = serde_json::json!({ "kind": "star", "numPoints": num_points, "innerRatio": ratio });
            (geometry, (min_x * outer, min_y * outer), (max_x - min_x) * outer, (max_y - min_y) * outer)
        }
        _ => return None,
    };
    // 旋轉是繞定位點；新的定位點（左上角）要放在舊圖形旋轉後左上角所在的位置，外觀才不變
    let (dx, dy) = rotate_offset(corner.0, corner.1, rotation);
    Some(shape_fields(element, x + dx, y + dy, width, height, geometry))
}

fn shape_fields(element: &Map<String, Value>, x: f64, y: f64, width: f64, height: f64, geometry: Value) -> Map<String, Value> {
    let mut shape = Map::new();
    for key in ["id", "rotation", "fill"] {
        if let Some(value) = element.get(key) {
            shape.insert(key.to_owned(), value.clone());
        }
    }
    shape.insert("type".to_owned(), Value::from("shape"));
    shape.insert("x".to_owned(), Value::from(x));
    shape.insert("y".to_owned(), Value::from(y));
    shape.insert("width".to_owned(), Value::from(width));
    shape.insert("height".to_owned(), Value::from(height));
    shape.insert("geometry".to_owned(), geometry);
    shape.insert("stroke".to_owned(), Value::Null);
    shape.insert("label".to_owned(), Value::Null);
    shape
}

/// Rewrites every v1 / v2 shape element of a document JSON in place. Elements that are already v3
/// are left alone, so it is safe on content of unknown age (recovery files carry no version).
pub fn upgrade_shapes_to_v3(document: &mut Value) {
    let Some(pages) = document.get_mut("pages").and_then(Value::as_array_mut) else { return };
    for page in pages {
        let Some(elements) = page.get_mut("elements").and_then(Value::as_array_mut) else { continue };
        for element in elements {
            if let Some(shape) = element.as_object().and_then(upgrade_shape) {
                *element = Value::Object(shape);
            }
        }
    }
}

/// Validates document content received from the frontend or read from disk.
///
/// # Errors
/// Returns `AppError::InvalidProject` describing the first violation.
pub fn validate_content(document: &Document, assets: &[AssetInfo]) -> AppResult<()> {
    if document.pages.is_empty() {
        return Err(AppError::invalid_project("document has no pages"));
    }
    validate_margins(&document.margins)?;
    validate_fonts(&document.fonts)?;
    let swatches = validate_swatches(&document.swatches)?;
    validate_page_number_rules(&document.page_number_rules, &swatches)?;
    let refs = Refs { styles: validate_text_styles(&document.text_styles, &swatches)?, swatches };
    for page in &document.pages {
        validate_sheet(&page.id, page.width, page.height, &page.background, &page.background_swatch_id, &page.elements, &refs)?;
    }
    for master in &document.masters {
        validate_sheet(&master.id, master.width, master.height, &master.background, &master.background_swatch_id, &master.elements, &refs)?;
    }
    validate_master_graph(document)?;
    for asset in assets {
        validate_asset_path(&asset.src)?;
    }
    Ok(())
}

/// What pages and master pages have in common.
fn validate_sheet(
    id: &str,
    width: f64,
    height: f64,
    background: &str,
    background_swatch_id: &Option<String>,
    elements: &[Element],
    refs: &Refs,
) -> AppResult<()> {
    require_id(id)?;
    if !(width > 0.0 && height > 0.0) {
        return Err(AppError::invalid_project(format!("page {id} has a non-positive size")));
    }
    require_background_color(background)?;
    require_swatch(background_swatch_id, &refs.swatches)?;
    for element in elements {
        validate_element(element, refs)?;
    }
    Ok(())
}

type StyleIds<'a> = std::collections::HashSet<&'a str>;
type SwatchIds<'a> = std::collections::HashSet<&'a str>;

/// What colors and texts may link to: swatches and text styles.
struct Refs<'a> {
    styles: StyleIds<'a>,
    swatches: SwatchIds<'a>,
}

/// Same rules as TS `isSwatchList`: ids 1–64 bytes, names trimmed, non-empty, at most
/// SWATCH_NAME_MAX_LENGTH characters, ids and names unique, colors lowercase `#rrggbb`.
fn validate_swatches(swatches: &[Swatch]) -> AppResult<SwatchIds<'_>> {
    let mut names = std::collections::HashSet::new();
    let mut ids = SwatchIds::new();
    for swatch in swatches {
        let invalid = |what: &str| AppError::invalid_project(format!("swatch {}: {what}", swatch.id));
        require_id(&swatch.id)?;
        let name = swatch.name.as_str();
        if name.is_empty() || name.trim() != name || name.chars().count() > SWATCH_NAME_MAX_LENGTH {
            return Err(invalid("invalid name"));
        }
        if !is_swatch_color(&swatch.color) {
            return Err(invalid("color must be lowercase #rrggbb"));
        }
        if !ids.insert(swatch.id.as_str()) || !names.insert(name) {
            return Err(invalid("duplicate id or name"));
        }
    }
    Ok(ids)
}

/// Same rules as TS `isProjectFontList`: ids 1–64 of `[A-Za-z0-9_-]`, names trimmed, non-empty, at
/// most FONT_NAME_MAX_LENGTH characters, ids and names unique; every file valid (`validate_font_file`).
fn validate_fonts(fonts: &[ProjectFont]) -> AppResult<()> {
    let mut names = std::collections::HashSet::new();
    let mut ids = std::collections::HashSet::new();
    for font in fonts {
        let invalid = |what: &str| AppError::invalid_project(format!("font {}: {what}", font.id));
        require_id(&font.id)?;
        if !font.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
            return Err(invalid("id has characters other than letters, digits, - and _"));
        }
        let name = font.name.as_str();
        if name.is_empty() || name.trim() != name || name.chars().count() > FONT_NAME_MAX_LENGTH {
            return Err(invalid("name is empty, untrimmed or too long"));
        }
        if !ids.insert(font.id.as_str()) || !names.insert(name) {
            return Err(invalid("duplicate id or name"));
        }
        validate_font_file(&font.regular).map_err(|what| invalid(what))?;
        if let Some(bold) = &font.bold {
            validate_font_file(bold).map_err(|what| invalid(what))?;
        }
    }
    Ok(())
}

/// Same rules as TS `isFontFile`.
fn validate_font_file(file: &FontFile) -> Result<(), &'static str> {
    if validate_asset_path_in(&file.src, FONT_ASSET_DIR).is_err() || !has_font_extension(&file.src) {
        return Err("file is not a .ttf / .otf in assets/fonts");
    }
    if file.file_family.chars().count() > FONT_FILE_NAME_MAX_LENGTH || file.file_style.chars().count() > FONT_FILE_NAME_MAX_LENGTH {
        return Err("name read from the file is too long");
    }
    if !(1..=1000).contains(&file.weight) {
        return Err("weight out of range");
    }
    let in_range = |value: f64, min: f64| value.is_finite() && value >= min && value <= FONT_METRIC_MAX;
    if !in_range(file.ascent, 0.0) || !in_range(file.descent, 0.0) || !in_range(file.apple_baseline_shift.abs(), 0.0) {
        return Err("metrics out of range");
    }
    Ok(())
}

/// Font files keep the extension they were imported with: `.ttf` or `.otf`, lowercase.
fn has_font_extension(src: &str) -> bool {
    src.ends_with(".ttf") || src.ends_with(".otf")
}

/// Same rule as TS `isSwatchColor`: `#rrggbb` in lowercase.
fn is_swatch_color(color: &str) -> bool {
    color.len() == 7
        && color.starts_with('#')
        && color[1..].bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// A color's swatch link must name an entry of the swatch list.
fn require_swatch(swatch_id: &Option<String>, swatches: &SwatchIds) -> AppResult<()> {
    match swatch_id {
        Some(id) if !swatches.contains(id.as_str()) => {
            Err(AppError::invalid_project(format!("color linked to a missing swatch {id}")))
        }
        _ => Ok(()),
    }
}

/// Same rules as TS `isTextStyleSheet`: ids 1–64 bytes, names trimmed, non-empty, at most
/// TEXT_STYLE_NAME_MAX_LENGTH characters, ids and names unique, font size in range, valid colors.
fn validate_text_styles<'a>(styles: &'a [TextStyleDef], swatches: &SwatchIds) -> AppResult<StyleIds<'a>> {
    let mut names = std::collections::HashSet::new();
    let mut ids = StyleIds::new();
    for style in styles {
        let invalid = |what: &str| AppError::invalid_project(format!("text style {}: {what}", style.id));
        require_id(&style.id)?;
        let name = style.name.as_str();
        if name.is_empty() || name.trim() != name || name.chars().count() > TEXT_STYLE_NAME_MAX_LENGTH {
            return Err(invalid("invalid name"));
        }
        if !(FONT_SIZE_MIN..=FONT_SIZE_MAX).contains(&style.font_size) {
            return Err(invalid("invalid font size"));
        }
        require_element_color(&style.fill)?;
        require_swatch(&style.fill_swatch_id, swatches)?;
        validate_text_decoration(&style.decoration, swatches)?;
        validate_text_spacing(&style.spacing)?;
        validate_text_indent(&style.indent)?;
        if !ids.insert(style.id.as_str()) || !names.insert(name) {
            return Err(invalid("duplicate id or name"));
        }
    }
    Ok(ids)
}

/// A text's `styleId` must name an entry of the style sheet.
fn require_style(style_id: &Option<String>, styles: &StyleIds) -> AppResult<()> {
    match style_id {
        Some(id) if !styles.contains(id.as_str()) => {
            Err(AppError::invalid_project(format!("text linked to a missing text style {id}")))
        }
        _ => Ok(()),
    }
}

/// Same rules as TS `isMasterGraphValid`: page and master ids unique across both lists, every
/// `masterId` / `parentId` names an existing master, no cycles, chains at most MASTER_DEPTH_MAX long.
fn validate_master_graph(document: &Document) -> AppResult<()> {
    use std::collections::{HashMap, HashSet};
    let ids: Vec<&str> = document.pages.iter().map(|p| p.id.as_str()).chain(document.masters.iter().map(|m| m.id.as_str())).collect();
    if ids.iter().collect::<HashSet<_>>().len() != ids.len() {
        return Err(AppError::invalid_project("duplicate page or master page id"));
    }
    let parents: HashMap<&str, Option<&str>> =
        document.masters.iter().map(|m| (m.id.as_str(), m.parent_id.as_deref())).collect();
    let missing = |id: &Option<String>| id.as_deref().is_some_and(|id| !parents.contains_key(id));
    if let Some(page) = document.pages.iter().find(|page| missing(&page.master_id)) {
        return Err(AppError::invalid_project(format!("page {} uses a missing master page", page.id)));
    }
    if let Some(master) = document.masters.iter().find(|master| missing(&master.parent_id)) {
        return Err(AppError::invalid_project(format!("master page {} is based on a missing master page", master.id)));
    }
    // 每個主頁往上走到最上層：走超過上限（含循環）就不合法
    for master in &document.masters {
        let mut depth = 1;
        let mut parent = master.parent_id.as_deref();
        while let Some(id) = parent {
            depth += 1;
            if depth > MASTER_DEPTH_MAX {
                return Err(AppError::invalid_project(format!("master page {} is nested too deeply or in a cycle", master.id)));
            }
            parent = parents[id];
        }
    }
    Ok(())
}

/// Same rules as TS `isMargins`: every side finite and in [0, MARGIN_MAX_PT]. Whether they fit the
/// page is not checked, so resizing pages never makes a file invalid.
fn validate_margins(margins: &Margins) -> AppResult<()> {
    for side in [margins.top, margins.right, margins.bottom, margins.left] {
        if !(side.is_finite() && (0.0..=MARGIN_MAX_PT).contains(&side)) {
            return Err(AppError::invalid_project(format!("invalid page margin {side}")));
        }
    }
    Ok(())
}

/// Same rules as TS `isPageNumberRules`: 1 ≤ from ≤ to ≤ PAGE_NUMBER_MAX, start ≤ PAGE_NUMBER_MAX,
/// single-line prefix / suffix of at most PAGE_NUMBER_AFFIX_MAX_LENGTH characters, font size in
/// range, valid colors and border, unique ids, and no two ranges sharing a page.
fn validate_page_number_rules(rules: &[PageNumberRule], swatches: &SwatchIds) -> AppResult<()> {
    let invalid = |rule: &PageNumberRule, what: &str| AppError::invalid_project(format!("page number rule {}: {what}", rule.id));
    let affix_ok = |s: &str| s.chars().count() <= PAGE_NUMBER_AFFIX_MAX_LENGTH && !s.contains(['\r', '\n']);
    for rule in rules {
        require_id(&rule.id)?;
        if !(1 <= rule.from && rule.from <= rule.to && rule.to <= PAGE_NUMBER_MAX && rule.start <= PAGE_NUMBER_MAX) {
            return Err(invalid(rule, "invalid page range or start"));
        }
        if ![&rule.odd, &rule.even].iter().all(|face| affix_ok(&face.prefix) && affix_ok(&face.suffix)) {
            return Err(invalid(rule, "invalid prefix or suffix"));
        }
        if !(FONT_SIZE_MIN..=FONT_SIZE_MAX).contains(&rule.style.font_size) {
            return Err(invalid(rule, "invalid font size"));
        }
        require_element_color(&rule.style.fill)?;
        require_swatch(&rule.style.fill_swatch_id, swatches)?;
        validate_text_decoration(&rule.style.decoration, swatches)?;
        if let Some(stroke) = &rule.style.stroke {
            validate_stroke(stroke, swatches)?;
        }
    }
    let mut sorted: Vec<&PageNumberRule> = rules.iter().collect();
    sorted.sort_by_key(|rule| rule.from);
    for pair in sorted.windows(2) {
        if pair[1].from <= pair[0].to {
            return Err(invalid(pair[1], "overlaps another rule"));
        }
    }
    let ids: std::collections::HashSet<&str> = rules.iter().map(|rule| rule.id.as_str()).collect();
    if ids.len() != rules.len() {
        return Err(AppError::invalid_project("duplicate page number rule id"));
    }
    Ok(())
}

fn validate_stroke(stroke: &Stroke, swatches: &SwatchIds) -> AppResult<()> {
    require_swatch(&stroke.swatch_id, swatches)?;
    validate_stroke_look(stroke)
}

/// The drawable part of a stroke: element color and a width in (0, STROKE_WIDTH_MAX]. The swatch
/// link is not checked (export uses it for the details of shape-library shapes, never linked).
pub(crate) fn validate_stroke_look(stroke: &Stroke) -> AppResult<()> {
    require_element_color(&stroke.color)?;
    if !(stroke.width > 0.0 && stroke.width <= STROKE_WIDTH_MAX) {
        return Err(AppError::invalid_project(format!("invalid stroke width {}", stroke.width)));
    }
    Ok(())
}

/// Same rules as TS `isTextShadow`: element color, both offsets finite and within
/// ±TEXT_SHADOW_OFFSET_MAX. The flags need no check (serde already requires booleans).
fn validate_text_decoration(decoration: &TextDecoration, swatches: &SwatchIds) -> AppResult<()> {
    let Some(shadow) = &decoration.shadow else { return Ok(()) };
    require_element_color(&shadow.color)?;
    require_swatch(&shadow.swatch_id, swatches)?;
    for offset in [shadow.offset_x, shadow.offset_y] {
        if !(offset.is_finite() && offset.abs() <= TEXT_SHADOW_OFFSET_MAX) {
            return Err(AppError::invalid_project(format!("invalid text shadow offset {offset}")));
        }
    }
    Ok(())
}

/// Same rules as TS `hasValidTextSpacing`: line height in [LINE_HEIGHT_MIN, LINE_HEIGHT_MAX],
/// letter spacing in [LETTER_SPACING_MIN, LETTER_SPACING_MAX] (NaN fails both).
fn validate_text_spacing(spacing: &TextSpacing) -> AppResult<()> {
    if !(LINE_HEIGHT_MIN..=LINE_HEIGHT_MAX).contains(&spacing.line_height) {
        return Err(AppError::invalid_project(format!("invalid line height {}", spacing.line_height)));
    }
    if !(LETTER_SPACING_MIN..=LETTER_SPACING_MAX).contains(&spacing.letter_spacing) {
        return Err(AppError::invalid_project(format!("invalid letter spacing {}", spacing.letter_spacing)));
    }
    Ok(())
}

/// Same rules as TS `hasValidTextIndent`: left / right in [0, TEXT_INDENT_MAX], the first line in
/// [−left, TEXT_INDENT_MAX] (not left of the box; NaN fails).
fn validate_text_indent(indent: &TextIndent) -> AppResult<()> {
    let TextIndent { indent_left: left, indent_right: right, indent_first_line: first } = *indent;
    if !(0.0..=TEXT_INDENT_MAX).contains(&left) || !(0.0..=TEXT_INDENT_MAX).contains(&right) || !(-left..=TEXT_INDENT_MAX).contains(&first) {
        return Err(AppError::invalid_project(format!("invalid indent {left} / {right} / {first}")));
    }
    Ok(())
}

fn validate_element(element: &Element, refs: &Refs) -> AppResult<()> {
    match element {
        Element::Text(e) => {
            require_id(&e.base.id)?;
            require_element_color(&e.fill)?;
            require_swatch(&e.fill_swatch_id, &refs.swatches)?;
            require_style(&e.style_id, &refs.styles)?;
            validate_text_spacing(&e.spacing)?;
            validate_text_indent(&e.indent)?;
            validate_text_decoration(&e.decoration, &refs.swatches)
        }
        Element::Shape(e) => {
            require_id(&e.base.id)?;
            require_element_color(&e.fill)?;
            require_swatch(&e.fill_swatch_id, &refs.swatches)?;
            validate_geometry(&e.geometry)?;
            if let Some(stroke) = &e.stroke {
                validate_stroke(stroke, &refs.swatches)?;
            }
            if let Some(label) = &e.label {
                require_element_color(&label.fill)?;
                require_swatch(&label.fill_swatch_id, &refs.swatches)?;
                require_style(&label.style_id, &refs.styles)?;
                validate_text_decoration(&label.decoration, &refs.swatches)?;
                validate_text_spacing(&label.spacing)?;
                validate_text_indent(&label.indent)?;
            }
            Ok(())
        }
        Element::Image(e) => {
            require_id(&e.base.id)?;
            validate_asset_path(&e.src)
        }
        Element::Line(e) => {
            require_id(&e.base.id)?;
            validate_stroke(&e.stroke, &refs.swatches)?;
            validate_line(e)
        }
    }
}

/// Same rules as `isValidLine` in `src/lib/editor/validation.ts`: 2–MAX_LINE_POINTS points with
/// finite coordinates within ±LINE_COORDINATE_MAX, arrowhead scales within
/// [LINE_END_SCALE_MIN, LINE_END_SCALE_MAX].
fn validate_line(line: &LineElement) -> AppResult<()> {
    let count = line.points.len();
    if !(2..=MAX_LINE_POINTS).contains(&count) {
        return Err(AppError::invalid_project(format!("line {} has {count} points", line.base.id)));
    }
    let in_range = |v: f64| v.is_finite() && v.abs() <= LINE_COORDINATE_MAX;
    if !line.points.iter().all(|p| in_range(p.x) && in_range(p.y)) {
        return Err(AppError::invalid_project(format!("line {} has an invalid point", line.base.id)));
    }
    for end in [&line.start, &line.end] {
        if !(LINE_END_SCALE_MIN..=LINE_END_SCALE_MAX).contains(&end.scale) {
            return Err(AppError::invalid_project(format!("invalid arrowhead scale {}", end.scale)));
        }
    }
    Ok(())
}

/// Rejects geometry that cannot be drawn sensibly. Same rules as `isShapeGeometry` in
/// `src/lib/editor/validation.ts`. Fewer than 3 sides / 2 points are not rejected: drawing raises
/// them (`project/shape.rs`), so older files keep opening.
fn validate_geometry(geometry: &ShapeGeometry) -> AppResult<()> {
    let valid = match geometry {
        ShapeGeometry::Rect { corner_radius } => corner_radius.radii().iter().all(|radius| radius.is_finite() && *radius >= 0.0),
        ShapeGeometry::Ellipse => true,
        ShapeGeometry::Polygon { sides } => *sides <= MAX_VERTEX_COUNT,
        ShapeGeometry::Star { num_points, inner_ratio } => {
            *num_points <= MAX_VERTEX_COUNT && *inner_ratio > 0.0 && *inner_ratio <= 1.0
        }
        // 只檢查格式：圖形庫在編輯器裡，這裡不認得 id（不認得的圖形畫成虛線外框、匯出略過）
        ShapeGeometry::Preset { preset, params } => {
            is_preset_name(preset)
                && params.len() <= SHAPE_PRESET_PARAMS_MAX
                && params.iter().all(|(name, value)| is_preset_name(name) && value.is_finite())
        }
    };
    if !valid {
        return Err(AppError::invalid_project(format!("invalid shape geometry {geometry:?}")));
    }
    Ok(())
}

/// A shape-library id or parameter name: 1–32 ASCII letters, digits or `-`. Same rule as
/// `isShapePresetName` in `src/lib/editor/validation.ts`.
fn is_preset_name(name: &str) -> bool {
    (1..=SHAPE_PRESET_ID_MAX_LENGTH).contains(&name.len()) && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

pub(crate) fn require_id(id: &str) -> AppResult<()> {
    if id.is_empty() || id.len() > 64 {
        return Err(AppError::invalid_project("element or page id is empty or too long"));
    }
    Ok(())
}

/// `#` followed by exactly `digits` hex digits.
fn is_hex_color(color: &str, digits: usize) -> bool {
    let bytes = color.as_bytes();
    bytes.len() == digits + 1 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}

/// Page backgrounds are paper: `#rrggbb` only, no transparency.
fn require_background_color(color: &str) -> AppResult<()> {
    if !is_hex_color(color, 6) {
        return Err(AppError::invalid_project(format!("invalid background color {color:?}")));
    }
    Ok(())
}

/// Element colors: `#rrggbb` or `#rrggbbaa`.
fn require_element_color(color: &str) -> AppResult<()> {
    if !is_hex_color(color, 6) && !is_hex_color(color, 8) {
        return Err(AppError::invalid_project(format!("invalid color {color:?}")));
    }
    Ok(())
}

/// Accepts only `assets/images/<file>` with a plain file name, so a crafted project file cannot
/// make the app read or delete files outside the project folder.
///
/// # Errors
/// Returns `AppError::InvalidProject` for any other path.
pub fn validate_asset_path(src: &str) -> AppResult<()> {
    validate_asset_path_in(src, ASSET_DIR)
}

/// Every asset directory: page images, the asset library's text and audio files, project fonts.
pub const ASSET_DIRS: [&str; 4] = [ASSET_DIR, TEXT_ASSET_DIR, AUDIO_ASSET_DIR, FONT_ASSET_DIR];

/// Accepts a plain file in any of `ASSET_DIRS`.
///
/// # Errors
/// Returns `AppError::InvalidProject` for any other path.
pub fn validate_any_asset_path(src: &str) -> AppResult<()> {
    if ASSET_DIRS.iter().any(|dir| validate_asset_path_in(src, dir).is_ok()) {
        Ok(())
    } else {
        Err(AppError::invalid_project(format!("invalid asset path {src:?}")))
    }
}

/// Accepts only `<dir>/<file>` with a plain file name (`dir` is one of the asset directories).
///
/// # Errors
/// Returns `AppError::InvalidProject` for any other path.
pub fn validate_asset_path_in(src: &str, dir: &str) -> AppResult<()> {
    let file = src
        .strip_prefix(dir)
        .and_then(|rest| rest.strip_prefix('/'))
        .ok_or_else(|| AppError::invalid_project(format!("asset path {src:?} is outside {dir}")))?;
    let plain = !file.is_empty()
        && file != "."
        && file != ".."
        && !file.contains(['/', '\\', ':', '\0'])
        && !file.starts_with('.');
    if !plain {
        return Err(AppError::invalid_project(format!("invalid asset path {src:?}")));
    }
    Ok(())
}

/// Returns every asset path referenced by the document (images on pages and master pages, project
/// font files) or listed in the asset panel.
pub fn referenced_assets<'a>(document: &'a Document, assets: &'a [AssetInfo]) -> impl Iterator<Item = &'a str> {
    // 主頁上的圖片也算：否則開檔清理會刪掉只用在主頁上的圖片
    let sheets = document.pages.iter().map(|page| &page.elements).chain(document.masters.iter().map(|master| &master.elements));
    let from_elements = sheets.flat_map(|elements| {
        elements.iter().filter_map(|element| match element {
            Element::Image(image) => Some(image.src.as_str()),
            _ => None,
        })
    });
    let fonts = document.fonts.iter().flat_map(|font| std::iter::once(&font.regular).chain(&font.bold)).map(|file| file.src.as_str());
    from_elements.chain(fonts).chain(assets.iter().map(|asset| asset.src.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../../tests/fixtures/sample.magproj");
    /// The same document saved by a v2 app (shapes as `rect` / `ellipse` / `polygon` / `star`).
    const FIXTURE_V2: &str = include_str!("../../../tests/fixtures/sample-v2.magproj");

    // TS 寫出的整數（例如 0）在 Rust 會以 0.0 寫回；比較時把數字一律視為 f64
    fn normalize(value: Value) -> Value {
        match value {
            Value::Number(n) => Value::from(n.as_f64().unwrap()),
            Value::Array(items) => Value::Array(items.into_iter().map(normalize).collect()),
            Value::Object(map) => Value::Object(map.into_iter().map(|(k, v)| (k, normalize(v))).collect()),
            other => other,
        }
    }

    #[test]
    fn fixture_round_trips_without_losing_fields() {
        let project = parse_project(FIXTURE).unwrap();
        let written: Value = serde_json::from_str(&serde_json::to_string_pretty(&project).unwrap()).unwrap();
        let original: Value = serde_json::from_str(FIXTURE).unwrap();
        assert_eq!(normalize(written), normalize(original));
    }

    #[test]
    fn lines_keep_their_points_ends_and_swatch_link() {
        let project = parse_project(FIXTURE).unwrap();
        let Element::Line(line) = &project.document.masters[1].elements[3] else { panic!("expected the arrow line") };
        assert_eq!(line.points.len(), 3);
        assert_eq!((line.path, line.compound), (LinePath::Straight, LineCompound::Single));
        assert_eq!(line.end, LineEnd { arrowhead: LineArrowhead::Triangle, scale: 1.5 });
        assert_eq!(line.stroke.swatch_id.as_deref(), Some("swatch-indigo"));
    }

    #[test]
    fn invalid_lines_are_rejected() {
        use serde_json::json;
        const LINE: &str = "/document/masters/1/elements/3";
        let with = |field: &str, replacement: Value| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            *value.pointer_mut(&format!("{LINE}/{field}")).unwrap() = replacement;
            parse_project(&value.to_string())
        };
        assert!(with("points", json!([{ "x": 0, "y": 0 }, { "x": -LINE_COORDINATE_MAX, "y": 0 }])).is_ok());
        let too_many: Vec<Value> = (0..=MAX_LINE_POINTS).map(|x| json!({ "x": x, "y": 0 })).collect();
        for (field, bad) in [
            ("points", json!([{ "x": 0, "y": 0 }])),
            ("points", Value::from(too_many)),
            ("points", json!([{ "x": 0, "y": 0 }, { "x": 2e6, "y": 0 }])),
            ("path", json!("bezier")),
            ("compound", json!("triple")),
            ("stroke", Value::Null),
            ("stroke", json!({ "color": "#000000", "swatchId": "missing", "width": 1, "dash": "solid" })),
            ("end", json!({ "arrowhead": "circle", "scale": 1 })),
            ("start", json!({ "arrowhead": "open", "scale": LINE_END_SCALE_MAX + 1.0 })),
            ("id", json!("")),
        ] {
            assert!(with(field, bad.clone()).is_err(), "{field} = {bad}");
        }
    }

    #[test]
    fn fixture_contains_every_element_type() {
        let project = parse_project(FIXTURE).unwrap();
        let elements = &project.document.pages[0].elements;
        let kinds: std::collections::HashSet<_> = elements.iter().map(std::mem::discriminant).collect();
        assert_eq!(kinds.len(), 3);
        let geometries: std::collections::HashSet<_> = elements
            .iter()
            .filter_map(|element| match element {
                Element::Shape(shape) => Some(std::mem::discriminant(&shape.geometry)),
                _ => None,
            })
            .collect();
        assert_eq!(geometries.len(), 4);
        // 圖形庫的圖形放在主頁（第 1 頁要和 v2 fixture 逐一比對）
        let preset = project.document.masters.iter().flat_map(|master| &master.elements).find_map(|element| match element {
            Element::Shape(ShapeElement { geometry: ShapeGeometry::Preset { preset, params }, .. }) => Some((preset, params)),
            _ => None,
        });
        let (preset, params) = preset.expect("a master holds a shape-library shape");
        assert_eq!((preset.as_str(), params.get("size")), ("hexagon", Some(&0.25)));
        // stroke 與 label 兩種情況（有 / 沒有）都要出現
        let shapes = || elements.iter().filter_map(|element| if let Element::Shape(s) = element { Some(s) } else { None });
        assert!(shapes().any(|s| s.stroke.is_some()) && shapes().any(|s| s.stroke.is_none()));
        assert!(shapes().any(|s| s.label.is_some()) && shapes().any(|s| s.label.is_none()));
    }

    #[test]
    fn upgrades_v2_shapes_without_moving_them() {
        let upgraded = parse_project(FIXTURE_V2).unwrap().document.pages.remove(0).elements;
        let expected = parse_project(FIXTURE).unwrap().document.pages.remove(0).elements;
        assert_eq!(upgraded.len(), expected.len());
        let close = |a: f64, b: f64| (a - b).abs() < 1e-6;
        for (old, new) in upgraded.iter().zip(&expected) {
            match (old, new) {
                (Element::Shape(old), Element::Shape(new)) => {
                    assert_eq!(old.base.id, new.base.id);
                    assert!(
                        close(old.base.x, new.base.x) && close(old.base.y, new.base.y),
                        "{} moved: {:?} vs {:?}",
                        old.base.id,
                        (old.base.x, old.base.y),
                        (new.base.x, new.base.y)
                    );
                    assert!(close(old.width, new.width) && close(old.height, new.height), "{} resized", old.base.id);
                    assert_eq!(old.base.rotation, new.base.rotation);
                    assert_eq!(old.fill, new.fill);
                    // 舊版沒有邊框與圖形內文字
                    assert_eq!((&old.stroke, &old.label), (&None, &None));
                    match (&old.geometry, &new.geometry) {
                        (
                            ShapeGeometry::Star { num_points: a, inner_ratio: ra },
                            ShapeGeometry::Star { num_points: b, inner_ratio: rb },
                        ) => assert!(a == b && close(*ra, *rb)),
                        // v11 起 fixture 的圓角矩形四角不同（左上 12）；舊版只有一個數字
                        (ShapeGeometry::Rect { corner_radius: a }, ShapeGeometry::Rect { corner_radius: b }) => {
                            assert_eq!(*a, CornerRadius::Uniform(12.0));
                            assert_eq!(b.radii()[0], 12.0);
                        }
                        (a, b) => assert_eq!(a, b),
                    }
                }
                // v6 之前沒有文字裝飾、v9 之前沒有行距與字距、v16 之前沒有縮排：讀成預設值，其他欄位不變
                (Element::Text(old), Element::Text(new)) => {
                    assert_eq!(old.decoration, TextDecoration::default());
                    assert_eq!(old.spacing, TextSpacing::default());
                    assert_eq!(old.indent, TextIndent::default());
                    assert_eq!(
                        *old,
                        TextElement {
                            decoration: TextDecoration::default(),
                            spacing: TextSpacing::default(),
                            indent: TextIndent::default(),
                            ..new.clone()
                        }
                    );
                }
                (old, new) => assert_eq!(old, new),
            }
        }
    }

    #[test]
    fn reads_text_decoration_and_defaults_it_in_older_files() {
        let project = parse_project(FIXTURE).unwrap();
        let Element::Text(text) = &project.document.pages[0].elements[0] else { panic!("expected text") };
        let shadow = TextShadow { color: "#00000080".to_owned(), swatch_id: None, offset_x: 2.0, offset_y: -1.5 };
        assert_eq!(
            text.decoration,
            TextDecoration { italic: true, underline: true, strikethrough: true, shadow: Some(shadow) }
        );
        assert!(project.document.page_number_rules[1].style.decoration.italic);

        // v5 檔案沒有這些欄位
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(5);
        for key in ["italic", "underline", "strikethrough", "shadow"] {
            value.pointer_mut("/document/pages/0/elements/0").unwrap().as_object_mut().unwrap().remove(key);
        }
        let Element::Text(text) = &parse_project(&value.to_string()).unwrap().document.pages[0].elements[0] else {
            panic!("expected text")
        };
        assert_eq!(text.decoration, TextDecoration::default());
    }

    #[test]
    fn reads_text_spacing_and_defaults_it_in_older_files() {
        let project = parse_project(FIXTURE).unwrap();
        let Element::Text(text) = &project.document.pages[0].elements[0] else { panic!("expected text") };
        assert_eq!(text.spacing, TextSpacing { line_height: 1.4, letter_spacing: -20.0 });
        let footer = project.document.text_styles.iter().find(|style| style.id == "style-footer").unwrap();
        assert_eq!(footer.spacing, TextSpacing { line_height: 1.2, letter_spacing: 50.0 });

        // v8 檔案沒有這兩個欄位：讀成以前固定的 1.2 / 0
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(8);
        let remove = |value: &mut Value, pointer: &str| {
            let object = value.pointer_mut(pointer).unwrap().as_object_mut().unwrap();
            object.remove("lineHeight");
            object.remove("letterSpacing");
        };
        remove(&mut value, "/document/pages/0/elements/0");
        remove(&mut value, "/document/pages/0/elements/2/label");
        remove(&mut value, "/document/textStyles/0");
        let document = parse_project(&value.to_string()).unwrap().document;
        let Element::Text(text) = &document.pages[0].elements[0] else { panic!("expected text") };
        let Element::Shape(ellipse) = &document.pages[0].elements[2] else { panic!("expected the ellipse") };
        assert_eq!(text.spacing, TextSpacing::default());
        assert_eq!(ellipse.label.as_ref().unwrap().spacing, TextSpacing { line_height: DEFAULT_LINE_HEIGHT, letter_spacing: 0.0 });
        assert_eq!(document.text_styles[0].spacing, TextSpacing::default());
    }

    #[test]
    fn reads_the_distributed_alignment_and_rejects_unknown_ones() {
        let project = parse_project(FIXTURE).unwrap();
        let heading = project.document.text_styles.iter().find(|style| style.id == "text-style-heading").unwrap();
        assert_eq!(heading.align, Align::Distributed);
        let saved = serde_json::to_value(heading).unwrap();
        assert_eq!(saved["align"], "distributed");

        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["pages"][0]["elements"][0]["align"] = Value::from("justify");
        assert!(parse_project(&value.to_string()).is_err());
    }

    #[test]
    fn reads_text_indents_and_defaults_them_in_older_files() {
        let project = parse_project(FIXTURE).unwrap();
        let Element::Text(text) = &project.document.pages[0].elements[0] else { panic!("expected text") };
        assert_eq!(text.indent, TextIndent { indent_left: 0.0, indent_right: 1.0, indent_first_line: 2.0 });
        let footer = project.document.text_styles.iter().find(|style| style.id == "style-footer").unwrap();
        assert_eq!(footer.indent, TextIndent { indent_left: 2.0, indent_right: 0.0, indent_first_line: -2.0 });
        let saved = serde_json::to_value(footer).unwrap();
        assert_eq!((saved["indentLeft"].as_f64(), saved["indentFirstLine"].as_f64()), (Some(2.0), Some(-2.0)));

        // v15 檔案沒有這三個欄位：讀成 0
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(15);
        let remove = |value: &mut Value, pointer: &str| {
            let object = value.pointer_mut(pointer).unwrap().as_object_mut().unwrap();
            for key in ["indentLeft", "indentRight", "indentFirstLine"] {
                object.remove(key);
            }
        };
        remove(&mut value, "/document/pages/0/elements/0");
        remove(&mut value, "/document/pages/0/elements/2/label");
        remove(&mut value, "/document/textStyles/0");
        let document = parse_project(&value.to_string()).unwrap().document;
        let Element::Text(text) = &document.pages[0].elements[0] else { panic!("expected text") };
        let Element::Shape(ellipse) = &document.pages[0].elements[2] else { panic!("expected the ellipse") };
        assert_eq!(text.indent, TextIndent::default());
        assert_eq!(ellipse.label.as_ref().unwrap().indent, TextIndent::default());
        assert_eq!(document.text_styles[0].indent, TextIndent::default());
    }

    #[test]
    fn rejects_text_indents_out_of_range() {
        let with = |pointer: &str, fields: [(&str, f64); 3]| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            for (key, number) in fields {
                value.pointer_mut(pointer).unwrap()[key] = Value::from(number);
            }
            parse_project(&value.to_string())
        };
        let indent = |left: f64, right: f64, first: f64| [("indentLeft", left), ("indentRight", right), ("indentFirstLine", first)];
        for pointer in ["/document/pages/0/elements/0", "/document/pages/0/elements/2/label", "/document/textStyles/0"] {
            assert!(with(pointer, indent(TEXT_INDENT_MAX, TEXT_INDENT_MAX, TEXT_INDENT_MAX)).is_ok(), "{pointer}");
            // 首行突排：首行 = −左縮排
            assert!(with(pointer, indent(2.0, 0.0, -2.0)).is_ok(), "{pointer}");
            assert!(with(pointer, indent(2.0, 0.0, -2.5)).is_err(), "{pointer}");
            assert!(with(pointer, indent(-1.0, 0.0, 0.0)).is_err(), "{pointer}");
            assert!(with(pointer, indent(0.0, 20.5, 0.0)).is_err(), "{pointer}");
            assert!(with(pointer, indent(0.0, 0.0, 20.5)).is_err(), "{pointer}");
        }
    }

    #[test]
    fn rejects_text_spacing_out_of_range() {
        let with = |pointer: &str, key: &str, number: f64| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            value.pointer_mut(pointer).unwrap()[key] = Value::from(number);
            parse_project(&value.to_string())
        };
        for pointer in ["/document/pages/0/elements/0", "/document/pages/0/elements/2/label", "/document/textStyles/0"] {
            assert!(with(pointer, "lineHeight", LINE_HEIGHT_MIN).is_ok(), "{pointer}");
            assert!(with(pointer, "lineHeight", LINE_HEIGHT_MAX).is_ok(), "{pointer}");
            assert!(with(pointer, "lineHeight", 0.4).is_err(), "{pointer}");
            assert!(with(pointer, "lineHeight", 3.1).is_err(), "{pointer}");
            assert!(with(pointer, "letterSpacing", LETTER_SPACING_MIN).is_ok(), "{pointer}");
            assert!(with(pointer, "letterSpacing", LETTER_SPACING_MAX).is_ok(), "{pointer}");
            assert!(with(pointer, "letterSpacing", -201.0).is_err(), "{pointer}");
            assert!(with(pointer, "letterSpacing", 1001.0).is_err(), "{pointer}");
        }
    }

    #[test]
    fn rejects_invalid_text_shadows() {
        let with_shadow = |pointer: &str, shadow: Value| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            value.pointer_mut(pointer).unwrap()["shadow"] = shadow;
            parse_project(&value.to_string())
        };
        let ok = serde_json::json!({ "color": "#000000", "offsetX": 50, "offsetY": -50 });
        for pointer in ["/document/pages/0/elements/0", "/document/pages/0/elements/2/label", "/document/pageNumberRules/0/style"] {
            assert!(with_shadow(pointer, ok.clone()).is_ok(), "{pointer}");
            assert!(with_shadow(pointer, serde_json::json!({ "color": "#000000", "offsetX": 50.5, "offsetY": 0 })).is_err());
            assert!(with_shadow(pointer, serde_json::json!({ "color": "black", "offsetX": 0, "offsetY": 0 })).is_err());
            assert!(with_shadow(pointer, serde_json::json!({ "color": "#000000", "offsetX": 0 })).is_err());
        }
    }

    #[test]
    fn upgrade_keeps_the_rotated_centre_in_place() {
        // 中心 (100, 100)、旋轉 90° 的 40 × 20 橢圓：新的左上角是中心 + R(90°)·(−20, −10) = (110, 80)
        let mut value: Value = serde_json::from_str(FIXTURE_V2).unwrap();
        let ellipse = value.pointer_mut("/document/pages/0/elements/2").unwrap();
        for (key, number) in [("x", 100.0), ("y", 100.0), ("rotation", 90.0), ("radiusX", 20.0), ("radiusY", 10.0)] {
            ellipse[key] = Value::from(number);
        }
        let Element::Shape(shape) = &parse_project(&value.to_string()).unwrap().document.pages[0].elements[2] else {
            panic!("expected a shape")
        };
        assert!((shape.base.x - 110.0).abs() < 1e-9 && (shape.base.y - 80.0).abs() < 1e-9, "{:?}", shape.base);
        assert_eq!((shape.width, shape.height), (40.0, 20.0));
    }

    #[test]
    fn files_before_v4_open_with_zero_margins() {
        assert_eq!(parse_project(FIXTURE_V2).unwrap().document.margins, Margins::default());

        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(3);
        value["document"].as_object_mut().unwrap().remove("margins");
        assert_eq!(parse_project(&value.to_string()).unwrap().document.margins, Margins::default());

        // fixture（v4）的邊界不是 0，確認真的有讀到
        assert!(parse_project(FIXTURE).unwrap().document.margins.top > 0.0);
    }

    #[test]
    fn rejects_invalid_margins() {
        for (side, number) in [("top", -1.0), ("left", MARGIN_MAX_PT + 1.0)] {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            value["document"]["margins"][side] = Value::from(number);
            assert!(matches!(parse_project(&value.to_string()), Err(AppError::InvalidProject(_))), "{side} {number}");
        }
        // 邊界超過頁面尺寸不算錯誤（縮小紙張不能讓檔案變成不合法）
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["margins"]["right"] = Value::from(5000.0);
        assert!(parse_project(&value.to_string()).is_ok());
    }

    #[test]
    fn files_before_v5_open_without_page_numbers() {
        assert!(parse_project(FIXTURE_V2).unwrap().document.page_number_rules.is_empty());

        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(4);
        value["document"].as_object_mut().unwrap().remove("pageNumberRules");
        assert!(parse_project(&value.to_string()).unwrap().document.page_number_rules.is_empty());

        // fixture（v5）有兩段頁碼，確認真的有讀到
        let rules = parse_project(FIXTURE).unwrap().document.page_number_rules;
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[1].odd.position, PageNumberPosition::MiddleRight);
    }

    #[test]
    fn rejects_invalid_page_number_rules() {
        use serde_json::json;
        let with = |pointer: &str, replacement: Value| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            *value.pointer_mut(pointer).unwrap() = replacement;
            parse_project(&value.to_string())
        };
        const FIRST: &str = "/document/pageNumberRules/0";
        assert!(with(&format!("{FIRST}/start"), json!(0)).is_ok());
        for (field, bad) in [
            ("from", json!(0)),
            ("to", json!(PAGE_NUMBER_MAX + 1)),
            ("start", json!(-1)),
            ("from", json!(1.5)),
            ("odd/position", json!("center")),
            ("odd/prefix", json!("a\nb")),
            ("even/suffix", json!("字".repeat(PAGE_NUMBER_AFFIX_MAX_LENGTH + 1))),
            ("style/fontSize", json!(FONT_SIZE_MAX + 1.0)),
            ("style/fill", json!("red")),
            ("style/stroke", json!({ "color": "#000000", "width": 0, "dash": "solid" })),
            ("id", json!("")),
        ] {
            assert!(with(&format!("{FIRST}/{field}"), bad.clone()).is_err(), "{field} = {bad}");
        }
        // from > to
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["pageNumberRules"][0]["from"] = json!(5);
        value["document"]["pageNumberRules"][0]["to"] = json!(4);
        assert!(parse_project(&value.to_string()).is_err());
    }

    #[test]
    fn page_number_rules_may_not_overlap_or_share_ids() {
        let rules = |edit: &dyn Fn(&mut Value)| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            edit(&mut value["document"]["pageNumberRules"]);
            parse_project(&value.to_string())
        };
        // fixture：第 1–2 頁、第 3–999 頁；順序不影響
        assert!(rules(&|r| r.as_array_mut().unwrap().reverse()).is_ok());
        assert!(rules(&|r| r[1]["from"] = Value::from(2)).is_err());
        assert!(rules(&|r| r[1]["id"] = r[0]["id"].clone()).is_err());
    }

    #[test]
    fn unknown_top_level_fields_are_preserved() {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["futureField"] = Value::from("kept");
        let project = parse_project(&value.to_string()).unwrap();
        assert_eq!(project.extra.get("futureField"), Some(&Value::from("kept")));
        assert!(serde_json::to_string(&project).unwrap().contains("futureField"));
    }

    #[test]
    fn rejects_newer_schema_version() {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(SCHEMA_VERSION + 1);
        let error = parse_project(&value.to_string()).unwrap_err();
        assert!(matches!(error, AppError::UnsupportedVersion(v) if v == SCHEMA_VERSION + 1));
    }

    #[test]
    fn rejects_foreign_or_malformed_files() {
        assert!(matches!(parse_project("{"), Err(AppError::InvalidProject(_))));
        assert!(matches!(parse_project(r#"{"format":"other"}"#), Err(AppError::InvalidProject(_))));
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(0);
        assert!(matches!(parse_project(&value.to_string()), Err(AppError::InvalidProject(_))));
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["pages"][0]["elements"][0]["type"] = Value::from("video");
        assert!(matches!(parse_project(&value.to_string()), Err(AppError::InvalidProject(_))));
    }

    #[test]
    fn opens_v1_files() {
        let mut value: Value = serde_json::from_str(FIXTURE_V2).unwrap();
        value["schemaVersion"] = Value::from(1);
        // v1 沒有透明度
        value["document"]["pages"][0]["elements"][1]["fill"] = Value::from("#e0e7ff");
        assert_eq!(parse_project(&value.to_string()).unwrap().schema_version, 1);
    }

    #[test]
    fn element_colors_may_have_alpha_but_backgrounds_may_not() {
        let with = |pointer: &str, color: &str| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            *value.pointer_mut(pointer).unwrap() = Value::from(color);
            parse_project(&value.to_string())
        };
        const FILL: &str = "/document/pages/0/elements/0/fill";
        const BACKGROUND: &str = "/document/pages/0/background";
        assert!(with(FILL, "#171717").is_ok());
        assert!(with(FILL, "#17171780").is_ok());
        assert!(with(FILL, "#1717178").is_err());
        assert!(with(FILL, "#171717800").is_err());
        assert!(with(FILL, "#17171g80").is_err());
        assert!(with(BACKGROUND, "#ffffff").is_ok());
        assert!(with(BACKGROUND, "#ffffff80").is_err());
        // 邊框與圖形內文字的顏色也要檢查（fixture 的橢圓兩者都有）
        assert!(with("/document/pages/0/elements/2/stroke/color", "#be123c80").is_ok());
        assert!(with("/document/pages/0/elements/2/stroke/color", "red").is_err());
        assert!(with("/document/pages/0/elements/2/label/fill", "red").is_err());
    }

    #[test]
    fn reads_four_corner_radii_and_keeps_a_single_number() {
        let project = parse_project(FIXTURE).unwrap();
        let shape = |document: &Document, id: &str| {
            document.pages[0]
                .elements
                .iter()
                .find_map(|e| match e {
                    Element::Shape(shape) if shape.base.id == id => Some(shape.geometry.clone()),
                    _ => None,
                })
                .unwrap_or_else(|| panic!("expected the shape {id}"))
        };
        // fixture 的圓角矩形：四個角不同，存成陣列、照樣存回陣列
        let rect = shape(&project.document, "el-rect");
        assert_eq!(rect, ShapeGeometry::Rect { corner_radius: CornerRadius::Corners([12.0, 12.0, 0.0, 4.0]) });
        assert_eq!(serde_json::to_value(&rect).unwrap()["cornerRadius"], serde_json::json!([12.0, 12.0, 0.0, 4.0]));
        // 四角一樣的（v10 以前的檔案）讀成數字、存回數字
        let uniform = ShapeGeometry::Rect { corner_radius: CornerRadius::Uniform(8.0) };
        assert_eq!(serde_json::to_value(&uniform).unwrap()["cornerRadius"], serde_json::json!(8.0));
        assert_eq!(CornerRadius::Uniform(8.0).radii(), [8.0; 4]);
    }

    #[test]
    fn geometry_must_be_drawable() {
        let with = |index: usize, geometry: Value| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            value["document"]["pages"][0]["elements"][index]["geometry"] = geometry;
            parse_project(&value.to_string())
        };
        use serde_json::json;
        assert!(with(1, json!({ "kind": "rect", "cornerRadius": 0 })).is_ok());
        assert!(with(1, json!({ "kind": "rect", "cornerRadius": -1 })).is_err());
        // 四個角（v11）：四個非負數字才行
        assert!(with(1, json!({ "kind": "rect", "cornerRadius": [0, 4, 8, 12] })).is_ok());
        assert!(with(1, json!({ "kind": "rect", "cornerRadius": [0, 4, 8] })).is_err());
        assert!(with(1, json!({ "kind": "rect", "cornerRadius": [0, 4, 8, -1] })).is_err());
        assert!(with(3, json!({ "kind": "polygon", "sides": 8 })).is_ok());
        // 繪製時會補到 3 邊，舊檔不因此打不開
        assert!(with(3, json!({ "kind": "polygon", "sides": 2 })).is_ok());
        assert!(with(3, json!({ "kind": "polygon", "sides": MAX_VERTEX_COUNT + 1 })).is_err());
        assert!(with(4, json!({ "kind": "star", "numPoints": 6, "innerRatio": 1.0 })).is_ok());
        assert!(with(4, json!({ "kind": "star", "numPoints": 6, "innerRatio": 0.0 })).is_err());
        assert!(with(4, json!({ "kind": "star", "numPoints": 6, "innerRatio": 1.5 })).is_err());
        // 圖形庫的圖形（v14）：只檢查格式，不認得的 id 也能開（畫成虛線外框）
        assert!(with(1, json!({ "kind": "preset", "preset": "hexagon", "params": { "size": 0.25 } })).is_ok());
        assert!(with(1, json!({ "kind": "preset", "preset": "some-future-shape2", "params": {} })).is_ok());
        assert!(with(1, json!({ "kind": "preset", "preset": "cloud" })).is_ok(), "params may be missing");
        assert!(with(1, json!({ "kind": "preset", "preset": "", "params": {} })).is_err());
        assert!(with(1, json!({ "kind": "preset", "preset": "a".repeat(33), "params": {} })).is_err());
        assert!(with(1, json!({ "kind": "preset", "preset": "../x", "params": {} })).is_err());
        assert!(with(1, json!({ "kind": "preset", "preset": "hexagon", "params": { "si ze": 1 } })).is_err());
        assert!(with(1, json!({ "kind": "preset", "preset": "hexagon", "params": { "size": "1" } })).is_err());
        let nine: serde_json::Map<String, Value> = (0..9).map(|n| (format!("p{n}"), json!(n))).collect();
        assert!(with(1, json!({ "kind": "preset", "preset": "hexagon", "params": nine })).is_err());
    }

    #[test]
    fn stroke_width_must_be_positive_and_bounded() {
        let with_width = |width: f64| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            value["document"]["pages"][0]["elements"][2]["stroke"]["width"] = Value::from(width);
            parse_project(&value.to_string())
        };
        assert!(with_width(0.25).is_ok());
        assert!(with_width(STROKE_WIDTH_MAX).is_ok());
        assert!(with_width(0.0).is_err());
        assert!(with_width(-1.0).is_err());
        assert!(with_width(STROKE_WIDTH_MAX + 1.0).is_err());
    }

    #[test]
    fn rejects_invalid_colors_and_empty_documents() {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["pages"][0]["background"] = Value::from("red");
        assert!(parse_project(&value.to_string()).is_err());
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["pages"] = Value::Array(vec![]);
        assert!(parse_project(&value.to_string()).is_err());
    }

    #[test]
    fn asset_paths_must_stay_inside_assets_dir() {
        assert!(validate_asset_path("assets/images/abc.png").is_ok());
        for bad in [
            "assets/images/../../secret.txt",
            "assets/images/sub/abc.png",
            "assets/images/..",
            "assets/images/",
            "assets/images/.hidden",
            "assets/images/a\\b.png",
            "C:/Windows/win.ini",
            "/etc/passwd",
            "blob:http://localhost/1",
            "assets/imagesX/abc.png",
        ] {
            assert!(validate_asset_path(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn asset_paths_per_directory() {
        assert!(validate_asset_path_in("assets/texts/abc.md", TEXT_ASSET_DIR).is_ok());
        assert!(validate_asset_path_in("assets/audio/abc.mp3", AUDIO_ASSET_DIR).is_ok());
        // 頁面圖片只能在 assets/images
        assert!(validate_asset_path("assets/texts/abc.md").is_err());
        assert!(validate_asset_path_in("assets/images/abc.png", TEXT_ASSET_DIR).is_err());
        for bad in ["assets/texts/../x.md", "assets/texts/.x", "assets/audio/a/b.mp3", "assets/audioX/a.mp3"] {
            let dir = if bad.starts_with("assets/texts") { TEXT_ASSET_DIR } else { AUDIO_ASSET_DIR };
            assert!(validate_asset_path_in(bad, dir).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn referenced_assets_includes_elements_and_asset_list() {
        let project = parse_project(FIXTURE).unwrap();
        let refs: Vec<_> = referenced_assets(&project.document, &project.assets).collect();
        assert!(refs.iter().all(|src| src.starts_with("assets/images/") || src.starts_with("assets/fonts/")));
        assert!(refs.len() >= 2);
        // 只用在主頁上的圖片也要算進去，開檔清理才不會刪掉它
        assert!(refs.contains(&"assets/images/fedcba9876543210fedcba9876543210.png"));
        // 專案字型的一般與粗體檔（沒有粗體的那套只有一個檔）
        let fonts: Vec<_> = refs.iter().filter(|src| src.starts_with("assets/fonts/")).collect();
        assert_eq!(fonts.len(), 3);
    }

    #[test]
    fn reads_project_fonts_and_defaults_them_in_older_files() {
        let document = parse_project(FIXTURE).unwrap().document;
        assert_eq!(document.fonts.len(), 2);
        let [display, book] = &document.fonts[..] else { panic!("two fonts") };
        assert_eq!((display.generic, display.bold.as_ref().map(|bold| bold.weight)), (GenericFamily::SansSerif, Some(500)));
        assert_eq!((book.generic, book.bold.is_none(), book.regular.embedding), (GenericFamily::Serif, true, FontEmbedding::PreviewAndPrint));
        assert_eq!(project_font_family(&book.id), "project-font-font-book");

        // v12 檔案沒有字型清單
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(12);
        value["document"].as_object_mut().unwrap().remove("fonts");
        assert!(parse_project(&value.to_string()).unwrap().document.fonts.is_empty());
        assert!(parse_project(FIXTURE_V2).unwrap().document.fonts.is_empty());
    }

    #[test]
    fn rejects_invalid_project_fonts() {
        use serde_json::json;
        let with = |edit: &dyn Fn(&mut Value)| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            edit(&mut value["document"]["fonts"]);
            parse_project(&value.to_string())
        };
        assert!(with(&|f| f[0]["name"] = json!("字".repeat(FONT_NAME_MAX_LENGTH))).is_ok());
        assert!(with(&|f| f[1]["regular"]["appleBaselineShift"] = json!(-0.2)).is_ok());
        let cases: [(&str, &dyn Fn(&mut Value)); 17] = [
            ("duplicate id", &|f| f[1]["id"] = f[0]["id"].clone()),
            ("duplicate name", &|f| f[1]["name"] = f[0]["name"].clone()),
            ("empty id", &|f| f[0]["id"] = json!("")),
            ("id with a quote", &|f| f[0]["id"] = json!("a\"b")),
            ("id with a space", &|f| f[0]["id"] = json!("a b")),
            ("untrimmed name", &|f| f[0]["name"] = json!(" 標題")),
            ("empty name", &|f| f[0]["name"] = json!("")),
            ("long name", &|f| f[0]["name"] = json!("字".repeat(FONT_NAME_MAX_LENGTH + 1))),
            ("unknown generic", &|f| f[0]["generic"] = json!("monospace")),
            ("file outside assets/fonts", &|f| f[0]["regular"]["src"] = json!("assets/images/a.otf")),
            ("path traversal", &|f| f[0]["bold"]["src"] = json!("assets/fonts/../a.otf")),
            ("woff file", &|f| f[0]["regular"]["src"] = json!("assets/fonts/a.woff2")),
            ("restricted embedding", &|f| f[0]["regular"]["embedding"] = json!("restricted")),
            ("weight 0", &|f| f[0]["regular"]["weight"] = json!(0)),
            ("negative ascent", &|f| f[0]["regular"]["ascent"] = json!(-1)),
            ("huge descent", &|f| f[0]["bold"]["descent"] = json!(FONT_METRIC_MAX + 1.0)),
            ("long file family", &|f| f[0]["regular"]["fileFamily"] = json!("x".repeat(FONT_FILE_NAME_MAX_LENGTH + 1))),
        ];
        for (what, edit) in cases {
            assert!(matches!(with(edit), Err(AppError::InvalidProject(_))), "{what}");
        }
    }

    #[test]
    fn reads_master_pages_and_defaults_them_in_older_files() {
        let document = parse_project(FIXTURE).unwrap().document;
        assert_eq!(document.masters.len(), 2);
        assert_eq!(document.masters[1].parent_id.as_deref(), Some("master-a"));
        assert_eq!(document.pages[0].master_id.as_deref(), Some("master-b"));

        // v6 檔案沒有主頁
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(6);
        value["document"].as_object_mut().unwrap().remove("masters");
        value["document"]["pages"][0].as_object_mut().unwrap().remove("masterId");
        let document = parse_project(&value.to_string()).unwrap().document;
        assert!(document.masters.is_empty());
        assert_eq!(document.pages[0].master_id, None);
        assert!(parse_project(FIXTURE_V2).unwrap().document.masters.is_empty());
    }

    #[test]
    fn rejects_invalid_master_references() {
        let with = |edit: &dyn Fn(&mut Value)| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            edit(&mut value["document"]);
            parse_project(&value.to_string())
        };
        assert!(with(&|_| {}).is_ok());
        let cases: [(&str, &dyn Fn(&mut Value)); 6] = [
            ("page uses a missing master", &|d| d["pages"][0]["masterId"] = Value::from("missing")),
            ("master based on a missing master", &|d| d["masters"][0]["parentId"] = Value::from("missing")),
            ("cycle", &|d| d["masters"][0]["parentId"] = Value::from("master-b")),
            ("based on itself", &|d| d["masters"][0]["parentId"] = Value::from("master-a")),
            ("master id used by a page", &|d| d["masters"][0]["id"] = Value::from("page-1")),
            ("invalid master background", &|d| d["masters"][1]["background"] = Value::from("#fef3c780")),
        ];
        for (what, edit) in cases {
            assert!(matches!(with(edit), Err(AppError::InvalidProject(_))), "{what}");
        }
    }

    #[test]
    fn limits_how_deeply_master_pages_nest() {
        let chain = |length: usize| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            let template = value["document"]["masters"][0].clone();
            let masters: Vec<Value> = (0..length)
                .map(|i| {
                    let mut master = template.clone();
                    master["id"] = Value::from(format!("m{i}"));
                    master["elements"] = Value::Array(vec![]);
                    master["parentId"] = if i == 0 { Value::Null } else { Value::from(format!("m{}", i - 1)) };
                    master
                })
                .collect();
            value["document"]["masters"] = Value::Array(masters);
            value["document"]["pages"][0]["masterId"] = Value::from(format!("m{}", length - 1));
            parse_project(&value.to_string())
        };
        assert!(chain(MASTER_DEPTH_MAX).is_ok());
        assert!(matches!(chain(MASTER_DEPTH_MAX + 1), Err(AppError::InvalidProject(_))));
    }

    #[test]
    fn default_text_styles_match_the_shared_fixture() {
        // TS defaultTextStyles 也和這份比對
        let expected: Value = serde_json::from_str(include_str!("../../../tests/fixtures/default-text-styles.json")).unwrap();
        let actual = serde_json::to_value(default_text_styles()).unwrap();
        assert_eq!(normalize(actual), normalize(expected));
    }

    #[test]
    fn reads_text_styles_and_defaults_them_in_older_files() {
        let document = parse_project(FIXTURE).unwrap().document;
        assert_eq!(document.text_styles.len(), 3);
        let Element::Text(footer) = &document.masters[1].elements[0] else { panic!("expected text") };
        assert_eq!(footer.style_id.as_deref(), Some("style-footer"));

        // v7 檔案沒有樣式表與連結：讀成內建樣式、都不連結
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(7);
        value["document"].as_object_mut().unwrap().remove("textStyles");
        for pointer in ["/document/masters/1/elements/0", "/document/pages/0/elements/0", "/document/pages/0/elements/2/label"] {
            value.pointer_mut(pointer).unwrap().as_object_mut().unwrap().remove("styleId");
        }
        let document = parse_project(&value.to_string()).unwrap().document;
        assert_eq!(document.text_styles, default_text_styles());
        let Element::Text(footer) = &document.masters[1].elements[0] else { panic!("expected text") };
        assert_eq!(footer.style_id, None);
        assert_eq!(parse_project(FIXTURE_V2).unwrap().document.text_styles, default_text_styles());

        // v8 的空樣式表要照樣保留（不是補成內建樣式）
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["textStyles"] = Value::Array(vec![]);
        for pointer in ["/document/masters/1/elements/0", "/document/pages/0/elements/2/label"] {
            value.pointer_mut(pointer).unwrap()["styleId"] = Value::Null;
        }
        assert!(parse_project(&value.to_string()).unwrap().document.text_styles.is_empty());
    }

    #[test]
    fn rejects_invalid_text_styles_and_links() {
        use serde_json::json;
        let with = |edit: &dyn Fn(&mut Value)| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            edit(&mut value["document"]);
            parse_project(&value.to_string())
        };
        assert!(with(&|d| d["textStyles"][2]["name"] = json!("字".repeat(TEXT_STYLE_NAME_MAX_LENGTH))).is_ok());
        let cases: [(&str, &dyn Fn(&mut Value)); 9] = [
            ("text links a missing style", &|d| d["pages"][0]["elements"][0]["styleId"] = json!("missing")),
            ("label links a missing style", &|d| d["pages"][0]["elements"][2]["label"]["styleId"] = json!("missing")),
            ("master text links a missing style", &|d| d["masters"][1]["elements"][0]["styleId"] = json!("missing")),
            ("duplicate id", &|d| d["textStyles"][1]["id"] = d["textStyles"][0]["id"].clone()),
            ("duplicate name", &|d| d["textStyles"][1]["name"] = d["textStyles"][0]["name"].clone()),
            ("untrimmed name", &|d| d["textStyles"][0]["name"] = json!(" 標題")),
            ("empty name", &|d| d["textStyles"][0]["name"] = json!("")),
            ("long name", &|d| d["textStyles"][0]["name"] = json!("字".repeat(TEXT_STYLE_NAME_MAX_LENGTH + 1))),
            ("font size", &|d| d["textStyles"][0]["fontSize"] = json!(FONT_SIZE_MIN - 1.0)),
        ];
        for (what, edit) in cases {
            assert!(matches!(with(edit), Err(AppError::InvalidProject(_))), "{what}");
        }
        assert!(with(&|d| d["textStyles"][0]["fill"] = json!("red")).is_err());
        assert!(with(&|d| d["textStyles"][0]["id"] = json!("")).is_err());
        assert!(with(&|d| d["textStyles"][2]["shadow"] = json!({ "color": "#000000", "offsetX": 99, "offsetY": 0 })).is_err());
    }

    /// Removes the swatch list and every swatch link, as in files before v12.
    fn strip_swatches(value: &mut Value) {
        match value {
            Value::Object(map) => {
                for key in ["swatches", "fillSwatchId", "swatchId", "backgroundSwatchId"] {
                    map.remove(key);
                }
                map.values_mut().for_each(strip_swatches);
            }
            Value::Array(items) => items.iter_mut().for_each(strip_swatches),
            _ => {}
        }
    }

    #[test]
    fn reads_swatches_and_defaults_them_in_older_files() {
        let document = parse_project(FIXTURE).unwrap().document;
        assert_eq!(document.swatches.len(), 6);
        assert_eq!(document.swatches[2], Swatch { id: "swatch-brand".into(), name: "品牌紅".into(), color: "#be123c".into() });
        assert_eq!(document.pages[0].background_swatch_id.as_deref(), Some("swatch-white"));
        assert_eq!(document.masters[0].background_swatch_id, None);
        let Element::Shape(ellipse) = &document.pages[0].elements[2] else { panic!("expected a shape") };
        assert_eq!(ellipse.stroke.as_ref().unwrap().swatch_id.as_deref(), Some("swatch-brand"));
        assert_eq!(ellipse.label.as_ref().unwrap().fill_swatch_id.as_deref(), Some("swatch-text"));
        // 連到色票時，實際的顏色照存（含使用處自己的透明度）
        let numbers = &document.page_number_rules[1].style;
        assert_eq!((numbers.fill.as_str(), numbers.fill_swatch_id.as_deref()), ("#4f46e580", Some("swatch-indigo")));

        // v11 檔案沒有色票與連結：讀成沒有色票、都不連結，存檔時寫出 null
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(11);
        strip_swatches(&mut value);
        let project = parse_project(&value.to_string()).unwrap();
        assert!(project.document.swatches.is_empty());
        let Element::Shape(ellipse) = &project.document.pages[0].elements[2] else { panic!("expected a shape") };
        assert_eq!(ellipse.stroke.as_ref().unwrap().swatch_id, None);
        let written = serde_json::to_value(&project).unwrap();
        assert_eq!(written["document"]["pages"][0]["backgroundSwatchId"], Value::Null);
        assert!(parse_project(FIXTURE_V2).unwrap().document.swatches.is_empty());
    }

    #[test]
    fn rejects_invalid_swatches_and_links() {
        use serde_json::json;
        let with = |edit: &dyn Fn(&mut Value)| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            edit(&mut value["document"]);
            parse_project(&value.to_string())
        };
        assert!(with(&|d| d["swatches"][0]["name"] = json!("字".repeat(SWATCH_NAME_MAX_LENGTH))).is_ok());
        let missing = json!("missing");
        let cases: [(&str, &dyn Fn(&mut Value)); 22] = [
            ("text fill", &|d| d["masters"][1]["elements"][0]["fillSwatchId"] = missing.clone()),
            ("text shadow", &|d| d["pages"][0]["elements"][0]["shadow"]["swatchId"] = missing.clone()),
            ("shape fill", &|d| d["pages"][0]["elements"][1]["fillSwatchId"] = missing.clone()),
            ("shape stroke", &|d| d["pages"][0]["elements"][2]["stroke"]["swatchId"] = missing.clone()),
            ("label fill", &|d| d["pages"][0]["elements"][2]["label"]["fillSwatchId"] = missing.clone()),
            ("page background", &|d| d["pages"][0]["backgroundSwatchId"] = missing.clone()),
            ("master background", &|d| d["masters"][0]["backgroundSwatchId"] = missing.clone()),
            ("text style fill", &|d| d["textStyles"][0]["fillSwatchId"] = missing.clone()),
            ("text style shadow", &|d| d["textStyles"][2]["shadow"]["swatchId"] = missing.clone()),
            ("page number fill", &|d| d["pageNumberRules"][0]["style"]["fillSwatchId"] = missing.clone()),
            ("page number shadow", &|d| d["pageNumberRules"][1]["style"]["shadow"]["swatchId"] = missing.clone()),
            ("page number stroke", &|d| d["pageNumberRules"][1]["style"]["stroke"]["swatchId"] = missing.clone()),
            ("link to a removed swatch", &|d| d["swatches"].as_array_mut().unwrap().retain(|s| s["id"] != "swatch-brand")),
            ("duplicate id", &|d| d["swatches"][1]["id"] = d["swatches"][0]["id"].clone()),
            ("duplicate name", &|d| d["swatches"][1]["name"] = d["swatches"][0]["name"].clone()),
            ("untrimmed name", &|d| d["swatches"][0]["name"] = json!(" 文字")),
            ("empty name", &|d| d["swatches"][0]["name"] = json!("")),
            ("long name", &|d| d["swatches"][0]["name"] = json!("字".repeat(SWATCH_NAME_MAX_LENGTH + 1))),
            ("empty id", &|d| d["swatches"][1]["id"] = json!("")),
            ("uppercase color", &|d| d["swatches"][0]["color"] = json!("#ABCDEF")),
            ("color with alpha", &|d| d["swatches"][0]["color"] = json!("#17171780")),
            ("named color", &|d| d["swatches"][0]["color"] = json!("red")),
        ];
        for (what, edit) in cases {
            assert!(matches!(with(edit), Err(AppError::InvalidProject(_))), "{what}");
        }
    }
}
