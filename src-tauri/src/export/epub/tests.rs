use super::*;
use crate::export::render::build_render;
use crate::export::test_support::{fixture_document, project_with_image, request};
use crate::export::TextLayout;
use crate::project::format::{Element, ShapeGeometry};
use std::io::Read;

fn meta() -> EpubMeta {
    EpubMeta {
        identifier: "urn:uuid:00000000-0000-4000-8000-000000000000".into(),
        modified: "2026-09-30T00:00:00Z".into(),
    }
}

/// Every entry of the archive, in archive order.
fn unzip(bytes: &[u8]) -> Vec<(String, Vec<u8>)> {
    let mut archive = ::zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
    (0..archive.len())
        .map(|i| {
            let mut file = archive.by_index(i).unwrap();
            let mut data = Vec::new();
            file.read_to_end(&mut data).unwrap();
            (file.name().to_owned(), data)
        })
        .collect()
}

fn text_of<'a>(entries: &'a [(String, Vec<u8>)], name: &str) -> &'a str {
    let (_, data) = entries.iter().find(|(n, _)| n == name).unwrap_or_else(|| panic!("missing {name}"));
    std::str::from_utf8(data).unwrap()
}

fn parse(xml: &str) -> roxmltree::Document<'_> {
    // 頁面是 XHTML（有 <!DOCTYPE html>），roxmltree 預設拒絕 DTD
    let options = roxmltree::ParsingOptions { allow_dtd: true, ..Default::default() };
    roxmltree::Document::parse_with_options(xml, options).unwrap_or_else(|e| panic!("not well-formed XML: {e}\n{xml}"))
}

fn export(document: crate::project::format::Document) -> (ExportOutput, Vec<(String, Vec<u8>)>) {
    let root = project_with_image();
    let output = build_epub(root.path(), &request(document), &meta()).unwrap();
    let entries = unzip(&output.bytes);
    (output, entries)
}

#[test]
fn render_epub_stamps_identifier_and_time() {
    let root = project_with_image();
    let entries = unzip(&render_epub(root.path(), &request(fixture_document())).unwrap().bytes);
    let opf = parse(text_of(&entries, "OEBPS/content.opf"));
    let identifier = opf.descendants().find(|n| n.attribute("id") == Some("pub-id")).and_then(|n| n.text()).unwrap();
    let uuid = identifier.strip_prefix("urn:uuid:").expect("urn:uuid identifier");
    assert!(uuid::Uuid::parse_str(uuid).is_ok());
    let modified = opf
        .descendants()
        .find(|n| n.attribute("property") == Some("dcterms:modified"))
        .and_then(|n| n.text())
        .unwrap();
    // CCYY-MM-DDThh:mm:ssZ，不含小數秒
    assert_eq!(modified.len(), 20);
    assert!(modified.ends_with('Z') && modified.as_bytes()[10] == b'T', "{modified}");
}

#[test]
fn epub_zip_layout() {
    let (output, entries) = export(fixture_document());
    let bytes = &output.bytes;
    // 第一個 local file header：簽章、壓縮方式 0（Stored）、檔名長度 8、extra field 長度 0
    assert_eq!(&bytes[0..4], b"PK\x03\x04");
    assert_eq!(u16::from_le_bytes([bytes[8], bytes[9]]), 0, "mimetype must be stored");
    assert_eq!(u16::from_le_bytes([bytes[26], bytes[27]]), 8);
    assert_eq!(u16::from_le_bytes([bytes[28], bytes[29]]), 0, "mimetype must have no extra field");
    assert_eq!(&bytes[30..38], b"mimetype");
    assert_eq!(&bytes[38..58], b"application/epub+zip");

    assert_eq!(entries[0].0, "mimetype");
    let container = parse(text_of(&entries, "META-INF/container.xml"));
    let rootfile = container.descendants().find(|n| n.has_tag_name("rootfile")).unwrap();
    assert_eq!(rootfile.attribute("full-path"), Some("OEBPS/content.opf"));
}

