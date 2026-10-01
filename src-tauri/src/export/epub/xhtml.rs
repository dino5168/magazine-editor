//! One document page → one fixed-layout XHTML file.
//!
//! Units: the editor's pt become CSS px with the same number (at zoom 1 the canvas shows 1 pt as
//! 1 CSS px), and the reading system scales the whole page to the screen.

use super::{EpubImages, LANGUAGE};
use crate::export::fonts::{bundled_family, bundled_generic};
use crate::export::render::{RenderElement, RenderKind, RenderPage, RenderStroke, RenderText, STROKE_MITER_LIMIT};
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

/// CSS `font-family` value: only bundled families (their canonical names, never the user's
/// string) followed by the first family's generic fallback (`serif` for 明體 / 楷體).
fn font_family(fonts: &[String]) -> String {
    let mut families: Vec<&str> = Vec::new();
    for family in fonts.iter().filter_map(|font| bundled_family(font)) {
        if !families.contains(&family) {
            families.push(family);
        }
    }
    let generic = families.first().and_then(|family| bundled_generic(family)).unwrap_or("sans-serif");
    families.iter().map(|family| format!("'{family}',")).collect::<String>() + generic
}

fn align_name(align: Align) -> &'static str {
    match align {
        Align::Left => "left",
        Align::Center => "center",
        Align::Right => "right",
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
    rotate(&mut style, element.rotation);
    let _ = write!(out, r#"<div class="el t" style="{style}">"#);
    for line in &text.lines {
        if line.is_empty() {
            // 空行沒有行框，高度會塌成 0；明確給一行的高度，後面的行才會在正確位置
            let _ = write!(out, r#"<div style="height:{}px"></div>"#, num(text.line_height));
        } else {
            let _ = write!(out, "<div>{}</div>", escape(line));
        }
    }
    out.push_str("</div>\n");
}

fn element_markup(out: &mut String, element: &RenderElement, images: &EpubImages) {
    let (x, y) = (element.x, element.y);
    match &element.kind {
        RenderKind::Text(t) => text(out, element, t),
        RenderKind::Rect(r) if r.stroke.is_some() => {
            // 和 Konva 一樣，圓角不超過短邊的一半（SVG 也會自動限制，這裡寫明以免依賴閱讀器）
            let radius = num(r.corner_radius.min(r.width.min(r.height) / 2.0));
            let shape = format!(
                r#"<rect x="0" y="0" width="{}" height="{}" rx="{radius}" ry="{radius}" {}{}/>"#,
                num(r.width),
                num(r.height),
                svg_fill(&r.fill),
                svg_stroke(&r.stroke),
            );
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
                "left:{}px;top:{}px;width:{}px;height:{}px;border-radius:{}px;background:{}",
                num(x),
                num(y),
                num(r.width),
                num(r.height),
                num(r.corner_radius),
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
        RenderKind::Image(i) => {
            // 圖片在 EPUB 裡用產生的安全檔名（見 EpubImages），不會帶入專案裡的原始檔名
            let Some(href) = images.href(&i.src) else { return };
            let mut style =
                format!("left:{}px;top:{}px;width:{}px;height:{}px", num(x), num(y), num(i.width), num(i.height));
            rotate(&mut style, element.rotation);
            let _ = writeln!(out, r#"<img class="el" src="../{href}" alt="" style="{style}"/>"#);
        }
    }
}

/// Whether the page uses inline SVG (the manifest must then mark it with `properties="svg"`).
pub fn has_svg(page: &RenderPage) -> bool {
    page.elements.iter().any(|element| match &element.kind {
        RenderKind::Polygon(_) => true,
        RenderKind::Rect(r) => r.stroke.is_some(),
        RenderKind::Ellipse(e) => e.stroke.is_some(),
        RenderKind::Text(_) | RenderKind::Image(_) => false,
    })
}

/// Builds the XHTML of one page.
///
/// # Args
/// * `page` - The page to draw.
/// * `title` - Page title (already falls back to a generated name when the page name is empty).
/// * `images` - Where each project image was placed inside the EPUB; images missing from it are
///   not drawn.
pub fn page(page: &RenderPage, title: &str, images: &EpubImages) -> String {
    let mut body = String::new();
    for element in &page.elements {
        element_markup(&mut body, element, images);
    }
    // viewport 用整數；頁面本身維持精確尺寸，多出的不到 1px 由 body 的同色背景補上
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}" lang="{lang}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width={vw}, height={vh}"/>
<title>{title}</title>
<link rel="stylesheet" type="text/css" href="../styles/page.css"/>
</head>
<body style="background:{bg}">
<div class="page" style="width:{w}px;height:{h}px;background:{bg}">
{body}</div>
</body>
</html>
"#,
        lang = LANGUAGE,
        vw = page.width.ceil() as u64,
        vh = page.height.ceil() as u64,
        title = escape(title),
        bg = page.background,
        w = num(page.width),
        h = num(page.height),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

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
