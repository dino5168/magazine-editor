//! PDF export through an embedded Typst compiler.
//!
//! Text line breaks come from the editor (`TextLayout`, measured by Konva) so the PDF wraps
//! exactly like the canvas; Typst only positions and renders.

pub mod world;

use crate::error::{AppError, AppResult};
use crate::project::format::{validate_content, Align, Document, Element, FontStyle};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::f64::consts::PI;
use std::path::Path;
use typst::diag::Warned;
use typst::text::Font;
use typst_layout::PagedDocument;
use typst_pdf::PdfOptions;
use world::ExportWorld;

/// Same value as `TEXT_LINE_HEIGHT` in `src/lib/editor/geometry.ts`.
const TEXT_LINE_HEIGHT: f64 = 1.2;
const MAX_LINES_PER_TEXT: usize = 10_000;
const GENERIC_FAMILIES: &[&str] = &["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"];

/// How the editor laid out one text element.
#[derive(Debug, Clone, Deserialize)]
pub struct TextLayout {
    /// Lines exactly as Konva wrapped them.
    pub lines: Vec<String>,
    /// Distance (pt) from the element's top to the first line's baseline.
    pub baseline: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub document: Document,
    /// Keyed by text element id.
    pub text_layouts: HashMap<String, TextLayout>,
}

#[derive(Debug)]
pub struct ExportOutput {
    pub pdf: Vec<u8>,
    pub pages: usize,
    /// Images skipped because their file no longer exists in the project.
    pub skipped_images: usize,
}

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

/// Maps a CSS `font-family` list to the bundled Typst family names.
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

/// Builds the JSON the Typst template draws.
///
/// # Returns
/// The data and the number of images skipped because their file is missing.
fn build_data(root: &Path, request: &ExportRequest) -> AppResult<(Value, usize)> {
    let mut skipped = 0;
    let mut pages = Vec::with_capacity(request.document.pages.len());
    for page in &request.document.pages {
        let mut elements = Vec::with_capacity(page.elements.len());
        for element in &page.elements {
            let value = match element {
                Element::Text(e) => {
                    let layout = text_layout(&request.text_layouts, &e.base.id, &e.text, e.font_size)?;
                    let align = match e.align {
                        Align::Left => "left",
                        Align::Center => "center",
                        Align::Right => "right",
                    };
                    json!({
                        "kind": "text", "x": e.base.x, "y": e.base.y, "rotation": e.base.rotation,
                        "width": e.width, "size": e.font_size, "fonts": font_families(&e.font_family),
                        "bold": e.font_style == FontStyle::Bold, "align": align, "fill": e.fill,
                        "lines": layout.lines, "baseline": layout.baseline,
                        "lineHeight": e.font_size * TEXT_LINE_HEIGHT,
                    })
                }
                Element::Rect(e) => json!({
                    "kind": "rect", "x": e.base.x, "y": e.base.y, "rotation": e.base.rotation,
                    "width": e.width, "height": e.height, "radius": e.corner_radius, "fill": e.fill,
                }),
                Element::Ellipse(e) => json!({
                    "kind": "ellipse", "x": e.base.x, "y": e.base.y, "rotation": e.base.rotation,
                    "rx": e.radius_x, "ry": e.radius_y, "fill": e.fill,
                }),
                Element::Polygon(e) => json!({
                    "kind": "polygon", "x": e.base.x, "y": e.base.y, "rotation": e.base.rotation,
                    "rx": e.radius, "ry": e.radius, "fill": e.fill,
                    "points": regular_points(&[e.radius], e.sides.max(3) as usize),
                }),
                Element::Star(e) => json!({
                    "kind": "polygon", "x": e.base.x, "y": e.base.y, "rotation": e.base.rotation,
                    "rx": e.outer_radius, "ry": e.outer_radius, "fill": e.fill,
                    "points": regular_points(&[e.outer_radius, e.inner_radius], e.num_points.max(2) as usize * 2),
                }),
                Element::Image(e) => {
                    // 圖片檔被刪除時略過，和畫布顯示灰框一樣不讓整份匯出失敗
                    if !root.join(&e.src).is_file() {
                        skipped += 1;
                        continue;
                    }
                    json!({
                        "kind": "image", "x": e.base.x, "y": e.base.y, "rotation": e.base.rotation,
                        "width": e.width, "height": e.height, "src": e.src,
                    })
                }
            };
            elements.push(value);
        }
        pages.push(json!({
            "width": page.width, "height": page.height, "background": page.background, "elements": elements,
        }));
    }
    Ok((json!({ "title": request.document.name, "pages": pages }), skipped))
}

/// Renders the document to PDF bytes.
///
/// # Errors
/// `AppError::InvalidProject` for invalid content, `AppError::Export` when Typst fails.
pub fn render_pdf(root: &Path, request: &ExportRequest, fonts: Vec<Font>) -> AppResult<ExportOutput> {
    validate_content(&request.document, &[])?;
    let (data, skipped_images) = build_data(root, request)?;
    let world = ExportWorld::new(root, serde_json::to_vec(&data)?, fonts);
    let document = compile(&world)?;
    let pdf = typst_pdf::pdf(&document, &PdfOptions::default()).map_err(|errors| diagnostics(&errors))?;
    Ok(ExportOutput { pdf, pages: document.pages().len(), skipped_images })
}

