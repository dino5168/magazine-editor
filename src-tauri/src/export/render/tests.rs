use super::*;
use crate::export::test_support::{fixture_document, project_with_image, request};

fn ellipse_photo(document: &RenderDocument) -> Option<RenderPhoto> {
    document.pages[0].elements.iter().find(|e| matches!(e.kind, RenderKind::Ellipse(_))).and_then(|e| e.photo.clone())
}

#[test]
fn image_frames_carry_their_photo() {
    let (root, req) = crate::export::test_support::photo_frame_request();
    let (document, skipped) = build_render(root.path(), &req).unwrap();
    assert_eq!(skipped, 0);
    assert_eq!(
        ellipse_photo(&document),
        Some(RenderPhoto { src: crate::export::test_support::FRAME_PHOTO.into(), x: 0.0, y: -5.0, width: 120.0, height: 90.0 })
    );
    // 其他物件沒有照片
    assert_eq!(document.pages[0].elements.iter().filter(|e| e.photo.is_some()).count(), 1);
}

#[test]
fn missing_photo_files_are_skipped_and_counted() {
    let (root, req) = crate::export::test_support::photo_frame_request();
    std::fs::remove_file(root.path().join(crate::export::test_support::FRAME_PHOTO)).unwrap();
    let (document, skipped) = build_render(root.path(), &req).unwrap();
    assert_eq!(skipped, 1);
    assert_eq!(ellipse_photo(&document), None);
    assert!(document.pages[0].elements.iter().any(|e| matches!(e.kind, RenderKind::Ellipse(_))), "the shape stays");
}

#[test]
fn photo_placements_must_come_from_the_editor_and_be_usable() {
    let (root, mut req) = crate::export::test_support::photo_frame_request();
    let good = req.shape_photos["el-ellipse"];
    for bad in [
        PhotoPlacement { x: f64::NAN, ..good },
        PhotoPlacement { width: 0.0, ..good },
        PhotoPlacement { height: -1.0, ..good },
        PhotoPlacement { y: 2.0e6, ..good },
    ] {
        req.shape_photos.insert("el-ellipse".into(), bad);
        assert!(matches!(build_render(root.path(), &req), Err(AppError::InvalidInput(_))), "{bad:?}");
    }
    req.shape_photos.clear();
    assert!(matches!(build_render(root.path(), &req), Err(AppError::InvalidInput(_))));
}

/// The fixture with its rectangle (`el-rect`) turned into a shape-library shape.
fn with_preset_shape() -> ExportRequest {
    let mut document = fixture_document();
    for element in &mut document.pages[0].elements {
        if let Element::Shape(shape) = element {
            if shape.base.id == "el-rect" {
                shape.geometry = ShapeGeometry::Preset { preset: "cylinder".into(), params: Default::default() };
            }
        }
    }
    request(document)
}

#[test]
fn lines_must_be_turned_into_paths_by_the_editor() {
    // 主頁上的線條不會被畫（主頁由編輯器展開）；頁面上的線條代表編輯器沒有先換成路徑
    let mut document = fixture_document();
    let line = document.masters.iter().flat_map(|master| &master.elements).find(|e| matches!(e, Element::Line(_))).cloned();
    let root = project_with_image();
    assert!(build_render(root.path(), &request(document.clone())).is_ok());
    document.pages[0].elements.push(line.expect("the fixture has a line on a master page"));
    let error = build_render(root.path(), &request(document)).unwrap_err();
    assert!(matches!(error, AppError::InvalidInput(_)), "{error:?}");
}

/// A shape path as the editor sends it (`ExportShapePath`).
fn shape_path(json: serde_json::Value) -> ShapePath {
    serde_json::from_value(json).unwrap()
}

fn preset_render(req: &ExportRequest) -> AppResult<Option<RenderPath>> {
    let root = project_with_image();
    let (document, _) = build_render(root.path(), req)?;
    Ok(document.pages[0].elements.iter().find_map(|element| match &element.kind {
        RenderKind::Path(path) => Some(path.clone()),
        _ => None,
    }))
}

