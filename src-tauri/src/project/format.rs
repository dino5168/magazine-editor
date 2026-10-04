//! `project.magproj` file format. Mirrors `src/lib/editor/types.ts`; the shared fixture
//! `tests/fixtures/sample.magproj` is round-tripped by both `cargo test` and vitest to catch drift.

use super::shape;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const FORMAT_ID: &str = "magazine-editor/project";
/// v2: element colors (`fill`) may carry alpha as `#rrggbbaa`. Page backgrounds stay `#rrggbb`.
/// v3: `rect` / `ellipse` / `polygon` / `star` merged into `shape` (box + geometry, `x` / `y` at the
/// top-left corner) with optional `stroke` and `label`. Older files are upgraded on read.
/// v4: `document.margins` (guides only). Older files and backups without it read as all 0; the
/// version bump stops older apps from opening (and silently dropping) it.
/// v5: `document.pageNumberRules`. Missing in older files and backups → no page numbers.
pub const SCHEMA_VERSION: u32 = 5;
pub const PROJECT_FILE_NAME: &str = "project.magproj";
/// Largest stroke width (pt); same as `STROKE_WIDTH_MAX` in `src/lib/editor/validation.ts`.
pub const STROKE_WIDTH_MAX: f64 = 100.0;
/// Most polygon sides / star points a file may contain (each is drawn as vertices); same as
/// `MAX_VERTEX_COUNT` in `src/lib/editor/validation.ts`.
pub const MAX_VERTEX_COUNT: u32 = 1000;
/// Largest page margin (pt), 2000 mm; same as `MARGIN_MAX_PT` in `src/lib/editor/validation.ts`.
pub const MARGIN_MAX_PT: f64 = 2000.0 * 72.0 / 25.4;
/// Font size range (pt); same as `FONT_SIZE_MIN` / `FONT_SIZE_MAX` in `src/lib/editor/validation.ts`.
/// Only page numbers are checked against it; elements rely on the UI.
pub const FONT_SIZE_MIN: f64 = 6.0;
pub const FONT_SIZE_MAX: f64 = 400.0;
/// Largest page number range end / start value; same as `PAGE_NUMBER_MAX` in `src/lib/editor/page-numbers.ts`.
pub const PAGE_NUMBER_MAX: u32 = 99999;
/// Longest page number prefix / suffix (characters); same as `PAGE_NUMBER_AFFIX_MAX_LENGTH`.
pub const PAGE_NUMBER_AFFIX_MAX_LENGTH: usize = 20;
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
    /// Canvas guides only; export ignores them. Missing in files before v4 → all 0.
    #[serde(default)]
    pub margins: Margins,
    /// Missing in files before v5 → no page numbers.
    #[serde(default, rename = "pageNumberRules")]
    pub page_number_rules: Vec<PageNumberRule>,
    pub pages: Vec<Page>,
}

/// Where a page number sits on the page.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PageNumberPosition {
    TopLeft,
    TopCenter,
    TopRight,
    MiddleLeft,
    MiddleRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

/// Settings for the odd or the even pages of a page number rule.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PageNumberFace {
    pub position: PageNumberPosition,
    pub prefix: String,
    pub suffix: String,
}

/// Look of a page number.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageNumberStyle {
    pub font_size: f64,
    pub font_family: String,
    pub font_style: FontStyle,
    pub fill: String,
    pub stroke: Option<Stroke>,
}

/// Page numbering of pages `from..=to` (1-based). The frontend turns it into a shape per page
/// before exporting, so the exporters never read it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PageNumberRule {
    pub id: String,
    pub from: u32,
    pub to: u32,
    /// Number shown on page `from`.
    pub start: u32,
    pub odd: PageNumberFace,
    pub even: PageNumberFace,
    pub style: PageNumberStyle,
}

