//! The render model: one document turned into positioned, drawable elements.
//!
//! Every output format builds this first, so coordinates, rotation, font mapping, the editor's
//! line breaks and the "missing image" rule are defined once instead of once per format.
//!
//! Coordinates keep the editor's definition: unit pt, origin at the page's top-left corner, y
//! pointing down, rotation clockwise around the element's anchor.

use super::{ExportRequest, LabelFrame, LineBox, PathCommand, PhotoPlacement, ShapePath, TextLayout};
use crate::error::{AppError, AppResult};
use crate::project::format::{
    validate_content, validate_stroke_look, Align, Element, FontStyle, ShapeElement, ShapeGeometry, Stroke, StrokeDash,
    TextDecoration, TextShadow,
    VerticalAlign,
};
use crate::project::shape;
use std::collections::HashMap;
use std::path::Path;

/// Inset between a shape's box and its text when the export request has no frame for the shape;
/// same value as `LABEL_PADDING_PT` in `src/lib/editor/shape-label.ts`.
pub const LABEL_PADDING_PT: f64 = 4.0;
const MAX_LINES_PER_TEXT: usize = 10_000;
const GENERIC_FAMILIES: &[&str] = &["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"];

/// Families that older projects stored, mapped to the bundled font that replaces them. Projects
/// saved before the fonts were bundled still carry these names, and there is no schema migration
/// for them, so the mapping has to stay.
const LEGACY_FAMILIES: &[(&str, &str)] = &[
    // 舊的畫面字型是可變字型，內嵌的是靜態實例
    ("Geist Variable", "Geist"),
    // 舊版中文向系統借字型，現在一律用內嵌的 Noto Sans TC
    ("Microsoft JhengHei", "Noto Sans TC"),
    ("Microsoft JhengHei UI", "Noto Sans TC"),
];

#[derive(Debug, Clone)]
pub struct RenderDocument {
    pub title: String,
    pub pages: Vec<RenderPage>,
}

#[derive(Debug, Clone)]
pub struct RenderPage {
    /// Page name shown in the editor's page tabs (EPUB table of contents).
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub background: String,
    /// Bottom-most element first, as in `Page.elements`.
    pub elements: Vec<RenderElement>,
}

#[derive(Debug, Clone)]
pub struct RenderElement {
    /// Top-left corner of the element's box (before rotation), for every kind.
    pub x: f64,
    pub y: f64,
    /// Degrees, clockwise, around `(x, y)`.
    pub rotation: f64,
    pub kind: RenderKind,
    /// Shapes only: the image frame's photo, clipped to the outline and drawn over the fill, under
    /// the outline's stroke and the details.
    pub photo: Option<RenderPhoto>,
}

/// An image frame's photo: the file and its rectangle in the shape's coordinates.
#[derive(Debug, Clone, PartialEq)]
pub struct RenderPhoto {
    /// Project-relative path (`assets/images/<file>`); the file is known to exist.
    pub src: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone)]
pub enum RenderKind {
    Text(RenderText),
    Rect(RenderRect),
    Ellipse(RenderEllipse),
    /// Both polygon and star shapes: a filled shape given by its vertices.
    Polygon(RenderPolygon),
    /// A shape from the shape library: outline paths computed by the editor.
    Path(RenderPath),
    Image(RenderImage),
}

