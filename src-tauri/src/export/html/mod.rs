//! Page output shared by the HTML-based formats (EPUB 3 fixed layout, HTML5 flip book): the markup
//! of each page, the stylesheet, and which images and bundled fonts go next to them.
//!
//! Both formats lay files out the same way under their root:
//!
//! ```text
//! styles/page.css           @font-face + page rules
//! fonts/<file>              bundled and project fonts of the families the document uses
//! images/image-<n>.<ext>    project images, renamed
//! ```

pub mod css;
pub mod markup;

use super::document_fonts::ProjectFace;
use super::fonts::{bundled_family, BUNDLED_FONTS};
use super::render::{RenderDocument, RenderKind};
use crate::project::assets::detect_extension;
use std::collections::HashMap;
use std::path::Path;
use typst::foundations::Bytes;

/// Language of the publication and of every page. The document model has no language yet; this is
/// the single place to replace once it does (see `docs/01-Plans/Imp-Plan-ExportEpub.md` §8).
pub const LANGUAGE: &str = "zh-TW";

/// Title used when the document name is blank.
pub const UNTITLED_DOCUMENT: &str = "未命名文件";

/// `text`, or `fallback()` when it is blank (document and page names may be empty).
pub fn non_empty_or(text: &str, fallback: impl FnOnce() -> String) -> String {
    if text.trim().is_empty() {
        fallback()
    } else {
        text.to_owned()
    }
}

/// Project images copied into the output, keyed by their project path (`assets/images/<file>`).
///
/// Images get generated names (`images/image-<n>.<ext>`) instead of the project's file names: a
/// crafted project may use names that are valid on disk but not in a URL (`#`, `%`, spaces).
pub struct PageImages {
    by_src: HashMap<String, PageImage>,
    /// In first-use order, so the output is deterministic.
    order: Vec<String>,
}

pub struct PageImage {
    /// Path relative to the output root.
    pub href: String,
    pub media_type: &'static str,
    pub data: Vec<u8>,
}

impl PageImages {
    /// Path of an image relative to the output root, or `None` when it was not included.
    pub fn href(&self, src: &str) -> Option<&str> {
        self.by_src.get(src).map(|image| image.href.as_str())
    }

    /// Every included image, in first-use order.
    pub fn iter(&self) -> impl Iterator<Item = &PageImage> {
        self.order.iter().map(|src| &self.by_src[src])
    }
}

/// Detects the image formats EPUB reading systems and browsers display (the same check as
/// importing).
///
/// # Returns
/// The media type and file extension, or `None` for other content.
fn image_type(data: &[u8]) -> Option<(&'static str, &'static str)> {
    let extension = detect_extension(data)?;
    let media_type = match extension {
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        // EPUB 3 的核心媒體類型；頁面用 <img> 引用，和畫布一樣不執行 script、不載入外部資源
        "svg" => "image/svg+xml",
        _ => return None,
    };
    Some((media_type, extension))
}

/// Reads every image the document draws.
///
/// # Returns
/// The images and how many were skipped (unreadable, or not a format the output can show). Like a
/// missing file, a skipped image does not fail the export.
pub fn collect_images(root: &Path, document: &RenderDocument) -> (PageImages, usize) {
    let mut images = PageImages { by_src: HashMap::new(), order: Vec::new() };
    let mut skipped = 0;
    // 圖片物件與圖片框（圖形裡的照片）
    let sources = document.pages.iter().flat_map(|page| &page.elements).flat_map(|element| {
        let image = match &element.kind {
            RenderKind::Image(image) => Some(&image.src),
            _ => None,
        };
        image.into_iter().chain(element.photo.as_ref().map(|photo| &photo.src))
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
        images.by_src.insert(src.clone(), PageImage { href, media_type, data });
        images.order.push(src.clone());
    }
    (images, skipped)
}

/// One embedded font face: a bundled font or a face of a project font.
pub struct EmbeddedFont {
    /// CSS family (`@font-face` name).
    pub family: String,
    pub bold: bool,
    /// File name under `fonts/`; a project font without a bold file has both faces in one file.
    pub file: String,
    pub data: Bytes,
    /// Canvas metrics (em) written as `ascent-override` / `descent-override`: project fonts only
    /// (the bundled files already agree in every engine, see `baseline_matches_css_line_box`).
    pub overrides: Option<(f64, f64)>,
}

/// Font faces for every family some text element uses (both weights, since any element may switch
/// to bold): bundled fonts in `BUNDLED_FONTS` order, then the project faces (`document_fonts::load`).
///
/// Project files get generated names (`project-font-<n>.<ext>`), like images: a crafted project may
/// use file names that are not safe in a CSS `url()`.
pub fn used_fonts(document: &RenderDocument, project: &[ProjectFace]) -> Vec<EmbeddedFont> {
    let mut families: Vec<&str> = Vec::new();
    for element in document.pages.iter().flat_map(|page| &page.elements) {
        if let RenderKind::Text(text) = &element.kind {
            families.extend(text.fonts.iter().filter_map(|font| bundled_family(font)));
        }
    }
    let bundled = BUNDLED_FONTS.iter().filter(|font| families.contains(&font.family)).map(|font| EmbeddedFont {
        family: font.family.to_owned(),
        bold: font.bold,
        file: font.file.to_owned(),
        data: Bytes::new(font.data),
        overrides: None,
    });
    let mut names: Vec<&str> = Vec::new();
    let project = project.iter().map(|face| {
        let n = names.iter().position(|src| *src == face.src).unwrap_or_else(|| {
            names.push(&face.src);
            names.len() - 1
        });
        let extension = if face.src.ends_with(".otf") { "otf" } else { "ttf" };
        EmbeddedFont {
            family: face.family.clone(),
            bold: face.bold,
            file: format!("project-font-{}.{extension}", n + 1),
            data: face.data.clone(),
            overrides: Some((face.ascent, face.descent)),
        }
    });
    bundled.chain(project).collect()
}

/// Each embedded file once (two faces of a project font may share one), in first-use order.
pub fn font_files(fonts: &[EmbeddedFont]) -> Vec<&EmbeddedFont> {
    let mut files: Vec<&EmbeddedFont> = Vec::new();
    for font in fonts {
        if !files.iter().any(|file| file.file == font.file) {
            files.push(font);
        }
    }
    files
}