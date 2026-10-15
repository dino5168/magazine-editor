//! One document page → the markup of its `.page` box: real text and absolutely positioned
//! elements, valid both as XHTML (EPUB) and as HTML5 (flip book).
//!
//! Units: the editor's pt become CSS px with the same number (at zoom 1 the canvas shows 1 pt as
//! 1 CSS px), and the reading system or viewer scales the whole page to the screen.

use super::PageImages;
use crate::export::document_fonts::is_project_family;
use crate::export::fonts::{bundled_family, bundled_generic};
use crate::export::render::{
    rounded_rect_path, DecorationLine, PathSegment, RenderElement, RenderKind, RenderPage, RenderRect, RenderStroke,
    RenderText, STROKE_MITER_LIMIT, SYNTHETIC_ITALIC_SLANT,
};
use crate::project::format::Align;
use std::fmt::Write;

/// Escapes text for XML content and attribute values, dropping characters XML 1.0 does not allow.
///
/// User text (element text, page and document names) always goes through this: it stays data and
/// can never become markup.
pub fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            // XML 1.0 的合法字元：tab / LF / CR、U+0020 以上（排除代理區與 U+FFFE、U+FFFF）
            '\t' | '\n' | '\r' => out.push(c),
            c if c < ' ' || c == '\u{FFFE}' || c == '\u{FFFF}' => {}
            c => out.push(c),
        }
    }
    out
}

