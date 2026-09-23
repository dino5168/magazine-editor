//! Fixtures shared by the export tests (`render` and `pdf` both build from the same project).

use super::world;
use super::ExportRequest;
use crate::project::format::{parse_project, Document, ASSET_DIR};
use std::collections::HashMap;
use typst::text::Font;

const FIXTURE: &str = include_str!("../../../tests/fixtures/sample.magproj");
/// 1×1 PNG
const PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49,
    0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x30, 0x9E, 0x79, 0x06, 0x00, 0x02, 0x9B, 0x01, 0x99, 0xF1, 0x32, 0x58, 0x2A,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

/// An export request without any layout data, so the fallback in `text_layout` applies.
pub fn request(document: Document) -> ExportRequest {
    ExportRequest { document, text_layouts: HashMap::new() }
}

/// The document from `tests/fixtures/sample.magproj` (one page, all six element types).
pub fn fixture_document() -> Document {
    parse_project(FIXTURE).unwrap().document
}

/// A temporary project folder holding the image the fixture references.
pub fn project_with_image() -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    let src = &parse_project(FIXTURE).unwrap().assets[0].src;
    std::fs::create_dir_all(root.path().join(ASSET_DIR)).unwrap();
    std::fs::write(root.path().join(src), PNG).unwrap();
    root
}

pub fn fonts() -> Vec<Font> {
    world::load_fonts()
}