/// Page margins in pt, the same for every page.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
pub struct Margins {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAlign {
    Top,
    Middle,
    Bottom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StrokeDash {
    Solid,
    Dashed,
    Dotted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Stroke {
    pub color: String,
    pub width: f64,
    pub dash: StrokeDash,
}

/// Text inside a shape (draw.io's label).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShapeLabel {
    pub text: String,
    pub font_size: f64,
    pub font_family: String,
    pub font_style: FontStyle,
    pub align: Align,
    pub vertical_align: VerticalAlign,
    pub fill: String,
}

/// What is drawn inside a shape's box.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ShapeGeometry {
    Rect {
        #[serde(rename = "cornerRadius")]
        corner_radius: f64,
    },
    Ellipse,
    /// Regular polygon stretched to fill the box.
    Polygon { sides: u32 },
    /// Star stretched to fill the box; `inner_ratio` = inner radius / outer radius.
    Star {
        #[serde(rename = "numPoints")]
        num_points: u32,
        #[serde(rename = "innerRatio")]
        inner_ratio: f64,
    },
}

/// Any box shape: `x` / `y` is the box's top-left corner, like every other element.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShapeElement {
    #[serde(flatten)]
    pub base: Base,
    pub width: f64,
    pub height: f64,
    pub geometry: ShapeGeometry,
    pub fill: String,
    pub stroke: Option<Stroke>,
    pub label: Option<ShapeLabel>,
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
    Shape(ShapeElement),
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

/// Only the fields needed to decide whether the rest of the file can be read.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Header {
    format: Option<String>,
    schema_version: Option<u32>,
}

/// Parses and validates a project file.
///
/// # Errors
/// - `AppError::UnsupportedVersion` when the file is newer than this app.
/// - `AppError::InvalidProject` when the JSON is malformed or fails validation.
pub fn parse_project(json: &str) -> AppResult<ProjectFile> {
    let header: Header = serde_json::from_str(json)?;
    if header.format.as_deref() != Some(FORMAT_ID) {
        return Err(AppError::invalid_project("not a magazine-editor project file"));
    }
    let project: ProjectFile = match header.schema_version {
        Some(version) if version > SCHEMA_VERSION => return Err(AppError::UnsupportedVersion(version)),
        Some(SCHEMA_VERSION) => serde_json::from_str(json)?,
        // v1 → v2 只放寬顏色格式（沒有升級步驟）；v1 / v2 → v3 把四種圖形改寫成 shape
        Some(1..SCHEMA_VERSION) => {
            let mut value: Value = serde_json::from_str(json)?;
            if let Some(document) = value.get_mut("document") {
                upgrade_shapes_to_v3(document);
            }
            serde_json::from_value(value)?
        }
        _ => return Err(AppError::invalid_project("missing or unknown schemaVersion")),
    };
    validate_content(&project.document, &project.assets)?;
    Ok(project)
}

/// Rotates `(dx, dy)` clockwise (y down) by `degrees`.
fn rotate_offset(dx: f64, dy: f64, degrees: f64) -> (f64, f64) {
    let (sin, cos) = degrees.to_radians().sin_cos();
    (dx * cos - dy * sin, dx * sin + dy * cos)
}

/// Converts one v2 `rect` / `ellipse` / `polygon` / `star` element to a v3 `shape`.
///
/// Returns `None` (leaving the element untouched, so deserialization reports it) when a field is
/// missing or has the wrong type.
fn upgrade_shape(element: &Map<String, Value>) -> Option<Map<String, Value>> {
    let number = |key: &str| element.get(key).and_then(Value::as_f64);
    let count = |key: &str| element.get(key).and_then(Value::as_u64).map(|n| u32::try_from(n).unwrap_or(u32::MAX));
    let (x, y, rotation) = (number("x")?, number("y")?, number("rotation")?);

    // 舊版 ellipse / polygon / star 以中心定位，算出中心到外框左上角的位移與外框尺寸
    let (geometry, corner, width, height) = match element.get("type")?.as_str()? {
        "rect" => {
            let geometry = serde_json::json!({ "kind": "rect", "cornerRadius": number("cornerRadius")? });
            return Some(shape_fields(element, x, y, number("width")?, number("height")?, geometry));
        }
        "ellipse" => {
            let (rx, ry) = (number("radiusX")?, number("radiusY")?);
            (serde_json::json!({ "kind": "ellipse" }), (-rx, -ry), 2.0 * rx, 2.0 * ry)
        }
        "polygon" => {
            let (sides, radius) = (count("sides")?, number("radius")?);
            let [min_x, min_y, max_x, max_y] = shape::point_bounds(&shape::polygon_unit_points(sides));
            let geometry = serde_json::json!({ "kind": "polygon", "sides": sides });
            (geometry, (min_x * radius, min_y * radius), (max_x - min_x) * radius, (max_y - min_y) * radius)
        }
        "star" => {
            let (num_points, inner, outer) = (count("numPoints")?, number("innerRadius")?, number("outerRadius")?);
            let ratio = if outer > 0.0 { inner / outer } else { 0.5 };
            let [min_x, min_y, max_x, max_y] = shape::point_bounds(&shape::star_unit_points(num_points, ratio));
            let geometry = serde_json::json!({ "kind": "star", "numPoints": num_points, "innerRatio": ratio });
            (geometry, (min_x * outer, min_y * outer), (max_x - min_x) * outer, (max_y - min_y) * outer)
        }
        _ => return None,
    };
    // 旋轉是繞定位點；新的定位點（左上角）要放在舊圖形旋轉後左上角所在的位置，外觀才不變
    let (dx, dy) = rotate_offset(corner.0, corner.1, rotation);
    Some(shape_fields(element, x + dx, y + dy, width, height, geometry))
}

