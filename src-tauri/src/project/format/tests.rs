use super::*;

const FIXTURE: &str = include_str!("../../../../tests/fixtures/sample.magproj");
/// The same document saved by a v2 app (shapes as `rect` / `ellipse` / `polygon` / `star`).
const FIXTURE_V2: &str = include_str!("../../../../tests/fixtures/sample-v2.magproj");

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
fn lines_keep_their_points_ends_and_swatch_link() {
    let project = parse_project(FIXTURE).unwrap();
    let Element::Line(line) = &project.document.masters[1].elements[3] else { panic!("expected the arrow line") };
    assert_eq!(line.points.len(), 3);
    assert_eq!((line.path, line.compound), (LinePath::Straight, LineCompound::Single));
    assert_eq!(line.end, LineEnd { arrowhead: LineArrowhead::Triangle, scale: 1.5 });
    assert_eq!(line.stroke.swatch_id.as_deref(), Some("swatch-indigo"));
}

#[test]
fn invalid_lines_are_rejected() {
    use serde_json::json;
    const LINE: &str = "/document/masters/1/elements/3";
    let with = |field: &str, replacement: Value| {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        *value.pointer_mut(&format!("{LINE}/{field}")).unwrap() = replacement;
        parse_project(&value.to_string())
    };
    assert!(with("points", json!([{ "x": 0, "y": 0 }, { "x": -LINE_COORDINATE_MAX, "y": 0 }])).is_ok());
    let too_many: Vec<Value> = (0..=MAX_LINE_POINTS).map(|x| json!({ "x": x, "y": 0 })).collect();
    for (field, bad) in [
        ("points", json!([{ "x": 0, "y": 0 }])),
        ("points", Value::from(too_many)),
        ("points", json!([{ "x": 0, "y": 0 }, { "x": 2e6, "y": 0 }])),
        ("path", json!("bezier")),
        ("compound", json!("triple")),
        ("stroke", Value::Null),
        ("stroke", json!({ "color": "#000000", "swatchId": "missing", "width": 1, "dash": "solid" })),
        ("end", json!({ "arrowhead": "circle", "scale": 1 })),
        ("start", json!({ "arrowhead": "open", "scale": LINE_END_SCALE_MAX + 1.0 })),
        ("id", json!("")),
    ] {
        assert!(with(field, bad.clone()).is_err(), "{field} = {bad}");
    }
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
    // 圖形庫的圖形放在主頁（第 1 頁要和 v2 fixture 逐一比對）
    let preset = project.document.masters.iter().flat_map(|master| &master.elements).find_map(|element| match element {
        Element::Shape(ShapeElement { geometry: ShapeGeometry::Preset { preset, params }, .. }) => Some((preset, params)),
        _ => None,
    });
    let (preset, params) = preset.expect("a master holds a shape-library shape");
    assert_eq!((preset.as_str(), params.get("size")), ("hexagon", Some(&0.25)));
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
                    // v11 起 fixture 的圓角矩形四角不同（左上 12）；舊版只有一個數字
                    (ShapeGeometry::Rect { corner_radius: a }, ShapeGeometry::Rect { corner_radius: b }) => {
                        assert_eq!(*a, CornerRadius::Uniform(12.0));
                        assert_eq!(b.radii()[0], 12.0);
                    }
                    (a, b) => assert_eq!(a, b),
                }
            }
            // v6 之前沒有文字裝飾、v9 之前沒有行距與字距、v16 之前沒有縮排：讀成預設值，其他欄位不變
            (Element::Text(old), Element::Text(new)) => {
                assert_eq!(old.decoration, TextDecoration::default());
                assert_eq!(old.spacing, TextSpacing::default());
                assert_eq!(old.indent, TextIndent::default());
                assert_eq!(
                    *old,
                    TextElement {
                        decoration: TextDecoration::default(),
                        spacing: TextSpacing::default(),
                        indent: TextIndent::default(),
                        ..new.clone()
                    }
                );
            }
            (old, new) => assert_eq!(old, new),
        }
    }
}

#[test]
fn reads_text_decoration_and_defaults_it_in_older_files() {
    let project = parse_project(FIXTURE).unwrap();
    let Element::Text(text) = &project.document.pages[0].elements[0] else { panic!("expected text") };
    let shadow = TextShadow { color: "#00000080".to_owned(), swatch_id: None, offset_x: 2.0, offset_y: -1.5 };
    assert_eq!(
        text.decoration,
        TextDecoration { italic: true, underline: true, strikethrough: true, shadow: Some(shadow) }
    );
    assert!(project.document.page_number_rules[1].style.decoration.italic);

    // v5 檔案沒有這些欄位
    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    value["schemaVersion"] = Value::from(5);
    for key in ["italic", "underline", "strikethrough", "shadow"] {
        value.pointer_mut("/document/pages/0/elements/0").unwrap().as_object_mut().unwrap().remove(key);
    }
    let Element::Text(text) = &parse_project(&value.to_string()).unwrap().document.pages[0].elements[0] else {
        panic!("expected text")
    };
    assert_eq!(text.decoration, TextDecoration::default());
}

