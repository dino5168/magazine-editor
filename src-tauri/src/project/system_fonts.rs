//! Fonts installed on this computer (`%WINDIR%\Fonts` and the per-user
//! `%LOCALAPPDATA%\Microsoft\Windows\Fonts`), listed so the user can add one to the project without
//! copying files around.
//!
//! Only the small tables the list needs are read (`name`, `OS/2`, …), not whole files (the system
//! fonts add up to more than 1 GB), and the result is cached by path, modification time and size.
//! The frontend only ever sees opaque ids; importing looks the file up again on this side.
//!
//! Plan: `docs/05-Plans-字型/02-字型管理問題-實作.md`.

use super::font_collection::build_sfnt;
use super::format::FONT_FILE_NAME_MAX_LENGTH;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use ttf_parser::{name_id, Face, Language, Tag};

/// Bump when the cached fields change; an older cache is ignored.
const CACHE_VERSION: u32 = 1;
const CACHE_FILE: &str = "system-fonts.json";
const FONT_EXTENSIONS: [&str; 3] = ["ttf", "otf", "ttc"];
/// Tables the list reads; `head` / `hhea` / `maxp` only so ttf-parser accepts the mini font.
const NEEDED_TABLES: [&[u8; 4]; 5] = [b"head", b"hhea", b"maxp", b"name", b"OS/2"];
/// Larger tables are not read (a `name` table is a few KB; this only stops a bad file).
const TABLE_MAX_BYTES: u32 = 1024 * 1024;
const FS_TYPE_RESTRICTED: u16 = 0x0002;
const FS_TYPE_ALLOWING: u16 = 0x000C;
const FS_TYPE_BITMAP_ONLY: u16 = 0x0200;
/// `OS/2.ulUnicodeRange2` bit 59 − 32: CJK Unified Ideographs.
const CJK_RANGE_BIT: u32 = 1 << (59 - 32);

/// Where a font is installed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FontSource {
    /// `%WINDIR%\Fonts`, for every user.
    System,
    /// Installed by this user only.
    User,
}

/// One face, as cached and as listed (minus `id`, which the list adds).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaceInfo {
    /// Which face of a collection (0 for a single font).
    pub index: u32,
    /// Display family: Traditional Chinese first, then US English.
    pub family: String,
    /// Family name a CSS `font-family` finds (US English first): the preview draws with it.
    pub css_family: String,
    /// Every family name in the file, for search ("正黑" and "JhengHei" both match).
    pub aliases: Vec<String>,
    pub style: String,
    pub weight: u16,
    pub italic: bool,
    pub has_chinese: bool,
    /// Why it cannot be added (user-facing), or None. Checked cheaply here; the import runs the
    /// full check (Typst and so on) again.
    pub problem: Option<String>,
}

/// A face in the list sent to the frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFont {
    /// Opaque id for `font_import_system` (a hash of the path and the face index).
    pub id: String,
    /// File name only (display).
    pub file: String,
    pub source: FontSource,
    #[serde(flatten)]
    pub face: FaceInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedFile {
    path: PathBuf,
    modified: u64,
    size: u64,
    faces: Vec<FaceInfo>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Cache {
    version: u32,
    files: Vec<CachedFile>,
}

/// What the list knows about each id, so an import finds the file again.
#[derive(Debug, Clone, PartialEq)]
pub struct FaceLocation {
    pub path: PathBuf,
    pub index: u32,
}

/// The ids of the last list (`system_fonts_list`), so `font_import_system` finds the files.
#[derive(Debug, Default)]
pub struct SystemFontsState(pub std::sync::Mutex<HashMap<String, FaceLocation>>);

/// Cache file name inside the app's local data folder.
pub fn cache_file(local_data: &Path) -> PathBuf {
    local_data.join(CACHE_FILE)
}

/// The folders to scan, with their source; folders that do not exist are left out.
pub fn font_folders() -> Vec<(PathBuf, FontSource)> {
    let windows = std::env::var_os("WINDIR").map_or_else(|| PathBuf::from(r"C:\Windows"), PathBuf::from);
    let mut folders = vec![(windows.join("Fonts"), FontSource::System)];
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        folders.push((PathBuf::from(local).join(r"Microsoft\Windows\Fonts"), FontSource::User));
    }
    folders.into_iter().filter(|(path, _)| path.is_dir()).collect()
}

