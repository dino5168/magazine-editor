//! Export pipeline, shared by every output format.
//!
//! The editor's document first becomes a [`render::RenderDocument`]: the drawable form of one
//! document, with the text already split into lines by the editor ([`TextLayout`], measured by
//! Konva) so that every output wraps exactly like the canvas. Each format then draws that model —
//! [`pdf`] hands it to the embedded Typst compiler, [`epub`] writes fixed-layout XHTML pages.

pub mod epub;
pub mod fonts;
pub mod pdf;
pub mod render;
#[cfg(test)]
mod test_support;
pub mod world;

#[expect(unused_imports, reason = "階段 4 由 export command 呼叫；接上後移除這個屬性")]
pub use epub::render_epub;
pub use pdf::render_pdf;

use crate::project::format::Document;
use serde::Deserialize;
use std::collections::HashMap;

/// How the editor laid out one text element.
#[derive(Debug, Clone, Deserialize)]
pub struct TextLayout {
    /// Lines exactly as Konva wrapped them.
    pub lines: Vec<String>,
    /// Distance (pt) from the element's top to the first line's baseline.
    pub baseline: f64,
    /// Width (pt) of each line as Konva measured it, for the underline / strikethrough. Empty in
    /// requests captured before it existed; the lines then span the text box.
    #[serde(default, rename = "lineWidths")]
    pub line_widths: Vec<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub document: Document,
    /// Keyed by text element id.
    pub text_layouts: HashMap<String, TextLayout>,
}

#[derive(Debug)]
pub struct ExportOutput {
    /// The exported file.
    pub bytes: Vec<u8>,
    pub pages: usize,
    /// Images skipped because their file no longer exists in the project.
    pub skipped_images: usize,
}
