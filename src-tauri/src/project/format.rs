//! `project.magproj` file format. Mirrors `src/lib/editor/types.ts`; the shared fixture
//! `tests/fixtures/sample.magproj` is round-tripped by both `cargo test` and vitest to catch drift.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const FORMAT_ID: &str = "magazine-editor/project";
pub const SCHEMA_VERSION: u32 = 1;
pub const PROJECT_FILE_NAME: &str = "project.magproj";
pub const ASSET_DIR: &str = "assets/images";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub format: String,
    pub schema_version: u32,
    pub id: String,
    pub created_at: String,
    pub modified_at: String,
    pub app_version: String,
    pub document: Document,
    pub assets: Vec<AssetInfo>,
    /// Top-level fields written by newer app versions; preserved on save.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Document {
    pub name: String,
    pub pages: Vec<Page>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Page {
    pub id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub background: String,
    pub elements: Vec<Element>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Base {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub rotation: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FontStyle {
    Normal,
    Bold,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Align {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextElement {
    #[serde(flatten)]
    pub base: Base,
    pub text: String,
    pub width: f64,
    pub font_size: f64,
    pub font_family: String,
    pub font_style: FontStyle,
    pub align: Align,
    pub fill: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RectElement {
    #[serde(flatten)]
    pub base: Base,
    pub width: f64,
    pub height: f64,
    pub corner_radius: f64,
    pub fill: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EllipseElement {
    #[serde(flatten)]
    pub base: Base,
    pub radius_x: f64,
    pub radius_y: f64,
    pub fill: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PolygonElement {
    #[serde(flatten)]
    pub base: Base,
    pub sides: u32,
    pub radius: f64,
    pub fill: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StarElement {
    #[serde(flatten)]
    pub base: Base,
    pub num_points: u32,
    pub inner_radius: f64,
    pub outer_radius: f64,
    pub fill: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImageElement {
    #[serde(flatten)]
    pub base: Base,
    /// Project-relative path under `assets/images/`.
    pub src: String,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Element {
    Text(TextElement),
    Rect(RectElement),
    Ellipse(EllipseElement),
    Polygon(PolygonElement),
    Star(StarElement),
    Image(ImageElement),
}

/// An image stored in the project's `assets/images/` (listed in the upload panel).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AssetInfo {
    /// Project-relative path, e.g. `assets/images/<hash>.png`.
    pub src: String,
    /// Original file name shown to the user.
    pub name: String,
    /// Intrinsic size in pixels.
    pub width: f64,
    pub height: f64,
}

/// The editable part of a project, exchanged with the frontend on open / save.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectContent {
    pub document: Document,
    pub assets: Vec<AssetInfo>,
}

/// Parses and validates a project file, upgrading older schema versions.
///
/// # Errors
/// - `AppError::UnsupportedVersion` when the file is newer than this app.
/// - `AppError::InvalidProject` when the JSON is malformed or fails validation.
pub fn parse_project(json: &str) -> AppResult<ProjectFile> {
    let mut value: Value = serde_json::from_str(json)?;
    let format = value.get("format").and_then(Value::as_str);
    if format != Some(FORMAT_ID) {
        return Err(AppError::invalid_project("not a magazine-editor project file"));
    }
    let version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .and_then(|v| u32::try_from(v).ok())
        .ok_or_else(|| AppError::invalid_project("missing schemaVersion"))?;
    if version > SCHEMA_VERSION {
        return Err(AppError::UnsupportedVersion(version));
    }
    migrate(&mut value, version)?;
    let project: ProjectFile = serde_json::from_value(value)?;
    validate_content(&project.document, &project.assets)?;
    Ok(project)
}

// 依序把舊版 JSON 升級到 SCHEMA_VERSION。v1 是第一版，目前沒有升級步驟；
// 發布 v2 時在此加上 `if from < 2 { upgrade_1_to_2(value)?; }` 並把 schemaVersion 改寫為新版
fn migrate(_value: &mut Value, from: u32) -> AppResult<()> {
    if from < 1 {
        return Err(AppError::invalid_project(format!("unknown schema version {from}")));
    }
    Ok(())
}

/// Serializes a project file as pretty-printed JSON (readable in a text editor, diff-friendly).
///
/// # Errors
/// Returns `AppError::InvalidProject` if serialization fails.
pub fn to_json(project: &ProjectFile) -> AppResult<String> {
    Ok(serde_json::to_string_pretty(project)?)
}

/// Validates document content received from the frontend or read from disk.
///
/// # Errors
/// Returns `AppError::InvalidProject` describing the first violation.
pub fn validate_content(document: &Document, assets: &[AssetInfo]) -> AppResult<()> {
    if document.pages.is_empty() {
        return Err(AppError::invalid_project("document has no pages"));
    }
    for page in &document.pages {
        require_id(&page.id)?;
        if !(page.width > 0.0 && page.height > 0.0) {
            return Err(AppError::invalid_project(format!("page {} has a non-positive size", page.id)));
        }
        require_color(&page.background)?;
        for element in &page.elements {
            validate_element(element)?;
        }
    }
    for asset in assets {
        validate_asset_path(&asset.src)?;
    }
    Ok(())
}

fn validate_element(element: &Element) -> AppResult<()> {
    match element {
        Element::Text(e) => {
            require_id(&e.base.id)?;
            require_color(&e.fill)
        }
        Element::Rect(e) => {
            require_id(&e.base.id)?;
            require_color(&e.fill)
        }
        Element::Ellipse(e) => {
            require_id(&e.base.id)?;
            require_color(&e.fill)
        }
        Element::Polygon(e) => {
            require_id(&e.base.id)?;
            require_color(&e.fill)
        }
        Element::Star(e) => {
            require_id(&e.base.id)?;
            require_color(&e.fill)
        }
        Element::Image(e) => {
            require_id(&e.base.id)?;
            validate_asset_path(&e.src)
        }
    }
}

fn require_id(id: &str) -> AppResult<()> {
    if id.is_empty() || id.len() > 64 {
        return Err(AppError::invalid_project("element or page id is empty or too long"));
    }
    Ok(())
}

fn require_color(color: &str) -> AppResult<()> {
    let bytes = color.as_bytes();
    let valid = bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit);
    if !valid {
        return Err(AppError::invalid_project(format!("invalid color {color:?}")));
    }
    Ok(())
}

/// Accepts only `assets/images/<file>` with a plain file name, so a crafted project file cannot
/// make the app read or delete files outside the project folder.
///
/// # Errors
/// Returns `AppError::InvalidProject` for any other path.
pub fn validate_asset_path(src: &str) -> AppResult<()> {
    let file = src
        .strip_prefix(ASSET_DIR)
        .and_then(|rest| rest.strip_prefix('/'))
        .ok_or_else(|| AppError::invalid_project(format!("image path {src:?} is outside {ASSET_DIR}")))?;
    let plain = !file.is_empty()
        && file != "."
        && file != ".."
        && !file.contains(['/', '\\', ':', '\0'])
        && !file.starts_with('.');
    if !plain {
        return Err(AppError::invalid_project(format!("invalid image path {src:?}")));
    }
    Ok(())
}

/// Returns every asset path referenced by the document or listed in the asset panel.
pub fn referenced_assets<'a>(document: &'a Document, assets: &'a [AssetInfo]) -> impl Iterator<Item = &'a str> {
    let from_elements = document.pages.iter().flat_map(|page| {
        page.elements.iter().filter_map(|element| match element {
            Element::Image(image) => Some(image.src.as_str()),
            _ => None,
        })
    });
    from_elements.chain(assets.iter().map(|asset| asset.src.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../../tests/fixtures/sample.magproj");

    // TS 寫出的整數（例如 0）在 Rust 會以 0.0 寫回；比較時把數字一律視為 f64
    fn normalize(value: Value) -> Value {
        match value {
            Value::Number(n) => Value::from(n.as_f64().unwrap()),
            Value::Array(items) => Value::Array(items.into_iter().map(normalize).collect()),
            Value::Object(map) => Value::Object(map.into_iter().map(|(k, v)| (k, normalize(v))).collect()),
            other => other,
        }
    }

    #[test]
    fn fixture_round_trips_without_losing_fields() {
        let project = parse_project(FIXTURE).unwrap();
        let written: Value = serde_json::from_str(&to_json(&project).unwrap()).unwrap();
        let original: Value = serde_json::from_str(FIXTURE).unwrap();
        assert_eq!(normalize(written), normalize(original));
    }

    #[test]
    fn fixture_contains_every_element_type() {
        let project = parse_project(FIXTURE).unwrap();
        let kinds: std::collections::HashSet<_> = project.document.pages[0]
            .elements
            .iter()
            .map(std::mem::discriminant)
            .collect();
        assert_eq!(kinds.len(), 6);
    }

    #[test]
    fn unknown_top_level_fields_are_preserved() {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["futureField"] = Value::from("kept");
        let project = parse_project(&value.to_string()).unwrap();
        assert_eq!(project.extra.get("futureField"), Some(&Value::from("kept")));
        assert!(to_json(&project).unwrap().contains("futureField"));
    }

    #[test]
    fn rejects_newer_schema_version() {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(SCHEMA_VERSION + 1);
        let error = parse_project(&value.to_string()).unwrap_err();
        assert!(matches!(error, AppError::UnsupportedVersion(v) if v == SCHEMA_VERSION + 1));
    }

    #[test]
    fn rejects_foreign_or_malformed_files() {
        assert!(matches!(parse_project("{"), Err(AppError::InvalidProject(_))));
        assert!(matches!(parse_project(r#"{"format":"other"}"#), Err(AppError::InvalidProject(_))));
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["pages"][0]["elements"][0]["type"] = Value::from("video");
        assert!(matches!(parse_project(&value.to_string()), Err(AppError::InvalidProject(_))));
    }

    #[test]
    fn rejects_invalid_colors_and_empty_documents() {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["pages"][0]["background"] = Value::from("red");
        assert!(parse_project(&value.to_string()).is_err());
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["pages"] = Value::Array(vec![]);
        assert!(parse_project(&value.to_string()).is_err());
    }

    #[test]
    fn asset_paths_must_stay_inside_assets_dir() {
        assert!(validate_asset_path("assets/images/abc.png").is_ok());
        for bad in [
            "assets/images/../../secret.txt",
            "assets/images/sub/abc.png",
            "assets/images/..",
            "assets/images/",
            "assets/images/.hidden",
            "assets/images/a\\b.png",
            "C:/Windows/win.ini",
            "/etc/passwd",
            "blob:http://localhost/1",
            "assets/imagesX/abc.png",
        ] {
            assert!(validate_asset_path(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn referenced_assets_includes_elements_and_asset_list() {
        let project = parse_project(FIXTURE).unwrap();
        let refs: Vec<_> = referenced_assets(&project.document, &project.assets).collect();
        assert!(refs.iter().all(|src| src.starts_with("assets/images/")));
        assert!(refs.len() >= 2);
    }
}
