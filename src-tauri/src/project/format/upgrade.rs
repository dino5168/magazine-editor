//! Upgrades older files (v1 / v2 shapes → v3).

use crate::project::shape;
use serde_json::{Map, Value};

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
