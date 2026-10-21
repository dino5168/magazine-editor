//! Font collections (`.ttc`): rebuilding one face of a collection as a standalone font file.
//!
//! Browsers (`FontFace`, `@font-face`) cannot pick a face inside a collection, so a project stores
//! the face as its own `.ttf` / `.otf`. The tables are copied byte for byte; only the file header,
//! the table directory and `head.checkSumAdjustment` are written anew.
//!
//! Plan: `docs/05-Plans-字型/02-字型管理問題-實作.md`.

use crate::error::{AppError, AppResult};

const TTC_TAG: &[u8; 4] = b"ttcf";
const HEAD_TAG: &[u8; 4] = b"head";
/// `head.checkSumAdjustment` makes the whole file sum to this (OpenType spec).
const CHECKSUM_MAGIC: u32 = 0xB1B0_AFBA;

fn damaged() -> AppError {
    AppError::invalid_input("字型集合檔損壞，無法讀取")
}

fn read_u16(bytes: &[u8], at: usize) -> AppResult<u16> {
    bytes.get(at..at + 2).map(|b| u16::from_be_bytes([b[0], b[1]])).ok_or_else(damaged)
}

fn read_u32(bytes: &[u8], at: usize) -> AppResult<u32> {
    bytes.get(at..at + 4).map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]])).ok_or_else(damaged)
}

/// Whether the bytes are a font collection.
pub fn is_collection(bytes: &[u8]) -> bool {
    bytes.get(..4) == Some(TTC_TAG)
}

/// Number of faces in a collection.
///
/// # Errors
/// `AppError::InvalidInput` when it is not a readable collection.
pub fn face_count(bytes: &[u8]) -> AppResult<u32> {
    if !is_collection(bytes) {
        return Err(AppError::invalid_input("不是字型集合檔（.ttc）"));
    }
    let count = read_u32(bytes, 8)?;
    // 每個字型的位移 4 bytes；數量大到檔案放不下就是壞檔
    if count == 0 || 12 + count as usize * 4 > bytes.len() {
        return Err(damaged());
    }
    Ok(count)
}

/// Sum of big-endian u32 words, the last one zero-padded (OpenType table checksum).
fn checksum(data: &[u8]) -> u32 {
    data.chunks(4).fold(0u32, |sum, chunk| {
        let mut word = [0u8; 4];
        word[..chunk.len()].copy_from_slice(chunk);
        sum.wrapping_add(u32::from_be_bytes(word))
    })
}

/// Rebuilds face `index` of a collection as a standalone sfnt (`.ttf` or `.otf` bytes).
///
/// # Errors
/// `AppError::InvalidInput` for a damaged collection or an index out of range.
pub fn extract_face(bytes: &[u8], index: u32) -> AppResult<Vec<u8>> {
    let count = face_count(bytes)?;
    if index >= count {
        return Err(AppError::invalid_input(format!("字型集合只有 {count} 個字型")));
    }
    let offset = read_u32(bytes, 12 + index as usize * 4)? as usize;
    let sfnt_version = read_u32(bytes, offset)?;
    let table_count = read_u16(bytes, offset + 4)? as usize;
    if table_count == 0 {
        return Err(damaged());
    }

    let mut tables: Vec<([u8; 4], &[u8])> = Vec::with_capacity(table_count);
    for record in 0..table_count {
        let at = offset + 12 + record * 16;
        let tag: [u8; 4] = bytes.get(at..at + 4).ok_or_else(damaged)?.try_into().map_err(|_| damaged())?;
        let start = read_u32(bytes, at + 8)? as usize;
        let length = read_u32(bytes, at + 12)? as usize;
        let data = bytes.get(start..start.checked_add(length).ok_or_else(damaged)?).ok_or_else(damaged)?;
        tables.push((tag, data));
    }
    build_sfnt(sfnt_version, tables)
}