#[derive(Debug, Clone)]
pub struct RenderText {
    /// Lines exactly as the canvas wrapped them; no format may re-wrap them.
    pub lines: Vec<String>,
    /// Distance (pt) from the element's top to the first line's baseline.
    pub baseline: f64,
    /// Distance (pt) between baselines.
    pub line_height: f64,
    pub width: f64,
    pub size: f64,
    /// Bundled family names, in priority order (generic CSS names removed).
    pub fonts: Vec<String>,
    pub bold: bool,
    pub align: Align,
    pub fill: String,
    /// Slanted like the browser's synthetic italic (no italic font files are bundled).
    pub italic: bool,
    /// Underline / strikethrough segments, in line order (underline before strikethrough).
    pub decorations: Vec<DecorationLine>,
    /// Thickness (pt) of every decoration line.
    pub decoration_thickness: f64,
    pub shadow: Option<RenderShadow>,
    /// Extra space (pt) after every character; 0 = none.
    pub letter_spacing: f64,
    /// With letter spacing, where each line starts (pt from the box's left edge), from the
    /// editor's line widths: Konva then draws one character at a time without kerning, and both its
    /// widths and the formats' own alignment count the spacing after the last character
    /// differently, so the formats place every line left-aligned at this x instead of aligning it
    /// themselves. Distributed text always has them (0, or centred for a lone character). `None`
    /// without letter spacing (or without line widths from an old request).
    pub line_starts: Option<Vec<f64>>,
    /// Distributed text: distance (pt) between neighbouring characters of each line, as the canvas
    /// spreads them; the formats use it instead of `letter_spacing`. `None` for other alignments.
    pub line_gaps: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecorationKind {
    /// Konva draws it before the line's text.
    Underline,
    /// Konva draws it after the line's text.
    Strikethrough,
}

/// One underline or strikethrough, in the text box's coordinates (pt, origin at the box's top-left).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DecorationLine {
    /// Index of the text line it belongs to.
    pub line: usize,
    pub kind: DecorationKind,
    pub x: f64,
    /// Centre of the line's thickness.
    pub y: f64,
    pub length: f64,
}

/// Hard text shadow, ready to draw inside the (rotated) text box.
#[derive(Debug, Clone, PartialEq)]
pub struct RenderShadow {
    /// Shadow color with the text's own alpha multiplied in: the canvas shadow takes the alpha of
    /// what is drawn.
    pub color: String,
    /// Offset in the text box's coordinates (the stored offset points along the page axes).
    pub dx: f64,
    pub dy: f64,
    /// With an underline or strikethrough, Konva draws the whole text off-screen first and casts a
    /// single shadow under all of it; otherwise each line casts its own shadow just before it.
    pub whole_block: bool,
}

/// Slope of the browser's synthetic italic: Skia skews glyphs by 1/4 around the baseline (measured
/// the same for every bundled font). PDF and EPUB slant by this much.
pub const SYNTHETIC_ITALIC_SLANT: f64 = 0.25;
/// Konva 10 `Text._sceneFunc` (non-legacy text rendering): the underline sits `round(size / 4)`
/// below the baseline and the strikethrough as far above it, both `size / 15` thick and
/// `round(line width)` long. Recheck when upgrading Konva.
const DECORATION_OFFSET_RATIO: f64 = 0.25;
const DECORATION_THICKNESS_RATIO: f64 = 1.0 / 15.0;

/// Text properties shared by text elements and the text inside shapes.
struct TextStyleRef<'a> {
    size: f64,
    family: &'a str,
    font_style: FontStyle,
    decoration: &'a TextDecoration,
    /// × font size.
    line_height: f64,
    /// 1/1000 of the font size.
    letter_spacing: f64,
    align: Align,
    fill: &'a str,
}

/// Where a line of `width` starts in a box of `box_width`, as Konva aligns it.
fn line_start(width: f64, box_width: f64, align: Align) -> f64 {
    match align {
        Align::Left => 0.0,
        Align::Center => (box_width - width) / 2.0,
        Align::Right => box_width - width,
        // 首尾置中的行寬是畫出來的寬：兩字以上 = 框寬（起點 0），單字置中
        Align::Distributed => (box_width - width) / 2.0,
    }
}

/// Where line `line` of `width` starts in the text box: its box (paragraph indents; the whole box
/// without them) plus the alignment within that box. Same as TS `alignedLineStart`.
fn layout_line_start(layout: &TextLayout, line: usize, width: f64, box_width: f64, align: Align) -> f64 {
    match layout.line_boxes.get(line) {
        Some(LineBox { start, width: room }) => start + line_start(width, *room, align),
        None => line_start(width, box_width, align),
    }
}