#[test]
fn reads_text_spacing_and_defaults_it_in_older_files() {
    let project = parse_project(FIXTURE).unwrap();
    let Element::Text(text) = &project.document.pages[0].elements[0] else { panic!("expected text") };
    assert_eq!(text.spacing, TextSpacing { line_height: 1.4, letter_spacing: -20.0 });
    let footer = project.document.text_styles.iter().find(|style| style.id == "style-footer").unwrap();
    assert_eq!(footer.spacing, TextSpacing { line_height: 1.2, letter_spacing: 50.0 });

    // v8 檔案沒有這兩個欄位：讀成以前固定的 1.2 / 0
    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    value["schemaVersion"] = Value::from(8);
    let remove = |value: &mut Value, pointer: &str| {
        let object = value.pointer_mut(pointer).unwrap().as_object_mut().unwrap();
        object.remove("lineHeight");
        object.remove("letterSpacing");
    };
    remove(&mut value, "/document/pages/0/elements/0");
    remove(&mut value, "/document/pages/0/elements/2/label");
    remove(&mut value, "/document/textStyles/0");
    let document = parse_project(&value.to_string()).unwrap().document;
    let Element::Text(text) = &document.pages[0].elements[0] else { panic!("expected text") };
    let Element::Shape(ellipse) = &document.pages[0].elements[2] else { panic!("expected the ellipse") };
    assert_eq!(text.spacing, TextSpacing::default());
    assert_eq!(ellipse.label.as_ref().unwrap().spacing, TextSpacing { line_height: DEFAULT_LINE_HEIGHT, letter_spacing: 0.0 });
    assert_eq!(document.text_styles[0].spacing, TextSpacing::default());
}

#[test]
fn reads_the_distributed_alignment_and_rejects_unknown_ones() {
    let project = parse_project(FIXTURE).unwrap();
    let heading = project.document.text_styles.iter().find(|style| style.id == "text-style-heading").unwrap();
    assert_eq!(heading.align, Align::Distributed);
    let saved = serde_json::to_value(heading).unwrap();
    assert_eq!(saved["align"], "distributed");

    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    value["document"]["pages"][0]["elements"][0]["align"] = Value::from("justify");
    assert!(parse_project(&value.to_string()).is_err());
}

#[test]
fn reads_text_indents_and_defaults_them_in_older_files() {
    let project = parse_project(FIXTURE).unwrap();
    let Element::Text(text) = &project.document.pages[0].elements[0] else { panic!("expected text") };
    assert_eq!(text.indent, TextIndent { indent_left: 0.0, indent_right: 1.0, indent_first_line: 2.0 });
    let footer = project.document.text_styles.iter().find(|style| style.id == "style-footer").unwrap();
    assert_eq!(footer.indent, TextIndent { indent_left: 2.0, indent_right: 0.0, indent_first_line: -2.0 });
    let saved = serde_json::to_value(footer).unwrap();
    assert_eq!((saved["indentLeft"].as_f64(), saved["indentFirstLine"].as_f64()), (Some(2.0), Some(-2.0)));

    // v15 檔案沒有這三個欄位：讀成 0
    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    value["schemaVersion"] = Value::from(15);
    let remove = |value: &mut Value, pointer: &str| {
        let object = value.pointer_mut(pointer).unwrap().as_object_mut().unwrap();
        for key in ["indentLeft", "indentRight", "indentFirstLine"] {
            object.remove(key);
        }
    };
    remove(&mut value, "/document/pages/0/elements/0");
    remove(&mut value, "/document/pages/0/elements/2/label");
    remove(&mut value, "/document/textStyles/0");
    let document = parse_project(&value.to_string()).unwrap().document;
    let Element::Text(text) = &document.pages[0].elements[0] else { panic!("expected text") };
    let Element::Shape(ellipse) = &document.pages[0].elements[2] else { panic!("expected the ellipse") };
    assert_eq!(text.indent, TextIndent::default());
    assert_eq!(ellipse.label.as_ref().unwrap().indent, TextIndent::default());
    assert_eq!(document.text_styles[0].indent, TextIndent::default());
}