fn read_exact_at(file: &mut File, offset: u64, length: usize) -> Option<Vec<u8>> {
    let mut buffer = vec![0; length];
    file.seek(SeekFrom::Start(offset)).ok()?;
    file.read_exact(&mut buffer).ok()?;
    Some(buffer)
}

fn be_u16(bytes: &[u8], at: usize) -> Option<u16> {
    bytes.get(at..at + 2).map(|b| u16::from_be_bytes([b[0], b[1]]))
}

fn be_u32(bytes: &[u8], at: usize) -> Option<u32> {
    bytes.get(at..at + 4).map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
}

/// Reads the face whose table directory starts at `offset`: the needed tables become a mini font
/// that ttf-parser reads. `Err` = a message for the face's `problem`.
fn read_face(file: &mut File, offset: u64, index: u32) -> Result<FaceInfo, String> {
    let unreadable = || "字型檔損壞，無法讀取".to_owned();
    let header = read_exact_at(file, offset, 12).ok_or_else(unreadable)?;
    let version = be_u32(&header, 0).ok_or_else(unreadable)?;
    let count = be_u16(&header, 4).ok_or_else(unreadable)? as usize;
    let directory = read_exact_at(file, offset + 12, 16 * count).ok_or_else(unreadable)?;
    let mut tables: Vec<([u8; 4], Vec<u8>)> = Vec::new();
    let mut variable = false;
    for record in directory.chunks_exact(16) {
        let tag: [u8; 4] = record[..4].try_into().map_err(|_| unreadable())?;
        if &tag == b"fvar" {
            variable = true;
        }
        if !NEEDED_TABLES.contains(&&tag) {
            continue;
        }
        let (start, length) = (be_u32(record, 8).ok_or_else(unreadable)?, be_u32(record, 12).ok_or_else(unreadable)?);
        if length > TABLE_MAX_BYTES {
            return Err(unreadable());
        }
        tables.push((tag, read_exact_at(file, u64::from(start), length as usize).ok_or_else(unreadable)?));
    }
    let mini = build_sfnt(version, tables.iter().map(|(tag, data)| (*tag, data.as_slice())).collect()).map_err(|_| unreadable())?;
    let face = Face::parse(&mini, 0).map_err(|_| unreadable())?;
    let os2 = face.raw_face().table(Tag::from_bytes(b"OS/2"));
    let fs_type = os2.and_then(|t| be_u16(t, 8)).unwrap_or(0);
    let has_chinese = os2.and_then(|t| be_u32(t, 46)).is_some_and(|range| range & CJK_RANGE_BIT != 0);

    let problem = if variable {
        Some("可變字型（Variable Font）不能使用".to_owned())
    } else if fs_type & FS_TYPE_BITMAP_ONLY != 0 {
        Some("授權只允許嵌入點陣圖".to_owned())
    } else if fs_type & FS_TYPE_RESTRICTED != 0 && fs_type & FS_TYPE_ALLOWING == 0 {
        Some("授權禁止嵌入（Restricted License）".to_owned())
    } else {
        None
    };
    let family = pick_name(&face, &[name_id::TYPOGRAPHIC_FAMILY, name_id::FAMILY], &[Language::Chinese_Taiwan, Language::English_UnitedStates]);
    let css_family = pick_name(&face, &[name_id::TYPOGRAPHIC_FAMILY, name_id::FAMILY], &[Language::English_UnitedStates]);
    if family.is_empty() {
        return Err(unreadable());
    }
    let mut aliases: Vec<String> = face
        .names()
        .into_iter()
        .filter(|name| name.name_id == name_id::FAMILY || name.name_id == name_id::TYPOGRAPHIC_FAMILY)
        .filter_map(|name| name.to_string())
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
        .collect();
    aliases.sort();
    aliases.dedup();
    Ok(FaceInfo {
        index,
        family,
        css_family,
        aliases,
        style: pick_name(&face, &[name_id::TYPOGRAPHIC_SUBFAMILY, name_id::SUBFAMILY], &[Language::Chinese_Taiwan, Language::English_UnitedStates]),
        weight: face.weight().to_number().clamp(1, 1000),
        italic: face.is_italic(),
        has_chinese,
        problem,
    })
}