/// Underline / strikethrough segments of every line, placed like Konva places them.
fn decoration_lines(layout: &TextLayout, box_width: f64, line_height: f64, style: &TextStyleRef) -> Vec<DecorationLine> {
    let TextDecoration { underline, strikethrough, .. } = *style.decoration;
    if !underline && !strikethrough {
        return Vec::new();
    }
    let offset = (style.size * DECORATION_OFFSET_RATIO).round();
    let mut out = Vec::new();
    for line in 0..layout.lines.len() {
        // 舊的 request 沒有行寬時，線畫滿整個文字框
        let width = layout.line_widths.get(line).copied().unwrap_or(box_width);
        let length = width.round();
        if length <= 0.0 {
            continue;
        }
        let x = layout_line_start(layout, line, width, box_width, style.align);
        let baseline = layout.baseline + line as f64 * line_height;
        if underline {
            out.push(DecorationLine { line, kind: DecorationKind::Underline, x, y: baseline + offset, length });
        }
        if strikethrough {
            out.push(DecorationLine { line, kind: DecorationKind::Strikethrough, x, y: baseline - offset, length });
        }
    }
    out
}

/// Alpha (0–1) of a validated `#rrggbb` / `#rrggbbaa` color.
fn color_alpha(color: &str) -> f64 {
    color.get(7..9).and_then(|hex| u8::from_str_radix(hex, 16).ok()).map_or(1.0, |byte| f64::from(byte) / 255.0)
}

/// `#rrggbb` of `color` with `alpha` (written as 6 digits when opaque).
fn with_alpha(color: &str, alpha: f64) -> String {
    let byte = (alpha.clamp(0.0, 1.0) * 255.0).round() as u8;
    if byte == 255 {
        color[..7].to_owned()
    } else {
        format!("{}{byte:02x}", &color[..7])
    }
}

fn render_shadow(shadow: &TextShadow, fill: &str, rotation: f64, whole_block: bool) -> RenderShadow {
    // 偏移以頁面為準：反向旋轉成文字框（已旋轉）裡的座標
    let (sin, cos) = rotation.to_radians().sin_cos();
    RenderShadow {
        color: with_alpha(&shadow.color, color_alpha(&shadow.color) * color_alpha(fill)),
        dx: shadow.offset_x * cos + shadow.offset_y * sin,
        dy: -shadow.offset_x * sin + shadow.offset_y * cos,
        whole_block,
    }
}

fn render_text(layout: TextLayout, box_width: f64, rotation: f64, style: &TextStyleRef) -> RenderText {
    let line_height = style.size * style.line_height;
    let decorations = decoration_lines(&layout, box_width, line_height, style);
    let shadow = style.decoration.shadow.as_ref().map(|shadow| render_shadow(shadow, style.fill, rotation, !decorations.is_empty()));
    let letter_spacing = style.size * style.letter_spacing / 1000.0;
    let distributed = style.align == Align::Distributed;
    // 首尾置中：每行字與字的距離由編輯器算好（和畫布逐字放的位置相同）；舊的 request 沒有時退回一般字距
    let line_gaps = (distributed && layout.line_gaps.len() == layout.lines.len()).then(|| layout.line_gaps.clone());
    // 段落縮排：每行在自己的行框裡對齊，各格式也不能自己對齊整個文字框
    let indented = !layout.line_boxes.is_empty();
    let line_starts = ((letter_spacing != 0.0 || distributed || indented) && !layout.line_widths.is_empty()).then(|| {
        layout.line_widths.iter().enumerate().map(|(line, width)| layout_line_start(&layout, line, *width, box_width, style.align)).collect()
    });
    RenderText {
        letter_spacing,
        line_starts,
        line_gaps,
        lines: layout.lines,
        baseline: layout.baseline,
        line_height,
        width: box_width,
        size: style.size,
        fonts: font_families(style.family),
        bold: style.font_style == FontStyle::Bold,
        align: style.align,
        fill: style.fill.to_owned(),
        italic: style.decoration.italic,
        decorations,
        decoration_thickness: style.size * DECORATION_THICKNESS_RATIO,
        shadow,
    }
}

/// Outline of a shape, centred on the shape's edge (as on the canvas).
#[derive(Debug, Clone, PartialEq)]
pub struct RenderStroke {
    pub color: String,
    pub width: f64,
    /// `None` for a solid line.
    pub dash: Option<DashPattern>,
}

