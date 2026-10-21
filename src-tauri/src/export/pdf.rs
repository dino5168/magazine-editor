//! PDF output: the render model drawn by the embedded Typst compiler.
//!
//! Typst only positions and renders. Line breaks already come from the editor (see
//! [`super::render`]), so the PDF wraps exactly like the canvas.

use super::document_fonts;
use super::fonts::typst_family;
use super::render::{
    self, build_render, rounded_rect_path, DecorationKind, PathSegment, RenderDocument, RenderElement, RenderKind,
    RenderStroke, STROKE_MITER_LIMIT, SYNTHETIC_ITALIC_SLANT,
};
use super::world::{file_id, ExportWorld};
use super::{ExportOutput, ExportRequest};
use crate::error::{AppError, AppResult};
use crate::project::format::Align;
use comemo::Track;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use typst::diag::Warned;
use typst::text::Font;
use typst::visualize::SvgImage;
use typst::World;
use typst_layout::PagedDocument;
use typst_pdf::PdfOptions;

/// Typst family names that text inside an SVG falls back to when its own font is not bundled (the
/// app's default 黑體). Without them Typst draws no text at all; the canvas uses the system font, so
/// the glyphs may still differ.
const SVG_FALLBACK_FONTS: [&str; 2] = ["Geist", "Noto Sans TC"];

fn align_name(align: Align) -> &'static str {
    match align {
        Align::Left => "left",
        Align::Center => "center",
        Align::Right => "right",
        // 每一行的起點與字距由 render model 算好（line_starts、line_gaps），靠左放
        Align::Distributed => "left",
    }
}

/// `null` or the stroke dictionary `template.typ` turns into a Typst stroke.
fn stroke_data(stroke: &Option<RenderStroke>) -> Value {
    match stroke {
        None => Value::Null,
        Some(s) => json!({
            "color": s.color,
            "width": s.width,
            "dash": s.dash.as_ref().map(|d| d.segments.clone()),
            "cap": if s.dash.as_ref().is_some_and(|d| d.round_cap) { "round" } else { "butt" },
            "miterLimit": STROKE_MITER_LIMIT,
        }),
    }
}

/// One path segment for `template.typ`: `["m", x, y]`, `["l", x, y]`, `["c", x1, y1, x2, y2, x, y]`
/// or `["z"]`.
fn seg(kind: &str, coords: &[f64]) -> Value {
    let mut items = vec![Value::from(kind)];
    items.extend(coords.iter().map(|&c| Value::from(c)));
    Value::Array(items)
}

/// A path as `template.typ` path segments.
fn path_segments(path: &[PathSegment]) -> Vec<Value> {
    path.iter()
        .map(|segment| match *segment {
            PathSegment::Move(x, y) => seg("m", &[x, y]),
            PathSegment::Line(x, y) => seg("l", &[x, y]),
            PathSegment::Cubic(x1, y1, x2, y2, x, y) => seg("c", &[x1, y1, x2, y2, x, y]),
            PathSegment::Close => seg("z", &[]),
        })
        .collect()
}

/// Rounded-rectangle outline (`render::rounded_rect_path`) as `template.typ` path segments.
///
/// 虛線的位置由路徑起點與方向決定；Typst 內建的 rect 起點不同，有邊框時改畫這條路徑，
/// 虛線才會和畫布、EPUB 落在同樣的位置。
fn rect_path(w: f64, h: f64, radii: [f64; 4]) -> Vec<Value> {
    path_segments(&rounded_rect_path(w, h, radii))
}

/// Ellipse outline (`render::ellipse_path`) as `template.typ` path segments.
fn ellipse_path(w: f64, h: f64) -> Vec<Value> {
    path_segments(&render::ellipse_path(w, h))
}

fn element_data(element: &RenderElement) -> Value {
    let mut data = kind_data(element);
    // 圖片框的照片：模板先畫填色、再畫裁在外形裡的照片（tiling）、最後畫邊框
    if let Some(photo) = &element.photo {
        data["photo"] = json!({ "src": photo.src, "x": photo.x, "y": photo.y, "width": photo.width, "height": photo.height });
    }
    data
}

