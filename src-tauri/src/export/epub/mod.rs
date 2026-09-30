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

mod css;
mod package;
mod xhtml;
mod zip;

use super::fonts::{bundled_family, BundledFont, BUNDLED_FONTS};
use super::render::{build_render, RenderDocument, RenderKind};
use super::{ExportOutput, ExportRequest};
use crate::error::AppResult;
use package::{ManifestItem, Metadata};
use std::collections::HashMap;
use std::path::Path;

/// Language of the publication and of every page. The document model has no language yet; this is
/// the single place to replace once it does (see `docs/Imp-Plan-ExportEpub.md` §8).
pub const LANGUAGE: &str = "zh-TW";

const UNTITLED_DOCUMENT: &str = "未命名文件";

/// Project images copied into the EPUB, keyed by their project path (`assets/images/<file>`).
///
/// Images get generated names (`images/image-<n>.<ext>`) instead of the project's file names: a
/// crafted project may use names that are valid on disk but not in a URL (`#`, `%`, spaces).
pub struct EpubImages {
    by_src: HashMap<String, EpubImage>,
    /// In first-use order, so the output is deterministic.
    order: Vec<String>,
}

struct EpubImage {
    href: String,
    media_type: &'static str,
    data: Vec<u8>,
}

impl EpubImages {
    /// Path of an image relative to `content.opf`, or `None` when it was not included.
    pub fn href(&self, src: &str) -> Option<&str> {
        self.by_src.get(src).map(|image| image.href.as_str())
    }
}

/// Detects the image formats EPUB reading systems display, from the file's first bytes.
fn image_type(data: &[u8]) -> Option<(&'static str, &'static str)> {
    if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(("image/png", "png"))
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(("image/jpeg", "jpg"))
    } else if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        Some(("image/gif", "gif"))
    } else if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        Some(("image/webp", "webp"))
    } else {
        None
    }
}

/// Reads every image the document draws.
///
/// # Returns
/// The images and how many were skipped (unreadable, or not a format EPUB can show). Like a missing
/// file, a skipped image does not fail the export.
fn collect_images(root: &Path, document: &RenderDocument) -> (EpubImages, usize) {
    let mut images = EpubImages { by_src: HashMap::new(), order: Vec::new() };
    let mut skipped = 0;
    let sources = document.pages.iter().flat_map(|page| &page.elements).filter_map(|element| match &element.kind {
        RenderKind::Image(image) => Some(&image.src),
        _ => None,
    });
    for src in sources {
        if images.by_src.contains_key(src) {
            continue;
        }
        // src 已經過 validate_asset_path（只能是 assets/images/<檔名>），build_render 也確認過檔案存在
        let detected = std::fs::read(root.join(src)).ok().and_then(|data| image_type(&data).map(|kind| (kind, data)));
        let Some(((media_type, ext), data)) = detected else {
            skipped += 1;
            continue;
        };
        let href = format!("images/image-{}.{ext}", images.order.len() + 1);
        images.by_src.insert(src.clone(), EpubImage { href, media_type, data });
        images.order.push(src.clone());
    }
    (images, skipped)
}

/// Bundled font files for every family some text element uses (both weights, since any element
/// may switch to bold), in `BUNDLED_FONTS` order.
fn used_fonts(document: &RenderDocument) -> Vec<&'static BundledFont> {
    let mut families: Vec<&str> = Vec::new();
    for element in document.pages.iter().flat_map(|page| &page.elements) {
        if let RenderKind::Text(text) = &element.kind {
            families.extend(text.fonts.iter().filter_map(|font| bundled_family(font)));
        }
    }
    BUNDLED_FONTS.iter().filter(|font| families.contains(&font.family)).collect()
}

fn font_media_type(file: &str) -> &'static str {
    if file.ends_with(".otf") {
        "font/otf"
    } else {
        "font/ttf"
    }
}

fn non_empty_or(text: &str, fallback: impl FnOnce() -> String) -> String {
    if text.trim().is_empty() {
        fallback()
    } else {
        text.to_owned()
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
    for (n, src) in images.order.iter().enumerate() {
        let image = &images.by_src[src];
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
                properties: xhtml::has_svg(page).then_some("svg"),
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
