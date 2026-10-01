//! The render model: one document turned into positioned, drawable elements.
//!
//! Every output format builds this first, so coordinates, rotation, font mapping, the editor's
//! line breaks and the "missing image" rule are defined once instead of once per format.
//!
//! Coordinates keep the editor's definition: unit pt, origin at the page's top-left corner, y
//! pointing down, rotation clockwise around the element's anchor.

use super::{ExportRequest, TextLayout};
use crate::error::{AppError, AppResult};
use crate::project::format::{
    validate_content, Align, Element, FontStyle, ShapeElement, ShapeGeometry, Stroke, StrokeDash, VerticalAlign,
};
use crate::project::shape;
use std::collections::HashMap;
use std::path::Path;

/// Same value as `TEXT_LINE_HEIGHT` in `src/lib/editor/geometry.ts`.
pub const TEXT_LINE_HEIGHT: f64 = 1.2;
/// Inset between a shape's box and its text; same value as `LABEL_PADDING_PT` in
/// `src/lib/editor/shape-label.ts`.
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
}

#[derive(Debug, Clone)]
pub enum RenderKind {
    Text(RenderText),
    Rect(RenderRect),
    Ellipse(RenderEllipse),
    /// Both polygon and star shapes: a filled shape given by its vertices.
    Polygon(RenderPolygon),
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
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DashPattern {
    pub dash: f64,
    pub gap: f64,
    /// Round caps turn the zero-length dashes of a dotted line into dots.
    pub round_cap: bool,
}

/// Miter limit for every format (the canvas default); Typst and SVG default to 4.
pub const STROKE_MITER_LIMIT: f64 = 10.0;

/// Dash pattern of a stroke style at a given width.
pub fn dash_pattern(dash: StrokeDash, width: f64) -> Option<DashPattern> {
    match dash {
        StrokeDash::Solid => None,
        StrokeDash::Dashed => Some(DashPattern { dash: 3.0 * width, gap: 3.0 * width, round_cap: false }),
        StrokeDash::Dotted => Some(DashPattern { dash: 0.0, gap: 2.0 * width, round_cap: true }),
    }
}

fn render_stroke(stroke: &Option<Stroke>) -> Option<RenderStroke> {
    stroke.as_ref().map(|s| RenderStroke { color: s.color.clone(), width: s.width, dash: dash_pattern(s.dash, s.width) })
}

#[derive(Debug, Clone)]
pub struct RenderRect {
    pub width: f64,
    pub height: f64,
    pub corner_radius: f64,
    pub fill: String,
    pub stroke: Option<RenderStroke>,
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

fn shape_kind(shape: &ShapeElement) -> RenderKind {
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
    match &shape.geometry {
        ShapeGeometry::Rect { corner_radius } => RenderKind::Rect(RenderRect {
            width,
            height,
            corner_radius: *corner_radius,
            fill: fill.clone(),
            stroke: stroke.clone(),
        }),
        ShapeGeometry::Ellipse => RenderKind::Ellipse(RenderEllipse { width, height, fill: fill.clone(), stroke: stroke.clone() }),
        ShapeGeometry::Polygon { sides } => polygon(shape::polygon_unit_points(*sides)),
        ShapeGeometry::Star { num_points, inner_ratio } => polygon(shape::star_unit_points(*num_points, *inner_ratio)),
    }
}

fn text_layout(layouts: &HashMap<String, TextLayout>, id: &str, text: &str, size: f64) -> AppResult<TextLayout> {
    match layouts.get(id) {
        Some(layout) if layout.lines.len() > MAX_LINES_PER_TEXT || !layout.baseline.is_finite() => {
            Err(AppError::invalid_input("文字排版資料不正確"))
        }
        Some(layout) => Ok(layout.clone()),
        // 前端應該為每個文字物件都提供分行結果；缺少時退回以換行符號分行、估計基線
        None => Ok(TextLayout {
            lines: text.split('\n').map(str::to_owned).collect(),
            baseline: size * (TEXT_LINE_HEIGHT / 2.0 + 0.35),
        }),
    }
}

/// The text inside a shape as an ordinary text element, or `None` when the shape has no text.
///
/// Same layout as `src/lib/editor/shape-label.ts`: the shape's box inset by `LABEL_PADDING_PT`,
/// the text block placed by its vertical alignment (overflowing freely), all rotated with the shape.
fn shape_label(shape: &ShapeElement, layouts: &HashMap<String, TextLayout>) -> AppResult<Option<RenderElement>> {
    let Some(label) = shape.label.as_ref().filter(|label| !label.text.is_empty()) else { return Ok(None) };
    let layout = text_layout(layouts, &format!("{}#label", shape.base.id), &label.text, label.font_size)?;
    let line_height = label.font_size * TEXT_LINE_HEIGHT;
    let frame_width = (shape.width - 2.0 * LABEL_PADDING_PT).max(1.0);
    let frame_height = (shape.height - 2.0 * LABEL_PADDING_PT).max(0.0);
    let text_height = layout.lines.len() as f64 * line_height;
    let offset = match label.vertical_align {
        VerticalAlign::Top => 0.0,
        VerticalAlign::Middle => (frame_height - text_height) / 2.0,
        VerticalAlign::Bottom => frame_height - text_height,
    };
    // 文字左上角在圖形內的位置，隨圖形一起繞圖形的定位點旋轉
    let (local_x, local_y) = (LABEL_PADDING_PT, LABEL_PADDING_PT + offset);
    let (sin, cos) = shape.base.rotation.to_radians().sin_cos();
    Ok(Some(RenderElement {
        x: shape.base.x + local_x * cos - local_y * sin,
        y: shape.base.y + local_x * sin + local_y * cos,
        rotation: shape.base.rotation,
        kind: RenderKind::Text(RenderText {
            lines: layout.lines,
            baseline: layout.baseline,
            line_height,
            width: frame_width,
            size: label.font_size,
            fonts: font_families(&label.font_family),
            bold: label.font_style == FontStyle::Bold,
            align: label.align,
            fill: label.fill.clone(),
        }),
    }))
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
                    let layout = text_layout(&request.text_layouts, &e.base.id, &e.text, e.font_size)?;
                    let text = RenderText {
                        lines: layout.lines,
                        baseline: layout.baseline,
                        line_height: e.font_size * TEXT_LINE_HEIGHT,
                        width: e.width,
                        size: e.font_size,
                        fonts: font_families(&e.font_family),
                        bold: e.font_style == FontStyle::Bold,
                        align: e.align,
                        fill: e.fill.clone(),
                    };
                    (&e.base, RenderKind::Text(text))
                }
                Element::Shape(e) => {
                    elements.push(RenderElement { x: e.base.x, y: e.base.y, rotation: e.base.rotation, kind: shape_kind(e) });
                    // 圖形內文字緊接在圖形上方，z 軸順序和畫布相同（同一個 Group 裡文字畫在圖形之後）
                    if let Some(label) = shape_label(e, &request.text_layouts)? {
                        elements.push(label);
                    }
                    continue;
                }
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
            elements.push(RenderElement { x: base.x, y: base.y, rotation: base.rotation, kind });
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
mod tests {
    use super::*;
    use crate::export::test_support::{fixture_document, project_with_image, request};

