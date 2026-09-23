//! The render model: one document turned into positioned, drawable elements.
//!
//! Every output format builds this first, so coordinates, rotation, font mapping, the editor's
//! line breaks and the "missing image" rule are defined once instead of once per format.
//!
//! Coordinates keep the editor's definition: unit pt, origin at the page's top-left corner, y
//! pointing down, rotation clockwise around the element's anchor.

use super::{ExportRequest, TextLayout};
use crate::error::{AppError, AppResult};
use crate::project::format::{validate_content, Align, Element, FontStyle};
use std::collections::HashMap;
use std::f64::consts::PI;
use std::path::Path;

/// Same value as `TEXT_LINE_HEIGHT` in `src/lib/editor/geometry.ts`.
pub const TEXT_LINE_HEIGHT: f64 = 1.2;
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
    pub width: f64,
    pub height: f64,
    pub background: String,
    /// Bottom-most element first, as in `Page.elements`.
    pub elements: Vec<RenderElement>,
}

#[derive(Debug, Clone)]
pub struct RenderElement {
    pub x: f64,
    pub y: f64,
    /// Degrees, clockwise.
    pub rotation: f64,
    pub kind: RenderKind,
}

#[derive(Debug, Clone)]
pub enum RenderKind {
    Text(RenderText),
    Rect(RenderRect),
    Ellipse(RenderEllipse),
    /// Both `polygon` and `star`: a filled shape given by its vertices.
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

#[derive(Debug, Clone)]
pub struct RenderRect {
    pub width: f64,
    pub height: f64,
    pub corner_radius: f64,
    pub fill: String,
}

#[derive(Debug, Clone)]
pub struct RenderEllipse {
    pub rx: f64,
    pub ry: f64,
    pub fill: String,
}

#[derive(Debug, Clone)]
pub struct RenderPolygon {
    /// Half the bounding box, so the shape spans `2 * rx` × `2 * ry` around the anchor.
    pub rx: f64,
    pub ry: f64,
    /// Vertices relative to the centre.
    pub points: Vec<[f64; 2]>,
    pub fill: String,
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

/// Vertices relative to the centre, using Konva's formulas (first vertex points up).
fn regular_points(radii: &[f64], count: usize) -> Vec<[f64; 2]> {
    (0..count)
        .map(|n| {
            let radius = radii[n % radii.len()];
            let angle = n as f64 * 2.0 * PI / count as f64;
            [radius * angle.sin(), -radius * angle.cos()]
        })
        .collect()
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
                Element::Rect(e) => (
                    &e.base,
                    RenderKind::Rect(RenderRect {
                        width: e.width,
                        height: e.height,
                        corner_radius: e.corner_radius,
                        fill: e.fill.clone(),
                    }),
                ),
                Element::Ellipse(e) => (
                    &e.base,
                    RenderKind::Ellipse(RenderEllipse { rx: e.radius_x, ry: e.radius_y, fill: e.fill.clone() }),
                ),
                Element::Polygon(e) => (
                    &e.base,
                    RenderKind::Polygon(RenderPolygon {
                        rx: e.radius,
                        ry: e.radius,
                        points: regular_points(&[e.radius], e.sides.max(3) as usize),
                        fill: e.fill.clone(),
                    }),
                ),
                Element::Star(e) => (
                    &e.base,
                    RenderKind::Polygon(RenderPolygon {
                        rx: e.outer_radius,
                        ry: e.outer_radius,
                        points: regular_points(&[e.outer_radius, e.inner_radius], e.num_points.max(2) as usize * 2),
                        fill: e.fill.clone(),
                    }),
                ),
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
    fn regular_points_match_konva() {
        let triangle = regular_points(&[10.0], 3);
        assert!((triangle[0][0]).abs() < 1e-9 && (triangle[0][1] + 10.0).abs() < 1e-9, "first vertex points up");
        let star = regular_points(&[10.0, 4.0], 10);
        assert_eq!(star.len(), 10);
        assert!((star[1][0].hypot(star[1][1]) - 4.0).abs() < 1e-9, "odd vertices use the inner radius");
    }

    #[test]
    fn builds_every_element_type() {
        let root = project_with_image();
        let (document, skipped) = build_render(root.path(), &request(fixture_document())).unwrap();
        assert_eq!(skipped, 0);
        assert_eq!(document.title, "範例雜誌");
        assert_eq!(document.pages.len(), 1);
        // star 和 polygon 都變成 polygon；順序即 z 軸順序
        assert_eq!(kinds(&document), vec!["text", "rect", "ellipse", "polygon", "polygon", "image"]);
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
