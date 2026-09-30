//! `styles/page.css`: the reset every page shares plus `@font-face` rules for the embedded fonts.

use crate::export::fonts::BundledFont;
use std::fmt::Write;

// .page 裁掉超出頁面的物件（和 PDF 被紙張邊界裁掉一致）。
// .t > div 用 pre：Konva 已決定斷行，閱讀器絕對不能再換行，行首尾空白也要保留。
// text-spacing-trim: space-all 關掉中文標點的寬度壓縮，canvas 量測時沒有壓縮，不關會讓標點附近位置對不上。
const RESET: &str = r#"html, body { margin: 0; padding: 0; overflow: hidden; }
.page { position: relative; overflow: hidden; }
.el { position: absolute; margin: 0; padding: 0; transform-origin: 0 0; }
.c { transform-origin: 50% 50%; }
.t { font-style: normal; font-kerning: normal; text-spacing-trim: space-all; hyphens: none; -epub-hyphens: none; }
.t > div { white-space: pre; }
img.el { display: block; }
svg.el { overflow: visible; }
"#;

/// Builds the stylesheet.
///
/// # Args
/// * `fonts` - Embedded font files, each stored at `fonts/<file>` inside the EPUB.
pub fn stylesheet(fonts: &[&BundledFont]) -> String {
    let mut css = String::new();
    for font in fonts {
        let _ = writeln!(
            css,
            r#"@font-face {{ font-family: "{family}"; font-weight: {weight}; font-style: normal; src: url("../fonts/{file}"); }}"#,
            family = font.family,
            weight = if font.bold { 700 } else { 400 },
            file = font.file,
        );
    }
    css.push_str(RESET);
    css
}