/// Writes a standalone sfnt from its tables: header, table directory sorted by tag, 4-byte aligned
/// tables, table checksums and `head.checkSumAdjustment`. The table contents are copied as is.
///
/// # Errors
/// `AppError::InvalidInput` when there is no table or `head` is too short.
pub fn build_sfnt(sfnt_version: u32, mut tables: Vec<([u8; 4], &[u8])>) -> AppResult<Vec<u8>> {
    let table_count = tables.len();
    if table_count == 0 || table_count > usize::from(u16::MAX) / 16 {
        return Err(damaged());
    }
    // 表格目錄必須依 tag 排序（OpenType 規格）
    tables.sort_by(|a, b| a.0.cmp(&b.0));

    let header_len = 12 + 16 * table_count;
    let body_len: usize = tables.iter().map(|(_, data)| data.len().next_multiple_of(4)).sum();
    let mut out = Vec::with_capacity(header_len + body_len);
    let entry_selector = (table_count as u16).ilog2() as u16;
    let search_range = (1u16 << entry_selector) * 16;
    out.extend_from_slice(&sfnt_version.to_be_bytes());
    out.extend_from_slice(&(table_count as u16).to_be_bytes());
    out.extend_from_slice(&search_range.to_be_bytes());
    out.extend_from_slice(&entry_selector.to_be_bytes());
    out.extend_from_slice(&((table_count as u16) * 16 - search_range).to_be_bytes());

    let mut position = header_len;
    let mut head_at = None;
    for (tag, data) in &tables {
        // head 的檢查碼要在 checkSumAdjustment 歸零後算
        let sum = if tag == HEAD_TAG {
            head_at = Some(position);
            let mut copy = data.to_vec();
            copy.get_mut(8..12).ok_or_else(damaged)?.fill(0);
            checksum(&copy)
        } else {
            checksum(data)
        };
        out.extend_from_slice(tag);
        out.extend_from_slice(&sum.to_be_bytes());
        out.extend_from_slice(&(position as u32).to_be_bytes());
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        position += data.len().next_multiple_of(4);
    }
    for (tag, data) in &tables {
        let start = out.len();
        out.extend_from_slice(data);
        if tag == HEAD_TAG {
            out[start + 8..start + 12].fill(0);
        }
        out.resize(out.len().next_multiple_of(4), 0);
    }
    if let Some(at) = head_at {
        let adjustment = CHECKSUM_MAGIC.wrapping_sub(checksum(&out));
        out[at + 8..at + 12].copy_from_slice(&adjustment.to_be_bytes());
    }
    Ok(out)
}

/// Simple-glyph flag bit 7 is reserved and must be zero; Chrome's sanitizer (OTS) rejects the whole
/// font when it is set (新細明體 sets it on almost every glyph). Nothing reads it.
const RESERVED_GLYPH_FLAG: u8 = 0x80;
const REPEAT_FLAG: u8 = 0x08;

/// `(offset, length)` of a table in a standalone sfnt.
fn table(font: &[u8], tag: &[u8; 4]) -> Option<(usize, usize)> {
    let count = read_u16(font, 4).ok()? as usize;
    (0..count).map(|record| 12 + record * 16).find_map(|at| {
        (font.get(at..at + 4)? == tag).then(|| Some((read_u32(font, at + 8).ok()? as usize, read_u32(font, at + 12).ok()? as usize)))?
    })
}

/// Offsets (in the file) of every flag byte of every simple glyph, not the repeat counts.
/// Empty for CFF fonts (no `glyf`) and wherever the glyph data is not readable as expected.
fn glyph_flag_offsets(font: &[u8]) -> Vec<usize> {
    let mut offsets = Vec::new();
    let (Some((head, _)), Some((maxp, _)), Some((loca, loca_len)), Some((glyf, glyf_len))) =
        (table(font, HEAD_TAG), table(font, b"maxp"), table(font, b"loca"), table(font, b"glyf"))
    else {
        return offsets;
    };
    let (Ok(format), Ok(glyphs)) = (read_u16(font, head + 50), read_u16(font, maxp + 4)) else { return offsets };
    let location = |glyph: usize| -> Option<usize> {
        if format == 1 {
            (glyph * 4 + 4 <= loca_len).then(|| read_u32(font, loca + glyph * 4).ok().map(|v| v as usize))?
        } else {
            (glyph * 2 + 2 <= loca_len).then(|| read_u16(font, loca + glyph * 2).ok().map(|v| v as usize * 2))?
        }
    };
    for glyph in 0..glyphs as usize {
        let (Some(start), Some(end)) = (location(glyph), location(glyph + 1)) else { break };
        if end <= start || end > glyf_len {
            continue;
        }
        let (mut at, end) = (glyf + start, glyf + end);
        let Ok(contours) = read_u16(font, at).map(|v| v as i16) else { break };
        if contours <= 0 {
            continue; // 空的或組合字形：沒有點的旗標
        }
        at += 10;
        let Ok(last_point) = read_u16(font, at + 2 * (contours as usize - 1)) else { break };
        at += 2 * contours as usize;
        let Ok(instructions) = read_u16(font, at) else { break };
        at += 2 + instructions as usize;
        let points = last_point as usize + 1;
        let mut read = 0;
        while read < points && at < end {
            let flag = font[at];
            offsets.push(at);
            at += 1;
            let mut repeat = 0;
            if flag & REPEAT_FLAG != 0 && at < end {
                repeat = font[at] as usize;
                at += 1;
            }
            read += 1 + repeat;
        }
    }
    offsets
}