/// Dash pattern in pt. Same numbers as `dashPattern` in `src/lib/editor/stroke.ts`.
#[derive(Debug, Clone, PartialEq)]
pub struct DashPattern {
    /// Dash, gap, dash, gap… lengths.
    pub segments: Vec<f64>,
    /// Round caps turn the zero-length dashes of a dotted line into dots.
    pub round_cap: bool,
}

/// Miter limit for every format (the canvas default); Typst and SVG default to 4.
pub const STROKE_MITER_LIMIT: f64 = 10.0;

/// Dash pattern of a stroke style at a given width.
pub fn dash_pattern(dash: StrokeDash, width: f64) -> Option<DashPattern> {
    match dash {
        StrokeDash::Solid => None,
        StrokeDash::Dashed => Some(DashPattern { segments: vec![3.0 * width, 3.0 * width], round_cap: false }),
        StrokeDash::Dotted => Some(DashPattern { segments: vec![0.0, 2.0 * width], round_cap: true }),
        // 長劃、空、短劃（平頭，長度 = 線寬）、空
        StrokeDash::DashDot => {
            Some(DashPattern { segments: vec![4.0 * width, 2.0 * width, width, 2.0 * width], round_cap: false })
        }
    }
}

fn render_stroke(stroke: &Option<Stroke>) -> Option<RenderStroke> {
    stroke.as_ref().map(|s| RenderStroke { color: s.color.clone(), width: s.width, dash: dash_pattern(s.dash, s.width) })
}

#[derive(Debug, Clone)]
pub struct RenderRect {
    pub width: f64,
    pub height: f64,
    /// Top-left, top-right, bottom-right, bottom-left; each already limited to half the shorter
    /// side, as Konva draws them (every format can use them as they are).
    pub corner_radii: [f64; 4],
    pub fill: String,
    pub stroke: Option<RenderStroke>,
}

impl RenderRect {
    /// The radius when all four corners are the same (they then draw as a plain rounded rectangle).
    pub fn uniform_corner_radius(&self) -> Option<f64> {
        let [first, ..] = self.corner_radii;
        self.corner_radii.iter().all(|radius| *radius == first).then_some(first)
    }
}

/// Cubic Bézier factor for a quarter circle.
pub const KAPPA: f64 = 0.552_284_749_830_793_4;

/// One segment of an outline path, in the shape's own coordinates (pt). Like SVG path data: a
/// `Move` starts a subpath, `Close` closes the current one; a subpath without `Close` stays open.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PathSegment {
    Move(f64, f64),
    Line(f64, f64),
    /// Two control points, then the end point.
    Cubic(f64, f64, f64, f64, f64, f64),
    Close,
}

/// Rounded-rectangle outline in Konva's order: from (top-left radius, 0) to the right, clockwise
/// (Konva 10.5.0 starts there with one radius or four). Dashes are laid out from the path's start,
/// so PDF and EPUB draw bordered rectangles with this path and their dashes match the canvas.
///
/// Args:
///   w, h: Size of the rectangle.
///   radii: Top-left, top-right, bottom-right, bottom-left; each is limited to half the shorter
///     side here too, as Konva does.
pub fn rounded_rect_path(w: f64, h: f64, radii: [f64; 4]) -> Vec<PathSegment> {
    let [tl, tr, br, bl] = radii.map(|radius| radius.clamp(0.0, w.min(h) / 2.0));
    let mut path = vec![PathSegment::Move(tl, 0.0), PathSegment::Line(w - tr, 0.0)];
    if tr > 0.0 {
        let k = tr * KAPPA;
        path.push(PathSegment::Cubic(w - tr + k, 0.0, w, tr - k, w, tr));
    }
    path.push(PathSegment::Line(w, h - br));
    if br > 0.0 {
        let k = br * KAPPA;
        path.push(PathSegment::Cubic(w, h - br + k, w - br + k, h, w - br, h));
    }
    path.push(PathSegment::Line(bl, h));
    if bl > 0.0 {
        let k = bl * KAPPA;
        path.push(PathSegment::Cubic(bl - k, h, 0.0, h - bl + k, 0.0, h - bl));
    }
    path.push(PathSegment::Line(0.0, tl));
    if tl > 0.0 {
        let k = tl * KAPPA;
        path.push(PathSegment::Cubic(0.0, tl - k, tl - k, 0.0, tl, 0.0));
    }
    path.push(PathSegment::Close);
    path
}

