//! The document, its pages and master pages, and what they share (swatches, fonts, page numbers).

use super::*;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

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