#[test]
fn shape_library_shapes_draw_the_editors_paths() {
    let mut req = with_preset_shape();
    req.shape_paths.insert(
        "el-rect".into(),
        shape_path(serde_json::json!({
            "outline": [{ "op": "M", "x": 0, "y": 5 }, { "op": "C", "x1": 0, "y1": 0, "x2": 10, "y2": 0, "x": 10, "y": 5 },
                        { "op": "L", "x": 10, "y": 20 }, { "op": "Z" }],
            "details": [{ "op": "M", "x": 0, "y": 5 }, { "op": "L", "x": 10, "y": 5 }],
            "detailStroke": { "color": "#37404c", "swatchId": null, "width": 1, "dash": "solid" },
        })),
    );
    let path = preset_render(&req).unwrap().expect("the preset is drawn as a path");
    assert_eq!(
        path.outline,
        vec![
            PathSegment::Move(0.0, 5.0),
            PathSegment::Cubic(0.0, 0.0, 10.0, 0.0, 10.0, 5.0),
            PathSegment::Line(10.0, 20.0),
            PathSegment::Close,
        ]
    );
    assert_eq!(path.details, vec![PathSegment::Move(0.0, 5.0), PathSegment::Line(10.0, 5.0)]);
    assert_eq!(path.detail_stroke.map(|s| (s.color, s.width)), Some(("#37404c".into(), 1.0)));
}

#[test]
fn shape_library_shapes_without_a_path_are_skipped() {
    // 編輯器不認得的圖形不送路徑：不畫、不失敗
    assert!(preset_render(&with_preset_shape()).unwrap().is_none());
}

#[test]
fn unusable_shape_paths_are_rejected() {
    let mut too_long = vec![serde_json::json!({ "op": "M", "x": 0, "y": 0 })];
    too_long.extend((0..SHAPE_PATH_COMMANDS_MAX).map(|n| serde_json::json!({ "op": "L", "x": n, "y": 0 })));
    let cases = [
        serde_json::json!({ "outline": [] }),
        serde_json::json!({ "outline": [{ "op": "L", "x": 0, "y": 0 }] }),
        serde_json::json!({ "outline": [{ "op": "M", "x": 0, "y": 1.0e9 }] }),
        serde_json::json!({ "outline": too_long }),
        serde_json::json!({
            "outline": [{ "op": "M", "x": 0, "y": 0 }, { "op": "L", "x": 1, "y": 1 }],
            "details": [{ "op": "M", "x": 0, "y": 0 }, { "op": "L", "x": 1, "y": 0 }],
            "detailStroke": { "color": "red\" onload=\"x", "swatchId": null, "width": 1, "dash": "solid" },
        }),
    ];
    for case in cases {
        let mut req = with_preset_shape();
        req.shape_paths.insert("el-rect".into(), shape_path(case.clone()));
        let error = preset_render(&req).expect_err(&case.to_string());
        assert!(matches!(error, AppError::InvalidInput(_)), "{case}: {error:?}");
    }
    // NaN 不會從 JSON 來，但也要擋
    let mut req = with_preset_shape();
    req.shape_paths.insert(
        "el-rect".into(),
        ShapePath { outline: vec![PathCommand::M { x: f64::NAN, y: 0.0 }], details: vec![], detail_stroke: None },
    );
    assert!(preset_render(&req).is_err());
}

fn kinds(document: &RenderDocument) -> Vec<&'static str> {
    document.pages[0]
        .elements
        .iter()
        .map(|element| match element.kind {
            RenderKind::Text(_) => "text",
            RenderKind::Rect(_) => "rect",
            RenderKind::Ellipse(_) => "ellipse",
            RenderKind::Polygon(_) => "polygon",
            RenderKind::Path(_) => "path",
            RenderKind::Image(_) => "image",
        })
        .collect()
}