/// A name in the first of `languages` that has one, else any readable one.
fn pick_name(face: &Face, ids: &[u16], languages: &[Language]) -> String {
    for id in ids {
        let names: Vec<_> = face.names().into_iter().filter(|name| name.name_id == *id).collect();
        let found = languages
            .iter()
            .find_map(|language| names.iter().filter(|name| name.language() == *language).find_map(|name| name.to_string()))
            .or_else(|| names.iter().find_map(|name| name.to_string()));
        if let Some(found) = found.map(|text| text.trim().to_owned()).filter(|text| !text.is_empty()) {
            return found.chars().take(FONT_FILE_NAME_MAX_LENGTH).collect();
        }
    }
    String::new()
}

/// Every face of one file; a face that cannot be read is left out, a file that cannot be read at
/// all gives an empty list.
fn read_file(path: &Path) -> Vec<FaceInfo> {
    let Ok(mut file) = File::open(path) else { return Vec::new() };
    let Some(header) = read_exact_at(&mut file, 0, 12) else { return Vec::new() };
    let offsets: Vec<u64> = if &header[..4] == b"ttcf" {
        let count = be_u32(&header, 8).unwrap_or(0).min(256) as usize;
        let Some(table) = read_exact_at(&mut file, 12, 4 * count) else { return Vec::new() };
        table.chunks_exact(4).filter_map(|b| be_u32(b, 0)).map(u64::from).collect()
    } else {
        vec![0]
    };
    offsets
        .into_iter()
        .enumerate()
        .filter_map(|(index, offset)| read_face(&mut file, offset, index as u32).ok())
        .collect()
}

fn face_id(path: &Path, index: u32) -> String {
    let digest = Sha256::digest(format!("{}#{index}", path.display()).as_bytes());
    digest.iter().take(12).map(|byte| format!("{byte:02x}")).collect()
}

fn load_cache(path: &Path) -> Cache {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Cache>(&bytes).ok())
        .filter(|cache| cache.version == CACHE_VERSION)
        .unwrap_or_default()
}

/// Lists the installed fonts, reading only files that changed since the cache was written.
///
/// # Args
/// * `folders` — folders to scan (`font_folders()`), not recursive.
/// * `cache_path` — where the cache lives (`<app data>/system-fonts.json`); written back when it
///   changed. A missing or damaged cache only makes this slower.
///
/// # Returns
/// The list (sorted by family, then weight) and where each id's file is.
pub fn list(folders: &[(PathBuf, FontSource)], cache_path: &Path) -> (Vec<SystemFont>, HashMap<String, FaceLocation>) {
    let old = load_cache(cache_path);
    let mut known: HashMap<&Path, &CachedFile> = old.files.iter().map(|file| (file.path.as_path(), file)).collect();
    let mut files = Vec::new();
    let mut changed = false;
    let mut fonts = Vec::new();
    let mut locations = HashMap::new();
    for (folder, source) in folders {
        let Ok(entries) = std::fs::read_dir(folder) else { continue };
        let mut paths: Vec<PathBuf> = entries.filter_map(|entry| entry.ok().map(|entry| entry.path())).collect();
        paths.sort();
        for path in paths {
            let extension = path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase);
            if !extension.is_some_and(|e| FONT_EXTENSIONS.contains(&e.as_str())) {
                continue;
            }
            let Ok(metadata) = path.metadata() else { continue };
            let modified = metadata.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
            let size = metadata.len();
            let cached = known.remove(path.as_path()).filter(|file| file.modified == modified && file.size == size);
            let faces = match cached {
                Some(file) => file.faces.clone(),
                None => {
                    changed = true;
                    read_file(&path)
                }
            };
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            for face in &faces {
                let id = face_id(&path, face.index);
                locations.insert(id.clone(), FaceLocation { path: path.clone(), index: face.index });
                fonts.push(SystemFont { id, file: name.clone(), source: *source, face: face.clone() });
            }
            files.push(CachedFile { path, modified, size, faces });
        }
    }
    // 快取裡還有沒掃到的檔案 = 已經移除
    if changed || !known.is_empty() {
        let cache = Cache { version: CACHE_VERSION, files };
        if let Ok(json) = serde_json::to_vec(&cache) {
            let _ = std::fs::write(cache_path, json);
        }
    }
    fonts.sort_by(|a, b| a.face.family.cmp(&b.face.family).then(a.face.weight.cmp(&b.face.weight)).then(a.id.cmp(&b.id)));
    (fonts, locations)
}

