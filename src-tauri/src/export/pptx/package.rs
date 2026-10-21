//! The PowerPoint file (PresentationML in a ZIP): the smallest set of parts PowerPoint opens without
//! offering a repair, one blank layout, and one slide per picture.
//!
//! The XML is fixed text; the only user content (document name, page names, alt text) goes through
//! [`escape_attribute`] / [`escape`], so it stays data.

use super::raster::{SlideImage, SlideImageFormat};
use crate::error::AppResult;
use crate::export::archive::{write_zip, Packing};
use crate::export::html::markup::escape;

/// EMU (English Metric Units) per pt: 914 400 per inch, 72 pt per inch.
pub const EMU_PER_PT: f64 = 12_700.0;

const XML_HEADER: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#;
const NS: &str = r#"xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main""#;
const REL_NS: &str = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_TYPE: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CT_PML: &str = "application/vnd.openxmlformats-officedocument.presentationml";
/// Shape tree header every slide, layout and master starts with.
const EMPTY_GROUP: &str = r#"<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>"#;
/// Slide-master ids and slide-layout ids share one range starting here (ECMA-376 §19.2.1.34).
const MASTER_ID: u64 = 2_147_483_648;
/// Slide ids start here.
const FIRST_SLIDE_ID: u64 = 256;
const APPLICATION: &str = "雜誌編輯軟體";

/// One slide: its picture and the text for screen readers and search.
pub struct Slide {
    pub image: SlideImage,
    /// The page's text; empty for a page without text.
    pub alt_text: String,
    /// The page name (the picture's name in PowerPoint's selection pane).
    pub name: String,
}

/// What `pptx_package` needs besides the slides.
pub struct PackageMeta<'a> {
    pub title: &'a str,
    /// Slide size in pt.
    pub width: f64,
    pub height: f64,
    /// `YYYY-MM-DDThh:mm:ssZ`.
    pub created: &'a str,
}

/// Escapes text for an XML attribute value: like [`escape`], and keeps line breaks (an attribute's
/// literal line break would be read back as a space).
pub fn escape_attribute(text: &str) -> String {
    escape(text).replace("\r\n", "&#10;").replace(['\n', '\r'], "&#10;").replace('\t', "&#9;")
}

pub fn emu(pt: f64) -> i64 {
    (pt * EMU_PER_PT).round() as i64
}

