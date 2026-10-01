//! The fonts bundled with the app, shared by the canvas and every exporter.
//!
//! These are the same files `src/index.css` loads with `@font-face` (and the families in
//! `src/lib/editor/fonts.ts`); see `fonts/README.md` for why the canvas and the exporters must
//! share them byte for byte.

pub struct BundledFont {
    /// CSS / Typst family name, as the editor writes it in `fontFamily`.
    pub family: &'static str,
    /// CSS generic family used after it as a fallback (`serif` / `sans-serif`).
    pub generic: &'static str,
    /// The family name Typst reads from the file. Usually `family`, but Typst picks the localized
    /// name for some fonts (LXGW WenKai TC is "霞鶩文楷 TC" to it), so the PDF data uses this.
    pub typst_family: &'static str,
    /// The face used for `fontStyle: "bold"` (not always weight 700, see LXGW WenKai TC).
    pub bold: bool,
    /// File name under `fonts/` (also used inside the EPUB).
    pub file: &'static str,
    pub data: &'static [u8],
}

pub static BUNDLED_FONTS: &[BundledFont] = &[
    BundledFont {
        family: "Geist",
        generic: "sans-serif",
        typst_family: "Geist",
        bold: false,
        file: "Geist-Regular.ttf",
        data: include_bytes!("../../../fonts/Geist-Regular.ttf"),
    },
    BundledFont {
        family: "Geist",
        generic: "sans-serif",
        typst_family: "Geist",
        bold: true,
        file: "Geist-Bold.ttf",
        data: include_bytes!("../../../fonts/Geist-Bold.ttf"),
    },
    BundledFont {
        family: "Noto Sans TC",
        generic: "sans-serif",
        typst_family: "Noto Sans TC",
        bold: false,
        file: "NotoSansTC-Regular.otf",
        data: include_bytes!("../../../fonts/NotoSansTC-Regular.otf"),
    },
    BundledFont {
        family: "Noto Sans TC",
        generic: "sans-serif",
        typst_family: "Noto Sans TC",
        bold: true,
        file: "NotoSansTC-Bold.otf",
        data: include_bytes!("../../../fonts/NotoSansTC-Bold.otf"),
    },
    BundledFont {
        family: "Noto Serif TC",
        generic: "serif",
        typst_family: "Noto Serif TC",
        bold: false,
        file: "NotoSerifTC-Regular.otf",
        data: include_bytes!("../../../fonts/NotoSerifTC-Regular.otf"),
    },
    BundledFont {
        family: "Noto Serif TC",
        generic: "serif",
        typst_family: "Noto Serif TC",
        bold: true,
        file: "NotoSerifTC-Bold.otf",
        data: include_bytes!("../../../fonts/NotoSerifTC-Bold.otf"),
    },
    BundledFont {
        family: "LXGW WenKai TC",
        generic: "serif",
        typst_family: "霞鶩文楷 TC",
        bold: false,
        file: "LXGWWenKaiTC-Regular.ttf",
        data: include_bytes!("../../../fonts/LXGWWenKaiTC-Regular.ttf"),
    },
    // 霞鶩文楷沒有 Bold，粗體用 Medium（`src/index.css` 也把它宣告成 font-weight 700）
    BundledFont {
        family: "LXGW WenKai TC",
        generic: "serif",
        typst_family: "霞鶩文楷 TC",
        bold: true,
        file: "LXGWWenKaiTC-Medium.ttf",
        data: include_bytes!("../../../fonts/LXGWWenKaiTC-Medium.ttf"),
    },
    BundledFont {
        family: "GenSenRounded2 TW",
        generic: "sans-serif",
        typst_family: "GenSenRounded2 TW",
        bold: false,
        file: "GenSenRounded2TW-R.otf",
        data: include_bytes!("../../../fonts/GenSenRounded2TW-R.otf"),
    },
    BundledFont {
        family: "GenSenRounded2 TW",
        generic: "sans-serif",
        typst_family: "GenSenRounded2 TW",
        bold: true,
        file: "GenSenRounded2TW-B.otf",
        data: include_bytes!("../../../fonts/GenSenRounded2TW-B.otf"),
    },
];

/// Returns the CSS generic family of a bundled family (`None` when the family is not bundled).
pub fn bundled_generic(family: &str) -> Option<&'static str> {
    BUNDLED_FONTS.iter().find(|font| font.family.eq_ignore_ascii_case(family)).map(|font| font.generic)
}

/// Translates a font-family name for Typst: a bundled family becomes the name Typst reads from
/// the file (see `BundledFont::typst_family`); anything else is passed through.
pub fn typst_family(family: &str) -> &str {
    BUNDLED_FONTS.iter().find(|font| font.family.eq_ignore_ascii_case(family)).map_or(family, |font| font.typst_family)
}

/// Returns the bundled family name matching `family` (CSS family names are case-insensitive),
/// or `None` when the family is not bundled.
pub fn bundled_family(family: &str) -> Option<&'static str> {
    BUNDLED_FONTS.iter().map(|font| font.family).find(|name| name.eq_ignore_ascii_case(family))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_bundled_family_has_regular_and_bold() {
        for font in BUNDLED_FONTS {
            let weights: Vec<bool> =
                BUNDLED_FONTS.iter().filter(|other| other.family == font.family).map(|other| other.bold).collect();
            assert!(weights.contains(&false) && weights.contains(&true), "{} needs both weights", font.family);
        }
    }

    #[test]
    fn every_family_has_one_generic() {
        for font in BUNDLED_FONTS {
            assert!(["serif", "sans-serif"].contains(&font.generic), "{}", font.file);
            assert_eq!(bundled_generic(font.family), Some(font.generic), "{}", font.file);
        }
    }

    /// Typst looks fonts up by the family name inside the file, which must equal `typst_family`
    /// (GenSenRounded2's per-weight family is "GenSenRounded2 TW R"; Typst uses the typographic one).
    #[test]
    fn typst_sees_the_declared_family_and_weight() {
        for font in BUNDLED_FONTS {
            let faces: Vec<_> = typst::text::Font::iter(typst::foundations::Bytes::new(font.data)).collect();
            assert_eq!(faces.len(), 1, "{}", font.file);
            let info = faces[0].info();
            assert_eq!(info.family, font.typst_family, "{}", font.file);
            let weight = info.variant.weight.to_number();
            assert_eq!(weight > 400, font.bold, "{}: weight {weight}", font.file);
        }
    }

    #[test]
    fn translates_family_names_for_typst() {
        assert_eq!(typst_family("lxgw wenkai tc"), "霞鶩文楷 TC");
        assert_eq!(typst_family("Noto Serif TC"), "Noto Serif TC");
        assert_eq!(typst_family("Arial"), "Arial");
    }

    #[test]
    fn matches_family_names_case_insensitively() {
        assert_eq!(bundled_family("noto sans tc"), Some("Noto Sans TC"));
        assert_eq!(bundled_family("Arial"), None);
    }
}
