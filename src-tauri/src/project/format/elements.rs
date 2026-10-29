//! Page elements: text, shapes, images and lines, and the text style sheet.

use super::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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
    /// A photo clipped to the shape's outline (image frame). Missing in files before v17 → none.
    #[serde(default)]
    pub image: Option<ShapeImage>,
}

/// How a photo fills its frame; same as `ShapeImageFit` in `src/lib/editor/types.ts`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ShapeImageFit {
    Cover,
    Contain,
}

/// A photo inside a shape; the editor places it (`shape-image.ts`), the exporters get the placement.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShapeImage {
    /// Project-relative path under `assets/images/`, like `ImageElement.src`.
    pub src: String,
    /// Intrinsic size in pixels.
    pub image_width: f64,
    pub image_height: f64,
    pub fit: ShapeImageFit,
    pub focus_x: f64,
    pub focus_y: f64,
    pub zoom: f64,
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