/// Ellipse outline filling a `w` × `h` box, in Konva's order: from the rightmost point, clockwise
/// (y down). PDF draws bordered ellipses with it so dashes match the canvas.
pub fn ellipse_path(w: f64, h: f64) -> Vec<PathSegment> {
    let (rx, ry) = (w / 2.0, h / 2.0);
    let (kx, ky) = (rx * KAPPA, ry * KAPPA);
    vec![
        PathSegment::Move(w, ry),
        PathSegment::Cubic(w, ry + ky, rx + kx, h, rx, h),
        PathSegment::Cubic(rx - kx, h, 0.0, ry + ky, 0.0, ry),
        PathSegment::Cubic(0.0, ry - ky, rx - kx, 0.0, rx, 0.0),
        PathSegment::Cubic(rx + kx, 0.0, w, ry - ky, w, ry),
        PathSegment::Close,
    ]
}

/// A shape drawn from paths: the filled outline (closed subpaths, filled and stroked) and the
/// details drawn on top of it (open or closed subpaths, stroked only, never filled).
#[derive(Debug, Clone)]
pub struct RenderPath {
    /// The box the paths were computed for; rotation turns around its top-left corner.
    pub width: f64,
    pub height: f64,
    pub outline: Vec<PathSegment>,
    pub fill: String,
    pub stroke: Option<RenderStroke>,
    /// Empty when the shape has no details.
    pub details: Vec<PathSegment>,
    /// The editor decides it (the border's style, or a darker fill when there is no border).
    pub detail_stroke: Option<RenderStroke>,
}

#[derive(Debug, Clone)]
pub struct RenderEllipse {
    /// The ellipse fills this box.
    pub width: f64,
    pub height: f64,
    pub fill: String,
    pub stroke: Option<RenderStroke>,
}

#[derive(Debug, Clone)]
pub struct RenderPolygon {
    pub width: f64,
    pub height: f64,
    /// Vertices relative to the box's top-left corner; they touch every edge of the box.
    pub points: Vec<[f64; 2]>,
    pub fill: String,
    pub stroke: Option<RenderStroke>,
}

#[derive(Debug, Clone)]
pub struct RenderImage {
    pub width: f64,
    pub height: f64,
    /// Project-relative path (`assets/images/<file>`); the file is known to exist.
    pub src: String,
}

/// Maps a CSS `font-family` list to the bundled family names.
fn font_families(css: &str) -> Vec<String> {
    css.split(',')
        .map(|family| family.trim().trim_matches(['"', '\'']).trim())
        .filter(|family| !family.is_empty() && !GENERIC_FAMILIES.contains(&family.to_ascii_lowercase().as_str()))
        .map(|family| {
            LEGACY_FAMILIES
                .iter()
                .find(|(from, _)| *from == family)
                .map_or_else(|| family.to_owned(), |(_, to)| (*to).to_owned())
        })
        .collect()
}