fn shape_fields(element: &Map<String, Value>, x: f64, y: f64, width: f64, height: f64, geometry: Value) -> Map<String, Value> {
    let mut shape = Map::new();
    for key in ["id", "rotation", "fill"] {
        if let Some(value) = element.get(key) {
            shape.insert(key.to_owned(), value.clone());
        }
    }
    shape.insert("type".to_owned(), Value::from("shape"));
    shape.insert("x".to_owned(), Value::from(x));
    shape.insert("y".to_owned(), Value::from(y));
    shape.insert("width".to_owned(), Value::from(width));
    shape.insert("height".to_owned(), Value::from(height));
    shape.insert("geometry".to_owned(), geometry);
    shape.insert("stroke".to_owned(), Value::Null);
    shape.insert("label".to_owned(), Value::Null);
    shape
}

/// Rewrites every v1 / v2 shape element of a document JSON in place. Elements that are already v3
/// are left alone, so it is safe on content of unknown age (recovery files carry no version).
pub fn upgrade_shapes_to_v3(document: &mut Value) {
    let Some(pages) = document.get_mut("pages").and_then(Value::as_array_mut) else { return };
    for page in pages {
        let Some(elements) = page.get_mut("elements").and_then(Value::as_array_mut) else { continue };
        for element in elements {
            if let Some(shape) = element.as_object().and_then(upgrade_shape) {
                *element = Value::Object(shape);
            }
        }
    }
}

/// Validates document content received from the frontend or read from disk.
///
/// # Errors
/// Returns `AppError::InvalidProject` describing the first violation.
pub fn validate_content(document: &Document, assets: &[AssetInfo]) -> AppResult<()> {
    if document.pages.is_empty() {
        return Err(AppError::invalid_project("document has no pages"));
    }
    validate_margins(&document.margins)?;
    validate_page_number_rules(&document.page_number_rules)?;
    for page in &document.pages {
        require_id(&page.id)?;
        if !(page.width > 0.0 && page.height > 0.0) {
            return Err(AppError::invalid_project(format!("page {} has a non-positive size", page.id)));
        }
        require_background_color(&page.background)?;
        for element in &page.elements {
            validate_element(element)?;
        }
    }
    for asset in assets {
        validate_asset_path(&asset.src)?;
    }
    Ok(())
}

/// Same rules as TS `isMargins`: every side finite and in [0, MARGIN_MAX_PT]. Whether they fit the
/// page is not checked, so resizing pages never makes a file invalid.
fn validate_margins(margins: &Margins) -> AppResult<()> {
    for side in [margins.top, margins.right, margins.bottom, margins.left] {
        if !(side.is_finite() && (0.0..=MARGIN_MAX_PT).contains(&side)) {
            return Err(AppError::invalid_project(format!("invalid page margin {side}")));
        }
    }
    Ok(())
}

