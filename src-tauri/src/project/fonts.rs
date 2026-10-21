//! Importing project fonts (`assets/fonts/`): checking a TTF / OTF file and reading what the app
//! needs from it (embedding permission, the metrics the canvas uses, names for display).
//!
//! Plan: `docs/05-Plans-字型/01-專案字型-實作.md`.

use super::assets::store;
use super::font_collection;
use super::format::{FontEmbedding, FontFile, FONT_ASSET_DIR, FONT_FILE_NAME_MAX_LENGTH, FONT_METRIC_MAX};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::Path;
use ttf_parser::{name_id, Face, Language, Tag};

/// Largest font file; full CJK fonts are 10–30 MB.
pub const FONT_ASSET_MAX_BYTES: usize = 64 * 1024 * 1024;
/// `OS/2.fsType` bit: only bitmaps may be embedded (outline fonts cannot be used).
const FS_TYPE_BITMAP_ONLY: u16 = 0x0200;

/// What a font file is, from its first four bytes.
fn container(bytes: &[u8]) -> AppResult<&'static str> {
    match bytes.get(..4) {
        Some(b"OTTO") => Ok("otf"),
        Some([0, 1, 0, 0]) | Some(b"true") => Ok("ttf"),
        // 集合要先經 prepare 拆成單一字型
        Some(b"ttcf") => Err(AppError::invalid_input("字型集合（.ttc）要指定用其中哪一個字型")),
        Some(b"wOFF") | Some(b"wOF2") => Err(AppError::invalid_input("不支援網頁字型（.woff / .woff2）：請改用 .ttf / .otf 檔")),
        _ => Err(AppError::invalid_input("不是 TrueType / OpenType 字型檔（.ttf / .otf）")),
    }
}

/// Raw `OS/2.fsType` (0 when there is no OS/2 table: nothing restricts it).
fn fs_type(face: &Face) -> u16 {
    face.raw_face()
        .table(Tag::from_bytes(b"OS/2"))
        .and_then(|table| table.get(8..10))
        .map_or(0, |bytes| u16::from_be_bytes([bytes[0], bytes[1]]))
}

/// The embedding permission, or an error for fonts that must not be embedded.
fn embedding(face: &Face) -> AppResult<FontEmbedding> {
    if fs_type(face) & FS_TYPE_BITMAP_ONLY != 0 {
        return Err(AppError::invalid_input("這個字型的授權只允許嵌入點陣圖，不能用在 PDF / EPUB"));
    }
    let Some(os2) = face.tables().os2 else { return Ok(FontEmbedding::Installable) };
    match os2.permissions() {
        Some(ttf_parser::Permissions::Installable) | None => Ok(FontEmbedding::Installable),
        Some(ttf_parser::Permissions::Editable) => Ok(FontEmbedding::Editable),
        Some(ttf_parser::Permissions::PreviewAndPrint) => Ok(FontEmbedding::PreviewAndPrint),
        Some(ttf_parser::Permissions::Restricted) => {
            Err(AppError::invalid_input("這個字型的授權禁止嵌入（Restricted License），不能放進 PDF / EPUB"))
        }
    }
}

/// `(ascent, descent)` in font units, both positive downward-agnostic magnitudes: what Windows
/// engines (Chromium / WebView2, so the canvas) use — `OS/2` typo metrics when USE_TYPO_METRICS is
/// set, win metrics otherwise, `hhea` without an OS/2 table.
fn windows_metrics(face: &Face) -> (f64, f64) {
    match face.tables().os2 {
        Some(os2) if os2.use_typographic_metrics() => {
            (f64::from(os2.typographic_ascender()), -f64::from(os2.typographic_descender()))
        }
        // windows_descender 是 usWinDescent 取負號（往下為負）
        Some(os2) => (f64::from(os2.windows_ascender()), -f64::from(os2.windows_descender())),
        None => hhea_metrics(face),
    }
}

/// `(ascent, descent)` from `hhea`, which Apple engines read.
fn hhea_metrics(face: &Face) -> (f64, f64) {
    let hhea = face.tables().hhea;
    (f64::from(hhea.ascender), -f64::from(hhea.descender))
}

