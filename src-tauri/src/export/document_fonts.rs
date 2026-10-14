//! Project fonts (`document.fonts`, files in `assets/fonts/`) for one export: only the fonts some
//! text uses, read from the project folder. Every format registers them under the family the
//! editor uses (`project-font-<id>`), whatever the files call themselves.
//!
//! Plan: `docs/05-Plans-字型/01-專案字型-實作.md`.

use super::render::{RenderDocument, RenderKind};
use crate::project::format::{self, project_font_family, FontFile, ProjectFont, FONT_ASSET_DIR};
use std::path::Path;
use typst::foundations::Bytes;

/// One face of a project font: the regular file as weight 400, and the bold file — or the regular
/// one again, so no format fakes bold — as 700.
#[derive(Clone)]
pub struct ProjectFace {
    /// `project-font-<id>`.
    pub family: String,
    pub bold: bool,
    /// Project path of the file (`assets/fonts/<file>`); both faces may share one.
    pub src: String,
    pub data: Bytes,
    /// The canvas metrics (em), written as `ascent-override` / `descent-override` in HTML formats.
    pub ascent: f64,
    pub descent: f64,
}

/// Whether CSS family `name` is a project font's (`project-font-` + letters, digits, `-`, `_`), so
/// it can be written into CSS as is.
pub fn is_project_family(name: &str) -> bool {
    let Some(id) = name.get(..13).filter(|prefix| prefix.eq_ignore_ascii_case("project-font-")).map(|_| &name[13..]) else {
        return false;
    };
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Reads the faces of every project font some text of `document` uses.
///
/// # Returns
/// Faces in `fonts` order (regular, then bold). A font whose file is missing or unreadable is left
/// out: its texts then draw with the fallback after it (the built-in Chinese font of the same kind).
pub fn load(root: &Path, fonts: &[ProjectFont], document: &RenderDocument) -> Vec<ProjectFace> {
    let used = |family: &str| {
        document.pages.iter().flat_map(|page| &page.elements).any(|element| match &element.kind {
            RenderKind::Text(text) => text.fonts.iter().any(|font| font.eq_ignore_ascii_case(family)),
            _ => false,
        })
    };
    let read = |file: &FontFile| -> Option<Bytes> {
        // 專案檔驗證過；這裡再擋一次，絕不讀 assets/fonts 以外的檔案
        format::validate_asset_path_in(&file.src, FONT_ASSET_DIR).ok()?;
        std::fs::read(root.join(&file.src)).ok().map(Bytes::new)
    };
    let mut faces = Vec::new();
    for font in fonts {
        let family = project_font_family(&font.id);
        if !used(&family) {
            continue;
        }
        let Some(regular) = read(&font.regular) else { continue };
        let bold_file = font.bold.as_ref().unwrap_or(&font.regular);
        let bold = if font.bold.is_some() { read(bold_file) } else { Some(regular.clone()) };
        let Some(bold) = bold else { continue };
        for (is_bold, file, data) in [(false, &font.regular, regular), (true, bold_file, bold)] {
            faces.push(ProjectFace {
                family: family.clone(),
                bold: is_bold,
                src: file.src.clone(),
                data,
                ascent: file.ascent,
                descent: file.descent,
            });
        }
    }
    faces
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_project_families_safe_for_css() {
        assert!(is_project_family("project-font-0a1b-c_D"));
        assert!(is_project_family("Project-Font-abc"));
        for bad in ["project-font-", "project-font-a'b", "project-font-a b", "project-font-a\"", "Geist", "project-fon", ""] {
            assert!(!is_project_family(bad), "{bad}");
        }
        assert!(!is_project_family(&format!("project-font-{}", "x".repeat(65))));
    }
}
