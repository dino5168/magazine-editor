//! Validation of document content (on open and on save).

use super::*;
use crate::error::{AppError, AppResult};

/// Validates document content received from the frontend or read from disk.
///
/// # Errors
/// Returns `AppError::InvalidProject` describing the first violation.
pub fn validate_content(document: &Document, assets: &[AssetInfo]) -> AppResult<()> {
    if document.pages.is_empty() {
        return Err(AppError::invalid_project("document has no pages"));
    }
    validate_margins(&document.margins)?;
    validate_fonts(&document.fonts)?;
    let swatches = validate_swatches(&document.swatches)?;
    validate_page_number_rules(&document.page_number_rules, &swatches)?;
    let refs = Refs { styles: validate_text_styles(&document.text_styles, &swatches)?, swatches };
    for page in &document.pages {
        validate_sheet(&page.id, page.width, page.height, &page.background, &page.background_swatch_id, &page.elements, &refs)?;
    }
    for master in &document.masters {
        validate_sheet(&master.id, master.width, master.height, &master.background, &master.background_swatch_id, &master.elements, &refs)?;
    }
    validate_master_graph(document)?;
    for asset in assets {
        validate_asset_path(&asset.src)?;
    }
    Ok(())
}

/// What pages and master pages have in common.
fn validate_sheet(
    id: &str,
    width: f64,
    height: f64,
    background: &str,
    background_swatch_id: &Option<String>,
    elements: &[Element],
    refs: &Refs,
) -> AppResult<()> {
    require_id(id)?;
    if !(width > 0.0 && height > 0.0) {
        return Err(AppError::invalid_project(format!("page {id} has a non-positive size")));
    }
    require_background_color(background)?;
    require_swatch(background_swatch_id, &refs.swatches)?;
    for element in elements {
        validate_element(element, refs)?;
    }
    Ok(())
}

type StyleIds<'a> = std::collections::HashSet<&'a str>;
type SwatchIds<'a> = std::collections::HashSet<&'a str>;

/// What colors and texts may link to: swatches and text styles.
struct Refs<'a> {
    styles: StyleIds<'a>,
    swatches: SwatchIds<'a>,
}

/// Same rules as TS `isSwatchList`: ids 1–64 bytes, names trimmed, non-empty, at most
/// SWATCH_NAME_MAX_LENGTH characters, ids and names unique, colors lowercase `#rrggbb`.
fn validate_swatches(swatches: &[Swatch]) -> AppResult<SwatchIds<'_>> {
    let mut names = std::collections::HashSet::new();
    let mut ids = SwatchIds::new();
    for swatch in swatches {
        let invalid = |what: &str| AppError::invalid_project(format!("swatch {}: {what}", swatch.id));
        require_id(&swatch.id)?;
        let name = swatch.name.as_str();
        if name.is_empty() || name.trim() != name || name.chars().count() > SWATCH_NAME_MAX_LENGTH {
            return Err(invalid("invalid name"));
        }
        if !is_swatch_color(&swatch.color) {
            return Err(invalid("color must be lowercase #rrggbb"));
        }
        if !ids.insert(swatch.id.as_str()) || !names.insert(name) {
            return Err(invalid("duplicate id or name"));
        }
    }
    Ok(ids)
}

/// Same rules as TS `isProjectFontList`: ids 1–64 of `[A-Za-z0-9_-]`, names trimmed, non-empty, at
/// most FONT_NAME_MAX_LENGTH characters, ids and names unique; every file valid (`validate_font_file`).
fn validate_fonts(fonts: &[ProjectFont]) -> AppResult<()> {
    let mut names = std::collections::HashSet::new();
    let mut ids = std::collections::HashSet::new();
    for font in fonts {
        let invalid = |what: &str| AppError::invalid_project(format!("font {}: {what}", font.id));
        require_id(&font.id)?;
        if !font.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
            return Err(invalid("id has characters other than letters, digits, - and _"));
        }
        let name = font.name.as_str();
        if name.is_empty() || name.trim() != name || name.chars().count() > FONT_NAME_MAX_LENGTH {
            return Err(invalid("name is empty, untrimmed or too long"));
        }
        if !ids.insert(font.id.as_str()) || !names.insert(name) {
            return Err(invalid("duplicate id or name"));
        }
        validate_font_file(&font.regular).map_err(|what| invalid(what))?;
        if let Some(bold) = &font.bold {
            validate_font_file(bold).map_err(|what| invalid(what))?;
        }
    }
    Ok(())
}