/// Reads the file of a listed face, checking that it is still inside a scanned folder.
///
/// # Errors
/// `AppError::InvalidInput` when the id is unknown or the file is gone.
pub fn read_listed(locations: &HashMap<String, FaceLocation>, folders: &[(PathBuf, FontSource)], id: &str) -> AppResult<(Vec<u8>, u32)> {
    let location = locations.get(id).ok_or_else(|| AppError::invalid_input("找不到這個系統字型，請重新開啟清單"))?;
    let inside = location.path.parent().is_some_and(|parent| folders.iter().any(|(folder, _)| folder == parent));
    if !inside {
        return Err(AppError::invalid_input("找不到這個系統字型，請重新開啟清單"));
    }
    let bytes = std::fs::read(&location.path).map_err(|_| AppError::invalid_input("讀不到這個系統字型的檔案（可能已經解除安裝）"))?;
    Ok((bytes, location.index))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::fonts::BUNDLED_FONTS;

    fn bundled(file: &str) -> &'static [u8] {
        BUNDLED_FONTS.iter().find(|font| font.file == file).unwrap().data
    }

    fn folder_with(files: &[(&str, &[u8])]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (name, bytes) in files {
            std::fs::write(dir.path().join(name), bytes).unwrap();
        }
        dir
    }

    #[test]
    fn lists_faces_with_names_weight_and_chinese_coverage() {
        let fonts = folder_with(&[
            ("Geist-Bold.ttf", bundled("Geist-Bold.ttf")),
            ("NotoSansTC-Regular.otf", bundled("NotoSansTC-Regular.otf")),
            ("readme.txt", b"not a font"),
            ("broken.ttf", b"\0\x01\0\0garbage"),
        ]);
        let cache = tempfile::tempdir().unwrap();
        let folders = [(fonts.path().to_path_buf(), FontSource::User)];
        let (list, locations) = list(&folders, &cache.path().join(CACHE_FILE));

        let summary: Vec<_> = list
            .iter()
            .map(|font| (font.face.family.as_str(), font.face.weight, font.face.has_chinese, font.source, font.file.as_str()))
            .collect();
        assert_eq!(
            summary,
            [("Geist", 700, false, FontSource::User, "Geist-Bold.ttf"), ("Noto Sans TC", 400, true, FontSource::User, "NotoSansTC-Regular.otf")]
        );
        assert!(list.iter().all(|font| font.face.problem.is_none()));
        assert_eq!(list[1].face.css_family, "Noto Sans TC");
        assert_eq!(locations.len(), 2);
        let (bytes, index) = read_listed(&locations, &folders, &list[0].id).unwrap();
        assert_eq!((bytes.as_slice(), index), (bundled("Geist-Bold.ttf"), 0));
    }

    #[test]
    fn uses_the_cache_until_a_file_changes() {
        let fonts = folder_with(&[("a.ttf", bundled("Geist-Regular.ttf"))]);
        let cache_dir = tempfile::tempdir().unwrap();
        let cache_path = cache_dir.path().join(CACHE_FILE);
        let folders = [(fonts.path().to_path_buf(), FontSource::System)];
        let (first, _) = list(&folders, &cache_path);
        assert_eq!(first[0].face.weight, 400);

        // 快取裡改一個值：檔案沒變時用快取（看得到改過的值）
        let mut cache = load_cache(&cache_path);
        cache.files[0].faces[0].weight = 123;
        std::fs::write(&cache_path, serde_json::to_vec(&cache).unwrap()).unwrap();
        assert_eq!(list(&folders, &cache_path).0[0].face.weight, 123);

        // 檔案換了（大小不同）：重新讀
        std::fs::write(fonts.path().join("a.ttf"), bundled("Geist-Bold.ttf")).unwrap();
        assert_eq!(list(&folders, &cache_path).0[0].face.weight, 700);
        // 檔案刪了：清單與快取都沒有它
        std::fs::remove_file(fonts.path().join("a.ttf")).unwrap();
        assert!(list(&folders, &cache_path).0.is_empty());
        assert!(load_cache(&cache_path).files.is_empty());
    }

    #[test]
    fn flags_fonts_that_cannot_be_used() {
        let mut restricted = bundled("Geist-Regular.ttf").to_vec();
        let tables = u16::from_be_bytes([restricted[4], restricted[5]]) as usize;
        let record = (0..tables).map(|i| 12 + 16 * i).find(|&at| &restricted[at..at + 4] == b"OS/2").unwrap();
        let start = u32::from_be_bytes(restricted[record + 8..record + 12].try_into().unwrap()) as usize;
        restricted[start + 8..start + 10].copy_from_slice(&FS_TYPE_RESTRICTED.to_be_bytes());
        let fonts = folder_with(&[("restricted.ttf", &restricted)]);
        let cache = tempfile::tempdir().unwrap();
        let (list, _) = list(&[(fonts.path().to_path_buf(), FontSource::System)], &cache.path().join(CACHE_FILE));
        assert!(list[0].face.problem.as_deref().unwrap().contains("禁止嵌入"));
    }

    #[test]
    fn unknown_ids_and_files_outside_the_folders_are_refused() {
        let fonts = folder_with(&[("a.ttf", bundled("Geist-Regular.ttf"))]);
        let folders = [(fonts.path().to_path_buf(), FontSource::System)];
        let mut locations = HashMap::new();
        assert!(read_listed(&locations, &folders, "nope").is_err());
        let elsewhere = tempfile::tempdir().unwrap();
        let outside = elsewhere.path().join("a.ttf");
        std::fs::write(&outside, bundled("Geist-Regular.ttf")).unwrap();
        locations.insert("x".to_owned(), FaceLocation { path: outside, index: 0 });
        assert!(read_listed(&locations, &folders, "x").is_err());
    }

    /// The real folders (manual): `cargo test real_system_fonts -- --ignored --nocapture` prints
    /// how long a cold and a cached scan take and the Chinese families found.
    #[test]
    #[ignore]
    fn real_system_fonts() {
        let cache = tempfile::tempdir().unwrap();
        let cache_path = cache.path().join(CACHE_FILE);
        let folders = font_folders();
        let started = std::time::Instant::now();
        let (fonts, _) = list(&folders, &cache_path);
        let cold = started.elapsed();
        let started = std::time::Instant::now();
        let (again, _) = list(&folders, &cache_path);
        println!("{} faces; cold {cold:?}, cached {:?}", fonts.len(), started.elapsed());
        assert_eq!(fonts, again);
        for font in fonts.iter().filter(|font| font.face.has_chinese) {
            println!(
                "{} | {} | {} {} | {:?} | {} | {:?}",
                font.face.family, font.face.css_family, font.face.style, font.face.weight, font.source, font.file, font.face.problem
            );
        }
    }
}
