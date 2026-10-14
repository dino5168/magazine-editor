//! `styles/page.css`: the shared `@font-face` and page rules, plus the document rules of an EPUB
//! page (the page is the whole document).

use crate::export::html::css::{font_faces, PAGE_RULES};
use crate::export::html::EmbeddedFont;

const DOCUMENT_RULES: &str = "html, body { margin: 0; padding: 0; overflow: hidden; }\n";

/// Builds the stylesheet.
///
/// # Args
/// * `fonts` - Embedded font files, each stored at `fonts/<file>` inside the EPUB.
pub fn stylesheet(fonts: &[EmbeddedFont]) -> String {
    font_faces(fonts) + DOCUMENT_RULES + PAGE_RULES
}
