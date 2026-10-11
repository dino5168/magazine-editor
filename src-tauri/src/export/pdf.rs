//! PDF output: the render model drawn by the embedded Typst compiler.
//!
//! Typst only positions and renders. Line breaks already come from the editor (see
//! [`super::render`]), so the PDF wraps exactly like the canvas.

use super::fonts::typst_family;
use super::render::{
    build_render, DecorationKind, RenderDocument, RenderElement, RenderKind, RenderStroke, STROKE_MITER_LIMIT,
    SYNTHETIC_ITALIC_SLANT,
};
use super::world::ExportWorld;
use super::{ExportOutput, ExportRequest};
use crate::error::{AppError, AppResult};
use crate::project::format::Align;
use serde_json::{json, Value};
use std::path::Path;
use typst::diag::Warned;
use typst::text::Font;
use typst_layout::PagedDocument;
use typst_pdf::PdfOptions;

fn align_name(align: Align) -> &'static str {
    match align {
        Align::Left => "left",
        Align::Center => "center",
        Align::Right => "right",
    }
}

/// `null` or the stroke dictionary `template.typ` turns into a Typst stroke.
fn stroke_data(stroke: &Option<RenderStroke>) -> Value {
    match stroke {
        None => Value::Null,
        Some(s) => json!({
            "color": s.color,
            "width": s.width,
            "dash": s.dash.map(|d| [d.dash, d.gap]),
            "cap": if s.dash.is_some_and(|d| d.round_cap) { "round" } else { "butt" },
            "miterLimit": STROKE_MITER_LIMIT,
        }),
    }
}

/// Cubic Bézier factor for a quarter circle.
const KAPPA: f64 = 0.552_284_749_830_793_4;

/// One path segment for `template.typ`: `["m", x, y]`, `["l", x, y]` or `["c", x1, y1, x2, y2, x, y]`.
fn seg(kind: &str, coords: &[f64]) -> Value {
    let mut items = vec![Value::from(kind)];
    items.extend(coords.iter().map(|&c| Value::from(c)));
    Value::Array(items)
}

/// Rounded-rectangle outline in Konva's order: from (r, 0) to the right, clockwise.
///
/// 虛線的位置由路徑起點與方向決定；Typst 內建的 rect 起點不同，有邊框時改畫這條路徑，
/// 虛線才會和畫布、EPUB（SVG rect 的起點也是 (r, 0)）落在同樣的位置。
fn rect_path(w: f64, h: f64, radius: f64) -> Vec<Value> {
    let r = radius.clamp(0.0, w.min(h) / 2.0);
    let k = r * KAPPA;
    let mut path = vec![seg("m", &[r, 0.0]), seg("l", &[w - r, 0.0])];
    if r > 0.0 {
        path.push(seg("c", &[w - r + k, 0.0, w, r - k, w, r]));
    }
    path.push(seg("l", &[w, h - r]));
    if r > 0.0 {
        path.push(seg("c", &[w, h - r + k, w - r + k, h, w - r, h]));
    }
    path.push(seg("l", &[r, h]));
    if r > 0.0 {
        path.push(seg("c", &[r - k, h, 0.0, h - r + k, 0.0, h - r]));
    }
    path.push(seg("l", &[0.0, r]));
    if r > 0.0 {
        path.push(seg("c", &[0.0, r - k, r - k, 0.0, r, 0.0]));
    }
    path
}

/// Ellipse outline in Konva's order: from the rightmost point, clockwise (y down).
fn ellipse_path(w: f64, h: f64) -> Vec<Value> {
    let (rx, ry) = (w / 2.0, h / 2.0);
    let (kx, ky) = (rx * KAPPA, ry * KAPPA);
    vec![
        seg("m", &[w, ry]),
        seg("c", &[w, ry + ky, rx + kx, h, rx, h]),
        seg("c", &[rx - kx, h, 0.0, ry + ky, 0.0, ry]),
        seg("c", &[0.0, ry - ky, rx - kx, 0.0, rx, 0.0]),
        seg("c", &[rx + kx, 0.0, w, ry - ky, w, ry]),
    ]
}