/// A name from the `name` table: Traditional Chinese first, then US English, then any readable one.
fn name(face: &Face, ids: &[u16]) -> String {
    for id in ids {
        let names: Vec<_> = face.names().into_iter().filter(|name| name.name_id == *id).collect();
        let pick = |language: Language| names.iter().filter(|name| name.language() == language).find_map(|name| name.to_string());
        let found = pick(Language::Chinese_Taiwan)
            .or_else(|| pick(Language::English_UnitedStates))
            .or_else(|| names.iter().find_map(|name| name.to_string()));
        if let Some(found) = found.map(|text| text.trim().to_owned()).filter(|text| !text.is_empty()) {
            return found.chars().take(FONT_FILE_NAME_MAX_LENGTH).collect();
        }
    }
    String::new()
}

/// Rounds an em value for storage (the overrides are percentages; 4 decimals is 0.01 %).
fn round_em(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

/// Checks a font file and reads what the project stores about it (`src` is left empty).
///
/// # Errors
/// `AppError::InvalidInput` (user-facing Chinese) for anything that cannot be used: not TTF / OTF,
/// a collection or web font, damaged, variable, restricted or bitmap-only embedding, a file Typst
/// cannot read, or unusable metrics.
pub fn analyze(bytes: &[u8]) -> AppResult<(FontFile, &'static str)> {
    if bytes.is_empty() {
        return Err(AppError::invalid_input("字型檔是空的"));
    }
    if bytes.len() > FONT_ASSET_MAX_BYTES {
        return Err(AppError::invalid_input("字型檔超過 64 MB 上限"));
    }
    let extension = container(bytes)?;
    let face = Face::parse(bytes, 0).map_err(|_| AppError::invalid_input("字型檔損壞，無法讀取"))?;
    // 文件模型只有一般 / 粗體兩個字重；可變字型與它的靜態實例度量不一定相同（fonts/README.md）
    if face.is_variable() {
        return Err(AppError::invalid_input("不支援可變字型（Variable Font）：請改用一般、粗體各自一個檔案的靜態字型"));
    }
    let embedding = embedding(&face)?;
    // PDF 由 Typst 排版：它讀不了的字型，匯出時字會全部消失
    if typst::text::Font::new(typst::foundations::Bytes::new(bytes.to_vec()), 0).is_none() {
        return Err(AppError::invalid_input("PDF 排版引擎無法讀取這個字型檔"));
    }

    let units = f64::from(face.units_per_em());
    let (ascent, descent) = windows_metrics(&face);
    let (hhea_ascent, hhea_descent) = hhea_metrics(&face);
    // 行高固定時，CSS 把第一條基線放在 行高 / 2 + (ascent − descent) / 2；只讀 hhea 的引擎差多少
    let apple_baseline_shift = ((hhea_ascent - hhea_descent) - (ascent - descent)) / 2.0 / units;
    let file = FontFile {
        src: String::new(),
        file_family: name(&face, &[name_id::TYPOGRAPHIC_FAMILY, name_id::FAMILY]),
        file_style: name(&face, &[name_id::TYPOGRAPHIC_SUBFAMILY, name_id::SUBFAMILY]),
        weight: face.weight().to_number().clamp(1, 1000),
        embedding,
        ascent: round_em(ascent / units),
        descent: round_em(descent / units),
        apple_baseline_shift: round_em(apple_baseline_shift),
    };
    let usable = |value: f64| value.is_finite() && (0.0..=FONT_METRIC_MAX).contains(&value);
    if file.ascent <= 0.0 || !usable(file.ascent) || !usable(file.descent) || !usable(file.apple_baseline_shift.abs()) {
        return Err(AppError::invalid_input("字型檔的行高資料不合理，無法使用"));
    }
    Ok((file, extension))
}

/// The bytes a project stores for a font file: face `index` of a collection rebuilt as a single
/// font, with the reserved glyph flag cleared (Chrome rejects fonts that set it).
///
/// # Args
/// * `index` — which face of a `.ttc`; `None` or `Some(0)` for a single font.
///
/// # Errors
/// `AppError::InvalidInput` for a collection without an index, an index out of range, or an index
/// on a single font.
pub fn prepare(bytes: &[u8], index: Option<u32>) -> AppResult<Vec<u8>> {
    let mut font = if font_collection::is_collection(bytes) {
        let Some(index) = index else {
            return Err(AppError::invalid_input("字型集合（.ttc）要指定用其中哪一個字型"));
        };
        font_collection::extract_face(bytes, index)?
    } else {
        if index.is_some_and(|index| index > 0) {
            return Err(AppError::invalid_input("這不是字型集合，只有一個字型"));
        }
        bytes.to_vec()
    };
    font_collection::clear_reserved_glyph_flags(&mut font);
    Ok(font)
}

/// One face of a collection, for choosing which one to import.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionFace {
    pub index: u32,
    pub family: String,
    pub style: String,
    pub weight: u16,
    /// Why it cannot be imported (user-facing), or None.
    pub problem: Option<String>,
}

