//! Package files: `META-INF/container.xml`, `content.opf` and the navigation document.

use super::xhtml::escape;
use super::LANGUAGE;
use std::fmt::Write;

pub const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
"#;

/// One file listed in the manifest.
pub struct ManifestItem {
    pub id: String,
    /// Path relative to `content.opf`.
    pub href: String,
    pub media_type: &'static str,
    pub properties: Option<&'static str>,
    /// Whether the item is a page in reading order.
    pub in_spine: bool,
}

pub struct Metadata<'a> {
    pub title: &'a str,
    /// `urn:uuid:…`
    pub identifier: &'a str,
    /// `YYYY-MM-DDThh:mm:ssZ`
    pub modified: &'a str,
}

/// Builds `content.opf`.
///
/// `rendition:` is one of EPUB 3's reserved prefixes, so the package does not declare it
/// (re-declaring a reserved prefix is an epubcheck warning).
pub fn content_opf(metadata: &Metadata, items: &[ManifestItem]) -> String {
    let mut manifest = String::new();
    let mut spine = String::new();
    for item in items {
        let properties = item.properties.map(|p| format!(r#" properties="{p}""#)).unwrap_or_default();
        let _ = writeln!(
            manifest,
            r#"<item id="{}" href="{}" media-type="{}"{properties}/>"#,
            item.id, item.href, item.media_type
        );
        if item.in_spine {
            let _ = writeln!(spine, r#"<itemref idref="{}"/>"#, item.id);
        }
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="{lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">{identifier}</dc:identifier>
<dc:title>{title}</dc:title>
<dc:language>{lang}</dc:language>
<meta property="dcterms:modified">{modified}</meta>
<meta property="rendition:layout">pre-paginated</meta>
<meta property="rendition:orientation">auto</meta>
<meta property="rendition:spread">auto</meta>
</metadata>
<manifest>
{manifest}</manifest>
<spine>
{spine}</spine>
</package>
"#,
        lang = LANGUAGE,
        identifier = escape(metadata.identifier),
        title = escape(metadata.title),
        modified = escape(metadata.modified),
    )
}

/// Builds `nav.xhtml`: a hidden table of contents with one entry per page.
///
/// # Args
/// * `title` - Document title.
/// * `pages` - `(href, page title)` in reading order.
pub fn nav_xhtml(title: &str, pages: &[(String, String)]) -> String {
    let mut entries = String::new();
    for (href, name) in pages {
        let _ = writeln!(entries, r#"<li><a href="{href}">{}</a></li>"#, escape(name));
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}" lang="{lang}">
<head>
<meta charset="UTF-8"/>
<title>{title}</title>
</head>
<body>
<nav epub:type="toc" id="toc" hidden="hidden">
<h1>目錄</h1>
<ol>
{entries}</ol>
</nav>
</body>
</html>
"#,
        lang = LANGUAGE,
        title = escape(title),
    )
}
