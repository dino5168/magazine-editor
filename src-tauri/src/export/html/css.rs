//! `styles/page.css` pieces every HTML-based format shares: `@font-face` rules for the embedded
//! fonts and the rules inside a `.page` box.

use crate::export::fonts::BundledFont;
use std::fmt::Write;

// .page 裁掉超出頁面的物件（和 PDF 被紙張邊界裁掉一致）。
// .t > div 用 pre：Konva 已決定斷行，閱讀器絕對不能再換行，行首尾空白也要保留。
// text-spacing-trim: space-all 關掉中文標點的寬度壓縮，canvas 量測時沒有壓縮，不關會讓標點附近位置對不上。
// .t 用 z-index: 0 自成一層：線的陰影（.d.s，z-index −1）才會畫在這段文字底下、又不會跑到其他物件後面。
// 這些規則只作用在 .page 與裡面的物件，整份文件的規則（html、body）由各格式自己決定。
pub const PAGE_RULES: &str = r#".page { position: relative; overflow: hidden; }
.el { position: absolute; margin: 0; padding: 0; transform-origin: 0 0; }
.t { z-index: 0; font-style: normal; font-kerning: normal; text-spacing-trim: space-all; hyphens: none; -epub-hyphens: none; }
.t > div { white-space: pre; }
.t > .d { position: absolute; display: block; }
.t > .d.s { z-index: -1; }
img.el { display: block; }
svg.el { overflow: visible; }
"#;

/// `@font-face` rules for the embedded fonts, each stored at `fonts/<file>` and referenced from
/// `styles/page.css`.
pub fn font_faces(fonts: &[&BundledFont]) -> String {
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
    css
}