/// Lists the faces of a font collection. Only the quick checks run here (variable font, embedding
/// permission): rebuilding and checking every face of a 30 MB collection took 10 s in a debug build;
/// the full check still runs when the chosen face is imported.
///
/// # Errors
/// `AppError::InvalidInput` when it is not a readable collection or exceeds the size limit.
pub fn collection_faces(bytes: &[u8]) -> AppResult<Vec<CollectionFace>> {
    if bytes.len() > FONT_ASSET_MAX_BYTES {
        return Err(AppError::invalid_input("字型檔超過 64 MB 上限"));
    }
    let count = font_collection::face_count(bytes)?;
    (0..count)
        .map(|index| {
            let face = Face::parse(bytes, index).map_err(|_| AppError::invalid_input("字型集合檔損壞，無法讀取"))?;
            let problem = if face.is_variable() {
                Some("可變字型（Variable Font）不能使用".to_owned())
            } else {
                match embedding(&face) {
                    Ok(_) => None,
                    Err(AppError::InvalidInput(message)) => Some(message),
                    Err(error) => return Err(error),
                }
            };
            Ok(CollectionFace {
                index,
                family: name(&face, &[name_id::TYPOGRAPHIC_FAMILY, name_id::FAMILY]),
                style: name(&face, &[name_id::TYPOGRAPHIC_SUBFAMILY, name_id::SUBFAMILY]),
                weight: face.weight().to_number().clamp(1, 1000),
                problem,
            })
        })
        .collect()
}