#[test]
fn maps_css_font_families() {
    assert_eq!(font_families(r#""Geist", "Noto Sans TC", sans-serif"#), vec!["Geist", "Noto Sans TC"]);
    // 內嵌字型之前存檔的專案：兩個舊名稱都要對應到內嵌的字型
    assert_eq!(
        font_families(r#""Geist Variable", "Microsoft JhengHei", sans-serif"#),
        vec!["Geist", "Noto Sans TC"]
    );
    assert!(font_families("sans-serif").is_empty());
}

#[test]
fn builds_every_element_type() {
    let root = project_with_image();
    let (document, skipped) = build_render(root.path(), &request(fixture_document())).unwrap();
    assert_eq!(skipped, 0);
    assert_eq!(document.title, "範例雜誌");
    assert_eq!(document.pages.len(), 1);
    // star 和 polygon 都變成 polygon；橢圓的圖形內文字緊接在橢圓之後；順序即 z 軸順序
    assert_eq!(kinds(&document), vec!["text", "rect", "ellipse", "text", "polygon", "polygon", "image"]);
}

fn label_of(document: &RenderDocument) -> (&RenderElement, &RenderText) {
    let element = &document.pages[0].elements[3];
    let RenderKind::Text(text) = &element.kind else { panic!("expected the ellipse's label") };
    (element, text)
}

#[test]
fn shape_labels_are_placed_in_the_inset_box() {
    // fixture 的橢圓：外框 (120, 440) 120 × 80，文字 14 pt、置中、垂直置中
    let root = project_with_image();
    let mut req = request(fixture_document());
    req.text_layouts.insert("el-ellipse#label".into(), TextLayout { lines: vec!["圖形內".into(), "文字".into()], baseline: 12.0, line_widths: vec![], line_gaps: vec![], line_boxes: vec![] });
    let (document, _) = build_render(root.path(), &req).unwrap();
    let (element, text) = label_of(&document);
    assert_eq!(text.lines, vec!["圖形內", "文字"], "uses the editor's line breaks");
    assert_eq!((text.width, text.size, text.baseline), (112.0, 14.0, 12.0));
    assert_eq!(element.x, 124.0);
    // 框高 72，兩行共 2 × 14 × 1.5（行距）= 42，上下各留 15
    assert!((element.y - (444.0 + 15.0)).abs() < 1e-9, "{}", element.y);
}

#[test]
fn shape_labels_use_the_frame_from_the_editor() {
    // 橢圓 120 × 80 的內切矩形（÷ √2）再內縮 4 pt：編輯器算好放進 labelFrames，Rust 照用
    let root = project_with_image();
    let mut req = request(fixture_document());
    let frame = LabelFrame { x: 21.57, y: 15.72, width: 76.85, height: 48.57 };
    req.label_frames.insert("el-ellipse".into(), frame);
    req.text_layouts.insert("el-ellipse#label".into(), TextLayout { lines: vec!["圖形內".into(), "文字".into()], baseline: 12.0, line_widths: vec![], line_gaps: vec![], line_boxes: vec![] });
    let (document, _) = build_render(root.path(), &req).unwrap();
    let (element, text) = label_of(&document);
    assert_eq!(text.width, frame.width);
    assert!((element.x - (120.0 + frame.x)).abs() < 1e-9, "{}", element.x);
    // 兩行共 42，置中：(48.57 − 42) / 2
    assert!((element.y - (440.0 + frame.y + (frame.height - 42.0) / 2.0)).abs() < 1e-9, "{}", element.y);

    for bad in [LabelFrame { width: 0.0, ..frame }, LabelFrame { y: f64::NAN, ..frame }, LabelFrame { height: -1.0, ..frame }] {
        req.label_frames.insert("el-ellipse".into(), bad);
        assert!(matches!(build_render(root.path(), &req), Err(AppError::InvalidInput(_))), "{bad:?}");
    }
}

#[test]
fn shape_labels_rotate_with_the_shape_and_skip_empty_text() {
    let mut document = fixture_document();
    let Element::Shape(ellipse) = &mut document.pages[0].elements[2] else { panic!("expected the ellipse") };
    ellipse.base.rotation = 90.0;
    let label = ellipse.label.as_mut().unwrap();
    label.vertical_align = VerticalAlign::Top;
    let root = project_with_image();
    let (rendered, _) = build_render(root.path(), &request(document.clone())).unwrap();
    let (element, _) = label_of(&rendered);
    // 局部 (4, 4) 順時針轉 90° → (−4, 4)
    assert!((element.x - 116.0).abs() < 1e-9 && (element.y - 444.0).abs() < 1e-9, "{:?}", (element.x, element.y));
    assert_eq!(element.rotation, 90.0);

    let Element::Shape(ellipse) = &mut document.pages[0].elements[2] else { unreachable!() };
    ellipse.label.as_mut().unwrap().text.clear();
    let (rendered, _) = build_render(root.path(), &request(document)).unwrap();
    assert_eq!(rendered.pages[0].elements.len(), 6, "empty label draws nothing");
}

#[test]
fn shapes_carry_their_stroke() {
    let root = project_with_image();
    let (document, _) = build_render(root.path(), &request(fixture_document())).unwrap();
    let strokes: Vec<_> = document.pages[0]
        .elements
        .iter()
        .filter_map(|element| match &element.kind {
            RenderKind::Rect(r) => Some(r.stroke.clone()),
            RenderKind::Ellipse(e) => Some(e.stroke.clone()),
            RenderKind::Polygon(p) => Some(p.stroke.clone()),
            _ => None,
        })
        .collect();
    // fixture：只有橢圓有邊框（#be123c、2 pt、虛線）
    let expected = RenderStroke {
        color: "#be123c".into(),
        width: 2.0,
        dash: Some(DashPattern { segments: vec![6.0, 6.0], round_cap: false }),
    };
    assert_eq!(strokes, vec![None, Some(expected), None, None]);
}

#[test]
fn dash_patterns_scale_with_the_width() {
    assert_eq!(dash_pattern(StrokeDash::Solid, 2.0), None);
    assert_eq!(dash_pattern(StrokeDash::Dashed, 2.0), Some(DashPattern { segments: vec![6.0, 6.0], round_cap: false }));
    assert_eq!(dash_pattern(StrokeDash::Dotted, 2.0), Some(DashPattern { segments: vec![0.0, 4.0], round_cap: true }));
    assert_eq!(
        dash_pattern(StrokeDash::DashDot, 2.0),
        Some(DashPattern { segments: vec![8.0, 4.0, 2.0, 4.0], round_cap: false })
    );
}

#[test]
fn missing_images_are_skipped_not_fatal() {
    let root = tempfile::tempdir().unwrap();
    let (document, skipped) = build_render(root.path(), &request(fixture_document())).unwrap();
    assert_eq!(skipped, 1);
    assert!(!kinds(&document).contains(&"image"));
}

#[test]
fn text_falls_back_when_the_frontend_sends_no_layout() {
    let root = project_with_image();
    let (document, _) = build_render(root.path(), &request(fixture_document())).unwrap();
    let RenderKind::Text(text) = &document.pages[0].elements[0].kind else { panic!("expected text") };
    // fixture 的文字行距 1.4
    assert_eq!(text.line_height, text.size * 1.4);
    assert!(text.baseline > 0.0);
    // 沒有 layout 時以 \n 分行
    assert_eq!(text.lines, vec!["雜誌標題", "副標"]);
}

/// The fixture's text element (36 pt, 420 pt wide, centred; italic, underline, strikethrough and
/// a `#00000080` shadow offset (2, −1.5)) rendered with a two-line layout.
fn decorated_text(edit: impl FnOnce(&mut crate::project::format::TextElement)) -> (RenderElement, RenderText) {
    let mut document = fixture_document();
    let Element::Text(text) = &mut document.pages[0].elements[0] else { panic!("expected text") };
    edit(text);
    let mut req = request(document);
    req.text_layouts.insert(
        "el-text".into(),
        TextLayout { lines: vec!["雜誌標題".into(), "副標".into(), String::new()], baseline: 30.0, line_widths: vec![144.4, 72.0, 0.0], line_gaps: vec![], line_boxes: vec![] },
    );
    let root = project_with_image();
    let (rendered, _) = build_render(root.path(), &req).unwrap();
    let element = rendered.pages[0].elements[0].clone();
    let RenderKind::Text(text) = element.kind.clone() else { panic!("expected text") };
    (element, text)
}

#[test]
fn decorations_follow_konvas_formula() {
    let (_, text) = decorated_text(|_| {});
    assert!(text.italic);
    // 36 pt：位移 round(9) = 9、線粗 2.4；置中：x = (420 − 寬) / 2，長度取整數；空行不畫
    let line = |line, kind, x, y, length| DecorationLine { line, kind, x, y, length };
    let second = 30.0 + 36.0 * 1.4;
    assert_eq!(
        text.decorations,
        vec![
            line(0, DecorationKind::Underline, 137.8, 39.0, 144.0),
            line(0, DecorationKind::Strikethrough, 137.8, 21.0, 144.0),
            line(1, DecorationKind::Underline, 174.0, second + 9.0, 72.0),
            line(1, DecorationKind::Strikethrough, 174.0, second - 9.0, 72.0),
        ]
    );
    assert!((text.decoration_thickness - 2.4).abs() < 1e-12);

    let (_, right) = decorated_text(|t| (t.align, t.decoration.strikethrough) = (Align::Right, false));
    assert_eq!(right.decorations.iter().map(|d| d.x).collect::<Vec<_>>(), vec![420.0 - 144.4, 420.0 - 72.0]);
    let (_, plain) = decorated_text(|t| (t.decoration.underline, t.decoration.strikethrough) = (false, false));
    assert!(plain.decorations.is_empty());
}

#[test]
fn letter_spacing_places_lines_from_the_editors_widths() {
    // fixture 的文字：36 pt、字距 −20‰ → −0.72 pt；置中，每行起點 = (420 − 行寬) / 2，和底線同一個 x
    let (_, text) = decorated_text(|_| {});
    assert!((text.letter_spacing - -0.72).abs() < 1e-12);
    assert_eq!(text.line_starts, Some(vec![137.8, 174.0, 210.0]));
    let (_, right) = decorated_text(|t| t.align = Align::Right);
    assert_eq!(right.line_starts, Some(vec![420.0 - 144.4, 420.0 - 72.0, 420.0]));
    // 沒有字距：照舊交給各格式自己對齊
    let (_, none) = decorated_text(|t| t.spacing.letter_spacing = 0.0);
    assert_eq!((none.letter_spacing, none.line_starts), (0.0, None));
}

#[test]
fn distributed_lines_run_edge_to_edge_with_the_editors_gaps() {
    let render = |gaps: Vec<f64>| {
        let mut document = fixture_document();
        let Element::Text(text) = &mut document.pages[0].elements[0] else { panic!("expected text") };
        text.align = Align::Distributed;
        let mut req = request(document);
        // 編輯器的結果：兩字以上行寬 = 框寬 420；單字「副」（36 寬）置中；空行
        req.text_layouts.insert(
            "el-text".into(),
            TextLayout { lines: vec!["雜誌標題".into(), "副".into(), String::new()], baseline: 30.0, line_widths: vec![420.0, 36.0, 0.0], line_gaps: gaps, line_boxes: vec![] },
        );
        let root = project_with_image();
        let (rendered, _) = build_render(root.path(), &req).unwrap();
        let RenderKind::Text(text) = rendered.pages[0].elements[0].kind.clone() else { panic!("expected text") };
        text
    };
    let text = render(vec![92.0, 0.0, 0.0]);
    assert_eq!(text.line_gaps, Some(vec![92.0, 0.0, 0.0]));
    // 起點：兩字以上 0、單字置中、空行（寬 0）在中間（不畫）
    assert_eq!(text.line_starts, Some(vec![0.0, 192.0, 210.0]));
    // 底線 / 刪除線畫滿整行（fixture 的文字兩種線都有）
    let underlines: Vec<_> = text.decorations.iter().filter(|d| d.kind == DecorationKind::Underline).map(|d| (d.x, d.length)).collect();
    assert_eq!(underlines, vec![(0.0, 420.0), (192.0, 36.0)]);

    // 舊的 request 沒有 lineGaps（或數量不對）：退回一般字距，起點照算
    let old = render(vec![]);
    assert_eq!((old.line_gaps, old.line_starts), (None, Some(vec![0.0, 192.0, 210.0])));
    // 其他對齊不帶 line_gaps
    let (_, centred) = decorated_text(|_| {});
    assert_eq!(centred.line_gaps, None);
}

/// The fixture's text (420 pt wide, underline + strikethrough) laid out with paragraph indents:
/// first line box 72–400, the second 36–400, the empty third line 72–400.
fn indented_text(align: Align, letter_spacing: f64, widths: Vec<f64>, boxes: Vec<LineBox>) -> AppResult<RenderText> {
    let mut document = fixture_document();
    let Element::Text(text) = &mut document.pages[0].elements[0] else { panic!("expected text") };
    (text.align, text.spacing.letter_spacing) = (align, letter_spacing);
    let mut req = request(document);
    let gaps = if align == Align::Distributed { vec![50.0, 0.0, 0.0] } else { vec![] };
    req.text_layouts.insert(
        "el-text".into(),
        TextLayout { lines: vec!["雜誌標題".into(), "副".into(), String::new()], baseline: 30.0, line_widths: widths, line_gaps: gaps, line_boxes: boxes },
    );
    let root = project_with_image();
    let (rendered, _) = build_render(root.path(), &req)?;
    let RenderKind::Text(text) = rendered.pages[0].elements[0].kind.clone() else { panic!("expected text") };
    Ok(text)
}

#[test]
fn indented_lines_are_aligned_within_their_boxes() {
    let boxes = || vec![LineBox { start: 72.0, width: 328.0 }, LineBox { start: 36.0, width: 364.0 }, LineBox { start: 72.0, width: 328.0 }];
    let widths = || vec![144.0, 36.0, 0.0];
    let starts = |align| indented_text(align, 0.0, widths(), boxes()).unwrap().line_starts;
    // 沒有字距也一律帶起點（不能交給各格式對齊整個文字框）
    assert_eq!(starts(Align::Left), Some(vec![72.0, 36.0, 72.0]));
    assert_eq!(starts(Align::Center), Some(vec![72.0 + 92.0, 36.0 + 164.0, 72.0 + 164.0]));
    assert_eq!(starts(Align::Right), Some(vec![400.0 - 144.0, 400.0 - 36.0, 400.0]));
    // 首尾置中：兩字以上行寬 = 行框寬
    let distributed = indented_text(Align::Distributed, 0.0, vec![328.0, 36.0, 0.0], boxes()).unwrap();
    assert_eq!(distributed.line_starts, Some(vec![72.0, 36.0 + 164.0, 72.0 + 164.0]));
    assert_eq!(distributed.line_gaps, Some(vec![50.0, 0.0, 0.0]));

    // 底線 / 刪除線和文字同一個起點
    let left = indented_text(Align::Left, 0.0, widths(), boxes()).unwrap();
    let xs: Vec<_> = left.decorations.iter().filter(|d| d.kind == DecorationKind::Underline).map(|d| d.x).collect();
    assert_eq!(xs, vec![72.0, 36.0]);
    // 沒有行框：照舊（沒有字距時不帶起點）
    assert_eq!(indented_text(Align::Left, 0.0, widths(), vec![]).unwrap().line_starts, None);
}

#[test]
fn rejects_line_boxes_that_do_not_match_the_lines() {
    let widths = || vec![144.0, 36.0, 0.0];
    let one = vec![LineBox { start: 0.0, width: 420.0 }];
    assert!(indented_text(Align::Left, 0.0, widths(), one).is_err());
    let infinite = vec![LineBox { start: f64::INFINITY, width: 1.0 }; 3];
    assert!(indented_text(Align::Left, 0.0, widths(), infinite).is_err());
    let negative = vec![LineBox { start: 0.0, width: -1.0 }; 3];
    assert!(indented_text(Align::Left, 0.0, widths(), negative).is_err());
}

#[test]
fn shadows_point_along_the_page_and_take_the_text_alpha() {
    let (_, text) = decorated_text(|_| {});
    let shadow = text.shadow.unwrap();
    assert_eq!((shadow.color.as_str(), shadow.dx, shadow.dy, shadow.whole_block), ("#00000080", 2.0, -1.5, true));

    // 物件順時針轉 90°：頁面上的 (2, −1.5) 是文字框裡的 (−1.5, −2)
    let (_, rotated) = decorated_text(|t| t.base.rotation = 90.0);
    let shadow = rotated.shadow.unwrap();
    assert!((shadow.dx + 1.5).abs() < 1e-12 && (shadow.dy + 2.0).abs() < 1e-12, "{shadow:?}");

    // 半透明文字的陰影也變淡（50% × 50% ≈ 25%）；沒有線時每行各自投陰影
    let (_, faint) = decorated_text(|t| {
        t.fill = "#17171780".into();
        (t.decoration.underline, t.decoration.strikethrough) = (false, false);
    });
    let shadow = faint.shadow.unwrap();
    assert_eq!((shadow.color.as_str(), shadow.whole_block), ("#00000040", false));
    let (_, none) = decorated_text(|t| t.decoration = TextDecoration::default());
    assert!(none.shadow.is_none() && !none.italic);
}

#[test]
fn shape_labels_carry_their_decoration() {
    let mut document = fixture_document();
    let Element::Shape(ellipse) = &mut document.pages[0].elements[2] else { panic!("expected the ellipse") };
    let label = ellipse.label.as_mut().unwrap();
    label.decoration = TextDecoration {
        italic: true,
        underline: true,
        strikethrough: false,
        shadow: Some(TextShadow { color: "#ff0000".into(), swatch_id: None, offset_x: 1.0, offset_y: 1.0 }),
    };
    let root = project_with_image();
    let (rendered, _) = build_render(root.path(), &request(document)).unwrap();
    let (_, text) = label_of(&rendered);
    assert!(text.italic && text.shadow.is_some());
    assert!(!text.decorations.is_empty() && text.decorations.iter().all(|d| d.kind == DecorationKind::Underline));
}

#[test]
fn rejects_line_widths_that_do_not_match_the_lines() {
    let root = project_with_image();
    for widths in [vec![10.0], vec![10.0, f64::NAN], vec![10.0, -1.0]] {
        let mut req = request(fixture_document());
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec!["a".into(), "b".into()], baseline: 10.0, line_widths: widths, line_gaps: vec![], line_boxes: vec![] });
        assert!(matches!(build_render(root.path(), &req), Err(AppError::InvalidInput(_))));
    }
}

#[test]
fn rejects_invalid_layout_data() {
    let mut req = request(fixture_document());
    req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![], baseline: f64::NAN, line_widths: vec![], line_gaps: vec![], line_boxes: vec![] });
    let root = project_with_image();
    assert!(matches!(build_render(root.path(), &req), Err(AppError::InvalidInput(_))));
}