fn compile(world: &ExportWorld) -> AppResult<PagedDocument> {
    let Warned { output, .. } = typst::compile::<PagedDocument>(world);
    output.map_err(|errors| diagnostics(&errors))
}

fn diagnostics(errors: &[typst::diag::SourceDiagnostic]) -> AppError {
    let messages: Vec<&str> = errors.iter().map(|error| error.message.as_str()).collect();
    AppError::Export(format!("PDF 排版失敗：{}", messages.join("；")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::format::{parse_project, ASSET_DIR};

    const FIXTURE: &str = include_str!("../../../tests/fixtures/sample.magproj");
    // 1×1 PNG
    const PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
        0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x30, 0x9E, 0x79, 0x06, 0x00, 0x02, 0x9B, 0x01, 0x99, 0xF1,
        0x32, 0x58, 0x2A, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    fn request(document: Document) -> ExportRequest {
        ExportRequest { document, text_layouts: HashMap::new() }
    }

    fn fixture_document() -> Document {
        parse_project(FIXTURE).unwrap().document
    }

    fn project_with_image() -> tempfile::TempDir {
        let root = tempfile::tempdir().unwrap();
        let src = &parse_project(FIXTURE).unwrap().assets[0].src;
        std::fs::create_dir_all(root.path().join(ASSET_DIR)).unwrap();
        std::fs::write(root.path().join(src), PNG).unwrap();
        root
    }

    fn fonts() -> Vec<Font> {
        world::load_fonts()
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
    fn bundled_fonts_cover_latin_and_chinese() {
        let families: Vec<String> = fonts().iter().map(|font| font.info().family.clone()).collect();
        for expected in ["Geist", "Noto Sans TC"] {
            assert!(families.iter().any(|family| family == expected), "missing {expected} in {families:?}");
        }
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
    fn renders_every_element_type_to_pdf() {
        let root = project_with_image();
        let output = render_pdf(root.path(), &request(fixture_document()), fonts()).unwrap();
        assert!(output.pdf.starts_with(b"%PDF-"));
        assert_eq!(output.pages, 1);
        assert_eq!(output.skipped_images, 0);
    }

    #[test]
    fn page_size_and_count_follow_the_document() {
        let mut document = fixture_document();
        let mut second = document.pages[0].clone();
        second.id = "page-2".into();
        second.width = 400.0;
        second.height = 300.0;
        second.elements.clear();
        document.pages.push(second);
        let root = project_with_image();
        let (data, _) = build_data(root.path(), &request(document.clone())).unwrap();
        let world = ExportWorld::new(root.path(), serde_json::to_vec(&data).unwrap(), fonts());
        let compiled = compile(&world).unwrap();
        let sizes: Vec<_> = compiled.pages().iter().map(|page| {
            let size = page.frame.size();
            (size.x.to_pt().round(), size.y.to_pt().round())
        }).collect();
        assert_eq!(sizes, vec![(595.0, 842.0), (400.0, 300.0)]);
    }

    #[test]
    fn missing_images_are_skipped_not_fatal() {
        let root = tempfile::tempdir().unwrap();
        let output = render_pdf(root.path(), &request(fixture_document()), fonts()).unwrap();
        assert_eq!(output.skipped_images, 1);
    }

    #[test]
    fn user_text_is_data_not_typst_code() {
        let mut document = fixture_document();
        let tricky = r#"#panic("boom") $x$ [a] \ "q" // c"#;
        if let Element::Text(text) = &mut document.pages[0].elements[0] {
            text.text = tricky.to_owned();
        }
        let mut req = request(document);
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![tricky.to_owned()], baseline: 30.0 });
        let root = project_with_image();
        assert!(render_pdf(root.path(), &req, fonts()).is_ok());
    }

    #[test]
    fn rejects_invalid_layout_data() {
        let mut req = request(fixture_document());
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![], baseline: f64::NAN });
        let root = project_with_image();
        assert!(matches!(render_pdf(root.path(), &req, fonts()), Err(AppError::InvalidInput(_))));
    }

    /// Writes PNG previews (2 px/pt) for visual comparison with the canvas. Renders the fixture, or
    /// an `ExportRequest` captured from the editor when `EXPORT_REQUEST_JSON` is set:
    /// `EXPORT_PREVIEW_DIR=<dir> [EXPORT_REQUEST_JSON=<file>] cargo test export_preview -- --ignored`
    #[test]
    #[ignore]
    fn export_preview() {
        let dir = std::env::var("EXPORT_PREVIEW_DIR").expect("set EXPORT_PREVIEW_DIR");
        let root = project_with_image();
        let req = match std::env::var("EXPORT_REQUEST_JSON") {
            Ok(path) => serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap(),
            Err(_) => request(fixture_document()),
        };
        let (data, _) = build_data(root.path(), &req).unwrap();
        let world = ExportWorld::new(root.path(), serde_json::to_vec(&data).unwrap(), fonts());
        let compiled = compile(&world).unwrap();
        for (index, page) in compiled.pages().iter().enumerate() {
            let pixmap = typst_render::render(page, &typst_render::RenderOptions { pixel_per_pt: 2.0.into(), ..Default::default() });
            pixmap.save_png(Path::new(&dir).join(format!("page-{}.png", index + 1))).unwrap();
        }
    }
}