/// Checks a font file and stores it in `assets/fonts/`, named by content hash (the same file is
/// stored once; existing files are never rewritten).
///
/// # Args
/// * `index` — which face of a `.ttc` (see `prepare`).
///
/// # Returns
/// What to store in `ProjectFont.regular` / `bold`, with `src` set.
///
/// # Errors
/// See `prepare` and `analyze`; `AppError::Io` on write failure.
pub fn import_font(root: &Path, bytes: &[u8], index: Option<u32>) -> AppResult<FontFile> {
    let font = prepare(bytes, index)?;
    let (file, extension) = analyze(&font)?;
    let src = store(root, FONT_ASSET_DIR, &font, extension)?;
    Ok(FontFile { src, ..file })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::export::fonts::BUNDLED_FONTS;

    fn bundled(file: &str) -> &'static [u8] {
        BUNDLED_FONTS.iter().find(|font| font.file == file).unwrap().data
    }

    /// A copy of a font with `OS/2.fsType` replaced (ttf-parser does not check table checksums).
    pub(crate) fn with_fs_type(data: &[u8], value: u16) -> Vec<u8> {
        let mut bytes = data.to_vec();
        let tables = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
        let record = (0..tables).map(|i| 12 + 16 * i).find(|&offset| &bytes[offset..offset + 4] == b"OS/2").unwrap();
        let start = u32::from_be_bytes(bytes[record + 8..record + 12].try_into().unwrap()) as usize;
        bytes[start + 8..start + 10].copy_from_slice(&value.to_be_bytes());
        bytes
    }

    #[test]
    fn reads_names_weight_and_metrics() {
        let (file, extension) = analyze(bundled("Geist-Bold.ttf")).unwrap();
        assert_eq!(extension, "ttf");
        assert_eq!((file.file_family.as_str(), file.weight, file.embedding), ("Geist", 700, FontEmbedding::Installable));
        assert!(file.ascent > 0.5 && file.descent > 0.0, "{file:?}");

        let (file, extension) = analyze(bundled("NotoSerifTC-Regular.otf")).unwrap();
        assert_eq!(extension, "otf");
        assert_eq!((file.file_family.as_str(), file.file_style.as_str(), file.weight), ("Noto Serif TC", "Regular", 400));
        // 內建字型的 hhea 與 Windows 度量一致（baseline_matches_css_line_box），Apple 不偏
        assert_eq!(file.apple_baseline_shift, 0.0);
    }

    /// The patched WenKai (`fonts/README.md`) has hhea = win metrics, so its shift is 0; the
    /// metrics are the canvas's: `(ascent − descent) / 2 + L / 2` must equal the editor's baseline.
    #[test]
    fn metrics_are_the_windows_ones_in_em() {
        for font in BUNDLED_FONTS {
            let (file, _) = analyze(font.data).unwrap();
            let face = Face::parse(font.data, 0).unwrap();
            let units = f64::from(face.units_per_em());
            let (ascent, descent) = windows_metrics(&face);
            assert!((file.ascent - ascent / units).abs() < 1e-4, "{}", font.file);
            assert!((file.descent - descent / units).abs() < 1e-4, "{}", font.file);
            assert_eq!(file.apple_baseline_shift, 0.0, "{}", font.file);
        }
    }

    #[test]
    fn embedding_permission_decides_whether_a_font_can_be_imported() {
        let data = bundled("Geist-Regular.ttf");
        let embedding = |value: u16| analyze(&with_fs_type(data, value)).map(|(file, _)| file.embedding);
        assert_eq!(embedding(0x0000).unwrap(), FontEmbedding::Installable);
        assert_eq!(embedding(0x0004).unwrap(), FontEmbedding::PreviewAndPrint);
        assert_eq!(embedding(0x0008).unwrap(), FontEmbedding::Editable);
        // 不准再拆的子集化旗標不影響（目前不做子集化）
        assert_eq!(embedding(0x0100).unwrap(), FontEmbedding::Installable);
        assert!(matches!(embedding(0x0002), Err(AppError::InvalidInput(_))));
        assert!(matches!(embedding(0x0200), Err(AppError::InvalidInput(_))));
        assert!(matches!(embedding(0x0208), Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn rejects_files_that_are_not_single_static_fonts() {
        for (bytes, what) in [
            (&b""[..], "空的"),
            (b"ttcf\0\x01\0\0", "字型集合"),
            (b"wOF2\0\x01\0\0", "網頁字型"),
            (b"wOFF\0\x01\0\0", "網頁字型"),
            (b"\x89PNG\r\n\x1a\n", "不是"),
            (b"OTTO\0\0\0\0", "損壞"),
        ] {
            let Err(AppError::InvalidInput(message)) = analyze(bytes) else { panic!("{what} accepted") };
            assert!(message.contains(what), "{message}");
        }
    }

    /// Variable fonts are rejected; the system's Segoe UI Variable is used when present (the repo
    /// has none, and a variable font cannot be made by patching bytes).
    #[test]
    fn rejects_a_variable_font() {
        let Ok(bytes) = std::fs::read(r"C:\Windows\Fonts\SegUIVar.ttf") else { return };
        let Err(AppError::InvalidInput(message)) = analyze(&bytes) else { panic!("variable font accepted") };
        assert!(message.contains("可變字型"), "{message}");
    }

    /// A font whose `hhea` differs from its Windows metrics (step 1 measured it in Chromium: the
    /// canvas reads ascent 95 / descent 27 at 100 px = the win metrics 1950 / 550 of 2048).
    #[test]
    fn apple_shift_of_a_font_with_different_hhea() {
        let Ok(bytes) = std::fs::read(r"C:\Windows\Fonts\calibri.ttf") else { return };
        let (file, _) = analyze(&bytes).unwrap();
        assert_eq!((file.ascent, file.descent), (round_em(1950.0 / 2048.0), round_em(550.0 / 2048.0)));
        // hhea 1536 / 512：(1024 − 1400) / 2 / 2048 = −0.0918 em（往上）
        assert_eq!(file.apple_baseline_shift, -0.0918);
        assert_eq!(file.embedding, FontEmbedding::Editable);
    }

    #[test]
    fn stores_the_file_once_under_its_hash() {
        let dir = tempfile::tempdir().unwrap();
        let first = import_font(dir.path(), bundled("Geist-Regular.ttf"), None).unwrap();
        let again = import_font(dir.path(), bundled("Geist-Regular.ttf"), None).unwrap();
        assert_eq!(first, again);
        assert!(first.src.starts_with("assets/fonts/") && first.src.ends_with(".ttf"), "{}", first.src);
        assert_eq!(std::fs::read(dir.path().join(&first.src)).unwrap(), bundled("Geist-Regular.ttf"));
        assert_eq!(std::fs::read_dir(dir.path().join(FONT_ASSET_DIR)).unwrap().count(), 1);
    }
}