/// Same rules as TS `isFontFile`.
fn validate_font_file(file: &FontFile) -> Result<(), &'static str> {
    if validate_asset_path_in(&file.src, FONT_ASSET_DIR).is_err() || !has_font_extension(&file.src) {
        return Err("file is not a .ttf / .otf in assets/fonts");
    }
    if file.file_family.chars().count() > FONT_FILE_NAME_MAX_LENGTH || file.file_style.chars().count() > FONT_FILE_NAME_MAX_LENGTH {
        return Err("name read from the file is too long");
    }
    if !(1..=1000).contains(&file.weight) {
        return Err("weight out of range");
    }
    let in_range = |value: f64, min: f64| value.is_finite() && value >= min && value <= FONT_METRIC_MAX;
    if !in_range(file.ascent, 0.0) || !in_range(file.descent, 0.0) || !in_range(file.apple_baseline_shift.abs(), 0.0) {
        return Err("metrics out of range");
    }
    Ok(())
}

/// Font files keep the extension they were imported with: `.ttf` or `.otf`, lowercase.
fn has_font_extension(src: &str) -> bool {
    src.ends_with(".ttf") || src.ends_with(".otf")
}

/// Same rule as TS `isSwatchColor`: `#rrggbb` in lowercase.
fn is_swatch_color(color: &str) -> bool {
    color.len() == 7
        && color.starts_with('#')
        && color[1..].bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// A color's swatch link must name an entry of the swatch list.
fn require_swatch(swatch_id: &Option<String>, swatches: &SwatchIds) -> AppResult<()> {
    match swatch_id {
        Some(id) if !swatches.contains(id.as_str()) => {
            Err(AppError::invalid_project(format!("color linked to a missing swatch {id}")))
        }
        _ => Ok(()),
    }
}

/// Same rules as TS `isTextStyleSheet`: ids 1–64 bytes, names trimmed, non-empty, at most
/// TEXT_STYLE_NAME_MAX_LENGTH characters, ids and names unique, font size in range, valid colors.
fn validate_text_styles<'a>(styles: &'a [TextStyleDef], swatches: &SwatchIds) -> AppResult<StyleIds<'a>> {
    let mut names = std::collections::HashSet::new();
    let mut ids = StyleIds::new();
    for style in styles {
        let invalid = |what: &str| AppError::invalid_project(format!("text style {}: {what}", style.id));
        require_id(&style.id)?;
        let name = style.name.as_str();
        if name.is_empty() || name.trim() != name || name.chars().count() > TEXT_STYLE_NAME_MAX_LENGTH {
            return Err(invalid("invalid name"));
        }
        if !(FONT_SIZE_MIN..=FONT_SIZE_MAX).contains(&style.font_size) {
            return Err(invalid("invalid font size"));
        }
        require_element_color(&style.fill)?;
        require_swatch(&style.fill_swatch_id, swatches)?;
        validate_text_decoration(&style.decoration, swatches)?;
        validate_text_spacing(&style.spacing)?;
        validate_text_indent(&style.indent)?;
        if !ids.insert(style.id.as_str()) || !names.insert(name) {
            return Err(invalid("duplicate id or name"));
        }
    }
    Ok(ids)
}

/// A text's `styleId` must name an entry of the style sheet.
fn require_style(style_id: &Option<String>, styles: &StyleIds) -> AppResult<()> {
    match style_id {
        Some(id) if !styles.contains(id.as_str()) => {
            Err(AppError::invalid_project(format!("text linked to a missing text style {id}")))
        }
        _ => Ok(()),
    }
}