#[test]
fn opf_lists_every_file() {
    let (output, entries) = export(fixture_document());
    let opf = parse(text_of(&entries, "OEBPS/content.opf"));

    let manifest: Vec<(String, String)> = opf
        .descendants()
        .filter(|n| n.has_tag_name("item"))
        .map(|n| (n.attribute("id").unwrap().to_owned(), format!("OEBPS/{}", n.attribute("href").unwrap())))
        .collect();
    let mut listed: Vec<&str> = manifest.iter().map(|(_, path)| path.as_str()).collect();
    let mut stored: Vec<&str> = entries
        .iter()
        .map(|(name, _)| name.as_str())
        .filter(|name| !matches!(*name, "mimetype" | "META-INF/container.xml" | "OEBPS/content.opf"))
        .collect();
    listed.sort_unstable();
    stored.sort_unstable();
    assert_eq!(listed, stored, "manifest must list exactly the files in the archive");

    let spine: Vec<&str> =
        opf.descendants().filter(|n| n.has_tag_name("itemref")).map(|n| n.attribute("idref").unwrap()).collect();
    assert_eq!(spine.len(), output.pages);
    assert_eq!(spine, vec!["page-1"]);

    let meta_value = |property: &str| {
        opf.descendants()
            .find(|n| n.has_tag_name("meta") && n.attribute("property") == Some(property))
            .and_then(|n| n.text())
            .map(str::to_owned)
    };
    assert_eq!(meta_value("rendition:layout").as_deref(), Some("pre-paginated"));
    assert_eq!(meta_value("dcterms:modified").as_deref(), Some("2026-09-30T00:00:00Z"));
    let title = opf.descendants().find(|n| n.has_tag_name("title")).and_then(|n| n.text());
    assert_eq!(title, Some("範例雜誌"));
    let nav = opf.descendants().find(|n| n.attribute("properties") == Some("nav")).unwrap();
    assert_eq!(nav.attribute("href"), Some("nav.xhtml"));
}

#[test]
fn pages_are_well_formed_xml() {
    let (_, entries) = export(fixture_document());
    for (name, data) in &entries {
        if name.ends_with(".xhtml") || name.ends_with(".opf") || name.ends_with(".xml") {
            parse(std::str::from_utf8(data).unwrap());
        }
    }
    let page = parse(text_of(&entries, "OEBPS/pages/page-1.xhtml"));
    let viewport = page.descendants().find(|n| n.attribute("name") == Some("viewport")).unwrap();
    // A4 = 595.28 × 841.89 pt，viewport 取整數
    assert_eq!(viewport.attribute("content"), Some("width=596, height=842"));
    let toc = parse(text_of(&entries, "OEBPS/nav.xhtml"));
    let link = toc.descendants().find(|n| n.has_tag_name("a")).unwrap();
    assert_eq!((link.attribute("href"), link.text()), (Some("pages/page-1.xhtml"), Some("封面")));
}

#[test]
fn user_text_is_data_not_markup() {
    let hostile = r#"<script>alert(1)</script> & "q" ]]> <!--"#;
    let mut document = fixture_document();
    document.name = format!("{hostile}\u{0}");
    document.pages[0].name = hostile.to_owned();
    let mut req = request(document);
    req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![hostile.into(), "第二行".into()], baseline: 30.0 });
    let root = project_with_image();
    let entries = unzip(&build_epub(root.path(), &req, &meta()).unwrap().bytes);

    let page = parse(text_of(&entries, "OEBPS/pages/page-1.xhtml"));
    assert!(page.descendants().all(|n| !n.has_tag_name("script")), "user text became markup");
    let lines: Vec<&str> = page
        .descendants()
        .filter(|n| n.attribute("class") == Some("el t"))
        .flat_map(|t| t.children().filter(|c| c.is_element()).filter_map(|c| c.text()))
        .collect();
    // 最後一行是 fixture 橢圓的圖形內文字（沒有 layout，以 \n 分行）
    assert_eq!(lines, vec![hostile, "第二行", "圖形內文字"]);
    // 標題裡的 NUL（XML 不允許）被去掉，其餘原樣保留
    let opf = parse(text_of(&entries, "OEBPS/content.opf"));
    assert_eq!(opf.descendants().find(|n| n.has_tag_name("title")).and_then(|n| n.text()), Some(hostile));
    parse(text_of(&entries, "OEBPS/nav.xhtml"));
}