/// Formats a length or angle for CSS / SVG: at most 4 decimals, no trailing zeros, no `-0`.
pub fn num(value: f64) -> String {
    let rounded = format!("{value:.4}");
    let trimmed = rounded.trim_end_matches('0').trim_end_matches('.');
    if trimmed == "-0" {
        "0".to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// Splits a validated `#rrggbb` / `#rrggbbaa` color into its `#rrggbb` part and the opacity
/// (0–1, at most 3 decimals); `None` when opaque.
///
/// 閱讀器相容性：8 位 hex 是 CSS Color 4 的寫法，SVG 1.1 也不允許；拆開後 CSS 用 `rgba()`、
/// SVG 用 `fill-opacity`，較舊的閱讀引擎也看得懂。
fn split_alpha(color: &str) -> (&str, Option<String>) {
    match color.get(7..9) {
        Some(hex) => {
            let byte = u8::from_str_radix(hex, 16).unwrap_or(u8::MAX);
            (&color[..7], (byte != u8::MAX).then(|| format!("{:.3}", f64::from(byte) / 255.0)))
        }
        None => (color, None),
    }
}

/// CSS color value: `#rrggbb` when opaque, otherwise `rgba(r,g,b,a)`.
fn css_color(color: &str) -> String {
    match split_alpha(color) {
        (rgb, None) => rgb.to_owned(),
        (rgb, Some(alpha)) => {
            let channel = |i: usize| u8::from_str_radix(&rgb[i..i + 2], 16).unwrap_or(0);
            format!("rgba({},{},{},{alpha})", channel(1), channel(3), channel(5))
        }
    }
}

/// SVG fill attributes: `fill="#rrggbb"`, plus `fill-opacity` when not opaque.
fn svg_fill(color: &str) -> String {
    match split_alpha(color) {
        (rgb, None) => format!(r#"fill="{rgb}""#),
        (rgb, Some(alpha)) => format!(r#"fill="{rgb}" fill-opacity="{alpha}""#),
    }
}

/// SVG stroke attributes (with a leading space), or nothing for `None`.
///
/// 邊線畫在外框線的中心，和 Konva、Typst 相同；所以有邊框的矩形與橢圓不用 CSS border（畫在框內）。
fn svg_stroke(stroke: &Option<RenderStroke>) -> String {
    let Some(stroke) = stroke else { return String::new() };
    let mut attrs = match split_alpha(&stroke.color) {
        (rgb, None) => format!(r#" stroke="{rgb}""#),
        (rgb, Some(alpha)) => format!(r#" stroke="{rgb}" stroke-opacity="{alpha}""#),
    };
    let _ = write!(attrs, r#" stroke-width="{}" stroke-miterlimit="{}""#, num(stroke.width), num(STROKE_MITER_LIMIT));
    if let Some(dash) = stroke.dash {
        let _ = write!(attrs, r#" stroke-dasharray="{} {}""#, num(dash.dash), num(dash.gap));
        if dash.round_cap {
            attrs.push_str(r#" stroke-linecap="round""#);
        }
    }
    attrs
}

/// An inline SVG covering the element's box; `shape` is drawn in box coordinates.
fn svg_box(out: &mut String, element: &RenderElement, width: f64, height: f64, shape: &str) {
    let mut style =
        format!("left:{}px;top:{}px;width:{}px;height:{}px", num(element.x), num(element.y), num(width), num(height));
    rotate(&mut style, element.rotation);
    let _ = writeln!(
        out,
        r#"<svg xmlns="http://www.w3.org/2000/svg" class="el" style="{style}" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{shape}</svg>"#,
        w = num(width),
        h = num(height),
    );
}

/// CSS `font-family` value: only bundled families (their canonical names) and project families
/// (`project-font-<id>`, letters, digits, `-`, `_` only), never any other user string, followed by
/// the generic fallback of the first bundled family (`serif` for 明體 / 楷體; a project font's stack
/// ends with the built-in Chinese font of its kind).
fn font_family(fonts: &[String]) -> String {
    let mut families: Vec<&str> = Vec::new();
    let known = fonts.iter().filter_map(|font| bundled_family(font).or_else(|| is_project_family(font).then_some(font.as_str())));
    for family in known {
        if !families.contains(&family) {
            families.push(family);
        }
    }
    let generic = families.iter().find_map(|family| bundled_generic(family)).unwrap_or("sans-serif");
    families.iter().map(|family| format!("'{family}',")).collect::<String>() + generic
}

fn align_name(align: Align) -> &'static str {
    match align {
        Align::Left => "left",
        Align::Center => "center",
        Align::Right => "right",
        // 每一行的起點由 render model 算好（line_starts），靠左放
        Align::Distributed => "left",
    }
}

fn rotate(style: &mut String, rotation: f64) {
    if rotation != 0.0 {
        let _ = write!(style, ";transform:rotate({}deg)", num(rotation));
    }
}

fn text(out: &mut String, element: &RenderElement, text: &RenderText) {
    let mut style = format!(
        "left:{}px;top:{}px;width:{}px;font-family:{};font-size:{}px;line-height:{}px;font-weight:{};color:{};text-align:{}",
        num(element.x),
        num(element.y),
        num(text.width),
        font_family(&text.fonts),
        num(text.size),
        num(text.line_height),
        if text.bold { 700 } else { 400 },
        css_color(&text.fill),
        align_name(text.align),
    );
    // 文字的陰影用 text-shadow（不複製文字，搜尋、選取、朗讀才不會出現兩次）；偏移已是文字框座標，隨框旋轉
    if let Some(shadow) = &text.shadow {
        let _ = write!(style, ";text-shadow:{}px {}px 0 {}", num(shadow.dx), num(shadow.dy), css_color(&shadow.color));
    }
    // 字距：編輯器（Konva）有字距時逐字畫，沒有 kerning 與連字，這裡也關掉；首尾置中也是逐字畫（每行的字距在行上）
    if text.letter_spacing != 0.0 {
        let _ = write!(style, ";letter-spacing:{}px", num(text.letter_spacing));
    }
    if text.letter_spacing != 0.0 || text.line_gaps.is_some() {
        style.push_str(";font-kerning:none;font-variant-ligatures:none");
    }
    rotate(&mut style, element.rotation);
    // 斜體：照瀏覽器的模擬斜體，以基線為軸斜切每一行（不用 font-style，斜率才不會因閱讀器而不同）
    let italic = if text.italic {
        format!(
            "transform:skewX({}deg);transform-origin:0 {}px",
            num(-SYNTHETIC_ITALIC_SLANT.atan().to_degrees()),
            num(text.baseline)
        )
    } else {
        String::new()
    };
    let _ = write!(out, r#"<div class="el t" style="{style}">"#);
    for (index, line) in text.lines.iter().enumerate() {
        if line.is_empty() {
            // 空行沒有行框，高度會塌成 0；明確給一行的高度，後面的行才會在正確位置
            let _ = write!(out, r#"<div style="height:{}px"></div>"#, num(text.line_height));
            continue;
        }
        // 有起點（字距、首尾置中）時每行靠左放在 render model 算好的起點（CSS 的行尾也有字距，自己對齊會偏；文字比框寬時起點是負的，
        // 所以用 margin 不用 padding）。換行由編輯器決定：閱讀器量的字寬稍寬時不能把行尾的字折下去，所以 nowrap
        let mut parts: Vec<String> = Vec::new();
        if let Some(x) = text.line_starts.as_ref().and_then(|starts| starts.get(index)) {
            parts.push(format!("text-align:left;margin-left:{}px;white-space:nowrap", num(*x)));
        }
        // 首尾置中：這一行字與字的距離（編輯器算好）；CSS 的行尾多一個字距，靠左放又不換行，看不到
        if let Some(gap) = text.line_gaps.as_ref().and_then(|gaps| gaps.get(index)) {
            parts.push(format!("letter-spacing:{}px", num(*gap)));
        }
        if !italic.is_empty() {
            parts.push(italic.clone());
        }
        let line_style = parts.join(";");
        if line_style.is_empty() {
            let _ = write!(out, "<div>{}</div>", escape(line));
        } else {
            let _ = write!(out, r#"<div style="{line_style}">{}</div>"#, escape(line));
        }
    }
    // 底線 / 刪除線：位置由 render model 照 Konva 的公式算好（CSS 的 text-decoration 位置由字型決定，對不上）。
    // 線的陰影放在 z-index −1：和畫布一樣在所有文字底下
    for line in &text.decorations {
        if let Some(shadow) = &text.shadow {
            decoration_bar(out, line, text.decoration_thickness, &shadow.color, (shadow.dx, shadow.dy), " s");
        }
        decoration_bar(out, line, text.decoration_thickness, &text.fill, (0.0, 0.0), "");
    }
    out.push_str("</div>\n");
}

/// One underline / strikethrough (or its shadow) as a bar in the text box's coordinates.
fn decoration_bar(out: &mut String, line: &DecorationLine, thickness: f64, color: &str, (dx, dy): (f64, f64), class: &str) {
    let _ = write!(
        out,
        r#"<span class="d{class}" style="left:{}px;top:{}px;width:{}px;height:{}px;background:{}"></span>"#,
        num(line.x + dx),
        num(line.y - thickness / 2.0 + dy),
        num(line.length),
        num(thickness),
        css_color(color),
    );
}

/// CSS `border-radius` of a rectangle: one value when the corners match, otherwise four in CSS
/// order (top-left, top-right, bottom-right, bottom-left, the same as Konva).
fn css_corner_radius(rect: &RenderRect) -> String {
    match rect.uniform_corner_radius() {
        Some(radius) => format!("{}px", num(radius)),
        None => rect.corner_radii.map(|radius| format!("{}px", num(radius))).join(" "),
    }
}

/// SVG path data (`d`) of an outline.
fn svg_path_data(path: &[PathSegment]) -> String {
    let parts: Vec<String> = path
        .iter()
        .map(|segment| match *segment {
            PathSegment::Move(x, y) => format!("M{} {}", num(x), num(y)),
            PathSegment::Line(x, y) => format!("L{} {}", num(x), num(y)),
            PathSegment::Cubic(x1, y1, x2, y2, x, y) => {
                format!("C{} {} {} {} {} {}", num(x1), num(y1), num(x2), num(y2), num(x), num(y))
            }
            PathSegment::Close => "Z".to_owned(),
        })
        .collect();
    parts.join(" ")
}

fn element_markup(out: &mut String, element: &RenderElement, images: &PageImages, image_prefix: &str) {
    let (x, y) = (element.x, element.y);
    match &element.kind {
        RenderKind::Text(t) => text(out, element, t),
        RenderKind::Rect(r) if r.stroke.is_some() => {
            // 圓角已由 render model 限制在短邊的一半（和 Konva 相同）。四個角一樣用 <rect rx>（起點同樣是 (r, 0)）；
            // 不同時 SVG rect 做不到，改畫和 PDF 同一條路徑（起點與方向相同，虛線位置才一樣）
            let shape = match r.uniform_corner_radius() {
                Some(radius) => format!(
                    r#"<rect x="0" y="0" width="{}" height="{}" rx="{radius}" ry="{radius}" {}{}/>"#,
                    num(r.width),
                    num(r.height),
                    svg_fill(&r.fill),
                    svg_stroke(&r.stroke),
                    radius = num(radius),
                ),
                None => format!(
                    r#"<path d="{}" {}{}/>"#,
                    svg_path_data(&rounded_rect_path(r.width, r.height, r.corner_radii)),
                    svg_fill(&r.fill),
                    svg_stroke(&r.stroke),
                ),
            };
            svg_box(out, element, r.width, r.height, &shape);
        }
        RenderKind::Ellipse(e) if e.stroke.is_some() => {
            let shape = format!(
                r#"<ellipse cx="{rx}" cy="{ry}" rx="{rx}" ry="{ry}" {}{}/>"#,
                svg_fill(&e.fill),
                svg_stroke(&e.stroke),
                rx = num(e.width / 2.0),
                ry = num(e.height / 2.0),
            );
            svg_box(out, element, e.width, e.height, &shape);
        }
        RenderKind::Rect(r) => {
            let mut style = format!(
                "left:{}px;top:{}px;width:{}px;height:{}px;border-radius:{};background:{}",
                num(x),
                num(y),
                num(r.width),
                num(r.height),
                // CSS 遇到兩角相加超過一邊會等比例縮小全部；render model 已把每個角限制在短邊一半，不會走到
                css_corner_radius(r),
                css_color(&r.fill),
            );
            rotate(&mut style, element.rotation);
            let _ = writeln!(out, r#"<div class="el" style="{style}"></div>"#);
        }
        RenderKind::Ellipse(e) => {
            let mut style = format!(
                "left:{}px;top:{}px;width:{}px;height:{}px;border-radius:50%;background:{}",
                num(x),
                num(y),
                num(e.width),
                num(e.height),
                css_color(&e.fill),
            );
            rotate(&mut style, element.rotation);
            let _ = writeln!(out, r#"<div class="el" style="{style}"></div>"#);
        }
        RenderKind::Polygon(p) => {
            // 頂點以外框左上角為原點，和 viewBox 相同
            let points: Vec<String> = p.points.iter().map(|[px, py]| format!("{},{}", num(*px), num(*py))).collect();
            let shape =
                format!(r#"<polygon points="{}" {}{}/>"#, points.join(" "), svg_fill(&p.fill), svg_stroke(&p.stroke));
            svg_box(out, element, p.width, p.height, &shape);
        }
        RenderKind::Path(p) => {
            // 填色外框 + 只描邊的細節線（fill="none"）；起點與方向和畫布、PDF 是同一串路徑
            let mut shape =
                format!(r#"<path d="{}" {}{}/>"#, svg_path_data(&p.outline), svg_fill(&p.fill), svg_stroke(&p.stroke));
            if !p.details.is_empty() && p.detail_stroke.is_some() {
                let _ = write!(shape, r#"<path d="{}" fill="none"{}/>"#, svg_path_data(&p.details), svg_stroke(&p.detail_stroke));
            }
            svg_box(out, element, p.width, p.height, &shape);
        }
        RenderKind::Image(i) => {
            // 圖片用產生的安全檔名（見 PageImages），不會帶入專案裡的原始檔名
            let Some(href) = images.href(&i.src) else { return };
            let mut style =
                format!("left:{}px;top:{}px;width:{}px;height:{}px", num(x), num(y), num(i.width), num(i.height));
            rotate(&mut style, element.rotation);
            let _ = writeln!(out, r#"<img class="el" src="{image_prefix}{href}" alt="" style="{style}"/>"#);
        }
    }
}

/// Whether the page uses inline SVG (the manifest must then mark it with `properties="svg"`).
pub fn has_svg(page: &RenderPage) -> bool {
    page.elements.iter().any(|element| match &element.kind {
        RenderKind::Polygon(_) | RenderKind::Path(_) => true,
        RenderKind::Rect(r) => r.stroke.is_some(),
        RenderKind::Ellipse(e) => e.stroke.is_some(),
        RenderKind::Text(_) | RenderKind::Image(_) => false,
    })
}

/// Builds the `.page` box of one page: its exact size and background, with every element inside.
///
/// # Args
/// * `page` - The page to draw.
/// * `images` - Where each project image was placed in the output; images missing from it are not
///   drawn.
/// * `image_prefix` - Path from the document holding this markup to the output root, put in front
///   of every image href (`../` for an EPUB page in `pages/`, empty for the flip book's `index.html`).
pub fn page_div(page: &RenderPage, images: &PageImages, image_prefix: &str) -> String {
    let mut body = String::new();
    for element in &page.elements {
        element_markup(&mut body, element, images, image_prefix);
    }
    format!(
        "<div class=\"page\" style=\"width:{w}px;height:{h}px;background:{bg}\">\n{body}</div>",
        bg = page.background,
        w = num(page.width),
        h = num(page.height),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_shapes_are_inline_svg_with_open_details_left_open() {
        let document = crate::export::test_support::path_shape_document();
        let page = &document.pages[0];
        assert!(has_svg(page));
        let images = super::super::PageImages { by_src: std::collections::HashMap::new(), order: Vec::new() };
        let markup = page_div(page, &images, "");
        assert!(
            markup.contains(r##"<path d="M0 0 L60 0 L60 60 L0 60 Z M100 0 L160 0 L160 60 L100 60 Z" fill="#ff0000"/>"##),
            "outline: two closed subpaths, filled, no stroke: {markup}"
        );
        assert!(
            markup.contains(r##"<path d="M0 80 L60 80 L60 100" fill="none" stroke="#0000ff" stroke-width="2""##),
            "details: open, stroked only: {markup}"
        );
    }

    #[test]
    fn escapes_markup_and_drops_invalid_xml_characters() {
        assert_eq!(escape(r#"<a href="x">&'"#), "&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
        assert_eq!(escape("a\u{0}b\u{1b}c\td"), "abc\td");
        assert_eq!(escape("中文"), "中文");
    }

    #[test]
    fn formats_numbers_compactly() {
        assert_eq!(num(595.2755905511812), "595.2756");
        assert_eq!(num(12.0), "12");
        assert_eq!(num(-0.00001), "0");
        assert_eq!(num(-30.5), "-30.5");
    }

    #[test]
    fn font_family_uses_only_bundled_names() {
        let fonts = vec!["geist".to_owned(), "x'; background:url(http://evil)".to_owned(), "Noto Sans TC".to_owned()];
        assert_eq!(font_family(&fonts), "'Geist','Noto Sans TC',sans-serif");
        assert_eq!(font_family(&[]), "sans-serif");
        assert_eq!(font_family(&["Noto Serif TC".to_owned()]), "'Noto Serif TC',serif");
        assert_eq!(font_family(&["LXGW WenKai TC".to_owned()]), "'LXGW WenKai TC',serif");
        assert_eq!(font_family(&["GenSenRounded2 TW".to_owned()]), "'GenSenRounded2 TW',sans-serif");
        // 專案字型：名稱照原樣（只有英數 - _），泛用字族取後面的內建中文字型
        let project = vec!["project-font-f1".to_owned(), "Noto Serif TC".to_owned()];
        assert_eq!(font_family(&project), "'project-font-f1','Noto Serif TC',serif");
        assert_eq!(font_family(&["project-font-x');}body{".to_owned()]), "sans-serif");
    }

    #[test]
    fn colors_with_alpha_use_widely_supported_syntax() {
        assert_eq!(css_color("#e0e7ff"), "#e0e7ff");
        assert_eq!(css_color("#e0e7ffcc"), "rgba(224,231,255,0.800)");
        assert_eq!(css_color("#ff000000"), "rgba(255,0,0,0.000)");
        assert_eq!(css_color("#ff0000ff"), "#ff0000");
        assert_eq!(svg_fill("#86efac"), r##"fill="#86efac""##);
        assert_eq!(svg_fill("#86efac80"), r##"fill="#86efac" fill-opacity="0.502""##);
    }

    #[test]
    fn stroke_attributes_follow_the_render_model() {
        use crate::export::render::DashPattern;
        assert_eq!(svg_stroke(&None), "");
        let solid = RenderStroke { color: "#be123c80".into(), width: 2.0, dash: None };
        assert_eq!(
            svg_stroke(&Some(solid)),
            r##" stroke="#be123c" stroke-opacity="0.502" stroke-width="2" stroke-miterlimit="10""##
        );
        let dotted = RenderStroke {
            color: "#000000".into(),
            width: 2.0,
            dash: Some(DashPattern { dash: 0.0, gap: 4.0, round_cap: true }),
        };
        assert!(svg_stroke(&Some(dotted)).ends_with(r#" stroke-dasharray="0 4" stroke-linecap="round""#));
    }
}