#[test]
fn rejects_text_indents_out_of_range() {
    let with = |pointer: &str, fields: [(&str, f64); 3]| {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        for (key, number) in fields {
            value.pointer_mut(pointer).unwrap()[key] = Value::from(number);
        }
        parse_project(&value.to_string())
    };
    let indent = |left: f64, right: f64, first: f64| [("indentLeft", left), ("indentRight", right), ("indentFirstLine", first)];
    for pointer in ["/document/pages/0/elements/0", "/document/pages/0/elements/2/label", "/document/textStyles/0"] {
        assert!(with(pointer, indent(TEXT_INDENT_MAX, TEXT_INDENT_MAX, TEXT_INDENT_MAX)).is_ok(), "{pointer}");
        // 首行突排：首行 = −左縮排
        assert!(with(pointer, indent(2.0, 0.0, -2.0)).is_ok(), "{pointer}");
        assert!(with(pointer, indent(2.0, 0.0, -2.5)).is_err(), "{pointer}");
        assert!(with(pointer, indent(-1.0, 0.0, 0.0)).is_err(), "{pointer}");
        assert!(with(pointer, indent(0.0, 20.5, 0.0)).is_err(), "{pointer}");
        assert!(with(pointer, indent(0.0, 0.0, 20.5)).is_err(), "{pointer}");
    }
}

#[test]
fn rejects_text_spacing_out_of_range() {
    let with = |pointer: &str, key: &str, number: f64| {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value.pointer_mut(pointer).unwrap()[key] = Value::from(number);
        parse_project(&value.to_string())
    };
    for pointer in ["/document/pages/0/elements/0", "/document/pages/0/elements/2/label", "/document/textStyles/0"] {
        assert!(with(pointer, "lineHeight", LINE_HEIGHT_MIN).is_ok(), "{pointer}");
        assert!(with(pointer, "lineHeight", LINE_HEIGHT_MAX).is_ok(), "{pointer}");
        assert!(with(pointer, "lineHeight", 0.4).is_err(), "{pointer}");
        assert!(with(pointer, "lineHeight", 3.1).is_err(), "{pointer}");
        assert!(with(pointer, "letterSpacing", LETTER_SPACING_MIN).is_ok(), "{pointer}");
        assert!(with(pointer, "letterSpacing", LETTER_SPACING_MAX).is_ok(), "{pointer}");
        assert!(with(pointer, "letterSpacing", -201.0).is_err(), "{pointer}");
        assert!(with(pointer, "letterSpacing", 1001.0).is_err(), "{pointer}");
    }
}