/// Same rules as TS `isPageNumberRules`: 1 ≤ from ≤ to ≤ PAGE_NUMBER_MAX, start ≤ PAGE_NUMBER_MAX,
/// single-line prefix / suffix of at most PAGE_NUMBER_AFFIX_MAX_LENGTH characters, font size in
/// range, valid colors and border, unique ids, and no two ranges sharing a page.
fn validate_page_number_rules(rules: &[PageNumberRule]) -> AppResult<()> {
    let invalid = |rule: &PageNumberRule, what: &str| AppError::invalid_project(format!("page number rule {}: {what}", rule.id));
    let affix_ok = |s: &str| s.chars().count() <= PAGE_NUMBER_AFFIX_MAX_LENGTH && !s.contains(['\r', '\n']);
    for rule in rules {
        require_id(&rule.id)?;
        if !(1 <= rule.from && rule.from <= rule.to && rule.to <= PAGE_NUMBER_MAX && rule.start <= PAGE_NUMBER_MAX) {
            return Err(invalid(rule, "invalid page range or start"));
        }
        if ![&rule.odd, &rule.even].iter().all(|face| affix_ok(&face.prefix) && affix_ok(&face.suffix)) {
            return Err(invalid(rule, "invalid prefix or suffix"));
        }
        if !(FONT_SIZE_MIN..=FONT_SIZE_MAX).contains(&rule.style.font_size) {
            return Err(invalid(rule, "invalid font size"));
        }
        require_element_color(&rule.style.fill)?;
        if let Some(stroke) = &rule.style.stroke {
            validate_stroke(stroke)?;
        }
    }
    let mut sorted: Vec<&PageNumberRule> = rules.iter().collect();
    sorted.sort_by_key(|rule| rule.from);
    for pair in sorted.windows(2) {
        if pair[1].from <= pair[0].to {
            return Err(invalid(pair[1], "overlaps another rule"));
        }
    }
    let ids: std::collections::HashSet<&str> = rules.iter().map(|rule| rule.id.as_str()).collect();
    if ids.len() != rules.len() {
        return Err(AppError::invalid_project("duplicate page number rule id"));
    }
    Ok(())
}

fn validate_stroke(stroke: &Stroke) -> AppResult<()> {
    require_element_color(&stroke.color)?;
    if !(stroke.width > 0.0 && stroke.width <= STROKE_WIDTH_MAX) {
        return Err(AppError::invalid_project(format!("invalid stroke width {}", stroke.width)));
    }
    Ok(())
}

fn validate_element(element: &Element) -> AppResult<()> {
    match element {
        Element::Text(e) => {
            require_id(&e.base.id)?;
            require_element_color(&e.fill)
        }
        Element::Shape(e) => {
            require_id(&e.base.id)?;
            require_element_color(&e.fill)?;
            validate_geometry(&e.geometry)?;
            if let Some(stroke) = &e.stroke {
                validate_stroke(stroke)?;
            }
            if let Some(label) = &e.label {
                require_element_color(&label.fill)?;
            }
            Ok(())
        }
        Element::Image(e) => {
            require_id(&e.base.id)?;
            validate_asset_path(&e.src)
        }
    }
}

/// Rejects geometry that cannot be drawn sensibly. Same rules as `isShapeGeometry` in
/// `src/lib/editor/validation.ts`. Fewer than 3 sides / 2 points are not rejected: drawing raises
/// them (`project/shape.rs`), so older files keep opening.
fn validate_geometry(geometry: &ShapeGeometry) -> AppResult<()> {
    let valid = match *geometry {
        ShapeGeometry::Rect { corner_radius } => corner_radius >= 0.0,
        ShapeGeometry::Ellipse => true,
        ShapeGeometry::Polygon { sides } => sides <= MAX_VERTEX_COUNT,
        ShapeGeometry::Star { num_points, inner_ratio } => {
            num_points <= MAX_VERTEX_COUNT && inner_ratio > 0.0 && inner_ratio <= 1.0
        }
    };
    if !valid {
        return Err(AppError::invalid_project(format!("invalid shape geometry {geometry:?}")));
    }
    Ok(())
}

fn require_id(id: &str) -> AppResult<()> {
    if id.is_empty() || id.len() > 64 {
        return Err(AppError::invalid_project("element or page id is empty or too long"));
    }
    Ok(())
}