/// Clears the reserved bit 7 of simple-glyph flags in a standalone TrueType font, in place, and
/// fixes `head.checkSumAdjustment`. The outlines do not change; CFF fonts are left alone.
///
/// # Returns
/// How many flag bytes changed (0 = the bytes are untouched).
pub fn clear_reserved_glyph_flags(font: &mut [u8]) -> usize {
    let mut changed = 0;
    for at in glyph_flag_offsets(font) {
        if font[at] & RESERVED_GLYPH_FLAG != 0 {
            font[at] &= !RESERVED_GLYPH_FLAG;
            changed += 1;
        }
    }
    if changed > 0 {
        refresh_checksums(font);
    }
    changed
}

/// Recomputes the `glyf` table checksum and `head.checkSumAdjustment` after an in-place change.
fn refresh_checksums(font: &mut [u8]) {
    let Ok(count) = read_u16(font, 4) else { return };
    for at in (0..count as usize).map(|record| 12 + record * 16) {
        if font.get(at..at + 4) != Some(b"glyf") {
            continue;
        }
        if let (Ok(start), Ok(length)) = (read_u32(font, at + 8), read_u32(font, at + 12)) {
            if let Some(data) = font.get(start as usize..start as usize + length as usize) {
                let sum = checksum(data);
                font[at + 4..at + 8].copy_from_slice(&sum.to_be_bytes());
            }
        }
    }
    if let Some((head, _)) = table(font, HEAD_TAG).filter(|&(head, length)| length >= 12 && head + 12 <= font.len()) {
        font[head + 8..head + 12].fill(0);
        let adjustment = CHECKSUM_MAGIC.wrapping_sub(checksum(font));
        font[head + 8..head + 12].copy_from_slice(&adjustment.to_be_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::fonts::BUNDLED_FONTS;
    use crate::project::format::FontFile;

    fn bundled(file: &str) -> &'static [u8] {
        BUNDLED_FONTS.iter().find(|font| font.file == file).unwrap().data
    }

    /// The tables of a standalone font, by tag.
    fn tables_of(font: &[u8]) -> Vec<([u8; 4], Vec<u8>)> {
        let count = read_u16(font, 4).unwrap() as usize;
        let mut out: Vec<_> = (0..count)
            .map(|record| {
                let at = 12 + record * 16;
                let start = read_u32(font, at + 8).unwrap() as usize;
                let length = read_u32(font, at + 12).unwrap() as usize;
                (font[at..at + 4].try_into().unwrap(), font[start..start + length].to_vec())
            })
            .collect();
        out.sort();
        out
    }

    /// A collection of `fonts`; tables with the same tag and content are stored once and shared,
    /// as real collections do. `head` is compared with checkSumAdjustment zeroed.
    fn make_collection(fonts: &[&[u8]]) -> Vec<u8> {
        let directories: usize = fonts.iter().map(|font| 12 + 16 * read_u16(font, 4).unwrap() as usize).sum();
        let mut out = Vec::new();
        out.extend_from_slice(TTC_TAG);
        out.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        out.extend_from_slice(&(fonts.len() as u32).to_be_bytes());
        let mut directory_at = 12 + 4 * fonts.len();
        for font in fonts {
            out.extend_from_slice(&(directory_at as u32).to_be_bytes());
            directory_at += 12 + 16 * read_u16(font, 4).unwrap() as usize;
        }
        let mut body: Vec<u8> = Vec::new();
        let mut stored: Vec<([u8; 4], Vec<u8>, usize)> = Vec::new();
        let body_start = out.len() + directories;
        let mut directory = Vec::new();
        for font in fonts {
            let tables = tables_of(font);
            directory.extend_from_slice(&font[..12]);
            for (tag, data) in tables {
                let offset = match stored.iter().find(|(t, d, _)| *t == tag && *d == data) {
                    Some((_, _, offset)) => *offset,
                    None => {
                        let offset = body_start + body.len();
                        body.extend_from_slice(&data);
                        body.resize(body.len().next_multiple_of(4), 0);
                        stored.push((tag, data.clone(), offset));
                        offset
                    }
                };
                directory.extend_from_slice(&tag);
                directory.extend_from_slice(&checksum(&data).to_be_bytes());
                directory.extend_from_slice(&(offset as u32).to_be_bytes());
                directory.extend_from_slice(&(data.len() as u32).to_be_bytes());
            }
        }
        out.extend_from_slice(&directory);
        out.extend_from_slice(&body);
        out
    }

    fn without_head_adjustment(mut tables: Vec<([u8; 4], Vec<u8>)>) -> Vec<([u8; 4], Vec<u8>)> {
        for (tag, data) in &mut tables {
            if tag == HEAD_TAG {
                data[8..12].fill(0);
            }
        }
        tables
    }

    #[test]
    fn extracts_each_face_with_identical_tables() {
        let fonts = [bundled("Geist-Regular.ttf"), bundled("Geist-Bold.ttf"), bundled("Geist-Regular.ttf")];
        let collection = make_collection(&fonts);
        assert!(is_collection(&collection));
        assert_eq!(face_count(&collection).unwrap(), 3);
        for (index, original) in fonts.iter().enumerate() {
            let face = extract_face(&collection, index as u32).unwrap();
            assert_eq!(checksum(&face), CHECKSUM_MAGIC, "face {index}");
            assert_eq!(without_head_adjustment(tables_of(&face)), without_head_adjustment(tables_of(original)), "face {index}");
            let (file, _) = super::super::fonts::analyze(&face).unwrap();
            let (expected, _) = super::super::fonts::analyze(original).unwrap();
            assert_eq!(file, expected);
        }
        // 第 1、3 個字型共用全部表格，拆出來仍是完整的檔案
        assert_eq!(extract_face(&collection, 0).unwrap(), extract_face(&collection, 2).unwrap());
    }

    #[test]
    fn rejects_bad_indexes_and_damaged_collections() {
        let collection = make_collection(&[bundled("Geist-Regular.ttf")]);
        let Err(AppError::InvalidInput(message)) = extract_face(&collection, 1) else { panic!("index 1 accepted") };
        assert!(message.contains("只有 1 個"), "{message}");
        assert!(face_count(bundled("Geist-Regular.ttf")).is_err());
        for damaged in [&collection[..20], &collection[..collection.len() / 2], b"ttcf\0\x01\0\0\0\0\0\0"] {
            assert!(extract_face(damaged, 0).is_err());
        }
    }

    #[test]
    fn clears_reserved_glyph_flags_without_touching_outlines() {
        let original = bundled("Geist-Regular.ttf");
        let offsets = glyph_flag_offsets(original);
        assert!(offsets.len() > 1000, "{} flag bytes", offsets.len());
        assert!(offsets.iter().all(|&at| original[at] & RESERVED_GLYPH_FLAG == 0));

        let mut font = original.to_vec();
        for &at in offsets.iter().step_by(3) {
            font[at] |= RESERVED_GLYPH_FLAG;
        }
        let changed = clear_reserved_glyph_flags(&mut font);
        assert_eq!(changed, offsets.len().div_ceil(3));
        assert_eq!(without_head_adjustment(tables_of(&font)), without_head_adjustment(tables_of(original)));
        assert_eq!(checksum(&font), CHECKSUM_MAGIC);

        // 沒有要改的字型：位元組完全不變；CFF 字型沒有 glyf
        let mut untouched = original.to_vec();
        assert_eq!(clear_reserved_glyph_flags(&mut untouched), 0);
        assert_eq!(untouched, original);
        assert!(glyph_flag_offsets(bundled("NotoSansTC-Regular.otf")).is_empty());
    }

    #[test]
    fn imports_a_face_of_a_collection_as_a_single_font() {
        use super::super::fonts::{collection_faces, import_font, prepare};
        let collection = make_collection(&[bundled("Geist-Regular.ttf"), bundled("Geist-Bold.ttf")]);
        let dir = tempfile::tempdir().unwrap();

        let bold = import_font(dir.path(), &collection, Some(1)).unwrap();
        assert_eq!((bold.file_family.as_str(), bold.weight), ("Geist", 700));
        let stored = std::fs::read(dir.path().join(&bold.src)).unwrap();
        assert!(!is_collection(&stored) && bold.src.ends_with(".ttf"), "{}", bold.src);
        assert_eq!(without_head_adjustment(tables_of(&stored)), without_head_adjustment(tables_of(bundled("Geist-Bold.ttf"))));

        let message = |result: AppResult<FontFile>| match result {
            Err(AppError::InvalidInput(message)) => message,
            other => panic!("{other:?}"),
        };
        assert!(message(import_font(dir.path(), &collection, None)).contains("指定"));
        assert!(message(import_font(dir.path(), &collection, Some(2))).contains("只有 2 個"));
        assert!(message(import_font(dir.path(), bundled("Geist-Regular.ttf"), Some(1))).contains("不是字型集合"));
        // 單一字型的 index 0 等於沒有指定；沒有 bit 7 的字型原樣保存
        assert_eq!(prepare(bundled("Geist-Regular.ttf"), Some(0)).unwrap(), bundled("Geist-Regular.ttf"));

        let faces = collection_faces(&collection).unwrap();
        assert_eq!(
            faces.iter().map(|face| (face.index, face.family.as_str(), face.weight, face.problem.is_none())).collect::<Vec<_>>(),
            [(0, "Geist", 400, true), (1, "Geist", 700, true)]
        );
        assert!(collection_faces(bundled("Geist-Regular.ttf")).is_err());

        // 列出時只做快速檢查：授權禁止嵌入的字型標出原因
        let restricted = super::super::fonts::tests::with_fs_type(bundled("Geist-Bold.ttf"), 0x0002);
        let faces = collection_faces(&make_collection(&[bundled("Geist-Regular.ttf"), &restricted])).unwrap();
        assert!(faces[0].problem.is_none());
        assert!(faces[1].problem.as_deref().is_some_and(|problem| problem.contains("禁止")), "{faces:?}");
    }

    /// The real 新細明體 (when present): its face sets the reserved flag, which import clears.
    #[test]
    fn real_mingliu_imports_with_cleared_flags() {
        use super::super::fonts::{collection_faces, prepare};
        let Ok(bytes) = std::fs::read(r"C:\Windows\Fonts\mingliu.ttc") else { return };
        let faces = collection_faces(&bytes).unwrap();
        let index = faces.iter().find(|face| face.family == "新細明體").expect("新細明體").index;
        let raw = extract_face(&bytes, index).unwrap();
        assert!(glyph_flag_offsets(&raw).iter().any(|&at| raw[at] & RESERVED_GLYPH_FLAG != 0));
        let font = prepare(&bytes, Some(index)).unwrap();
        assert!(glyph_flag_offsets(&font).iter().all(|&at| font[at] & RESERVED_GLYPH_FLAG == 0));
        assert_eq!(checksum(&font), CHECKSUM_MAGIC);
    }

    /// Manual check (plan steps 1–2): `FONT_TTC=C:\Windows\Fonts\msjh.ttc EXTRACT_DIR=<dir>
    /// cargo test extract_real_collection -- --ignored --nocapture` writes every face as the
    /// project would store it (`prepare`) to `<dir>` and checks it with `analyze` (ttf-parser +
    /// Typst); load the files with `FontFace` to compare them with the system fonts.
    #[test]
    #[ignore]
    fn extract_real_collection() {
        let path = std::env::var("FONT_TTC").expect("FONT_TTC");
        let dir = std::path::PathBuf::from(std::env::var("EXTRACT_DIR").expect("EXTRACT_DIR"));
        let bytes = std::fs::read(&path).unwrap();
        for index in 0..face_count(&bytes).unwrap() {
            let face = super::super::fonts::prepare(&bytes, Some(index)).unwrap();
            assert_eq!(checksum(&face), CHECKSUM_MAGIC, "whole-file checksum of face {index}");
            let (file, extension) = super::super::fonts::analyze(&face).unwrap();
            let out = dir.join(format!("face-{index}.{extension}"));
            std::fs::write(&out, &face).unwrap();
            println!(
                "face {index}: {} / {} weight {} embedding {:?} ascent {} descent {} apple {} {} bytes -> {}",
                file.file_family,
                file.file_style,
                file.weight,
                file.embedding,
                file.ascent,
                file.descent,
                file.apple_baseline_shift,
                face.len(),
                out.display()
            );
        }
    }
}
