//! Export pipeline, shared by every output format.
//!
//! The editor's document first becomes a [`render::RenderDocument`]: the drawable form of one
//! document, with the text already split into lines by the editor ([`TextLayout`], measured by
//! Konva) so that every output wraps exactly like the canvas. Each format then draws that model —
//! [`pdf`] hands it to the embedded Typst compiler, [`epub`] writes fixed-layout XHTML pages.

pub mod document_fonts;
pub mod epub;
pub mod flipbook;
pub mod fonts;
pub mod html;
pub mod pdf;
pub mod render;
#[cfg(test)]
mod test_support;
pub mod world;

#[expect(unused_imports, reason = "階段 4 由 export command 呼叫；接上後移除這個屬性")]
pub use epub::render_epub;
pub use pdf::render_pdf;

use crate::project::format::{Document, Stroke};
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
    /// Distributed text only: distance (pt) between neighbouring characters of each line, as the
    /// canvas spreads them (letter spacing included). Empty otherwise.
    #[serde(default, rename = "lineGaps")]
    pub line_gaps: Vec<f64>,
    /// Text with paragraph indents only: where each line may go, as the editor laid it out (TS
    /// `layoutIndentedText`); a line is aligned within its box. Empty otherwise (the box is the
    /// whole text box).
    #[serde(default, rename = "lineBoxes")]
    pub line_boxes: Vec<LineBox>,
}

/// Room of one line of indented text (TS `LineBox`).
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub struct LineBox {
    /// pt from the text box's left edge.
    pub start: f64,
    /// pt.
    pub width: f64,
}

/// One command of a shape-library outline, as the editor sends it (`PathCommand` in
/// `src/lib/editor/shape-path.ts`): pt relative to the shape's box.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(tag = "op")]
pub enum PathCommand {
    M { x: f64, y: f64 },
    L { x: f64, y: f64 },
    C { x1: f64, y1: f64, x2: f64, y2: f64, x: f64, y: f64 },
    Z,
}

/// The outline of one shape-library shape, computed by the editor (`ExportShapePath` in
/// `src/lib/export/export-request.ts`). Rust does not know the library; it only draws these.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapePath {
    /// Filled and stroked.
    pub outline: Vec<PathCommand>,
    /// Stroked only.
    #[serde(default)]
    pub details: Vec<PathCommand>,
    /// The details' line; `None` when there are no details.
    #[serde(default)]
    pub detail_stroke: Option<Stroke>,
}

/// Where an image frame's photo is drawn, in the shape's coordinates (`photoPlacement` in
/// `src/lib/editor/shape-image.ts`); may extend past the frame, the outline clips it.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub struct PhotoPlacement {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub document: Document,
    /// Keyed by text element id.
    pub text_layouts: HashMap<String, TextLayout>,
    /// Keyed by shape element id. A shape-library shape without an entry (one the editor does
    /// not know) is skipped.
    #[serde(default)]
    pub shape_paths: HashMap<String, ShapePath>,
    /// Keyed by shape element id: where each image frame's photo goes. Every shape with a photo
    /// has an entry (the editor computes it, Rust does not repeat the formula).
    #[serde(default)]
    pub shape_photos: HashMap<String, PhotoPlacement>,
}

#[derive(Debug)]
pub struct ExportOutput {
    /// The exported file.
    pub bytes: Vec<u8>,
    pub pages: usize,
    /// Images skipped because their file no longer exists in the project, or the format cannot
    /// draw it (an SVG Typst cannot read, a file EPUB cannot show).
    pub skipped_images: usize,
}