/// Same rules as TS `isMasterGraphValid`: page and master ids unique across both lists, every
/// `masterId` / `parentId` names an existing master, no cycles, chains at most MASTER_DEPTH_MAX long.
fn validate_master_graph(document: &Document) -> AppResult<()> {
    use std::collections::{HashMap, HashSet};
    let ids: Vec<&str> = document.pages.iter().map(|p| p.id.as_str()).chain(document.masters.iter().map(|m| m.id.as_str())).collect();
    if ids.iter().collect::<HashSet<_>>().len() != ids.len() {
        return Err(AppError::invalid_project("duplicate page or master page id"));
    }
    let parents: HashMap<&str, Option<&str>> =
        document.masters.iter().map(|m| (m.id.as_str(), m.parent_id.as_deref())).collect();
    let missing = |id: &Option<String>| id.as_deref().is_some_and(|id| !parents.contains_key(id));
    if let Some(page) = document.pages.iter().find(|page| missing(&page.master_id)) {
        return Err(AppError::invalid_project(format!("page {} uses a missing master page", page.id)));
    }
    if let Some(master) = document.masters.iter().find(|master| missing(&master.parent_id)) {
        return Err(AppError::invalid_project(format!("master page {} is based on a missing master page", master.id)));
    }
    // 每個主頁往上走到最上層：走超過上限（含循環）就不合法
    for master in &document.masters {
        let mut depth = 1;
        let mut parent = master.parent_id.as_deref();
        while let Some(id) = parent {
            depth += 1;
            if depth > MASTER_DEPTH_MAX {
                return Err(AppError::invalid_project(format!("master page {} is nested too deeply or in a cycle", master.id)));
            }
            parent = parents[id];
        }
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
fn validate_page_number_rules(rules: &[PageNumberRule], swatches: &SwatchIds) -> AppResult<()> {
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
        require_swatch(&rule.style.fill_swatch_id, swatches)?;
        validate_text_decoration(&rule.style.decoration, swatches)?;
        if let Some(stroke) = &rule.style.stroke {
            validate_stroke(stroke, swatches)?;
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

fn validate_stroke(stroke: &Stroke, swatches: &SwatchIds) -> AppResult<()> {
    require_swatch(&stroke.swatch_id, swatches)?;
    validate_stroke_look(stroke)
}

/// The drawable part of a stroke: element color and a width in (0, STROKE_WIDTH_MAX]. The swatch
/// link is not checked (export uses it for the details of shape-library shapes, never linked).
pub(crate) fn validate_stroke_look(stroke: &Stroke) -> AppResult<()> {
    require_element_color(&stroke.color)?;
    if !(stroke.width > 0.0 && stroke.width <= STROKE_WIDTH_MAX) {
        return Err(AppError::invalid_project(format!("invalid stroke width {}", stroke.width)));
    }
    Ok(())
}

/// Same rules as TS `isTextShadow`: element color, both offsets finite and within
/// ±TEXT_SHADOW_OFFSET_MAX. The flags need no check (serde already requires booleans).
fn validate_text_decoration(decoration: &TextDecoration, swatches: &SwatchIds) -> AppResult<()> {
    let Some(shadow) = &decoration.shadow else { return Ok(()) };
    require_element_color(&shadow.color)?;
    require_swatch(&shadow.swatch_id, swatches)?;
    for offset in [shadow.offset_x, shadow.offset_y] {
        if !(offset.is_finite() && offset.abs() <= TEXT_SHADOW_OFFSET_MAX) {
            return Err(AppError::invalid_project(format!("invalid text shadow offset {offset}")));
        }
    }
    Ok(())
}

/// Same rules as TS `hasValidTextSpacing`: line height in [LINE_HEIGHT_MIN, LINE_HEIGHT_MAX],
/// letter spacing in [LETTER_SPACING_MIN, LETTER_SPACING_MAX] (NaN fails both).
fn validate_text_spacing(spacing: &TextSpacing) -> AppResult<()> {
    if !(LINE_HEIGHT_MIN..=LINE_HEIGHT_MAX).contains(&spacing.line_height) {
        return Err(AppError::invalid_project(format!("invalid line height {}", spacing.line_height)));
    }
    if !(LETTER_SPACING_MIN..=LETTER_SPACING_MAX).contains(&spacing.letter_spacing) {
        return Err(AppError::invalid_project(format!("invalid letter spacing {}", spacing.letter_spacing)));
    }
    Ok(())
}

/// Same rules as TS `hasValidTextIndent`: left / right in [0, TEXT_INDENT_MAX], the first line in
/// [−left, TEXT_INDENT_MAX] (not left of the box; NaN fails).
fn validate_text_indent(indent: &TextIndent) -> AppResult<()> {
    let TextIndent { indent_left: left, indent_right: right, indent_first_line: first } = *indent;
    if !(0.0..=TEXT_INDENT_MAX).contains(&left) || !(0.0..=TEXT_INDENT_MAX).contains(&right) || !(-left..=TEXT_INDENT_MAX).contains(&first) {
        return Err(AppError::invalid_project(format!("invalid indent {left} / {right} / {first}")));
    }
    Ok(())
}

fn validate_element(element: &Element, refs: &Refs) -> AppResult<()> {
    match element {
        Element::Text(e) => {
            require_id(&e.base.id)?;
            require_element_color(&e.fill)?;
            require_swatch(&e.fill_swatch_id, &refs.swatches)?;
            require_style(&e.style_id, &refs.styles)?;
            validate_text_spacing(&e.spacing)?;
            validate_text_indent(&e.indent)?;
            validate_text_decoration(&e.decoration, &refs.swatches)
        }
        Element::Shape(e) => {
            require_id(&e.base.id)?;
            require_element_color(&e.fill)?;
            require_swatch(&e.fill_swatch_id, &refs.swatches)?;
            validate_geometry(&e.geometry)?;
            if let Some(stroke) = &e.stroke {
                validate_stroke(stroke, &refs.swatches)?;
            }
            if let Some(label) = &e.label {
                require_element_color(&label.fill)?;
                require_swatch(&label.fill_swatch_id, &refs.swatches)?;
                require_style(&label.style_id, &refs.styles)?;
                validate_text_decoration(&label.decoration, &refs.swatches)?;
                validate_text_spacing(&label.spacing)?;
                validate_text_indent(&label.indent)?;
            }
            if let Some(image) = &e.image {
                validate_shape_image(image)?;
            }
            Ok(())
        }
        Element::Image(e) => {
            require_id(&e.base.id)?;
            validate_asset_path(&e.src)
        }
        Element::Line(e) => {
            require_id(&e.base.id)?;
            validate_stroke(&e.stroke, &refs.swatches)?;
            validate_line(e)
        }
    }
}

/// Same rules as `isShapeImage` in `src/lib/editor/validation.ts`, plus the path check of image
/// elements: `src` under `assets/images/`, positive finite pixel size, focus 0–1, zoom
/// 1–SHAPE_IMAGE_ZOOM_MAX.
fn validate_shape_image(image: &ShapeImage) -> AppResult<()> {
    validate_asset_path(&image.src)?;
    let positive = |v: f64| v.is_finite() && v > 0.0;
    let unit = |v: f64| (0.0..=1.0).contains(&v);
    let valid = positive(image.image_width)
        && positive(image.image_height)
        && unit(image.focus_x)
        && unit(image.focus_y)
        && (1.0..=SHAPE_IMAGE_ZOOM_MAX).contains(&image.zoom);
    if !valid {
        return Err(AppError::invalid_project("invalid shape image"));
    }
    Ok(())
}

/// Same rules as `isValidLine` in `src/lib/editor/validation.ts`: 2–MAX_LINE_POINTS points with
/// finite coordinates within ±LINE_COORDINATE_MAX, arrowhead scales within
/// [LINE_END_SCALE_MIN, LINE_END_SCALE_MAX].
fn validate_line(line: &LineElement) -> AppResult<()> {
    let count = line.points.len();
    if !(2..=MAX_LINE_POINTS).contains(&count) {
        return Err(AppError::invalid_project(format!("line {} has {count} points", line.base.id)));
    }
    let in_range = |v: f64| v.is_finite() && v.abs() <= LINE_COORDINATE_MAX;
    if !line.points.iter().all(|p| in_range(p.x) && in_range(p.y)) {
        return Err(AppError::invalid_project(format!("line {} has an invalid point", line.base.id)));
    }
    for end in [&line.start, &line.end] {
        if !(LINE_END_SCALE_MIN..=LINE_END_SCALE_MAX).contains(&end.scale) {
            return Err(AppError::invalid_project(format!("invalid arrowhead scale {}", end.scale)));
        }
    }
    Ok(())
}

/// Rejects geometry that cannot be drawn sensibly. Same rules as `isShapeGeometry` in
/// `src/lib/editor/validation.ts`. Fewer than 3 sides / 2 points are not rejected: drawing raises
/// them (`project/shape.rs`), so older files keep opening.
fn validate_geometry(geometry: &ShapeGeometry) -> AppResult<()> {
    let valid = match geometry {
        ShapeGeometry::Rect { corner_radius } => corner_radius.radii().iter().all(|radius| radius.is_finite() && *radius >= 0.0),
        ShapeGeometry::Ellipse => true,
        ShapeGeometry::Polygon { sides } => *sides <= MAX_VERTEX_COUNT,
        ShapeGeometry::Star { num_points, inner_ratio } => {
            *num_points <= MAX_VERTEX_COUNT && *inner_ratio > 0.0 && *inner_ratio <= 1.0
        }
        // 只檢查格式：圖形庫在編輯器裡，這裡不認得 id（不認得的圖形畫成虛線外框、匯出略過）
        ShapeGeometry::Preset { preset, params } => {
            is_preset_name(preset)
                && params.len() <= SHAPE_PRESET_PARAMS_MAX
                && params.iter().all(|(name, value)| is_preset_name(name) && value.is_finite())
        }
    };
    if !valid {
        return Err(AppError::invalid_project(format!("invalid shape geometry {geometry:?}")));
    }
    Ok(())
}

/// A shape-library id or parameter name: 1–32 ASCII letters, digits or `-`. Same rule as
/// `isShapePresetName` in `src/lib/editor/validation.ts`.
fn is_preset_name(name: &str) -> bool {
    (1..=SHAPE_PRESET_ID_MAX_LENGTH).contains(&name.len()) && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

pub(crate) fn require_id(id: &str) -> AppResult<()> {
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
    validate_asset_path_in(src, ASSET_DIR)
}

/// Every asset directory: page images, the asset library's text and audio files, project fonts.
pub const ASSET_DIRS: [&str; 4] = [ASSET_DIR, TEXT_ASSET_DIR, AUDIO_ASSET_DIR, FONT_ASSET_DIR];

/// Accepts a plain file in any of `ASSET_DIRS`.
///
/// # Errors
/// Returns `AppError::InvalidProject` for any other path.
pub fn validate_any_asset_path(src: &str) -> AppResult<()> {
    if ASSET_DIRS.iter().any(|dir| validate_asset_path_in(src, dir).is_ok()) {
        Ok(())
    } else {
        Err(AppError::invalid_project(format!("invalid asset path {src:?}")))
    }
}

/// Accepts only `<dir>/<file>` with a plain file name (`dir` is one of the asset directories).
///
/// # Errors
/// Returns `AppError::InvalidProject` for any other path.
pub fn validate_asset_path_in(src: &str, dir: &str) -> AppResult<()> {
    let file = src
        .strip_prefix(dir)
        .and_then(|rest| rest.strip_prefix('/'))
        .ok_or_else(|| AppError::invalid_project(format!("asset path {src:?} is outside {dir}")))?;
    let plain = !file.is_empty()
        && file != "."
        && file != ".."
        && !file.contains(['/', '\\', ':', '\0'])
        && !file.starts_with('.');
    if !plain {
        return Err(AppError::invalid_project(format!("invalid asset path {src:?}")));
    }
    Ok(())
}

/// Returns every asset path referenced by the document (images on pages and master pages, project
/// font files) or listed in the asset panel.
pub fn referenced_assets<'a>(document: &'a Document, assets: &'a [AssetInfo]) -> impl Iterator<Item = &'a str> {
    // 主頁上的圖片也算：否則開檔清理會刪掉只用在主頁上的圖片
    let sheets = document.pages.iter().map(|page| &page.elements).chain(document.masters.iter().map(|master| &master.elements));
    // 圖片框（圖形裡的照片）也算：否則開檔清理會刪掉只用在圖片框的照片
    let from_elements = sheets.flat_map(|elements| {
        elements.iter().filter_map(|element| match element {
            Element::Image(image) => Some(image.src.as_str()),
            Element::Shape(shape) => shape.image.as_ref().map(|image| image.src.as_str()),
            _ => None,
        })
    });
    let fonts = document.fonts.iter().flat_map(|font| std::iter::once(&font.regular).chain(&font.bold)).map(|file| file.src.as_str());
    from_elements.chain(fonts).chain(assets.iter().map(|asset| asset.src.as_str()))
}