    fn kinds(document: &RenderDocument) -> Vec<&'static str> {
        document.pages[0]
            .elements
            .iter()
            .map(|element| match element.kind {
                RenderKind::Text(_) => "text",
                RenderKind::Rect(_) => "rect",
                RenderKind::Ellipse(_) => "ellipse",
                RenderKind::Polygon(_) => "polygon",
                RenderKind::Image(_) => "image",
            })
            .collect()
    }

    #[test]
    fn maps_css_font_families() {
        assert_eq!(font_families(r#""Geist", "Noto Sans TC", sans-serif"#), vec!["Geist", "Noto Sans TC"]);
        // 內嵌字型之前存檔的專案：兩個舊名稱都要對應到內嵌的字型
        assert_eq!(
            font_families(r#""Geist Variable", "Microsoft JhengHei", sans-serif"#),
            vec!["Geist", "Noto Sans TC"]
        );
        assert!(font_families("sans-serif").is_empty());
    }

    #[test]
    fn builds_every_element_type() {
        let root = project_with_image();
        let (document, skipped) = build_render(root.path(), &request(fixture_document())).unwrap();
        assert_eq!(skipped, 0);
        assert_eq!(document.title, "範例雜誌");
        assert_eq!(document.pages.len(), 1);
        // star 和 polygon 都變成 polygon；橢圓的圖形內文字緊接在橢圓之後；順序即 z 軸順序
        assert_eq!(kinds(&document), vec!["text", "rect", "ellipse", "text", "polygon", "polygon", "image"]);
    }

    fn label_of(document: &RenderDocument) -> (&RenderElement, &RenderText) {
        let element = &document.pages[0].elements[3];
        let RenderKind::Text(text) = &element.kind else { panic!("expected the ellipse's label") };
        (element, text)
    }

    #[test]
    fn shape_labels_are_placed_in_the_inset_box() {
        // fixture 的橢圓：外框 (120, 440) 120 × 80，文字 14 pt、置中、垂直置中
        let root = project_with_image();
        let mut req = request(fixture_document());
        req.text_layouts.insert("el-ellipse#label".into(), TextLayout { lines: vec!["圖形內".into(), "文字".into()], baseline: 12.0 });
        let (document, _) = build_render(root.path(), &req).unwrap();
        let (element, text) = label_of(&document);
        assert_eq!(text.lines, vec!["圖形內", "文字"], "uses the editor's line breaks");
        assert_eq!((text.width, text.size, text.baseline), (112.0, 14.0, 12.0));
        assert_eq!(element.x, 124.0);
        // 框高 72，兩行共 2 × 14 × 1.2 = 33.6，上下各留 19.2
        assert!((element.y - (444.0 + 19.2)).abs() < 1e-9, "{}", element.y);
    }

    #[test]
    fn shape_labels_rotate_with_the_shape_and_skip_empty_text() {
        let mut document = fixture_document();
        let Element::Shape(ellipse) = &mut document.pages[0].elements[2] else { panic!("expected the ellipse") };
        ellipse.base.rotation = 90.0;
        let label = ellipse.label.as_mut().unwrap();
        label.vertical_align = VerticalAlign::Top;
        let root = project_with_image();
        let (rendered, _) = build_render(root.path(), &request(document.clone())).unwrap();
        let (element, _) = label_of(&rendered);
        // 局部 (4, 4) 順時針轉 90° → (−4, 4)
        assert!((element.x - 116.0).abs() < 1e-9 && (element.y - 444.0).abs() < 1e-9, "{:?}", (element.x, element.y));
        assert_eq!(element.rotation, 90.0);

        let Element::Shape(ellipse) = &mut document.pages[0].elements[2] else { unreachable!() };
        ellipse.label.as_mut().unwrap().text.clear();
        let (rendered, _) = build_render(root.path(), &request(document)).unwrap();
        assert_eq!(rendered.pages[0].elements.len(), 6, "empty label draws nothing");
    }

    #[test]
    fn shapes_carry_their_stroke() {
        let root = project_with_image();
        let (document, _) = build_render(root.path(), &request(fixture_document())).unwrap();
        let strokes: Vec<_> = document.pages[0]
            .elements
            .iter()
            .filter_map(|element| match &element.kind {
                RenderKind::Rect(r) => Some(r.stroke.clone()),
                RenderKind::Ellipse(e) => Some(e.stroke.clone()),
                RenderKind::Polygon(p) => Some(p.stroke.clone()),
                _ => None,
            })
            .collect();
        // fixture：只有橢圓有邊框（#be123c、2 pt、虛線）
        let expected = RenderStroke {
            color: "#be123c".into(),
            width: 2.0,
            dash: Some(DashPattern { dash: 6.0, gap: 6.0, round_cap: false }),
        };
        assert_eq!(strokes, vec![None, Some(expected), None, None]);
    }

    #[test]
    fn dash_patterns_scale_with_the_width() {
        assert_eq!(dash_pattern(StrokeDash::Solid, 2.0), None);
        assert_eq!(dash_pattern(StrokeDash::Dashed, 2.0), Some(DashPattern { dash: 6.0, gap: 6.0, round_cap: false }));
        assert_eq!(dash_pattern(StrokeDash::Dotted, 2.0), Some(DashPattern { dash: 0.0, gap: 4.0, round_cap: true }));
    }

    #[test]
    fn missing_images_are_skipped_not_fatal() {
        let root = tempfile::tempdir().unwrap();
        let (document, skipped) = build_render(root.path(), &request(fixture_document())).unwrap();
        assert_eq!(skipped, 1);
        assert!(!kinds(&document).contains(&"image"));
    }

    #[test]
    fn text_falls_back_when_the_frontend_sends_no_layout() {
        let root = project_with_image();
        let (document, _) = build_render(root.path(), &request(fixture_document())).unwrap();
        let RenderKind::Text(text) = &document.pages[0].elements[0].kind else { panic!("expected text") };
        assert_eq!(text.line_height, text.size * TEXT_LINE_HEIGHT);
        assert!(text.baseline > 0.0);
        // 沒有 layout 時以 \n 分行
        assert_eq!(text.lines, vec!["雜誌標題", "副標"]);
    }

    #[test]
    fn rejects_invalid_layout_data() {
        let mut req = request(fixture_document());
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![], baseline: f64::NAN });
        let root = project_with_image();
        assert!(matches!(build_render(root.path(), &req), Err(AppError::InvalidInput(_))));
    }
}
