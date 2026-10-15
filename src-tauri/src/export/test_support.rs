//! Fixtures shared by the export tests (`render` and `pdf` both build from the same project).

use super::fonts::BUNDLED_FONTS;
use super::world;
use super::render::{PathSegment, RenderDocument, RenderElement, RenderKind, RenderPage, RenderPath, RenderStroke};
use super::ExportRequest;
use crate::project::format::{parse_project, Document, Element, ASSET_DIR};
use std::path::Path;
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
    ExportRequest { document, text_layouts: HashMap::new(), shape_paths: HashMap::new() }
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

fn bundled(file: &str) -> &'static [u8] {
    BUNDLED_FONTS.iter().find(|font| font.file == file).unwrap().data
}

/// Writes real files for the fixture's two project fonts:「標題黑體」(`font-display`) = Noto Serif TC
/// Regular with Bold as its bold file,「書名明體」(`font-book`, no bold file) = Geist Regular. The files
/// differ from what the names suggest on purpose: the output must use exactly these files.
pub fn write_project_fonts(root: &Path, document: &Document) {
    let data = |id: &str, bold: bool| match (id, bold) {
        ("font-display", false) => bundled("NotoSerifTC-Regular.otf"),
        ("font-display", true) => bundled("NotoSerifTC-Bold.otf"),
        _ => bundled("Geist-Regular.ttf"),
    };
    for font in &document.fonts {
        for (file, bold) in std::iter::once((&font.regular, false)).chain(font.bold.as_ref().map(|bold| (bold, true))) {
            let path = root.join(&file.src);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, data(&font.id, bold)).unwrap();
        }
    }
}

/// The fixture with its first text element in a project font (`"project-font-<id>", <fallback>`).
pub fn document_with_project_font(id: &str, bold: bool) -> Document {
    let mut document = fixture_document();
    let Element::Text(text) = &mut document.pages[0].elements[0] else { panic!("expected text") };
    text.font_family = format!(r#""project-font-{id}", "Noto Sans TC", sans-serif"#);
    // 英文用專案字型的檔案；中文看那個檔案有沒有，沒有就用後面的內建黑體
    text.text = "Ab 中".to_owned();
    text.font_style = if bold { crate::project::format::FontStyle::Bold } else { crate::project::format::FontStyle::Normal };
    document
}
/// The project folder of the preview tests: `EXPORT_PROJECT_DIR` when set (a real project, so
/// its images and project fonts are read), otherwise a temporary one holding the fixture's image.
pub fn preview_root() -> (Option<tempfile::TempDir>, std::path::PathBuf) {
    match std::env::var("EXPORT_PROJECT_DIR") {
        Ok(dir) => (None, std::path::PathBuf::from(dir)),
        Err(_) => {
            let root = project_with_image();
            let path = root.path().to_path_buf();
            (Some(root), path)
        }
    }
}
/// A one-page render document holding a single path shape at (10, 10) on a 200 × 120 white page:
/// two separate red squares (0–60 and 100–160, 60 high) as the outline, and an open blue "L"
/// detail line (0, 80) → (60, 80) → (60, 100) that must stay open and unfilled.
pub fn path_shape_document() -> RenderDocument {
    use PathSegment::{Close, Line, Move};
    let path = RenderPath {
        width: 180.0,
        height: 100.0,
        outline: vec![
            Move(0.0, 0.0),
            Line(60.0, 0.0),
            Line(60.0, 60.0),
            Line(0.0, 60.0),
            Close,
            Move(100.0, 0.0),
            Line(160.0, 0.0),
            Line(160.0, 60.0),
            Line(100.0, 60.0),
            Close,
        ],
        fill: "#ff0000".into(),
        stroke: None,
        details: vec![Move(0.0, 80.0), Line(60.0, 80.0), Line(60.0, 100.0)],
        detail_stroke: Some(RenderStroke { color: "#0000ff".into(), width: 2.0, dash: None }),
    };
    RenderDocument {
        title: "path".into(),
        pages: vec![RenderPage {
            name: "Page-1".into(),
            width: 200.0,
            height: 120.0,
            background: "#ffffff".into(),
            elements: vec![RenderElement { x: 10.0, y: 10.0, rotation: 0.0, kind: RenderKind::Path(path) }],
        }],
    }
}