/// `#` followed by exactly `digits` hex digits.
fn is_hex_color(color: &str, digits: usize) -> bool {
    let bytes = color.as_bytes();
    bytes.len() == digits + 1 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}

/// Page backgrounds are paper: `#rrggbb` only, no transparency.
fn require_background_color(color: &str) -> AppResult<()> {
    if !is_hex_color(color, 6) {
        return Err(AppError::invalid_project(format!("invalid background color {color:?}")));
    }
    Ok(())
}

/// Element colors: `#rrggbb` or `#rrggbbaa`.
fn require_element_color(color: &str) -> AppResult<()> {
    if !is_hex_color(color, 6) && !is_hex_color(color, 8) {
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
    /// The same document saved by a v2 app (shapes as `rect` / `ellipse` / `polygon` / `star`).
    const FIXTURE_V2: &str = include_str!("../../../tests/fixtures/sample-v2.magproj");

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
        let written: Value = serde_json::from_str(&serde_json::to_string_pretty(&project).unwrap()).unwrap();
        let original: Value = serde_json::from_str(FIXTURE).unwrap();
        assert_eq!(normalize(written), normalize(original));
    }

    #[test]
    fn fixture_contains_every_element_type() {
        let project = parse_project(FIXTURE).unwrap();
        let elements = &project.document.pages[0].elements;
        let kinds: std::collections::HashSet<_> = elements.iter().map(std::mem::discriminant).collect();
        assert_eq!(kinds.len(), 3);
        let geometries: std::collections::HashSet<_> = elements
            .iter()
            .filter_map(|element| match element {
                Element::Shape(shape) => Some(std::mem::discriminant(&shape.geometry)),
                _ => None,
            })
            .collect();
        assert_eq!(geometries.len(), 4);
        // stroke 與 label 兩種情況（有 / 沒有）都要出現
        let shapes = || elements.iter().filter_map(|element| if let Element::Shape(s) = element { Some(s) } else { None });
        assert!(shapes().any(|s| s.stroke.is_some()) && shapes().any(|s| s.stroke.is_none()));
        assert!(shapes().any(|s| s.label.is_some()) && shapes().any(|s| s.label.is_none()));
    }

    #[test]
    fn upgrades_v2_shapes_without_moving_them() {
        let upgraded = parse_project(FIXTURE_V2).unwrap().document.pages.remove(0).elements;
        let expected = parse_project(FIXTURE).unwrap().document.pages.remove(0).elements;
        assert_eq!(upgraded.len(), expected.len());
        let close = |a: f64, b: f64| (a - b).abs() < 1e-6;
        for (old, new) in upgraded.iter().zip(&expected) {
            match (old, new) {
                (Element::Shape(old), Element::Shape(new)) => {
                    assert_eq!(old.base.id, new.base.id);
                    assert!(
                        close(old.base.x, new.base.x) && close(old.base.y, new.base.y),
                        "{} moved: {:?} vs {:?}",
                        old.base.id,
                        (old.base.x, old.base.y),
                        (new.base.x, new.base.y)
                    );
                    assert!(close(old.width, new.width) && close(old.height, new.height), "{} resized", old.base.id);
                    assert_eq!(old.base.rotation, new.base.rotation);
                    assert_eq!(old.fill, new.fill);
                    // 舊版沒有邊框與圖形內文字
                    assert_eq!((&old.stroke, &old.label), (&None, &None));
                    match (&old.geometry, &new.geometry) {
                        (
                            ShapeGeometry::Star { num_points: a, inner_ratio: ra },
                            ShapeGeometry::Star { num_points: b, inner_ratio: rb },
                        ) => assert!(a == b && close(*ra, *rb)),
                        (a, b) => assert_eq!(a, b),
                    }
                }
                (old, new) => assert_eq!(old, new),
            }
        }
    }

    #[test]
    fn upgrade_keeps_the_rotated_centre_in_place() {
        // 中心 (100, 100)、旋轉 90° 的 40 × 20 橢圓：新的左上角是中心 + R(90°)·(−20, −10) = (110, 80)
        let mut value: Value = serde_json::from_str(FIXTURE_V2).unwrap();
        let ellipse = value.pointer_mut("/document/pages/0/elements/2").unwrap();
        for (key, number) in [("x", 100.0), ("y", 100.0), ("rotation", 90.0), ("radiusX", 20.0), ("radiusY", 10.0)] {
            ellipse[key] = Value::from(number);
        }
        let Element::Shape(shape) = &parse_project(&value.to_string()).unwrap().document.pages[0].elements[2] else {
            panic!("expected a shape")
        };
        assert!((shape.base.x - 110.0).abs() < 1e-9 && (shape.base.y - 80.0).abs() < 1e-9, "{:?}", shape.base);
        assert_eq!((shape.width, shape.height), (40.0, 20.0));
    }

    #[test]
    fn files_before_v4_open_with_zero_margins() {
        assert_eq!(parse_project(FIXTURE_V2).unwrap().document.margins, Margins::default());

        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(3);
        value["document"].as_object_mut().unwrap().remove("margins");
        assert_eq!(parse_project(&value.to_string()).unwrap().document.margins, Margins::default());

        // fixture（v4）的邊界不是 0，確認真的有讀到
        assert!(parse_project(FIXTURE).unwrap().document.margins.top > 0.0);
    }

    #[test]
    fn rejects_invalid_margins() {
        for (side, number) in [("top", -1.0), ("left", MARGIN_MAX_PT + 1.0)] {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            value["document"]["margins"][side] = Value::from(number);
            assert!(matches!(parse_project(&value.to_string()), Err(AppError::InvalidProject(_))), "{side} {number}");
        }
        // 邊界超過頁面尺寸不算錯誤（縮小紙張不能讓檔案變成不合法）
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["margins"]["right"] = Value::from(5000.0);
        assert!(parse_project(&value.to_string()).is_ok());
    }

    #[test]
    fn files_before_v5_open_without_page_numbers() {
        assert!(parse_project(FIXTURE_V2).unwrap().document.page_number_rules.is_empty());

        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["schemaVersion"] = Value::from(4);
        value["document"].as_object_mut().unwrap().remove("pageNumberRules");
        assert!(parse_project(&value.to_string()).unwrap().document.page_number_rules.is_empty());

        // fixture（v5）有兩段頁碼，確認真的有讀到
        let rules = parse_project(FIXTURE).unwrap().document.page_number_rules;
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[1].odd.position, PageNumberPosition::MiddleRight);
    }

    #[test]
    fn rejects_invalid_page_number_rules() {
        use serde_json::json;
        let with = |pointer: &str, replacement: Value| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            *value.pointer_mut(pointer).unwrap() = replacement;
            parse_project(&value.to_string())
        };
        const FIRST: &str = "/document/pageNumberRules/0";
        assert!(with(&format!("{FIRST}/start"), json!(0)).is_ok());
        for (field, bad) in [
            ("from", json!(0)),
            ("to", json!(PAGE_NUMBER_MAX + 1)),
            ("start", json!(-1)),
            ("from", json!(1.5)),
            ("odd/position", json!("center")),
            ("odd/prefix", json!("a\nb")),
            ("even/suffix", json!("字".repeat(PAGE_NUMBER_AFFIX_MAX_LENGTH + 1))),
            ("style/fontSize", json!(FONT_SIZE_MAX + 1.0)),
            ("style/fill", json!("red")),
            ("style/stroke", json!({ "color": "#000000", "width": 0, "dash": "solid" })),
            ("id", json!("")),
        ] {
            assert!(with(&format!("{FIRST}/{field}"), bad.clone()).is_err(), "{field} = {bad}");
        }
        // from > to
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["pageNumberRules"][0]["from"] = json!(5);
        value["document"]["pageNumberRules"][0]["to"] = json!(4);
        assert!(parse_project(&value.to_string()).is_err());
    }

    #[test]
    fn page_number_rules_may_not_overlap_or_share_ids() {
        let rules = |edit: &dyn Fn(&mut Value)| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            edit(&mut value["document"]["pageNumberRules"]);
            parse_project(&value.to_string())
        };
        // fixture：第 1–2 頁、第 3–999 頁；順序不影響
        assert!(rules(&|r| r.as_array_mut().unwrap().reverse()).is_ok());
        assert!(rules(&|r| r[1]["from"] = Value::from(2)).is_err());
        assert!(rules(&|r| r[1]["id"] = r[0]["id"].clone()).is_err());
    }

    #[test]
    fn unknown_top_level_fields_are_preserved() {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["futureField"] = Value::from("kept");
        let project = parse_project(&value.to_string()).unwrap();
        assert_eq!(project.extra.get("futureField"), Some(&Value::from("kept")));
        assert!(serde_json::to_string(&project).unwrap().contains("futureField"));
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
        value["schemaVersion"] = Value::from(0);
        assert!(matches!(parse_project(&value.to_string()), Err(AppError::InvalidProject(_))));
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value["document"]["pages"][0]["elements"][0]["type"] = Value::from("video");
        assert!(matches!(parse_project(&value.to_string()), Err(AppError::InvalidProject(_))));
    }

    #[test]
    fn opens_v1_files() {
        let mut value: Value = serde_json::from_str(FIXTURE_V2).unwrap();
        value["schemaVersion"] = Value::from(1);
        // v1 沒有透明度
        value["document"]["pages"][0]["elements"][1]["fill"] = Value::from("#e0e7ff");
        assert_eq!(parse_project(&value.to_string()).unwrap().schema_version, 1);
    }

    #[test]
    fn element_colors_may_have_alpha_but_backgrounds_may_not() {
        let with = |pointer: &str, color: &str| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            *value.pointer_mut(pointer).unwrap() = Value::from(color);
            parse_project(&value.to_string())
        };
        const FILL: &str = "/document/pages/0/elements/0/fill";
        const BACKGROUND: &str = "/document/pages/0/background";
        assert!(with(FILL, "#171717").is_ok());
        assert!(with(FILL, "#17171780").is_ok());
        assert!(with(FILL, "#1717178").is_err());
        assert!(with(FILL, "#171717800").is_err());
        assert!(with(FILL, "#17171g80").is_err());
        assert!(with(BACKGROUND, "#ffffff").is_ok());
        assert!(with(BACKGROUND, "#ffffff80").is_err());
        // 邊框與圖形內文字的顏色也要檢查（fixture 的橢圓兩者都有）
        assert!(with("/document/pages/0/elements/2/stroke/color", "#be123c80").is_ok());
        assert!(with("/document/pages/0/elements/2/stroke/color", "red").is_err());
        assert!(with("/document/pages/0/elements/2/label/fill", "red").is_err());
    }

    #[test]
    fn geometry_must_be_drawable() {
        let with = |index: usize, geometry: Value| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            value["document"]["pages"][0]["elements"][index]["geometry"] = geometry;
            parse_project(&value.to_string())
        };
        use serde_json::json;
        assert!(with(1, json!({ "kind": "rect", "cornerRadius": 0 })).is_ok());
        assert!(with(1, json!({ "kind": "rect", "cornerRadius": -1 })).is_err());
        assert!(with(3, json!({ "kind": "polygon", "sides": 8 })).is_ok());
        // 繪製時會補到 3 邊，舊檔不因此打不開
        assert!(with(3, json!({ "kind": "polygon", "sides": 2 })).is_ok());
        assert!(with(3, json!({ "kind": "polygon", "sides": MAX_VERTEX_COUNT + 1 })).is_err());
        assert!(with(4, json!({ "kind": "star", "numPoints": 6, "innerRatio": 1.0 })).is_ok());
        assert!(with(4, json!({ "kind": "star", "numPoints": 6, "innerRatio": 0.0 })).is_err());
        assert!(with(4, json!({ "kind": "star", "numPoints": 6, "innerRatio": 1.5 })).is_err());
    }

    #[test]
    fn stroke_width_must_be_positive_and_bounded() {
        let with_width = |width: f64| {
            let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
            value["document"]["pages"][0]["elements"][2]["stroke"]["width"] = Value::from(width);
            parse_project(&value.to_string())
        };
        assert!(with_width(0.25).is_ok());
        assert!(with_width(STROKE_WIDTH_MAX).is_ok());
        assert!(with_width(0.0).is_err());
        assert!(with_width(-1.0).is_err());
        assert!(with_width(STROKE_WIDTH_MAX + 1.0).is_err());
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