/// The drawable kind of a shape, or `None` when there is nothing to draw: a shape-library shape the
/// editor sent no outline for (it does not know the shape; the editor counts and reports those).
///
/// # Errors
/// `AppError::InvalidInput` when the editor's outline is unusable.
fn shape_kind(shape: &ShapeElement, paths: &HashMap<String, ShapePath>) -> AppResult<Option<RenderKind>> {
    let (width, height, fill, stroke) = (shape.width, shape.height, shape.fill.clone(), render_stroke(&shape.stroke));
    let polygon = |unit: Vec<[f64; 2]>| {
        RenderKind::Polygon(RenderPolygon {
            width,
            height,
            points: shape::fit_to_box(&unit, width, height),
            fill: fill.clone(),
            stroke: stroke.clone(),
        })
    };
    let kind = match &shape.geometry {
        ShapeGeometry::Rect { corner_radius } => RenderKind::Rect(RenderRect {
            width,
            height,
            // Konva 10.5.0 實測：每個角各自限制在短邊的一半（不是 CSS 的等比例縮小）
            corner_radii: corner_radius.radii().map(|radius| radius.clamp(0.0, width.min(height) / 2.0)),
            fill: fill.clone(),
            stroke: stroke.clone(),
        }),
        ShapeGeometry::Ellipse => RenderKind::Ellipse(RenderEllipse { width, height, fill: fill.clone(), stroke: stroke.clone() }),
        ShapeGeometry::Polygon { sides } => polygon(shape::polygon_unit_points(*sides)),
        ShapeGeometry::Star { num_points, inner_ratio } => polygon(shape::star_unit_points(*num_points, *inner_ratio)),
        ShapeGeometry::Preset { .. } => {
            let Some(path) = paths.get(&shape.base.id) else { return Ok(None) };
            RenderKind::Path(render_path(width, height, fill.clone(), stroke.clone(), path)?)
        }
    };
    Ok(Some(kind))
}

/// Most commands one path of a shape-library shape may have (the library's shapes use a few
/// dozen); the paths come from the WebView, so they are bounded like any other input.
const SHAPE_PATH_COMMANDS_MAX: usize = 2000;
/// Largest coordinate (pt) in a shape-library path; far beyond any page (2000 mm ≈ 5669 pt).
const SHAPE_PATH_COORD_MAX: f64 = 1.0e6;

/// Checks one path from the editor and turns it into render segments.
fn path_segments(commands: &[PathCommand]) -> AppResult<Vec<PathSegment>> {
    let invalid = || AppError::invalid_input("匯出資料有誤：圖形的路徑不正確");
    if commands.len() > SHAPE_PATH_COMMANDS_MAX || !matches!(commands.first(), None | Some(PathCommand::M { .. })) {
        return Err(invalid());
    }
    let ok = |values: &[f64]| values.iter().all(|v| v.is_finite() && v.abs() <= SHAPE_PATH_COORD_MAX);
    commands
        .iter()
        .map(|command| {
            let (segment, values) = match *command {
                PathCommand::M { x, y } => (PathSegment::Move(x, y), vec![x, y]),
                PathCommand::L { x, y } => (PathSegment::Line(x, y), vec![x, y]),
                PathCommand::C { x1, y1, x2, y2, x, y } => (PathSegment::Cubic(x1, y1, x2, y2, x, y), vec![x1, y1, x2, y2, x, y]),
                PathCommand::Z => (PathSegment::Close, vec![]),
            };
            if ok(&values) {
                Ok(segment)
            } else {
                Err(invalid())
            }
        })
        .collect()
}

/// A shape-library shape drawn from the outline the editor computed.
///
/// # Errors
/// `AppError::InvalidInput` for an empty or unusable outline, or an invalid detail line.
fn render_path(width: f64, height: f64, fill: String, stroke: Option<RenderStroke>, path: &ShapePath) -> AppResult<RenderPath> {
    let outline = path_segments(&path.outline)?;
    if outline.is_empty() {
        return Err(AppError::invalid_input("匯出資料有誤：圖形的路徑不正確"));
    }
    let details = path_segments(&path.details)?;
    if let Some(detail) = &path.detail_stroke {
        validate_stroke_look(detail).map_err(|_| AppError::invalid_input("匯出資料有誤：圖形的細節線樣式不正確"))?;
    }
    // 細節線沒有線條樣式就不畫（編輯器只在有細節線時才給）
    let detail_stroke = if details.is_empty() { None } else { render_stroke(&path.detail_stroke) };
    Ok(RenderPath { width, height, outline, fill, stroke, details, detail_stroke })
}

