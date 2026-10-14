//! EPUB 3 fixed-layout output: one document page = one XHTML page, laid out with absolute CSS
//! positioning in the editor's units, with real (selectable, searchable) text.
//!
//! ```text
//! mimetype                      first entry, stored
//! META-INF/container.xml
//! OEBPS/content.opf             metadata / manifest / spine
//! OEBPS/nav.xhtml               table of contents (page names), not in the spine
//! OEBPS/styles/page.css         reset + @font-face
//! OEBPS/fonts/<file>            bundled fonts of the families the document uses
//! OEBPS/images/image-<n>.<ext>  project images, renamed
//! OEBPS/pages/page-<n>.xhtml    one per page, in reading order
//! ```
//!
//! The page markup, stylesheet rules, images and fonts come from [`crate::export::html`], shared
//! with the flip book.

mod css;
mod package;
mod xhtml;
mod zip;

use super::html::markup::has_svg;
use super::html::{collect_images, non_empty_or, used_fonts, UNTITLED_DOCUMENT};
use super::render::build_render;
use super::{ExportOutput, ExportRequest};
use crate::error::AppResult;
use package::{ManifestItem, Metadata};
use std::path::Path;

fn font_media_type(file: &str) -> &'static str {
    if file.ends_with(".otf") {
        "font/otf"
    } else {
        "font/ttf"
    }
}

/// Values that change on every export; injected so tests get deterministic output.
pub struct EpubMeta {
    /// `urn:uuid:…`
    pub identifier: String,
    /// `YYYY-MM-DDThh:mm:ssZ`
    pub modified: String,
}

impl EpubMeta {
    /// A new identifier and the current UTC time.
    pub fn now() -> Self {
        let t = time::OffsetDateTime::now_utc();
        Self {
            identifier: format!("urn:uuid:{}", uuid::Uuid::new_v4()),
            // dcterms:modified 必須是不含小數秒的 UTC 時間
            modified: format!(
                "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
                t.year(),
                u8::from(t.month()),
                t.day(),
                t.hour(),
                t.minute(),
                t.second()
            ),
        }
    }
}

/// Builds the EPUB with the given identifier and timestamp.
///
/// # Errors
/// `AppError::InvalidProject` for invalid content, `AppError::InvalidInput` for unusable layout
/// data, `AppError::Export` when the archive cannot be written.
pub fn build_epub(root: &Path, request: &ExportRequest, meta: &EpubMeta) -> AppResult<ExportOutput> {
    let (document, skipped_missing) = build_render(root, request)?;
    let (images, skipped_unreadable) = collect_images(root, &document);
    let fonts = used_fonts(&document);
    let title = non_empty_or(&document.title, || UNTITLED_DOCUMENT.to_owned());

    let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
    let mut items: Vec<ManifestItem> = Vec::new();
    let mut add = |item: ManifestItem, data: Vec<u8>| {
        entries.push((format!("OEBPS/{}", item.href), data));
        items.push(item);
    };

    add(
        ManifestItem {
            id: "css".into(),
            href: "styles/page.css".into(),
            media_type: "text/css",
            properties: None,
            in_spine: false,
        },
        css::stylesheet(&fonts).into_bytes(),
    );
    for (n, font) in fonts.iter().enumerate() {
        add(
            ManifestItem {
                id: format!("font-{}", n + 1),
                href: format!("fonts/{}", font.file),
                media_type: font_media_type(font.file),
                properties: None,
                in_spine: false,
            },
            font.data.to_vec(),
        );
    }
    for (n, image) in images.iter().enumerate() {
        add(
            ManifestItem {
                id: format!("img-{}", n + 1),
                href: image.href.clone(),
                media_type: image.media_type,
                properties: None,
                in_spine: false,
            },
            image.data.clone(),
        );
    }
    let mut toc = Vec::with_capacity(document.pages.len());
    for (n, page) in document.pages.iter().enumerate() {
        let href = format!("pages/page-{}.xhtml", n + 1);
        let page_title = non_empty_or(&page.name, || format!("第 {} 頁", n + 1));
        add(
            ManifestItem {
                id: format!("page-{}", n + 1),
                href: href.clone(),
                media_type: "application/xhtml+xml",
                properties: has_svg(page).then_some("svg"),
                in_spine: true,
            },
            xhtml::page(page, &page_title, &images).into_bytes(),
        );
        toc.push((href, page_title));
    }
    add(
        ManifestItem {
            id: "nav".into(),
            href: "nav.xhtml".into(),
            media_type: "application/xhtml+xml",
            properties: Some("nav"),
            in_spine: false,
        },
        package::nav_xhtml(&title, &toc).into_bytes(),
    );

    let metadata = Metadata { title: &title, identifier: &meta.identifier, modified: &meta.modified };
    let opf = package::content_opf(&metadata, &items);
    entries.insert(0, ("META-INF/container.xml".into(), package::CONTAINER_XML.as_bytes().to_vec()));
    entries.insert(1, ("OEBPS/content.opf".into(), opf.into_bytes()));

    Ok(ExportOutput {
        bytes: zip::write_container(&entries)?,
        pages: document.pages.len(),
        skipped_images: skipped_missing + skipped_unreadable,
    })
}

/// Renders the document to EPUB bytes (a new identifier and the current time as `modified`).
///
/// # Errors
/// See [`build_epub`].
#[cfg_attr(not(test), expect(dead_code, reason = "階段 4 由 export command 呼叫；接上後移除這個屬性"))]
pub fn render_epub(root: &Path, request: &ExportRequest) -> AppResult<ExportOutput> {
    build_epub(root, request, &EpubMeta::now())
}

#[cfg(test)]
mod tests;