fn relationships(items: &[(String, &str, String)]) -> String {
    let rels: String = items
        .iter()
        .map(|(id, kind, target)| {
            let kind = if kind.starts_with("http") { (*kind).to_owned() } else { format!("{REL_TYPE}/{kind}") };
            format!(r#"<Relationship Id="{id}" Type="{kind}" Target="{target}"/>"#)
        })
        .collect();
    format!(r#"{XML_HEADER}<Relationships xmlns="{REL_NS}">{rels}</Relationships>"#)
}

fn content_types(slides: usize) -> String {
    let overrides = [
        ("/ppt/presentation.xml", format!("{CT_PML}.presentation.main+xml")),
        ("/ppt/slideMasters/slideMaster1.xml", format!("{CT_PML}.slideMaster+xml")),
        ("/ppt/slideLayouts/slideLayout1.xml", format!("{CT_PML}.slideLayout+xml")),
        ("/ppt/presProps.xml", format!("{CT_PML}.presProps+xml")),
        ("/ppt/viewProps.xml", format!("{CT_PML}.viewProps+xml")),
        ("/ppt/tableStyles.xml", format!("{CT_PML}.tableStyles+xml")),
        ("/ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml".to_owned()),
        ("/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml".to_owned()),
        ("/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml".to_owned()),
    ];
    let mut parts: String =
        overrides.iter().map(|(part, kind)| format!(r#"<Override PartName="{part}" ContentType="{kind}"/>"#)).collect();
    for index in 1..=slides {
        parts.push_str(&format!(r#"<Override PartName="/ppt/slides/slide{index}.xml" ContentType="{CT_PML}.slide+xml"/>"#));
    }
    let defaults: String = [
        ("rels", "application/vnd.openxmlformats-package.relationships+xml"),
        ("xml", "application/xml"),
        (SlideImageFormat::Png.extension(), SlideImageFormat::Png.content_type()),
        (SlideImageFormat::Jpeg.extension(), SlideImageFormat::Jpeg.content_type()),
    ]
    .iter()
    .map(|(ext, kind)| format!(r#"<Default Extension="{ext}" ContentType="{kind}"/>"#))
    .collect();
    format!(r#"{XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">{defaults}{parts}</Types>"#)
}

fn presentation(meta: &PackageMeta, slides: usize) -> String {
    let slide_ids: String = (0..slides)
        .map(|index| format!(r#"<p:sldId id="{}" r:id="rId{}"/>"#, FIRST_SLIDE_ID + index as u64, SLIDE_REL_START + index))
        .collect();
    format!(
        r#"{XML_HEADER}<p:presentation {NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="{MASTER_ID}" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>{slide_ids}</p:sldIdLst><p:sldSz cx="{cx}" cy="{cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>"#,
        cx = emu(meta.width),
        cy = emu(meta.height),
    )
}

/// `ppt/_rels/presentation.xml.rels`: rId1–rId5 are the fixed parts, slides follow.
const SLIDE_REL_START: usize = 6;

fn presentation_rels(slides: usize) -> String {
    let mut items = vec![
        ("rId1".to_owned(), "slideMaster", "slideMasters/slideMaster1.xml".to_owned()),
        ("rId2".to_owned(), "presProps", "presProps.xml".to_owned()),
        ("rId3".to_owned(), "viewProps", "viewProps.xml".to_owned()),
        ("rId4".to_owned(), "theme", "theme/theme1.xml".to_owned()),
        ("rId5".to_owned(), "tableStyles", "tableStyles.xml".to_owned()),
    ];
    items.extend((0..slides).map(|index| (format!("rId{}", SLIDE_REL_START + index), "slide", format!("slides/slide{}.xml", index + 1))));
    relationships(&items)
}

fn slide_master() -> String {
    format!(
        r#"{XML_HEADER}<p:sldMaster {NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>{EMPTY_GROUP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="{layout_id}" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>"#,
        layout_id = MASTER_ID + 1,
    )
}

fn slide_layout() -> String {
    format!(
        r#"{XML_HEADER}<p:sldLayout {NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>{EMPTY_GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>"#
    )
}

/// The Office default colours and fonts; required by the master, never visible (slides are pictures).
fn theme() -> String {
    let color = |name: &str, value: &str| format!("<a:{name}><a:srgbClr val=\"{value}\"/></a:{name}>");
    let colors = [
        ("dk1", "000000"),
        ("lt1", "FFFFFF"),
        ("dk2", "44546A"),
        ("lt2", "E7E6E6"),
        ("accent1", "4472C4"),
        ("accent2", "ED7D31"),
        ("accent3", "A5A5A5"),
        ("accent4", "FFC000"),
        ("accent5", "5B9BD5"),
        ("accent6", "70AD47"),
        ("hlink", "0563C1"),
        ("folHlink", "954F72"),
    ]
    .iter()
    .map(|(name, value)| color(name, value))
    .collect::<String>();
    let font = |latin: &str| format!(r#"<a:latin typeface="{latin}"/><a:ea typeface=""/><a:cs typeface=""/>"#);
    let solid = r#"<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>"#;
    let line = |width: u32| format!(r#"<a:ln w="{width}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>"#);
    let effect = "<a:effectStyle><a:effectLst/></a:effectStyle>";
    format!(
        r#"{XML_HEADER}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office">{colors}</a:clrScheme><a:fontScheme name="Office"><a:majorFont>{major}</a:majorFont><a:minorFont>{minor}</a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst>{solid}{solid}{solid}</a:fillStyleLst><a:lnStyleLst>{l1}{l2}{l3}</a:lnStyleLst><a:effectStyleLst>{effect}{effect}{effect}</a:effectStyleLst><a:bgFillStyleLst>{solid}{solid}{solid}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>"#,
        major = font("Calibri Light"),
        minor = font("Calibri"),
        l1 = line(6350),
        l2 = line(12700),
        l3 = line(19050),
    )
}

fn slide(index: usize, slide: &Slide, meta: &PackageMeta) -> String {
    let name = if slide.name.trim().is_empty() { format!("頁面 {}", index + 1) } else { slide.name.clone() };
    format!(
        r#"{XML_HEADER}<p:sld {NS}><p:cSld><p:spTree>{EMPTY_GROUP}<p:pic><p:nvPicPr><p:cNvPr id="2" name="{name}" descr="{descr}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"#,
        name = escape_attribute(&name),
        descr = escape_attribute(&slide.alt_text),
        cx = emu(meta.width),
        cy = emu(meta.height),
    )
}

fn media_path(index: usize, format: SlideImageFormat) -> String {
    format!("image{}.{}", index + 1, format.extension())
}

fn core_properties(meta: &PackageMeta) -> String {
    format!(
        r#"{XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>{title}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">{created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{created}</dcterms:modified></cp:coreProperties>"#,
        title = escape(meta.title),
        created = escape(meta.created),
    )
}

fn app_properties(slides: usize) -> String {
    format!(
        r#"{XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>{APPLICATION}</Application><Slides>{slides}</Slides></Properties>"#
    )
}

/// Writes the `.pptx` file.
///
/// # Args
/// * `meta` - Title, slide size, creation time.
/// * `slides` - One per page, in order; every picture is stretched over the whole slide.
///
/// # Errors
/// `AppError::Export` when the archive cannot be written.
pub fn pptx_package(meta: &PackageMeta, slides: &[Slide]) -> AppResult<Vec<u8>> {
    let count = slides.len();
    let mut text_parts: Vec<(String, String)> = vec![
        ("[Content_Types].xml".into(), content_types(count)),
        (
            "_rels/.rels".into(),
            relationships(&[
                ("rId1".into(), "officeDocument", "ppt/presentation.xml".into()),
                ("rId2".into(), "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml".into()),
                ("rId3".into(), "extended-properties", "docProps/app.xml".into()),
            ]),
        ),
        ("docProps/core.xml".into(), core_properties(meta)),
        ("docProps/app.xml".into(), app_properties(count)),
        ("ppt/presentation.xml".into(), presentation(meta, count)),
        ("ppt/_rels/presentation.xml.rels".into(), presentation_rels(count)),
        ("ppt/presProps.xml".into(), format!("{XML_HEADER}<p:presentationPr {NS}/>")),
        ("ppt/viewProps.xml".into(), format!("{XML_HEADER}<p:viewPr {NS}/>")),
        (
            "ppt/tableStyles.xml".into(),
            format!(r#"{XML_HEADER}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}}"/>"#),
        ),
        ("ppt/theme/theme1.xml".into(), theme()),
        ("ppt/slideMasters/slideMaster1.xml".into(), slide_master()),
        (
            "ppt/slideMasters/_rels/slideMaster1.xml.rels".into(),
            relationships(&[
                ("rId1".into(), "slideLayout", "../slideLayouts/slideLayout1.xml".into()),
                ("rId2".into(), "theme", "../theme/theme1.xml".into()),
            ]),
        ),
        ("ppt/slideLayouts/slideLayout1.xml".into(), slide_layout()),
        (
            "ppt/slideLayouts/_rels/slideLayout1.xml.rels".into(),
            relationships(&[("rId1".into(), "slideMaster", "../slideMasters/slideMaster1.xml".into())]),
        ),
    ];
    let mut media: Vec<(String, &[u8])> = Vec::with_capacity(count);
    for (index, item) in slides.iter().enumerate() {
        let file = media_path(index, item.image.format);
        text_parts.push((format!("ppt/slides/slide{}.xml", index + 1), slide(index, item, meta)));
        text_parts.push((
            format!("ppt/slides/_rels/slide{}.xml.rels", index + 1),
            relationships(&[
                ("rId1".into(), "slideLayout", "../slideLayouts/slideLayout1.xml".into()),
                ("rId2".into(), "image", format!("../media/{file}")),
            ]),
        ));
        media.push((format!("ppt/media/{file}"), item.image.bytes.as_slice()));
    }
    let xml = text_parts.iter().map(|(path, xml)| (path.as_str(), xml.as_bytes(), Packing::Deflated));
    // 圖片本來就壓縮過，原樣存放
    let images = media.iter().map(|(path, bytes)| (path.as_str(), *bytes, Packing::Stored));
    write_zip(xml.chain(images), "PowerPoint")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, HashSet};
    use std::io::Read;

    fn picture(format: SlideImageFormat) -> SlideImage {
        SlideImage { format, bytes: vec![1, 2, 3] }
    }

    fn sample() -> Vec<u8> {
        let meta = PackageMeta { title: "雜誌 <&> \"title\"", width: 960.0, height: 540.0, created: "2026-10-21T05:06:07Z" };
        let slides = vec![
            Slide { image: picture(SlideImageFormat::Png), alt_text: "第一行\n第二行 <b>&".into(), name: "封面".into() },
            Slide { image: picture(SlideImageFormat::Jpeg), alt_text: String::new(), name: "Page-2".into() },
        ];
        pptx_package(&meta, &slides).unwrap()
    }

    fn read_all(bytes: &[u8]) -> HashMap<String, Vec<u8>> {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        (0..archive.len())
            .map(|index| {
                let mut file = archive.by_index(index).unwrap();
                let mut content = Vec::new();
                file.read_to_end(&mut content).unwrap();
                (file.name().to_owned(), content)
            })
            .collect()
    }

    fn xml(files: &HashMap<String, Vec<u8>>, path: &str) -> String {
        String::from_utf8(files[path].clone()).unwrap()
    }

    /// The directory of a part, for resolving its relationships' targets.
    fn resolve(part: &str, target: &str) -> String {
        let mut segments: Vec<&str> = part.split('/').collect();
        segments.pop();
        for piece in target.split('/') {
            match piece {
                ".." => {
                    segments.pop();
                }
                piece => segments.push(piece),
            }
        }
        segments.join("/")
    }

    #[test]
    fn every_xml_part_parses_and_every_relationship_points_at_a_part() {
        let files = read_all(&sample());
        for (path, content) in &files {
            if path.ends_with(".xml") || path.ends_with(".rels") {
                let text = std::str::from_utf8(content).unwrap();
                roxmltree::Document::parse(text).unwrap_or_else(|error| panic!("{path}: {error}"));
            }
        }
        let rels: Vec<&String> = files.keys().filter(|path| path.ends_with(".rels")).collect();
        assert_eq!(rels.len(), 1 + 1 + 1 + 1 + 2, "package, presentation, master, layout, two slides");
        for rel in rels {
            let owner = rel.replace("_rels/", "").trim_end_matches(".rels").to_owned();
            let text = xml(&files, rel);
            let doc = roxmltree::Document::parse(&text).unwrap();
            let mut ids = HashSet::new();
            for node in doc.descendants().filter(|node| node.has_tag_name("Relationship")) {
                assert!(ids.insert(node.attribute("Id").unwrap().to_owned()), "{rel}: duplicate id");
                let target = node.attribute("Target").unwrap();
                let part = if rel == "_rels/.rels" { target.to_owned() } else { resolve(&owner, target) };
                assert!(files.contains_key(&part), "{rel} → {part} is missing");
            }
        }
    }

    #[test]
    fn content_types_cover_every_part() {
        let files = read_all(&sample());
        let text = xml(&files, "[Content_Types].xml");
        let doc = roxmltree::Document::parse(&text).unwrap();
        let defaults: HashSet<&str> =
            doc.descendants().filter(|n| n.has_tag_name("Default")).map(|n| n.attribute("Extension").unwrap()).collect();
        let overrides: HashSet<String> = doc
            .descendants()
            .filter(|n| n.has_tag_name("Override"))
            .map(|n| n.attribute("PartName").unwrap().trim_start_matches('/').to_owned())
            .collect();
        for path in files.keys().filter(|path| *path != "[Content_Types].xml") {
            let extension = path.rsplit('.').next().unwrap();
            assert!(overrides.contains(path) || defaults.contains(extension), "{path} has no content type");
            if path.ends_with(".xml") {
                assert!(overrides.contains(path), "{path} needs its own content type");
            }
        }
        for path in &overrides {
            assert!(files.contains_key(path), "content type for missing {path}");
        }
    }

    #[test]
    fn slides_are_listed_in_order_at_the_page_size() {
        let files = read_all(&sample());
        let text = xml(&files, "ppt/presentation.xml");
        assert!(text.contains(r#"<p:sldSz cx="12192000" cy="6858000"/>"#), "960 × 540 pt = PowerPoint's 16:9");
        assert!(text.contains(r#"<p:sldId id="256" r:id="rId6"/><p:sldId id="257" r:id="rId7"/>"#));
        let rels = xml(&files, "ppt/_rels/presentation.xml.rels");
        assert!(rels.contains(r#"Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml""#));
        // 每張投影片一張滿版圖片，格式照副檔名
        assert!(xml(&files, "ppt/slides/slide1.xml").contains(r#"<a:ext cx="12192000" cy="6858000"/>"#));
        assert!(xml(&files, "ppt/slides/_rels/slide1.xml.rels").contains("../media/image1.png"));
        assert!(xml(&files, "ppt/slides/_rels/slide2.xml.rels").contains("../media/image2.jpeg"));
        assert_eq!(files["ppt/media/image2.jpeg"], vec![1, 2, 3]);
        assert!(xml(&files, "docProps/app.xml").contains("<Slides>2</Slides>"));
    }

    #[test]
    fn user_text_is_escaped_and_keeps_line_breaks() {
        let files = read_all(&sample());
        let slide = xml(&files, "ppt/slides/slide1.xml");
        assert!(slide.contains(r#"name="封面" descr="第一行&#10;第二行 &lt;b&gt;&amp;""#), "{slide}");
        let doc = roxmltree::Document::parse(&slide).unwrap();
        let picture = doc.descendants().find(|n| n.has_tag_name("cNvPr") && n.attribute("id") == Some("2")).unwrap();
        assert_eq!(picture.attribute("descr"), Some("第一行\n第二行 <b>&"));
        assert!(xml(&files, "docProps/core.xml").contains("<dc:title>雜誌 &lt;&amp;&gt; &quot;title&quot;</dc:title>"));
    }

    #[test]
    fn images_are_stored_and_xml_is_deflated() {
        let bytes = sample();
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        assert_eq!(archive.by_name("ppt/media/image1.png").unwrap().compression(), zip::CompressionMethod::Stored);
        assert_eq!(archive.by_name("ppt/presentation.xml").unwrap().compression(), zip::CompressionMethod::Deflated);
    }

    #[test]
    fn emu_conversion() {
        assert_eq!(emu(720.0), 9_144_000);
        assert_eq!(emu(405.0), 5_143_500);
        assert_eq!(escape_attribute("a\r\nb\tc"), "a&#10;b&#9;c");
    }
}