fn text_layout(layouts: &HashMap<String, TextLayout>, id: &str, text: &str, size: f64, line_height: f64) -> AppResult<TextLayout> {
    match layouts.get(id) {
        Some(layout)
            if layout.lines.len() > MAX_LINES_PER_TEXT
                || !layout.baseline.is_finite()
                || !(layout.line_widths.is_empty() || layout.line_widths.len() == layout.lines.len())
                || !layout.line_widths.iter().all(|width| width.is_finite() && *width >= 0.0)
                || !(layout.line_boxes.is_empty() || layout.line_boxes.len() == layout.lines.len())
                || !layout.line_boxes.iter().all(|b| b.start.is_finite() && b.width.is_finite() && b.width >= 0.0) =>
        {
            Err(AppError::invalid_input("文字排版資料不正確"))
        }
        Some(layout) => Ok(layout.clone()),
        // 前端應該為每個文字物件都提供分行結果；缺少時退回以換行符號分行、估計基線
        None => Ok(TextLayout {
            lines: text.split('\n').map(str::to_owned).collect(),
            baseline: size * (line_height / 2.0 + 0.35),
            line_widths: Vec::new(),
            line_gaps: Vec::new(),
            line_boxes: Vec::new(),
        }),
    }
}

/// The text inside a shape as an ordinary text element, or `None` when the shape has no text.
///
/// Same layout as `src/lib/editor/shape-label.ts`: the text is laid out in the frame the editor
/// sent (`labelFrame`; without one, the box inset by `LABEL_PADDING_PT`), the block placed by its
/// vertical alignment (overflowing freely), all rotated with the shape.
fn shape_label(
    shape: &ShapeElement,
    layouts: &HashMap<String, TextLayout>,
    frames: &HashMap<String, LabelFrame>,
) -> AppResult<Option<RenderElement>> {
    let Some(label) = shape.label.as_ref().filter(|label| !label.text.is_empty()) else { return Ok(None) };
    let layout = text_layout(layouts, &format!("{}#label", shape.base.id), &label.text, label.font_size, label.spacing.line_height)?;
    let line_height = label.font_size * label.spacing.line_height;
    let style = TextStyleRef {
        size: label.font_size,
        family: &label.font_family,
        font_style: label.font_style,
        decoration: &label.decoration,
        line_height: label.spacing.line_height,
        letter_spacing: label.spacing.letter_spacing,
        align: label.align,
        fill: &label.fill,
    };
    let frame = match frames.get(&shape.base.id) {
        Some(frame) => {
            let usable = |v: f64| v.is_finite() && v.abs() <= SHAPE_PATH_COORD_MAX;
            if ![frame.x, frame.y, frame.width, frame.height].into_iter().all(usable) || frame.width <= 0.0 || frame.height < 0.0 {
                return Err(AppError::invalid_input("匯出資料有誤：圖形內文字的文字框不正確"));
            }
            *frame
        }
        None => LabelFrame {
            x: LABEL_PADDING_PT,
            y: LABEL_PADDING_PT,
            width: (shape.width - 2.0 * LABEL_PADDING_PT).max(1.0),
            height: (shape.height - 2.0 * LABEL_PADDING_PT).max(0.0),
        },
    };
    let (frame_width, frame_height) = (frame.width, frame.height);
    let text_height = layout.lines.len() as f64 * line_height;
    let offset = match label.vertical_align {
        VerticalAlign::Top => 0.0,
        VerticalAlign::Middle => (frame_height - text_height) / 2.0,
        VerticalAlign::Bottom => frame_height - text_height,
    };
    // 文字左上角在圖形內的位置，隨圖形一起繞圖形的定位點旋轉
    let (local_x, local_y) = (frame.x, frame.y + offset);
    let (sin, cos) = shape.base.rotation.to_radians().sin_cos();
    Ok(Some(RenderElement {
        x: shape.base.x + local_x * cos - local_y * sin,
        y: shape.base.y + local_x * sin + local_y * cos,
        rotation: shape.base.rotation,
        kind: RenderKind::Text(render_text(layout, frame_width, shape.base.rotation, &style)),
        photo: None,
    }))
}