fn kind_data(element: &RenderElement) -> Value {
    let (x, y, rotation) = (element.x, element.y, element.rotation);
    match &element.kind {
        RenderKind::Rect(e) if e.stroke.is_some() => json!({
            "kind": "path", "x": x, "y": y, "rotation": rotation, "width": e.width, "height": e.height,
            "fill": e.fill, "stroke": stroke_data(&e.stroke), "segments": rect_path(e.width, e.height, e.corner_radii),
        }),
        RenderKind::Ellipse(e) if e.stroke.is_some() => json!({
            "kind": "path", "x": x, "y": y, "rotation": rotation, "width": e.width, "height": e.height,
            "fill": e.fill, "stroke": stroke_data(&e.stroke), "segments": ellipse_path(e.width, e.height),
        }),
        RenderKind::Text(e) => json!({
            "kind": "text", "x": x, "y": y, "rotation": rotation,
            "width": e.width, "size": e.size,
            "fonts": e.fonts.iter().map(|font| typst_family(font)).collect::<Vec<_>>(),
            "bold": e.bold, "align": align_name(e.align), "fill": e.fill,
            "lines": e.lines, "baseline": e.baseline, "lineHeight": e.line_height,
            "slant": if e.italic { SYNTHETIC_ITALIC_SLANT } else { 0.0 },
            "decorations": e.decorations.iter().map(|d| json!({
                "line": d.line,
                "kind": match d.kind { DecorationKind::Underline => "underline", DecorationKind::Strikethrough => "strikethrough" },
                "x": d.x, "y": d.y, "length": d.length,
            })).collect::<Vec<_>>(),
            "decorationThickness": e.decoration_thickness,
            "shadow": e.shadow.as_ref().map(|s| json!({ "color": s.color, "dx": s.dx, "dy": s.dy, "wholeBlock": s.whole_block })),
            "letterSpacing": e.letter_spacing, "lineStarts": e.line_starts, "lineGaps": e.line_gaps,
        }),
        RenderKind::Rect(e) => json!({
            "kind": "rect", "x": x, "y": y, "rotation": rotation,
            "width": e.width, "height": e.height, "radii": e.corner_radii, "fill": e.fill,
            "stroke": stroke_data(&e.stroke),
        }),
        RenderKind::Ellipse(e) => json!({
            "kind": "ellipse", "x": x, "y": y, "rotation": rotation,
            "width": e.width, "height": e.height, "fill": e.fill, "stroke": stroke_data(&e.stroke),
        }),
        RenderKind::Polygon(e) => json!({
            "kind": "polygon", "x": x, "y": y, "rotation": rotation,
            "width": e.width, "height": e.height, "fill": e.fill, "points": e.points,
            "stroke": stroke_data(&e.stroke),
        }),
        RenderKind::Path(e) => json!({
            "kind": "path", "x": x, "y": y, "rotation": rotation, "width": e.width, "height": e.height,
            "fill": e.fill, "stroke": stroke_data(&e.stroke), "segments": path_segments(&e.outline),
            "details": path_segments(&e.details), "detailStroke": stroke_data(&e.detail_stroke),
        }),
        RenderKind::Image(e) => json!({
            "kind": "image", "x": x, "y": y, "rotation": rotation,
            "width": e.width, "height": e.height, "src": e.src,
        }),
    }
}

/// Builds the JSON that `template.typ` draws.
fn to_data(document: &RenderDocument) -> Value {
    let pages: Vec<Value> = document
        .pages
        .iter()
        .map(|page| {
            let elements: Vec<Value> = page.elements.iter().map(element_data).collect();
            json!({ "width": page.width, "height": page.height, "background": page.background, "elements": elements })
        })
        .collect();
    json!({ "title": document.title, "svgFonts": SVG_FALLBACK_FONTS, "pages": pages })
}

/// Whether Typst can draw an SVG: decoded the way `image()` in the template does it (same
/// function, fonts and sandboxed world), so linked images outside `assets/images/` count as errors.
fn svg_is_drawable(world: &ExportWorld, src: &str) -> bool {
    let id = file_id(src);
    let Ok(data) = world.file(id) else {
        return false;
    };
    let world: &dyn World = world;
    SvgImage::with_fonts_images(data, world.track(), &SVG_FALLBACK_FONTS, Some(id)).is_ok()
}

/// Removes the SVG images Typst cannot draw (broken XML, zero size, links to absolute paths or
/// files outside the project...). One of them would fail the whole export; like a missing image
/// file, it is skipped instead.
///
/// # Returns
/// How many image elements were removed.
fn drop_undrawable_svgs(root: &Path, document: &mut RenderDocument, fonts: &[Font]) -> usize {
    let is_svg = |element: &RenderElement| matches!(&element.kind, RenderKind::Image(image) if image.src.ends_with(".svg"));
    let has_svg_photo = |element: &RenderElement| element.photo.as_ref().is_some_and(|photo| photo.src.ends_with(".svg"));
    if !document.pages.iter().flat_map(|page| &page.elements).any(|element| is_svg(element) || has_svg_photo(element)) {
        return 0;
    }
    // 只讀 assets/images，data.json 用不到
    let world = ExportWorld::new(root, Vec::new(), fonts.to_vec(), &[]);
    let mut drawable: HashMap<String, bool> = HashMap::new();
    let mut skipped = 0;
    for page in &mut document.pages {
        // 圖片框的 SVG 照片讀不了時拿掉照片、保留圖形（同一個檢查）
        for element in &mut page.elements {
            let Some(photo) = &element.photo else { continue };
            if !photo.src.ends_with(".svg") {
                continue;
            }
            let keep = *drawable.entry(photo.src.clone()).or_insert_with(|| svg_is_drawable(&world, &photo.src));
            if !keep {
                element.photo = None;
                skipped += 1;
            }
        }
        page.elements.retain(|element| {
            let RenderKind::Image(image) = &element.kind else {
                return true;
            };
            if !is_svg(element) {
                return true;
            }
            let keep = *drawable.entry(image.src.clone()).or_insert_with(|| svg_is_drawable(&world, &image.src));
            skipped += usize::from(!keep);
            keep
        });
    }
    skipped
}

/// The document laid out by Typst, before it becomes a file: PDF writes it, PowerPoint draws each
/// page as a picture.
pub struct CompiledDocument {
    /// What was laid out; images that could not be drawn are already removed.
    pub render: RenderDocument,
    /// One Typst page per `render.pages` entry, same order.
    pub pages: PagedDocument,
    pub skipped_images: usize,
}