#[test]
fn renders_every_element_type() {
    let root = project_with_image();
    let req = request(fixture_document());
    let (render, _) = build_render(root.path(), &req).unwrap();
    let entries = unzip(&build_epub(root.path(), &req, &meta()).unwrap().bytes);
    let xml = text_of(&entries, "OEBPS/pages/page-1.xhtml");
    let page = parse(xml);

    let class_of = |n: &roxmltree::Node| n.attribute("class").unwrap_or("").to_owned();
    let drawn: Vec<String> = page
        .descendants()
        .find(|n| n.attribute("class") == Some("page"))
        .unwrap()
        .children()
        .filter(|n| n.is_element())
        .map(|n| format!("{}.{}", n.tag_name().name(), class_of(&n)))
        .collect();
    // 順序即 z 軸順序：text、rect、ellipse、polygon、star、image
    // 橢圓有邊框，所以和多邊形一樣畫成 SVG（邊線在外框線中心，CSS border 做不到）；
    // 它的圖形內文字是緊接在後的文字 div
    assert_eq!(drawn, vec!["div.el t", "div.el", "svg.el", "div.el t", "svg.el", "svg.el", "img.el"]);
    assert!(xml.contains("transform:rotate(12.5deg)"), "rect rotation");
    assert!(xml.contains("left:120px;top:440px;width:120px;height:80px"), "ellipse box");
    let ellipse = page.descendants().find(|n| n.has_tag_name("ellipse")).expect("stroked ellipse is SVG");
    assert_eq!(
        ["cx", "cy", "rx", "ry", "stroke", "stroke-width", "stroke-dasharray"].map(|a| ellipse.attribute(a).unwrap_or("-")),
        ["60", "40", "60", "40", "#be123c", "2", "6 6"]
    );
    assert!(xml.contains(r#"src="../images/image-1.png""#));
    // fixture 的矩形是半透明的 #e0e7ffcc
    assert!(xml.contains("background:rgba(224,231,255,0.800)"), "rect alpha");
    assert!(!xml.contains("#e0e7ffcc"), "8-digit hex must not reach the EPUB");

    // 多邊形與星形的頂點和 PDF 用的是同一組數字（以 viewBox 的左上角為原點）
    let svgs: Vec<_> = page.descendants().filter(|n| n.has_tag_name("polygon")).collect();
    let shapes: Vec<_> = render.pages[0]
        .elements
        .iter()
        .filter_map(|e| match &e.kind {
            RenderKind::Polygon(p) => Some(p),
            _ => None,
        })
        .collect();
    assert_eq!(svgs.len(), shapes.len());
    for (svg, shape) in svgs.iter().zip(shapes) {
        let expected: Vec<String> = shape
            .points
            .iter()
            .map(|[x, y]| format!("{},{}", xhtml::num(*x), xhtml::num(*y)))
            .collect();
        assert_eq!(svg.attribute("points"), Some(expected.join(" ").as_str()));
    }
}

#[test]
fn svg_property_marks_pages_with_shapes() {
    let mut document = fixture_document();
    let mut plain = document.pages[0].clone();
    plain.id = "page-2".into();
    plain.name = String::new();
    // 沒有 SVG 的頁面：拿掉多邊形與星形，其他圖形也不要邊框
    plain.elements.retain(|e| {
        !matches!(e, Element::Shape(s) if matches!(s.geometry, ShapeGeometry::Polygon { .. } | ShapeGeometry::Star { .. }))
    });
    for element in &mut plain.elements {
        if let Element::Shape(shape) = element {
            shape.stroke = None;
        }
    }
    document.pages.push(plain);
    let (_, entries) = export(document);
    let opf = parse(text_of(&entries, "OEBPS/content.opf"));
    let properties = |id: &str| {
        opf.descendants().find(|n| n.attribute("id") == Some(id)).and_then(|n| n.attribute("properties"))
    };
    assert_eq!(properties("page-1"), Some("svg"));
    assert_eq!(properties("page-2"), None);
    // 沒有名稱的頁面在目錄裡用「第 N 頁」
    assert!(text_of(&entries, "OEBPS/nav.xhtml").contains(">第 2 頁</a>"));
}

#[test]
fn missing_images_are_skipped_not_fatal() {
    let root = tempfile::tempdir().unwrap();
    let output = build_epub(root.path(), &request(fixture_document()), &meta()).unwrap();
    assert_eq!(output.skipped_images, 1);
    let entries = unzip(&output.bytes);
    assert!(!text_of(&entries, "OEBPS/pages/page-1.xhtml").contains("<img"));
    assert!(entries.iter().all(|(name, _)| !name.starts_with("OEBPS/images/")));
}

#[test]
fn images_that_are_not_displayable_are_skipped() {
    let root = project_with_image();
    let document = fixture_document();
    let Some(Element::Image(image)) = document.pages[0].elements.iter().find(|e| matches!(e, Element::Image(_))) else {
        panic!("fixture has an image");
    };
    std::fs::write(root.path().join(&image.src), b"not an image").unwrap();
    let output = build_epub(root.path(), &request(document), &meta()).unwrap();
    assert_eq!(output.skipped_images, 1);
    assert!(!text_of(&unzip(&output.bytes), "OEBPS/pages/page-1.xhtml").contains("<img"));
}

#[test]
fn embeds_only_used_font_families() {
    let fonts_in = |family: &str| {
        let mut document = fixture_document();
        for element in &mut document.pages[0].elements {
            match element {
                Element::Text(text) => text.font_family = family.to_owned(),
                // 圖形內文字的字型也會內嵌
                Element::Shape(shape) => {
                    if let Some(label) = &mut shape.label {
                        label.font_family = family.to_owned();
                    }
                }
                Element::Image(_) => {}
            }
        }
        let (_, entries) = export(document);
        let files: Vec<String> = entries
            .iter()
            .filter_map(|(name, _)| name.strip_prefix("OEBPS/fonts/").map(str::to_owned))
            .collect();
        let faces = text_of(&entries, "OEBPS/styles/page.css").matches("@font-face").count();
        assert_eq!(faces, files.len(), "@font-face rules and embedded files must match");
        files
    };
    assert_eq!(
        fonts_in(r#""Geist", "Noto Sans TC", sans-serif"#),
        vec!["Geist-Regular.ttf", "Geist-Bold.ttf", "NotoSansTC-Regular.otf", "NotoSansTC-Bold.otf"]
    );
    // 舊專案的字型名稱照樣對應到內嵌字型
    assert_eq!(fonts_in(r#""Microsoft JhengHei", sans-serif"#), vec!["NotoSansTC-Regular.otf", "NotoSansTC-Bold.otf"]);
    assert!(fonts_in("Arial, sans-serif").is_empty());
}

/// The editor puts the first baseline at `(ascent − descent) / 2 + L / 2` (`text-layout.ts`); a CSS
/// line box of height `L` puts it at `(L − (ascent + descent)) / 2 + ascent` — the same value, so
/// the EPUB needs no baseline correction *as long as the canvas and the reading system read the
/// same ascent and descent*.
///
/// Engines read different tables: CoreText (Apple Books) uses `hhea`; DirectWrite (Chromium /
/// WebView2, Thorium on Windows) uses `OS/2` typo metrics when USE_TYPO_METRICS is set and the win
/// metrics otherwise. A bundled font is safe when both choices give the same numbers. (Geist's win
/// metrics differ from `hhea`, but it sets USE_TYPO_METRICS, so they are never used for the line
/// box; Noto Sans TC does the opposite.)
#[test]
fn baseline_matches_css_line_box() {
    for font in BUNDLED_FONTS {
        let face = ttf_parser::Face::parse(font.data, 0).unwrap();
        let hhea = (face.ascender(), face.descender());
        let (ascent, descent) = (f64::from(hhea.0), -f64::from(hhea.1));
        let line = f64::from(face.units_per_em()) * crate::export::render::TEXT_LINE_HEIGHT;
        let editor = (ascent - descent) / 2.0 + line / 2.0;
        let css = (line - (ascent + descent)) / 2.0 + ascent;
        assert!((editor - css).abs() < 1e-9, "{}", font.file);

        let os2 = face.tables().os2.expect("bundled fonts have an OS/2 table");
        let windows = if os2.use_typographic_metrics() {
            (os2.typographic_ascender(), os2.typographic_descender())
        } else {
            (os2.windows_ascender(), os2.windows_descender())
        };
        assert_eq!(hhea, windows, "{}: Windows and macOS engines would place the baseline differently", font.file);
    }
}


/// Writes `preview.epub` for opening in a reading system or running epubcheck (not part of the
/// normal run; the export command is wired up in a later stage).
///
/// `EXPORT_PREVIEW_DIR=<dir> [EXPORT_REQUEST_JSON=<file>] cargo test epub_preview -- --ignored`
#[test]
#[ignore]
fn epub_preview() {
    let dir = std::env::var("EXPORT_PREVIEW_DIR").expect("set EXPORT_PREVIEW_DIR");
    let root = project_with_image();
    let req = match std::env::var("EXPORT_REQUEST_JSON") {
        Ok(path) => serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap(),
        Err(_) => request(fixture_document()),
    };
    let output = render_epub(root.path(), &req).unwrap();
    std::fs::write(std::path::Path::new(&dir).join("preview.epub"), output.bytes).unwrap();
}