/// The photo of an image frame for the render model.
///
/// # Returns
/// `Ok(None)` without a photo, or when its file is missing (the shape keeps its fill, like a
/// missing image; the caller counts it).
///
/// # Errors
/// `AppError::InvalidInput` when the editor sent no placement or an unusable one.
fn render_photo(root: &Path, shape: &ShapeElement, placements: &HashMap<String, PhotoPlacement>) -> AppResult<Option<RenderPhoto>> {
    let Some(image) = &shape.image else { return Ok(None) };
    let Some(placement) = placements.get(&shape.base.id) else {
        return Err(AppError::invalid_input("匯出資料有誤：圖片框沒有照片的位置"));
    };
    let PhotoPlacement { x, y, width, height } = *placement;
    let usable = |v: f64| v.is_finite() && v.abs() <= SHAPE_PATH_COORD_MAX;
    if ![x, y, width, height].into_iter().all(usable) || width <= 0.0 || height <= 0.0 {
        return Err(AppError::invalid_input("匯出資料有誤：圖片框的照片位置不正確"));
    }
    if !root.join(&image.src).is_file() {
        return Ok(None);
    }
    Ok(Some(RenderPhoto { src: image.src.clone(), x, y, width, height }))
}

/// Turns the editor's document and line breaks into the render model.
///
/// # Returns
/// The model and the number of images skipped because their file is missing from the project.
///
/// # Errors
/// `AppError::InvalidProject` for invalid content, `AppError::InvalidInput` for unusable layout
/// data from the frontend.
pub fn build_render(root: &Path, request: &ExportRequest) -> AppResult<(RenderDocument, usize)> {
    validate_content(&request.document, &[])?;
    let mut skipped = 0;
    let mut pages = Vec::with_capacity(request.document.pages.len());
    for page in &request.document.pages {
        let mut elements = Vec::with_capacity(page.elements.len());
        for element in &page.elements {
            let (base, kind) = match element {
                Element::Text(e) => {
                    let layout = text_layout(&request.text_layouts, &e.base.id, &e.text, e.font_size, e.spacing.line_height)?;
                    let style = TextStyleRef {
                        size: e.font_size,
                        family: &e.font_family,
                        font_style: e.font_style,
                        decoration: &e.decoration,
                        line_height: e.spacing.line_height,
                        letter_spacing: e.spacing.letter_spacing,
                        align: e.align,
                        fill: &e.fill,
                    };
                    (&e.base, RenderKind::Text(render_text(layout, e.width, e.base.rotation, &style)))
                }
                Element::Shape(e) => {
                    if let Some(kind) = shape_kind(e, &request.shape_paths)? {
                        let photo = render_photo(root, e, &request.shape_photos)?;
                        // 照片檔被刪除時只畫填色，算進略過的圖片數（同圖片物件）
                        skipped += usize::from(e.image.is_some() && photo.is_none());
                        elements.push(RenderElement { x: e.base.x, y: e.base.y, rotation: e.base.rotation, kind, photo });
                    }
                    // 圖形內文字緊接在圖形上方，z 軸順序和畫布相同（同一個 Group 裡文字畫在圖形之後）
                    if let Some(label) = shape_label(e, &request.text_layouts, &request.label_frames)? {
                        elements.push(label);
                    }
                    continue;
                }
                // 編輯器匯出前把線條換成路徑圖形（buildExportRequest），匯出請求裡不該有線條
                Element::Line(_) => return Err(AppError::invalid_input("匯出資料有誤：線條沒有先換成路徑")),
                Element::Image(e) => {
                    // 圖片檔被刪除時略過，和畫布顯示灰框一樣不讓整份匯出失敗
                    if !root.join(&e.src).is_file() {
                        skipped += 1;
                        continue;
                    }
                    (
                        &e.base,
                        RenderKind::Image(RenderImage { width: e.width, height: e.height, src: e.src.clone() }),
                    )
                }
            };
            elements.push(RenderElement { x: base.x, y: base.y, rotation: base.rotation, kind, photo: None });
        }
        pages.push(RenderPage {
            name: page.name.clone(),
            width: page.width,
            height: page.height,
            background: page.background.clone(),
            elements,
        });
    }
    Ok((RenderDocument { title: request.document.name.clone(), pages }, skipped))
}

#[cfg(test)]
mod tests;