fn element_data(element: &RenderElement) -> Value {
    let (x, y, rotation) = (element.x, element.y, element.rotation);
    match &element.kind {
        RenderKind::Rect(e) if e.stroke.is_some() => json!({
            "kind": "path", "x": x, "y": y, "rotation": rotation, "width": e.width, "height": e.height,
            "fill": e.fill, "stroke": stroke_data(&e.stroke), "segments": rect_path(e.width, e.height, e.corner_radius),
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
            "letterSpacing": e.letter_spacing, "lineStarts": e.line_starts,
        }),
        RenderKind::Rect(e) => json!({
            "kind": "rect", "x": x, "y": y, "rotation": rotation,
            "width": e.width, "height": e.height, "radius": e.corner_radius, "fill": e.fill,
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
    json!({ "title": document.title, "pages": pages })
}

/// Renders the document to PDF bytes.
///
/// # Errors
/// `AppError::InvalidProject` for invalid content, `AppError::Export` when Typst fails.
pub fn render_pdf(root: &Path, request: &ExportRequest, fonts: Vec<Font>) -> AppResult<ExportOutput> {
    let (document, skipped_images) = build_render(root, request)?;
    let world = ExportWorld::new(root, serde_json::to_vec(&to_data(&document))?, fonts);
    let compiled = compile(&world)?;
    let pdf = typst_pdf::pdf(&compiled, &PdfOptions::default()).map_err(|errors| diagnostics(&errors))?;
    Ok(ExportOutput { bytes: pdf, pages: compiled.pages().len(), skipped_images })
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
    use crate::export::TextLayout;
    use crate::project::format::{Element, ShapeGeometry, Stroke, StrokeDash, TextDecoration, TextShadow};

    fn compiled_pages(root: &Path, request: &ExportRequest) -> PagedDocument {
        let (document, _) = build_render(root, request).unwrap();
        let world = ExportWorld::new(root, serde_json::to_vec(&to_data(&document)).unwrap(), fonts());
        compile(&world).unwrap()
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

    #[test]
    fn user_text_is_data_not_typst_code() {
        let mut document = fixture_document();
        let tricky = r#"#panic("boom") $x$ [a] \ "q" // c"#;
        if let Element::Text(text) = &mut document.pages[0].elements[0] {
            text.text = tricky.to_owned();
        }
        let mut req = request(document);
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![tricky.to_owned()], baseline: 30.0, line_widths: vec![] });
        let root = project_with_image();
        assert!(render_pdf(root.path(), &req, fonts()).is_ok());
    }

    #[test]
    fn renders_letter_spaced_lines_at_their_starts() {
        // fixture 的文字有字距（−20‰）：帶行寬時每行靠左放在 lineStarts，也要排得出來
        let mut req = request(fixture_document());
        req.text_layouts.insert(
            "el-text".into(),
            TextLayout { lines: vec!["雜誌標題".into(), "副標".into()], baseline: 30.0, line_widths: vec![141.1, 70.6] },
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
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![], baseline: f64::NAN, line_widths: vec![] });
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
        rect.geometry = ShapeGeometry::Rect { corner_radius: 0.0 };
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
        rect.stroke = Some(Stroke { color: "#000000".into(), width, dash });
        document
    }

    const BLACK: [u8; 3] = [0, 0, 0];
    const WHITE: [u8; 3] = [255, 255, 255];

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
        let rect = rect_path(100.0, 40.0, 30.0);
        // 圓角超過短邊一半時限制為 20（和 Konva、SVG 一樣）
        assert_eq!(rect[0], json!(["m", 20.0, 0.0]));
        assert_eq!(rect[1], json!(["l", 80.0, 0.0]), "goes right first");
        assert_eq!(end(rect.last().unwrap()), (20.0, 0.0));
        assert_eq!(rect_path(10.0, 10.0, 0.0).len(), 5, "no curves without a corner radius");

        let ellipse = ellipse_path(100.0, 40.0);
        assert_eq!(ellipse[0], json!(["m", 100.0, 20.0]), "rightmost point");
        assert_eq!(end(&ellipse[1]), (50.0, 40.0), "then down (clockwise)");
        assert_eq!(end(ellipse.last().unwrap()), (100.0, 20.0));
    }

    #[test]
    fn stroked_ellipses_compile() {
        let mut document = fixture_document();
        for element in &mut document.pages[0].elements {
            if let Element::Shape(shape) = element {
                shape.stroke = Some(Stroke { color: "#000000".into(), width: 3.0, dash: StrokeDash::Dotted });
            }
        }
        let root = project_with_image();
        assert!(render_pdf(root.path(), &request(document), fonts()).is_ok());
    }

    #[test]
    fn dashed_and_dotted_strokes_have_gaps() {
        for dash in [StrokeDash::Dashed, StrokeDash::Dotted] {
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
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![line.into()], baseline: 90.0, line_widths: vec![width] });
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
        let shadow = Some(TextShadow { color: "#ff0000".into(), offset_x: 5.0, offset_y: 5.0 });
        let raster = render_request(&single_text("  ", 100.0, |t| {
            t.decoration.underline = true;
            t.decoration.shadow = shadow.clone();
        }));
        assert!(is_black(rgb_at(&raster, 150, 215)), "the line covers its shadow");
        assert!(is_red(rgb_at(&raster, 150, 222)) && is_red(rgb_at(&raster, 203, 220)), "shadow below and to the right");
        assert_eq!(rgb_at(&raster, 150, 209), WHITE);

        // 沒有線：每行的陰影緊接在該行之前，往右 8 pt
        let raster = render_request(&single_text("丨", 100.0, |t| {
            t.decoration.shadow = Some(TextShadow { color: "#ff0000".into(), offset_x: 8.0, offset_y: 0.0 });
        }));
        let right_edge = (100..500).rev().find(|&x| is_black(rgb_at(&raster, x, 160))).unwrap();
        assert!(is_red(rgb_at(&raster, right_edge + 4, 160)), "red right of the stroke");
        assert!(!is_red(rgb_at(&raster, left_edge(&raster, 160) - 3, 160)), "nothing left of the stroke");
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
        let compiled = compiled_pages(root.path(), &req);
        for (index, page) in compiled.pages().iter().enumerate() {
            let pixmap =
                typst_render::render(page, &typst_render::RenderOptions { pixel_per_pt: 2.0.into(), ..Default::default() });
            pixmap.save_png(Path::new(&dir).join(format!("page-{}.png", index + 1))).unwrap();
        }
    }
}