#[test]
fn rejects_invalid_text_shadows() {
    let with_shadow = |pointer: &str, shadow: Value| {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value.pointer_mut(pointer).unwrap()["shadow"] = shadow;
        parse_project(&value.to_string())
    };
    let ok = serde_json::json!({ "color": "#000000", "offsetX": 50, "offsetY": -50 });
    for pointer in ["/document/pages/0/elements/0", "/document/pages/0/elements/2/label", "/document/pageNumberRules/0/style"] {
        assert!(with_shadow(pointer, ok.clone()).is_ok(), "{pointer}");
        assert!(with_shadow(pointer, serde_json::json!({ "color": "#000000", "offsetX": 50.5, "offsetY": 0 })).is_err());
        assert!(with_shadow(pointer, serde_json::json!({ "color": "black", "offsetX": 0, "offsetY": 0 })).is_err());
        assert!(with_shadow(pointer, serde_json::json!({ "color": "#000000", "offsetX": 0 })).is_err());
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
fn reads_four_corner_radii_and_keeps_a_single_number() {
    let project = parse_project(FIXTURE).unwrap();
    let shape = |document: &Document, id: &str| {
        document.pages[0]
            .elements
            .iter()
            .find_map(|e| match e {
                Element::Shape(shape) if shape.base.id == id => Some(shape.geometry.clone()),
                _ => None,
            })
            .unwrap_or_else(|| panic!("expected the shape {id}"))
    };
    // fixture 的圓角矩形：四個角不同，存成陣列、照樣存回陣列
    let rect = shape(&project.document, "el-rect");
    assert_eq!(rect, ShapeGeometry::Rect { corner_radius: CornerRadius::Corners([12.0, 12.0, 0.0, 4.0]) });
    assert_eq!(serde_json::to_value(&rect).unwrap()["cornerRadius"], serde_json::json!([12.0, 12.0, 0.0, 4.0]));
    // 四角一樣的（v10 以前的檔案）讀成數字、存回數字
    let uniform = ShapeGeometry::Rect { corner_radius: CornerRadius::Uniform(8.0) };
    assert_eq!(serde_json::to_value(&uniform).unwrap()["cornerRadius"], serde_json::json!(8.0));
    assert_eq!(CornerRadius::Uniform(8.0).radii(), [8.0; 4]);
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
    // 四個角（v11）：四個非負數字才行
    assert!(with(1, json!({ "kind": "rect", "cornerRadius": [0, 4, 8, 12] })).is_ok());
    assert!(with(1, json!({ "kind": "rect", "cornerRadius": [0, 4, 8] })).is_err());
    assert!(with(1, json!({ "kind": "rect", "cornerRadius": [0, 4, 8, -1] })).is_err());
    assert!(with(3, json!({ "kind": "polygon", "sides": 8 })).is_ok());
    // 繪製時會補到 3 邊，舊檔不因此打不開
    assert!(with(3, json!({ "kind": "polygon", "sides": 2 })).is_ok());
    assert!(with(3, json!({ "kind": "polygon", "sides": MAX_VERTEX_COUNT + 1 })).is_err());
    assert!(with(4, json!({ "kind": "star", "numPoints": 6, "innerRatio": 1.0 })).is_ok());
    assert!(with(4, json!({ "kind": "star", "numPoints": 6, "innerRatio": 0.0 })).is_err());
    assert!(with(4, json!({ "kind": "star", "numPoints": 6, "innerRatio": 1.5 })).is_err());
    // 圖形庫的圖形（v14）：只檢查格式，不認得的 id 也能開（畫成虛線外框）
    assert!(with(1, json!({ "kind": "preset", "preset": "hexagon", "params": { "size": 0.25 } })).is_ok());
    assert!(with(1, json!({ "kind": "preset", "preset": "some-future-shape2", "params": {} })).is_ok());
    assert!(with(1, json!({ "kind": "preset", "preset": "cloud" })).is_ok(), "params may be missing");
    assert!(with(1, json!({ "kind": "preset", "preset": "", "params": {} })).is_err());
    assert!(with(1, json!({ "kind": "preset", "preset": "a".repeat(33), "params": {} })).is_err());
    assert!(with(1, json!({ "kind": "preset", "preset": "../x", "params": {} })).is_err());
    assert!(with(1, json!({ "kind": "preset", "preset": "hexagon", "params": { "si ze": 1 } })).is_err());
    assert!(with(1, json!({ "kind": "preset", "preset": "hexagon", "params": { "size": "1" } })).is_err());
    let nine: serde_json::Map<String, Value> = (0..9).map(|n| (format!("p{n}"), json!(n))).collect();
    assert!(with(1, json!({ "kind": "preset", "preset": "hexagon", "params": nine })).is_err());
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
fn asset_paths_per_directory() {
    assert!(validate_asset_path_in("assets/texts/abc.md", TEXT_ASSET_DIR).is_ok());
    assert!(validate_asset_path_in("assets/audio/abc.mp3", AUDIO_ASSET_DIR).is_ok());
    // 頁面圖片只能在 assets/images
    assert!(validate_asset_path("assets/texts/abc.md").is_err());
    assert!(validate_asset_path_in("assets/images/abc.png", TEXT_ASSET_DIR).is_err());
    for bad in ["assets/texts/../x.md", "assets/texts/.x", "assets/audio/a/b.mp3", "assets/audioX/a.mp3"] {
        let dir = if bad.starts_with("assets/texts") { TEXT_ASSET_DIR } else { AUDIO_ASSET_DIR };
        assert!(validate_asset_path_in(bad, dir).is_err(), "{bad} should be rejected");
    }
}

#[test]
fn referenced_assets_includes_elements_and_asset_list() {
    let project = parse_project(FIXTURE).unwrap();
    let refs: Vec<_> = referenced_assets(&project.document, &project.assets).collect();
    assert!(refs.iter().all(|src| src.starts_with("assets/images/") || src.starts_with("assets/fonts/")));
    assert!(refs.len() >= 2);
    // 只用在主頁上的圖片也要算進去，開檔清理才不會刪掉它
    assert!(refs.contains(&"assets/images/fedcba9876543210fedcba9876543210.png"));
    // 圖片框（圖形裡的照片）也是：這個檔案只有主頁 A 的色帶在用
    assert!(refs.contains(&"assets/images/abcdef0123456789abcdef0123456789.jpg"));
    // 專案字型的一般與粗體檔（沒有粗體的那套只有一個檔）
    let fonts: Vec<_> = refs.iter().filter(|src| src.starts_with("assets/fonts/")).collect();
    assert_eq!(fonts.len(), 3);
}

#[test]
fn reads_shape_images_and_defaults_them_in_older_files() {
    const BAND: &str = "/document/masters/0/elements/0";
    let project = parse_project(FIXTURE).unwrap();
    let shapes: Vec<&ShapeElement> = project
        .document
        .masters
        .iter()
        .map(|master| &master.elements)
        .chain(project.document.pages.iter().map(|page| &page.elements))
        .flatten()
        .filter_map(|element| match element {
            Element::Shape(shape) => Some(shape),
            _ => None,
        })
        .collect();
    let with_photo: Vec<_> = shapes.iter().filter_map(|shape| shape.image.as_ref()).collect();
    assert_eq!(with_photo.len(), 1);
    assert_eq!(
        with_photo[0],
        &ShapeImage {
            src: "assets/images/abcdef0123456789abcdef0123456789.jpg".into(),
            image_width: 1200.0,
            image_height: 800.0,
            fit: ShapeImageFit::Cover,
            focus_x: 0.3,
            focus_y: 0.6,
            zoom: 1.5,
        }
    );

    // v16 檔案的圖形沒有 image 欄位 → 沒有照片
    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    value["schemaVersion"] = Value::from(16);
    value.pointer_mut(BAND).unwrap().as_object_mut().unwrap().remove("image");
    let older = parse_project(&value.to_string()).unwrap();
    let Element::Shape(band) = &older.document.masters[0].elements[0] else { panic!("expected the band") };
    assert!(band.image.is_none());
}

#[test]
fn rejects_invalid_shape_images() {
    use serde_json::json;
    const IMAGE: &str = "/document/masters/0/elements/0/image";
    let with = |key: &str, replacement: Value| {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        value.pointer_mut(IMAGE).unwrap()[key] = replacement;
        parse_project(&value.to_string())
    };
    assert!(with("zoom", json!(SHAPE_IMAGE_ZOOM_MAX)).is_ok());
    assert!(with("focusX", json!(0)).is_ok());
    for (key, bad) in [
        ("src", json!("../secret.png")),
        ("src", json!("assets/fonts/a.ttf")),
        ("imageWidth", json!(0)),
        ("imageHeight", json!(-5)),
        ("fit", json!("stretch")),
        ("focusX", json!(1.01)),
        ("focusY", json!(-0.1)),
        ("zoom", json!(0.99)),
        ("zoom", json!(SHAPE_IMAGE_ZOOM_MAX + 0.1)),
    ] {
        assert!(with(key, bad.clone()).is_err(), "{key} = {bad}");
    }
}

#[test]
fn reads_project_fonts_and_defaults_them_in_older_files() {
    let document = parse_project(FIXTURE).unwrap().document;
    assert_eq!(document.fonts.len(), 2);
    let [display, book] = &document.fonts[..] else { panic!("two fonts") };
    assert_eq!((display.generic, display.bold.as_ref().map(|bold| bold.weight)), (GenericFamily::SansSerif, Some(500)));
    assert_eq!((book.generic, book.bold.is_none(), book.regular.embedding), (GenericFamily::Serif, true, FontEmbedding::PreviewAndPrint));
    assert_eq!(project_font_family(&book.id), "project-font-font-book");

    // v12 檔案沒有字型清單
    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    value["schemaVersion"] = Value::from(12);
    value["document"].as_object_mut().unwrap().remove("fonts");
    assert!(parse_project(&value.to_string()).unwrap().document.fonts.is_empty());
    assert!(parse_project(FIXTURE_V2).unwrap().document.fonts.is_empty());
}

#[test]
fn rejects_invalid_project_fonts() {
    use serde_json::json;
    let with = |edit: &dyn Fn(&mut Value)| {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        edit(&mut value["document"]["fonts"]);
        parse_project(&value.to_string())
    };
    assert!(with(&|f| f[0]["name"] = json!("字".repeat(FONT_NAME_MAX_LENGTH))).is_ok());
    assert!(with(&|f| f[1]["regular"]["appleBaselineShift"] = json!(-0.2)).is_ok());
    let cases: [(&str, &dyn Fn(&mut Value)); 17] = [
        ("duplicate id", &|f| f[1]["id"] = f[0]["id"].clone()),
        ("duplicate name", &|f| f[1]["name"] = f[0]["name"].clone()),
        ("empty id", &|f| f[0]["id"] = json!("")),
        ("id with a quote", &|f| f[0]["id"] = json!("a\"b")),
        ("id with a space", &|f| f[0]["id"] = json!("a b")),
        ("untrimmed name", &|f| f[0]["name"] = json!(" 標題")),
        ("empty name", &|f| f[0]["name"] = json!("")),
        ("long name", &|f| f[0]["name"] = json!("字".repeat(FONT_NAME_MAX_LENGTH + 1))),
        ("unknown generic", &|f| f[0]["generic"] = json!("monospace")),
        ("file outside assets/fonts", &|f| f[0]["regular"]["src"] = json!("assets/images/a.otf")),
        ("path traversal", &|f| f[0]["bold"]["src"] = json!("assets/fonts/../a.otf")),
        ("woff file", &|f| f[0]["regular"]["src"] = json!("assets/fonts/a.woff2")),
        ("restricted embedding", &|f| f[0]["regular"]["embedding"] = json!("restricted")),
        ("weight 0", &|f| f[0]["regular"]["weight"] = json!(0)),
        ("negative ascent", &|f| f[0]["regular"]["ascent"] = json!(-1)),
        ("huge descent", &|f| f[0]["bold"]["descent"] = json!(FONT_METRIC_MAX + 1.0)),
        ("long file family", &|f| f[0]["regular"]["fileFamily"] = json!("x".repeat(FONT_FILE_NAME_MAX_LENGTH + 1))),
    ];
    for (what, edit) in cases {
        assert!(matches!(with(edit), Err(AppError::InvalidProject(_))), "{what}");
    }
}

#[test]
fn reads_master_pages_and_defaults_them_in_older_files() {
    let document = parse_project(FIXTURE).unwrap().document;
    assert_eq!(document.masters.len(), 2);
    assert_eq!(document.masters[1].parent_id.as_deref(), Some("master-a"));
    assert_eq!(document.pages[0].master_id.as_deref(), Some("master-b"));

    // v6 檔案沒有主頁
    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    value["schemaVersion"] = Value::from(6);
    value["document"].as_object_mut().unwrap().remove("masters");
    value["document"]["pages"][0].as_object_mut().unwrap().remove("masterId");
    let document = parse_project(&value.to_string()).unwrap().document;
    assert!(document.masters.is_empty());
    assert_eq!(document.pages[0].master_id, None);
    assert!(parse_project(FIXTURE_V2).unwrap().document.masters.is_empty());
}

#[test]
fn rejects_invalid_master_references() {
    let with = |edit: &dyn Fn(&mut Value)| {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        edit(&mut value["document"]);
        parse_project(&value.to_string())
    };
    assert!(with(&|_| {}).is_ok());
    let cases: [(&str, &dyn Fn(&mut Value)); 6] = [
        ("page uses a missing master", &|d| d["pages"][0]["masterId"] = Value::from("missing")),
        ("master based on a missing master", &|d| d["masters"][0]["parentId"] = Value::from("missing")),
        ("cycle", &|d| d["masters"][0]["parentId"] = Value::from("master-b")),
        ("based on itself", &|d| d["masters"][0]["parentId"] = Value::from("master-a")),
        ("master id used by a page", &|d| d["masters"][0]["id"] = Value::from("page-1")),
        ("invalid master background", &|d| d["masters"][1]["background"] = Value::from("#fef3c780")),
    ];
    for (what, edit) in cases {
        assert!(matches!(with(edit), Err(AppError::InvalidProject(_))), "{what}");
    }
}

#[test]
fn limits_how_deeply_master_pages_nest() {
    let chain = |length: usize| {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        let template = value["document"]["masters"][0].clone();
        let masters: Vec<Value> = (0..length)
            .map(|i| {
                let mut master = template.clone();
                master["id"] = Value::from(format!("m{i}"));
                master["elements"] = Value::Array(vec![]);
                master["parentId"] = if i == 0 { Value::Null } else { Value::from(format!("m{}", i - 1)) };
                master
            })
            .collect();
        value["document"]["masters"] = Value::Array(masters);
        value["document"]["pages"][0]["masterId"] = Value::from(format!("m{}", length - 1));
        parse_project(&value.to_string())
    };
    assert!(chain(MASTER_DEPTH_MAX).is_ok());
    assert!(matches!(chain(MASTER_DEPTH_MAX + 1), Err(AppError::InvalidProject(_))));
}

#[test]
fn default_text_styles_match_the_shared_fixture() {
    // TS defaultTextStyles 也和這份比對
    let expected: Value = serde_json::from_str(include_str!("../../../../tests/fixtures/default-text-styles.json")).unwrap();
    let actual = serde_json::to_value(default_text_styles()).unwrap();
    assert_eq!(normalize(actual), normalize(expected));
}

#[test]
fn reads_text_styles_and_defaults_them_in_older_files() {
    let document = parse_project(FIXTURE).unwrap().document;
    assert_eq!(document.text_styles.len(), 3);
    let Element::Text(footer) = &document.masters[1].elements[0] else { panic!("expected text") };
    assert_eq!(footer.style_id.as_deref(), Some("style-footer"));

    // v7 檔案沒有樣式表與連結：讀成內建樣式、都不連結
    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    value["schemaVersion"] = Value::from(7);
    value["document"].as_object_mut().unwrap().remove("textStyles");
    for pointer in ["/document/masters/1/elements/0", "/document/pages/0/elements/0", "/document/pages/0/elements/2/label"] {
        value.pointer_mut(pointer).unwrap().as_object_mut().unwrap().remove("styleId");
    }
    let document = parse_project(&value.to_string()).unwrap().document;
    assert_eq!(document.text_styles, default_text_styles());
    let Element::Text(footer) = &document.masters[1].elements[0] else { panic!("expected text") };
    assert_eq!(footer.style_id, None);
    assert_eq!(parse_project(FIXTURE_V2).unwrap().document.text_styles, default_text_styles());

    // v8 的空樣式表要照樣保留（不是補成內建樣式）
    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    value["document"]["textStyles"] = Value::Array(vec![]);
    for pointer in ["/document/masters/1/elements/0", "/document/pages/0/elements/2/label"] {
        value.pointer_mut(pointer).unwrap()["styleId"] = Value::Null;
    }
    assert!(parse_project(&value.to_string()).unwrap().document.text_styles.is_empty());
}

#[test]
fn rejects_invalid_text_styles_and_links() {
    use serde_json::json;
    let with = |edit: &dyn Fn(&mut Value)| {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        edit(&mut value["document"]);
        parse_project(&value.to_string())
    };
    assert!(with(&|d| d["textStyles"][2]["name"] = json!("字".repeat(TEXT_STYLE_NAME_MAX_LENGTH))).is_ok());
    let cases: [(&str, &dyn Fn(&mut Value)); 9] = [
        ("text links a missing style", &|d| d["pages"][0]["elements"][0]["styleId"] = json!("missing")),
        ("label links a missing style", &|d| d["pages"][0]["elements"][2]["label"]["styleId"] = json!("missing")),
        ("master text links a missing style", &|d| d["masters"][1]["elements"][0]["styleId"] = json!("missing")),
        ("duplicate id", &|d| d["textStyles"][1]["id"] = d["textStyles"][0]["id"].clone()),
        ("duplicate name", &|d| d["textStyles"][1]["name"] = d["textStyles"][0]["name"].clone()),
        ("untrimmed name", &|d| d["textStyles"][0]["name"] = json!(" 標題")),
        ("empty name", &|d| d["textStyles"][0]["name"] = json!("")),
        ("long name", &|d| d["textStyles"][0]["name"] = json!("字".repeat(TEXT_STYLE_NAME_MAX_LENGTH + 1))),
        ("font size", &|d| d["textStyles"][0]["fontSize"] = json!(FONT_SIZE_MIN - 1.0)),
    ];
    for (what, edit) in cases {
        assert!(matches!(with(edit), Err(AppError::InvalidProject(_))), "{what}");
    }
    assert!(with(&|d| d["textStyles"][0]["fill"] = json!("red")).is_err());
    assert!(with(&|d| d["textStyles"][0]["id"] = json!("")).is_err());
    assert!(with(&|d| d["textStyles"][2]["shadow"] = json!({ "color": "#000000", "offsetX": 99, "offsetY": 0 })).is_err());
}

/// Removes the swatch list and every swatch link, as in files before v12.
fn strip_swatches(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for key in ["swatches", "fillSwatchId", "swatchId", "backgroundSwatchId"] {
                map.remove(key);
            }
            map.values_mut().for_each(strip_swatches);
        }
        Value::Array(items) => items.iter_mut().for_each(strip_swatches),
        _ => {}
    }
}

#[test]
fn reads_swatches_and_defaults_them_in_older_files() {
    let document = parse_project(FIXTURE).unwrap().document;
    assert_eq!(document.swatches.len(), 6);
    assert_eq!(document.swatches[2], Swatch { id: "swatch-brand".into(), name: "品牌紅".into(), color: "#be123c".into() });
    assert_eq!(document.pages[0].background_swatch_id.as_deref(), Some("swatch-white"));
    assert_eq!(document.masters[0].background_swatch_id, None);
    let Element::Shape(ellipse) = &document.pages[0].elements[2] else { panic!("expected a shape") };
    assert_eq!(ellipse.stroke.as_ref().unwrap().swatch_id.as_deref(), Some("swatch-brand"));
    assert_eq!(ellipse.label.as_ref().unwrap().fill_swatch_id.as_deref(), Some("swatch-text"));
    // 連到色票時，實際的顏色照存（含使用處自己的透明度）
    let numbers = &document.page_number_rules[1].style;
    assert_eq!((numbers.fill.as_str(), numbers.fill_swatch_id.as_deref()), ("#4f46e580", Some("swatch-indigo")));

    // v11 檔案沒有色票與連結：讀成沒有色票、都不連結，存檔時寫出 null
    let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
    value["schemaVersion"] = Value::from(11);
    strip_swatches(&mut value);
    let project = parse_project(&value.to_string()).unwrap();
    assert!(project.document.swatches.is_empty());
    let Element::Shape(ellipse) = &project.document.pages[0].elements[2] else { panic!("expected a shape") };
    assert_eq!(ellipse.stroke.as_ref().unwrap().swatch_id, None);
    let written = serde_json::to_value(&project).unwrap();
    assert_eq!(written["document"]["pages"][0]["backgroundSwatchId"], Value::Null);
    assert!(parse_project(FIXTURE_V2).unwrap().document.swatches.is_empty());
}

#[test]
fn rejects_invalid_swatches_and_links() {
    use serde_json::json;
    let with = |edit: &dyn Fn(&mut Value)| {
        let mut value: Value = serde_json::from_str(FIXTURE).unwrap();
        edit(&mut value["document"]);
        parse_project(&value.to_string())
    };
    assert!(with(&|d| d["swatches"][0]["name"] = json!("字".repeat(SWATCH_NAME_MAX_LENGTH))).is_ok());
    let missing = json!("missing");
    let cases: [(&str, &dyn Fn(&mut Value)); 22] = [
        ("text fill", &|d| d["masters"][1]["elements"][0]["fillSwatchId"] = missing.clone()),
        ("text shadow", &|d| d["pages"][0]["elements"][0]["shadow"]["swatchId"] = missing.clone()),
        ("shape fill", &|d| d["pages"][0]["elements"][1]["fillSwatchId"] = missing.clone()),
        ("shape stroke", &|d| d["pages"][0]["elements"][2]["stroke"]["swatchId"] = missing.clone()),
        ("label fill", &|d| d["pages"][0]["elements"][2]["label"]["fillSwatchId"] = missing.clone()),
        ("page background", &|d| d["pages"][0]["backgroundSwatchId"] = missing.clone()),
        ("master background", &|d| d["masters"][0]["backgroundSwatchId"] = missing.clone()),
        ("text style fill", &|d| d["textStyles"][0]["fillSwatchId"] = missing.clone()),
        ("text style shadow", &|d| d["textStyles"][2]["shadow"]["swatchId"] = missing.clone()),
        ("page number fill", &|d| d["pageNumberRules"][0]["style"]["fillSwatchId"] = missing.clone()),
        ("page number shadow", &|d| d["pageNumberRules"][1]["style"]["shadow"]["swatchId"] = missing.clone()),
        ("page number stroke", &|d| d["pageNumberRules"][1]["style"]["stroke"]["swatchId"] = missing.clone()),
        ("link to a removed swatch", &|d| d["swatches"].as_array_mut().unwrap().retain(|s| s["id"] != "swatch-brand")),
        ("duplicate id", &|d| d["swatches"][1]["id"] = d["swatches"][0]["id"].clone()),
        ("duplicate name", &|d| d["swatches"][1]["name"] = d["swatches"][0]["name"].clone()),
        ("untrimmed name", &|d| d["swatches"][0]["name"] = json!(" 文字")),
        ("empty name", &|d| d["swatches"][0]["name"] = json!("")),
        ("long name", &|d| d["swatches"][0]["name"] = json!("字".repeat(SWATCH_NAME_MAX_LENGTH + 1))),
        ("empty id", &|d| d["swatches"][1]["id"] = json!("")),
        ("uppercase color", &|d| d["swatches"][0]["color"] = json!("#ABCDEF")),
        ("color with alpha", &|d| d["swatches"][0]["color"] = json!("#17171780")),
        ("named color", &|d| d["swatches"][0]["color"] = json!("red")),
    ];
    for (what, edit) in cases {
        assert!(matches!(with(edit), Err(AppError::InvalidProject(_))), "{what}");
    }
}