/// Lays out the document with Typst.
///
/// # Errors
/// `AppError::InvalidProject` for invalid content, `AppError::Export` when Typst fails.
pub fn compile_document(root: &Path, request: &ExportRequest, fonts: Vec<Font>) -> AppResult<CompiledDocument> {
    let (mut render, missing_images) = build_render(root, request)?;
    let skipped_images = missing_images + drop_undrawable_svgs(root, &mut render, &fonts);
    let project_fonts = document_fonts::load(root, &request.document.fonts, &render);
    let world = ExportWorld::new(root, serde_json::to_vec(&to_data(&render))?, fonts, &project_fonts);
    let pages = compile(&world)?;
    Ok(CompiledDocument { render, pages, skipped_images })
}

/// Renders the document to PDF bytes.
///
/// # Errors
/// `AppError::InvalidProject` for invalid content, `AppError::Export` when Typst fails.
pub fn render_pdf(root: &Path, request: &ExportRequest, fonts: Vec<Font>) -> AppResult<ExportOutput> {
    let compiled = compile_document(root, request, fonts)?;
    let pdf = typst_pdf::pdf(&compiled.pages, &PdfOptions::default()).map_err(|errors| diagnostics(&errors))?;
    Ok(ExportOutput { bytes: pdf, pages: compiled.pages.pages().len(), skipped_images: compiled.skipped_images })
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
    use crate::export::test_support::{fixture_document, fonts, project_with_image, request};

    #[test]
    fn image_frames_draw_their_photo_inside_the_outline() {
        let (root, req) = crate::export::test_support::photo_frame_request();
        let (document, _) = build_render(root.path(), &req).unwrap();
        let project = document_fonts::load(root.path(), &req.document.fonts, &document);
        let world = ExportWorld::new(root.path(), serde_json::to_vec(&to_data(&document)).unwrap(), fonts(), &project);
        let compiled = compile(&world).unwrap();
        let pixmap =
            typst_render::render(&compiled.pages()[0], &typst_render::RenderOptions { pixel_per_pt: 2.0.into(), ..Default::default() });
        // 橢圓在 (120, 440)，120 × 80；照片畫在 (0, -5) 120 × 90 → 一個照片像素 = 0.6 pt
        let at = |x: f64, y: f64| {
            let p = pixmap.pixel(((120.0 + x) * 2.0) as u32, ((440.0 + y) * 2.0) as u32).unwrap();
            (p.red(), p.green(), p.blue())
        };
        assert_eq!(at(35.0, 25.0), (255, 0, 0), "top-left quadrant");
        assert_eq!(at(85.0, 25.0), (0, 200, 0), "top-right quadrant");
        assert_eq!(at(35.0, 55.0), (0, 0, 255), "bottom-left quadrant");
        assert_eq!(at(85.0, 55.0), (255, 220, 0), "bottom-right quadrant");
        // 橢圓外（外框的角落）沒有照片
        assert_ne!(at(3.0, 3.0), (255, 0, 0));
        // 照片只嵌入一次、是原圖
        let pdf = typst_pdf::pdf(&compiled, &PdfOptions::default()).unwrap();
        let text = String::from_utf8_lossy(&pdf);
        assert!(text.contains("/Width 200") && text.contains("/Height 150"), "the photo keeps its pixels");
    }
    use crate::export::TextLayout;
    use crate::project::format::{CornerRadius, Element, ShapeGeometry, Stroke, StrokeDash, TextDecoration, TextShadow};

    fn compiled_pages(root: &Path, request: &ExportRequest) -> PagedDocument {
        let (document, _) = build_render(root, request).unwrap();
        let project = document_fonts::load(root, &request.document.fonts, &document);
        let world = ExportWorld::new(root, serde_json::to_vec(&to_data(&document)).unwrap(), fonts(), &project);
        compile(&world).unwrap()
    }

    /// Each run of text on the page and the font file it uses: the family inside the file and its weight.
    fn text_runs(frame: &typst::layout::Frame, out: &mut Vec<(String, String, u16)>) {
        for (_, item) in frame.items() {
            match item {
                typst::layout::FrameItem::Group(group) => text_runs(&group.frame, out),
                typst::layout::FrameItem::Text(text) => {
                    let info = text.font.font().info();
                    out.push((text.text.to_string(), info.family.clone(), info.variant.weight.to_number()));
                }
                _ => {}
            }
        }
    }

    fn runs_of(root: &Path, document: crate::project::format::Document) -> Vec<(String, String, u16)> {
        let compiled = compiled_pages(root, &request(document));
        let mut runs = Vec::new();
        text_runs(&compiled.pages()[0].frame, &mut runs);
        runs
    }

    /// The first text is "Ab 中" in a project font (`document_with_project_font`); with letter spacing
    /// every character is its own run.
    fn font_of(runs: &[(String, String, u16)], needle: &str) -> (String, u16) {
        let (_, family, weight) = runs.iter().find(|(text, _, _)| text.contains(needle)).unwrap_or_else(|| panic!("{needle} in {runs:?}"));
        (family.clone(), *weight)
    }

    #[test]
    fn project_fonts_draw_with_their_own_files() {
        use crate::export::test_support::{document_with_project_font, write_project_fonts};
        let run = |id: &str, bold: bool| {
            let root = project_with_image();
            let document = document_with_project_font(id, bold);
            write_project_fonts(root.path(), &document);
            runs_of(root.path(), document)
        };
        // 「標題黑體」的檔案是 Noto Serif TC（故意和名稱不同）：英文、中文都用它，粗體用它的粗體檔
        let display = run("font-display", false);
        assert_eq!(font_of(&display, "A"), ("Noto Serif TC".to_owned(), 400));
        assert_eq!(font_of(&display, "中"), ("Noto Serif TC".to_owned(), 400));
        assert_eq!(font_of(&run("font-display", true), "A"), ("Noto Serif TC".to_owned(), 700));
        // 「書名明體」= Geist、沒有粗體檔：粗體也用一般檔（不模擬加粗）；Geist 沒有中文，接後面的內建黑體
        let book = run("font-book", true);
        assert_eq!(font_of(&book, "A"), ("Geist".to_owned(), 400));
        assert_eq!(font_of(&book, "中"), ("Noto Sans TC".to_owned(), 700));
    }

    #[test]
    fn a_missing_project_font_file_falls_back_instead_of_failing() {
        use crate::export::test_support::document_with_project_font;
        let root = project_with_image();
        let document = document_with_project_font("font-book", false);
        assert!(render_pdf(root.path(), &request(document.clone()), fonts()).is_ok());
        assert_eq!(font_of(&runs_of(root.path(), document), "A"), ("Noto Sans TC".to_owned(), 400));
    }

    #[test]
    fn bundled_fonts_cover_latin_and_chinese() {
        let families: Vec<String> = fonts().iter().map(|font| font.info().family.clone()).collect();
        for expected in ["Geist", "Noto Sans TC"] {
            assert!(families.iter().any(|family| family == expected), "missing {expected} in {families:?}");
        }
    }

    #[test]
    fn renders_every_element_type_to_pdf() {
        let root = project_with_image();
        let output = render_pdf(root.path(), &request(fixture_document()), fonts()).unwrap();
        assert!(output.bytes.starts_with(b"%PDF-"));
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
        let compiled = compiled_pages(root.path(), &request(document));
        let sizes: Vec<_> = compiled
            .pages()
            .iter()
            .map(|page| {
                let size = page.frame.size();
                (size.x.to_pt().round(), size.y.to_pt().round())
            })
            .collect();
        assert_eq!(sizes, vec![(595.0, 842.0), (400.0, 300.0)]);
    }

    #[test]
    fn missing_images_are_skipped_not_fatal() {
        let root = tempfile::tempdir().unwrap();
        let output = render_pdf(root.path(), &request(fixture_document()), fonts()).unwrap();
        assert_eq!(output.skipped_images, 1);
    }

    const SVG_NS: &str = r#"xmlns="http://www.w3.org/2000/svg""#;

    /// A white page with one 200 × 100 pt image element per SVG (stacked downwards from (50, 50)),
    /// the SVG files written into a project folder.
    fn svg_page(svgs: &[String]) -> (tempfile::TempDir, ExportRequest) {
        let root = project_with_image();
        let mut document = fixture_document();
        let page = &mut document.pages[0];
        page.background = "#ffffff".into();
        page.elements.retain(|e| matches!(e, Element::Image(_)));
        let template = page.elements.pop().unwrap();
        for (index, svg) in svgs.iter().enumerate() {
            let src = format!("assets/images/svg-{index}.svg");
            std::fs::write(root.path().join(&src), svg).unwrap();
            let mut element = template.clone();
            let Element::Image(image) = &mut element else { unreachable!() };
            image.src = src;
            (image.base.x, image.base.y, image.width, image.height) = (50.0, 50.0 + 120.0 * index as f64, 200.0, 100.0);
            page.elements.push(element);
        }
        (root, request(document))
    }

    #[test]
    fn svg_images_typst_cannot_draw_are_skipped_not_fatal() {
        let good = format!(r#"<svg {SVG_NS} width="2" height="1"><rect width="2" height="1" fill="red"/></svg>"#);
        let svgs = [
            good.clone(),
            // 實測（計畫 16 步驟 1）每一個都會讓整份 Typst 排版失敗
            format!(r#"<svg {SVG_NS} width="0" height="0"><rect width="1" height="1"/></svg>"#),
            format!(r#"<svg {SVG_NS} width="2" height="1"><image href="file:///C:/Windows/a.jpg" width="2" height="1"/></svg>"#),
            format!(r#"<svg {SVG_NS} width="2" height="1"><image href="../../secret.png" width="2" height="1"/></svg>"#),
            format!(r#"<svg {SVG_NS} width="2" height="1"><rect"#),
            // 同一張壞圖用兩次：兩個物件都略過
            format!(r#"<svg {SVG_NS} width="0" height="0"><rect width="1" height="1"/></svg>"#),
        ];
        let (root, req) = svg_page(&svgs);
        let output = render_pdf(root.path(), &req, fonts()).unwrap();
        assert_eq!(output.skipped_images, 5);
        // 能畫的那張照常畫出來
        let (mut document, _) = build_render(root.path(), &req).unwrap();
        assert_eq!(drop_undrawable_svgs(root.path(), &mut document, &fonts()), 5);
        assert_eq!(document.pages[0].elements.len(), 1);
    }

    #[test]
    fn bundled_sample_photos_are_svg_typst_can_draw() {
        // 「素材」面板「內建範例」的相片（src/lib/library/bundled-photos.ts）：放到頁面時經 library_import 存進專案，匯出時不能被略過
        let photos = ["abstract", "city", "desert", "forest", "mountain", "ocean"].map(|name| {
            std::fs::read_to_string(format!("{}/../src/assets/photos/photo-{name}.svg", env!("CARGO_MANIFEST_DIR"))).unwrap()
        });
        for photo in &photos {
            assert_eq!(crate::project::assets::detect_extension(photo.as_bytes()), Some("svg"));
        }
        let (root, req) = svg_page(&photos);
        assert_eq!(render_pdf(root.path(), &req, fonts()).unwrap().skipped_images, 0);
    }

    #[test]
    fn svg_images_are_drawn_and_their_text_falls_back_to_the_default_font() {
        let svgs = [
            format!(r#"<svg {SVG_NS} viewBox="0 0 2 1"><rect width="2" height="1" fill="red"/></svg>"#),
            // Arial 沒有內嵌：沒有退回字型時 Typst 一個字都不畫
            format!(r#"<svg {SVG_NS} width="200" height="100"><text x="10" y="70" font-family="Arial" font-size="60">Ab 中</text></svg>"#),
        ];
        let (root, req) = svg_page(&svgs);
        let compiled = compiled_pages(root.path(), &req);
        let pixmap =
            typst_render::render(&compiled.pages()[0], &typst_render::RenderOptions { pixel_per_pt: 1.0.into(), ..Default::default() });
        let at = |x: u32, y: u32| pixmap.pixel(x, y).map(|p| (p.red(), p.green(), p.blue())).unwrap();
        // 第一張填滿 200 × 100 的外框
        assert_eq!(at(60, 60), (255, 0, 0));
        assert_eq!(at(240, 140), (255, 0, 0));
        // 第二張的文字有畫出來（黑色像素）
        let dark = (170..270).flat_map(|y| (50..250).map(move |x| (x, y))).filter(|&(x, y)| at(x, y).0 < 100).count();
        assert!(dark > 300, "text pixels: {dark}");
    }

    #[test]
    fn user_text_is_data_not_typst_code() {
        let mut document = fixture_document();
        let tricky = r#"#panic("boom") $x$ [a] \ "q" // c"#;
        if let Element::Text(text) = &mut document.pages[0].elements[0] {
            text.text = tricky.to_owned();
        }
        let mut req = request(document);
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![tricky.to_owned()], baseline: 30.0, line_widths: vec![], line_gaps: vec![], line_boxes: vec![] });
        let root = project_with_image();
        assert!(render_pdf(root.path(), &req, fonts()).is_ok());
    }

    #[test]
    fn renders_letter_spaced_lines_at_their_starts() {
        // fixture 的文字有字距（−20‰）：帶行寬時每行靠左放在 lineStarts，也要排得出來
        let mut req = request(fixture_document());
        req.text_layouts.insert(
            "el-text".into(),
            TextLayout { lines: vec!["雜誌標題".into(), "副標".into()], baseline: 30.0, line_widths: vec![141.1, 70.6], line_gaps: vec![], line_boxes: vec![] },
        );
        let root = project_with_image();
        assert!(render_pdf(root.path(), &req, fonts()).is_ok());
        let data = to_data(&build_render(root.path(), &req).unwrap().0);
        let text = &data["pages"][0]["elements"][0];
        assert_eq!(text["letterSpacing"], serde_json::json!(-0.72));
        assert_eq!(text["lineStarts"], serde_json::json!([(420.0 - 141.1) / 2.0, (420.0 - 70.6) / 2.0]));
    }

    #[test]
    fn rejects_invalid_layout_data() {
        let mut req = request(fixture_document());
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![], baseline: f64::NAN, line_widths: vec![], line_gaps: vec![], line_boxes: vec![] });
        let root = project_with_image();
        assert!(matches!(render_pdf(root.path(), &req, fonts()), Err(AppError::InvalidInput(_))));
    }

    /// A lone unrotated rectangle at (100, 100), 200 × 100 pt, on a white page.
    fn single_rect(fill: &str) -> crate::project::format::Document {
        let mut document = fixture_document();
        let page = &mut document.pages[0];
        page.background = "#ffffff".into();
        page.elements.retain(|e| matches!(e, Element::Shape(s) if matches!(s.geometry, ShapeGeometry::Rect { .. })));
        let Element::Shape(rect) = &mut page.elements[0] else { unreachable!() };
        (rect.base.x, rect.base.y, rect.base.rotation) = (100.0, 100.0, 0.0);
        (rect.width, rect.height) = (200.0, 100.0);
        rect.geometry = ShapeGeometry::Rect { corner_radius: CornerRadius::Uniform(0.0) };
        rect.fill = fill.into();
        document
    }

    /// RGB pixels of a page rendered at 1 px/pt.
    struct Raster {
        width: u32,
        pixels: Vec<[u8; 3]>,
    }

    /// The page rendered at 1 px/pt.
    fn render_page(document: crate::project::format::Document) -> Raster {
        render_request(&request(document))
    }

    fn render_request(req: &ExportRequest) -> Raster {
        let root = project_with_image();
        let compiled = compiled_pages(root.path(), req);
        let pixmap =
            typst_render::render(&compiled.pages()[0], &typst_render::RenderOptions { pixel_per_pt: 1.0.into(), ..Default::default() });
        let pixels = pixmap
            .pixels()
            .iter()
            .map(|pixel| {
                // 白底不透明，premultiplied 的值就是實際顏色
                assert_eq!(pixel.alpha(), 255);
                [pixel.red(), pixel.green(), pixel.blue()]
            })
            .collect();
        Raster { width: pixmap.width(), pixels }
    }

    fn rgb_at(raster: &Raster, x: u32, y: u32) -> [u8; 3] {
        raster.pixels[(y * raster.width + x) as usize]
    }

    /// RGB of the pixel at the rectangle's centre, rendered at 1 px/pt.
    fn centre_pixel(fill: &str) -> [u8; 3] {
        rgb_at(&render_page(single_rect(fill)), 200, 150)
    }

    /// The single rectangle with a black stroke of the given width and style.
    fn stroked_rect(width: f64, dash: StrokeDash) -> crate::project::format::Document {
        let mut document = single_rect("#ffffff");
        let Element::Shape(rect) = &mut document.pages[0].elements[0] else { unreachable!() };
        rect.stroke = Some(Stroke { color: "#000000".into(), swatch_id: None, width, dash });
        document
    }

    const BLACK: [u8; 3] = [0, 0, 0];
    const WHITE: [u8; 3] = [255, 255, 255];

    #[test]
    fn each_corner_is_rounded_on_its_own() {
        // 200 × 100 的紅色矩形在 (100, 100)；只有左上（40）與右下（20）是圓角
        let corners = |stroke: Option<Stroke>| {
            let mut document = single_rect("#ff0000");
            let Element::Shape(rect) = &mut document.pages[0].elements[0] else { unreachable!() };
            rect.geometry = ShapeGeometry::Rect { corner_radius: CornerRadius::Corners([40.0, 0.0, 20.0, 0.0]) };
            rect.stroke = stroke;
            let raster = render_request(&request(document));
            // 每個角往內 3 pt 的點：圓角處是頁面的白色，直角處是填色
            [(103, 103), (296, 103), (296, 196), (103, 196)].map(|(x, y)| rgb_at(&raster, x, y) == WHITE)
        };
        // 沒有邊框（Typst rect 的 radius 字典）與有邊框（自己畫的路徑）都一樣
        assert_eq!(corners(None), [true, false, true, false]);
        let stroke = Stroke { color: "#0000ff".into(), swatch_id: None, width: 1.0, dash: StrokeDash::Solid };
        assert_eq!(corners(Some(stroke)), [true, false, true, false]);
    }

    #[test]
    fn stroke_is_centred_on_the_edge_like_the_canvas() {
        // 矩形左緣在 x = 100，10 pt 的邊線從 95 到 105
        let pixmap = render_page(stroked_rect(10.0, StrokeDash::Solid));
        assert_eq!(rgb_at(&pixmap, 96, 150), BLACK, "outside half of the stroke");
        assert_eq!(rgb_at(&pixmap, 103, 150), BLACK, "inside half of the stroke");
        assert_eq!(rgb_at(&pixmap, 93, 150), WHITE);
        assert_eq!(rgb_at(&pixmap, 108, 150), WHITE, "fill");
    }

    /// Last point of a path segment.
    fn end(segment: &Value) -> (f64, f64) {
        let items = segment.as_array().unwrap();
        let n = items.len();
        (items[n - 2].as_f64().unwrap(), items[n - 1].as_f64().unwrap())
    }

    #[test]
    fn outline_paths_start_where_konva_starts_and_close() {
        let rect = rect_path(100.0, 40.0, [30.0; 4]);
        // 圓角超過短邊一半時限制為 20（和 Konva、SVG 一樣）
        assert_eq!(rect[0], json!(["m", 20.0, 0.0]));
        assert_eq!(rect[1], json!(["l", 80.0, 0.0]), "goes right first");
        assert_eq!(end(&rect[rect.len() - 2]), (20.0, 0.0));
        assert_eq!(rect.last(), Some(&json!(["z"])), "ends closed");
        assert_eq!(rect_path(10.0, 10.0, [0.0; 4]).len(), 6, "no curves without a corner radius");
        // 四個角不同：從 (左上, 0) 開始，只有圓角的角有曲線，每個角各自限制在短邊一半（40 → 20）
        let corners = rect_path(100.0, 40.0, [40.0, 0.0, 10.0, 0.0]);
        assert_eq!(corners[0], json!(["m", 20.0, 0.0]));
        assert_eq!(corners[1], json!(["l", 100.0, 0.0]), "a square top-right corner has no curve");
        assert_eq!(corners.iter().filter(|s| s[0] == "c").count(), 2);
        assert_eq!(end(&corners[corners.len() - 2]), (20.0, 0.0));

        let ellipse = ellipse_path(100.0, 40.0);
        assert_eq!(ellipse[0], json!(["m", 100.0, 20.0]), "rightmost point");
        assert_eq!(end(&ellipse[1]), (50.0, 40.0), "then down (clockwise)");
        assert_eq!(end(&ellipse[ellipse.len() - 2]), (100.0, 20.0));
        assert_eq!(ellipse.last(), Some(&json!(["z"])), "ends closed");
    }

    #[test]
    fn path_shapes_fill_each_subpath_and_keep_open_details_open() {
        let document = crate::export::test_support::path_shape_document();
        let root = project_with_image();
        let project = document_fonts::load(root.path(), &[], &document);
        let world = ExportWorld::new(root.path(), serde_json::to_vec(&to_data(&document)).unwrap(), fonts(), &project);
        let compiled = compile(&world).unwrap();
        let pixmap =
            typst_render::render(&compiled.pages()[0], &typst_render::RenderOptions { pixel_per_pt: 1.0.into(), ..Default::default() });
        let at = |x: u32, y: u32| pixmap.pixel(x, y).map(|p| [p.red(), p.green(), p.blue()]).unwrap();
        // 外框的兩個子路徑各自填色，中間不連起來
        assert_eq!(at(40, 40), [255, 0, 0], "first subpath filled");
        assert_eq!(at(150, 40), [255, 0, 0], "second subpath filled");
        assert_eq!(at(90, 15), WHITE, "no fill between the subpaths");
        // 細節線只描邊；沒有 "z" 的子路徑不會被接回起點
        assert_eq!(at(40, 90), [0, 0, 255], "detail line drawn");
        assert_eq!(at(40, 100), WHITE, "open detail is not closed back to its start");
        assert_eq!(at(55, 97), WHITE, "details are never filled");
    }

    #[test]
    fn stroked_ellipses_compile() {
        let mut document = fixture_document();
        for element in &mut document.pages[0].elements {
            if let Element::Shape(shape) = element {
                shape.stroke = Some(Stroke { color: "#000000".into(), swatch_id: None, width: 3.0, dash: StrokeDash::Dotted });
            }
        }
        let root = project_with_image();
        assert!(render_pdf(root.path(), &request(document), fonts()).is_ok());
    }

    #[test]
    fn dashed_dotted_and_dash_dot_strokes_have_gaps() {
        for dash in [StrokeDash::Dashed, StrokeDash::Dotted, StrokeDash::DashDot] {
            let pixmap = render_page(stroked_rect(4.0, dash));
            // 沿著上緣（y = 100）取樣
            let row: Vec<[u8; 3]> = (110..290).map(|x| rgb_at(&pixmap, x, 100)).collect();
            let dark = row.iter().filter(|p| p[0] < 64).count();
            let light = row.iter().filter(|p| p[0] > 192).count();
            assert!(dark > 20 && light > 20, "{dash:?}: dark {dark}, light {light}");
        }
        let solid = render_page(stroked_rect(4.0, StrokeDash::Solid));
        assert!((110..290).all(|x| rgb_at(&solid, x, 100) == BLACK));
    }

    #[test]
    fn element_alpha_blends_with_the_page() {
        assert_eq!(centre_pixel("#ff0000"), [255, 0, 0]);
        // 50% 紅色疊在白色上 ≈ (255, 127, 127)
        let [r, g, b] = centre_pixel("#ff000080");
        assert_eq!(r, 255);
        assert!((125..=130).contains(&g) && (125..=130).contains(&b), "got {r},{g},{b}");
        assert_eq!(centre_pixel("#ff000000"), [255, 255, 255]);
    }

    #[test]
    fn pdf_carries_the_alpha() {
        let root = project_with_image();
        let opaque = render_pdf(root.path(), &request(single_rect("#ff0000")), fonts()).unwrap().bytes;
        let half = render_pdf(root.path(), &request(single_rect("#ff000080")), fonts()).unwrap().bytes;
        let has_alpha_state = |pdf: &[u8]| pdf.windows(4).any(|w| w == b"/ca ");
        assert!(!has_alpha_state(&opaque));
        assert!(has_alpha_state(&half), "PDF has no fill-opacity graphics state");
    }

    /// A lone black 100 pt text at (100, 100), 400 pt wide, left-aligned, on a white page, laid out
    /// as one line with its baseline at y = 190 and the given width.
    fn single_text(line: &str, width: f64, edit: impl FnOnce(&mut crate::project::format::TextElement)) -> ExportRequest {
        let mut document = fixture_document();
        let page = &mut document.pages[0];
        page.background = "#ffffff".into();
        page.elements.retain(|e| matches!(e, Element::Text(_)));
        let Element::Text(text) = &mut page.elements[0] else { unreachable!() };
        (text.base.x, text.base.y, text.base.rotation) = (100.0, 100.0, 0.0);
        (text.width, text.font_size, text.fill, text.align) = (400.0, 100.0, "#000000".into(), Align::Left);
        text.font_style = crate::project::format::FontStyle::Normal;
        text.decoration = TextDecoration::default();
        edit(text);
        let mut req = request(document);
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![line.into()], baseline: 90.0, line_widths: vec![width], line_gaps: vec![], line_boxes: vec![] });
        req
    }

    const BASELINE_Y: u32 = 190;

    fn is_black(p: [u8; 3]) -> bool {
        p.iter().all(|&c| c < 64)
    }

    fn is_red(p: [u8; 3]) -> bool {
        p[0] > 200 && p[1] < 64 && p[2] < 64
    }

    /// Leftmost dark pixel of a row, between x = 100 and 500.
    fn left_edge(raster: &Raster, y: u32) -> u32 {
        (100..500).find(|&x| is_black(rgb_at(raster, x, y))).expect("no dark pixel in the row")
    }

    #[test]
    fn italic_slants_like_the_browser_around_the_baseline() {
        // 直的筆畫「丨」：斜體每高 1 pt 往右 0.25 pt，基線不動
        let upright = render_request(&single_text("丨", 100.0, |_| {}));
        let italic = render_request(&single_text("丨", 100.0, |t| t.decoration.italic = true));
        for y in [130, 160, 185] {
            let shift = f64::from(left_edge(&italic, y)) - f64::from(left_edge(&upright, y));
            let expected = SYNTHETIC_ITALIC_SLANT * f64::from(BASELINE_Y - y);
            assert!((shift - expected).abs() <= 1.5, "row {y}: shift {shift}, expected {expected}");
        }
    }

    /// Left edge of every run of dark pixels in a row (whole page width).
    fn dark_runs(raster: &Raster, y: u32) -> Vec<u32> {
        let mut runs = Vec::new();
        let mut inside = false;
        for x in 0..590 {
            let dark = is_black(rgb_at(raster, x, y));
            if dark && !inside {
                runs.push(x);
            }
            inside = dark;
        }
        runs
    }

    #[test]
    fn distributed_text_places_characters_by_the_editors_gaps() {
        // 50 pt 的「丨」兩個：第二個的起點 = 第一個 + 字寬 50 + 編輯器算的間距 100（字距不影響）
        let distributed = |line: &str, width: f64, gap: f64| {
            let mut req = single_text(line, width, |t| {
                t.font_size = 50.0;
                t.align = Align::Distributed;
                t.spacing.letter_spacing = 100.0;
            });
            req.text_layouts.get_mut("el-text").unwrap().line_gaps = vec![gap];
            render_request(&req)
        };
        let pair = dark_runs(&distributed("丨丨", 400.0, 100.0), 180);
        assert_eq!(pair.len(), 2, "{pair:?}");
        assert!((f64::from(pair[1] - pair[0]) - 150.0).abs() <= 1.5, "{pair:?}");

        // 行比文字框寬一點（Typst 量的字寬比瀏覽器寬時就會這樣）：仍是同一行，不能把最後一個字折到下一行
        let mut req = single_text("丨丨", 100.0, |t| (t.font_size, t.width, t.align) = (50.0, 100.0, Align::Distributed));
        req.text_layouts.get_mut("el-text").unwrap().line_gaps = vec![10.0];
        let overflowing = dark_runs(&render_request(&req), 180);
        assert_eq!(overflowing.len(), 2, "both characters on the first line: {overflowing:?}");

        // 單字置中：起點 = (400 − 50) / 2，比靠左往右 175
        let left = dark_runs(&render_request(&single_text("丨", 50.0, |t| t.font_size = 50.0)), 180);
        let single = dark_runs(&distributed("丨", 50.0, 0.0), 180);
        assert_eq!((left.len(), single.len()), (1, 1));
        assert!((f64::from(single[0] - left[0]) - 175.0).abs() <= 1.5, "{left:?} {single:?}");
    }

    #[test]
    fn underline_and_strikethrough_sit_where_konva_draws_them() {
        // 100 pt：底線中心在基線下 25（y = 215）、刪除線在基線上 25（y = 165），粗 6.67，從 x = 100 到 200
        let raster = render_request(&single_text("  ", 100.0, |t| (t.decoration.underline, t.decoration.strikethrough) = (true, true)));
        for (x, y) in [(102, 215), (150, 213), (150, 217), (198, 215), (150, 165)] {
            assert!(is_black(rgb_at(&raster, x, y)), "({x}, {y}) should be on a line");
        }
        for (x, y) in [(97, 215), (203, 215), (150, 220), (150, 210), (150, 190), (150, 170)] {
            assert_eq!(rgb_at(&raster, x, y), WHITE, "({x}, {y}) should be off the lines");
        }
    }

    #[test]
    fn shadows_are_drawn_under_the_text_at_the_offset() {
        // 有底線：整段的陰影在最下面，底線本體蓋在陰影上
        let shadow = Some(TextShadow { color: "#ff0000".into(), swatch_id: None, offset_x: 5.0, offset_y: 5.0 });
        let raster = render_request(&single_text("  ", 100.0, |t| {
            t.decoration.underline = true;
            t.decoration.shadow = shadow.clone();
        }));
        assert!(is_black(rgb_at(&raster, 150, 215)), "the line covers its shadow");
        assert!(is_red(rgb_at(&raster, 150, 222)) && is_red(rgb_at(&raster, 203, 220)), "shadow below and to the right");
        assert_eq!(rgb_at(&raster, 150, 209), WHITE);

        // 沒有線：每行的陰影緊接在該行之前，往右 8 pt
        let raster = render_request(&single_text("丨", 100.0, |t| {
            t.decoration.shadow = Some(TextShadow { color: "#ff0000".into(), swatch_id: None, offset_x: 8.0, offset_y: 0.0 });
        }));
        let right_edge = (100..500).rev().find(|&x| is_black(rgb_at(&raster, x, 160))).unwrap();
        assert!(is_red(rgb_at(&raster, right_edge + 4, 160)), "red right of the stroke");
        assert!(!is_red(rgb_at(&raster, left_edge(&raster, 160) - 3, 160)), "nothing left of the stroke");
    }

    /// Writes PNG previews (2 px/pt) for visual comparison with the canvas. Renders the fixture, or
    /// an `ExportRequest` captured from the editor when `EXPORT_REQUEST_JSON` is set:
    /// `EXPORT_PREVIEW_DIR=<dir> [EXPORT_REQUEST_JSON=<file>] [EXPORT_PROJECT_DIR=<project>] cargo test export_preview -- --ignored`
    #[test]
    #[ignore]
    fn export_preview() {
        let dir = std::env::var("EXPORT_PREVIEW_DIR").expect("set EXPORT_PREVIEW_DIR");
        // 暫存資料夾要活到最後（_temp）
        let (_temp, root) = crate::export::test_support::preview_root();
        let req = match std::env::var("EXPORT_REQUEST_JSON") {
            Ok(path) => serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap(),
            Err(_) => request(fixture_document()),
        };
        let compiled = compiled_pages(&root, &req);
        for (index, page) in compiled.pages().iter().enumerate() {
            let pixmap =
                typst_render::render(page, &typst_render::RenderOptions { pixel_per_pt: 2.0.into(), ..Default::default() });
            pixmap.save_png(Path::new(&dir).join(format!("page-{}.png", index + 1))).unwrap();
        }
    }
}
