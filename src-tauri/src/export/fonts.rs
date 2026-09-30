//! The fonts bundled with the app, shared by the canvas and every exporter.
//!
//! These are the same four files `src/index.css` loads with `@font-face`; see `fonts/README.md`
//! for why the canvas and the exporters must share them byte for byte.

pub struct BundledFont {
    /// CSS / Typst family name, as the editor writes it in `fontFamily`.
    pub family: &'static str,
    pub bold: bool,
    /// File name under `fonts/` (also used inside the EPUB).
    pub file: &'static str,
    pub data: &'static [u8],
}

pub static BUNDLED_FONTS: &[BundledFont] = &[
    BundledFont {
        family: "Geist",
        bold: false,
        file: "Geist-Regular.ttf",
        data: include_bytes!("../../../fonts/Geist-Regular.ttf"),
    },
    BundledFont {
        family: "Geist",
        bold: true,
        file: "Geist-Bold.ttf",
        data: include_bytes!("../../../fonts/Geist-Bold.ttf"),
    },
    BundledFont {
        family: "Noto Sans TC",
        bold: false,
        file: "NotoSansTC-Regular.otf",
        data: include_bytes!("../../../fonts/NotoSansTC-Regular.otf"),
    },
    BundledFont {
        family: "Noto Sans TC",
        bold: true,
        file: "NotoSansTC-Bold.otf",
        data: include_bytes!("../../../fonts/NotoSansTC-Bold.otf"),
    },
];

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
    fn matches_family_names_case_insensitively() {
        assert_eq!(bundled_family("noto sans tc"), Some("Noto Sans TC"));
        assert_eq!(bundled_family("Arial"), None);
    }
}
