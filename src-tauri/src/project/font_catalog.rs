//! 「下載免費字型」的精選清單（`fonts-catalog.json`，前端也讀同一份做畫面）：取得清單字型的檔案。
//!
//! 網址只來自清單（前端只傳 id）；下載的檔案與解出的字型都要符合清單的 SHA-256 與大小，不符就丟掉。
//! 字型檔放在本機快取（`font-cache/<字型檔的 SHA-256>.<ext>`），其他專案再用時不必重新下載。
//! 這裡不碰網路：下載由 command 做（進度、取消），這裡收下載好的位元組。
//! 計畫：`docs/05-Plans-字型/02-字型管理問題-實作.md`。

use super::fonts::FONT_ASSET_MAX_BYTES;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const CATALOG_JSON: &str = include_str!("../../fonts-catalog.json");
/// The catalog format this app reads.
const CATALOG_VERSION: u32 = 1;
/// Folder of the local cache, under the app's local data folder.
const CACHE_FOLDER: &str = "font-cache";

/// One file of a catalog font: where to get it and what it must hash to.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogFile {
    /// Pinned download address (a release asset or a file at a fixed commit).
    pub url: String,
    /// The font's path inside the download when it is a zip.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archive_path: Option<String>,
    /// SHA-256 (lower-case hex) and size of the download.
    pub sha256: String,
    pub bytes: u64,
    /// SHA-256 and size of the font file itself (the cache key; the same as the download when it
    /// is not a zip).
    pub file_sha256: String,
    pub file_bytes: u64,
}

/// One font of the catalog.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogFont {
    pub id: String,
    pub name: String,
    pub category: String,
    pub license: String,
    pub homepage: String,
    pub version: String,
    pub regular: CatalogFile,
    pub bold: Option<CatalogFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog {
    catalog_version: u32,
    fonts: Vec<CatalogFont>,
}

/// The built-in catalog (checked by the tests, so parsing cannot fail in a release).
pub fn catalog() -> &'static [CatalogFont] {
    static CATALOG: OnceLock<Vec<CatalogFont>> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let catalog: Catalog = serde_json::from_str(CATALOG_JSON).expect("fonts-catalog.json");
        assert_eq!(catalog.catalog_version, CATALOG_VERSION, "fonts-catalog.json version");
        catalog.fonts
    })
}

/// A catalog font by id.
///
/// # Errors
/// `AppError::InvalidInput` when the id is not in the catalog.
pub fn find(id: &str) -> AppResult<&'static CatalogFont> {
    catalog()
        .iter()
        .find(|font| font.id == id)
        .ok_or_else(|| AppError::invalid_input("清單裡沒有這套字型"))
}

impl CatalogFont {
    /// The font's files: regular, then bold if any.
    pub fn files(&self) -> impl Iterator<Item = &CatalogFile> {
        std::iter::once(&self.regular).chain(self.bold.as_ref())
    }
}

impl CatalogFile {
    /// `ttf` / `otf`, from the archive path or the URL.
    fn extension(&self) -> String {
        let name = self.archive_path.as_deref().unwrap_or(&self.url);
        name.rsplit('.').next().unwrap_or_default().to_ascii_lowercase()
    }
}

/// The cache folder (created when files are written).
pub fn cache_dir(local_data: &Path) -> PathBuf {
    local_data.join(CACHE_FOLDER)
}

fn cache_path(cache_dir: &Path, file: &CatalogFile) -> PathBuf {
    cache_dir.join(format!("{}.{}", file.file_sha256, file.extension()))
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Whether bytes are exactly what the catalog promises.
fn matches(bytes: &[u8], sha256: &str, size: u64) -> bool {
    bytes.len() as u64 == size && sha256_hex(bytes) == sha256
}

/// The cached font file, if it is there and intact (a damaged one is ignored and replaced).
fn read_cached(cache_dir: &Path, file: &CatalogFile) -> Option<Vec<u8>> {
    let bytes = std::fs::read(cache_path(cache_dir, file)).ok()?;
    matches(&bytes, &file.file_sha256, file.file_bytes).then_some(bytes)
}

/// Ids of the catalog fonts whose files are all in the cache (by name; read again when used).
pub fn cached_ids(cache_dir: &Path) -> Vec<String> {
    catalog()
        .iter()
        .filter(|font| font.files().all(|file| cache_path(cache_dir, file).is_file()))
        .map(|font| font.id.clone())
        .collect()
}

/// The downloads a font still needs (each URL once), i.e. its files that are not in the cache.
pub fn missing_downloads<'a>(font: &'a CatalogFont, cache_dir: &Path) -> Vec<&'a CatalogFile> {
    let mut missing: Vec<&CatalogFile> = Vec::new();
    for file in font.files() {
        if read_cached(cache_dir, file).is_none() && !missing.iter().any(|other| other.url == file.url) {
            missing.push(file);
        }
    }
    missing
}

const MISMATCH: &str = "下載的檔案和清單不符（可能損壞或被更動）";

/// The font file inside a download, after checking both against the catalog.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) when the download or the font does not match, or the zip
/// has no such entry.
pub fn font_from_download(file: &CatalogFile, download: &[u8]) -> AppResult<Vec<u8>> {
    if !matches(download, &file.sha256, file.bytes) {
        return Err(AppError::invalid_input(MISMATCH));
    }
    let font = match &file.archive_path {
        None => download.to_vec(),
        Some(path) => {
            let mut archive = zip::ZipArchive::new(Cursor::new(download)).map_err(|_| AppError::invalid_input(MISMATCH))?;
            let mut entry = archive.by_name(path).map_err(|_| AppError::invalid_input(MISMATCH))?;
            if entry.size() > FONT_ASSET_MAX_BYTES as u64 {
                return Err(AppError::invalid_input(MISMATCH));
            }
            let mut bytes = Vec::with_capacity(entry.size() as usize);
            entry.read_to_end(&mut bytes).map_err(|_| AppError::invalid_input(MISMATCH))?;
            bytes
        }
    };
    if !matches(&font, &file.file_sha256, file.file_bytes) {
        return Err(AppError::invalid_input(MISMATCH));
    }
    Ok(font)
}

/// Writes a checked font file into the cache (temporary file + rename). A failure only means the
/// next project downloads it again, so it is not an error.
fn write_cache(cache_dir: &Path, file: &CatalogFile, bytes: &[u8]) {
    let path = cache_path(cache_dir, file);
    let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let written = std::fs::create_dir_all(cache_dir).and_then(|()| std::fs::write(&temp, bytes)).and_then(|()| std::fs::rename(&temp, &path));
    if written.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
}

/// A catalog font's regular and bold files: from the cache, or out of `downloads` (keyed by URL,
/// the result of fetching `missing_downloads`), checked and then cached.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) when a needed download is absent or does not match.
pub fn font_files(font: &CatalogFont, cache_dir: &Path, downloads: &HashMap<String, Vec<u8>>) -> AppResult<(Vec<u8>, Option<Vec<u8>>)> {
    let get = |file: &CatalogFile| -> AppResult<Vec<u8>> {
        if let Some(bytes) = read_cached(cache_dir, file) {
            return Ok(bytes);
        }
        let download = downloads.get(&file.url).ok_or_else(|| AppError::invalid_input(MISMATCH))?;
        let bytes = font_from_download(file, download)?;
        write_cache(cache_dir, file, &bytes);
        Ok(bytes)
    };
    Ok((get(&font.regular)?, font.bold.as_ref().map(get).transpose()?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::fonts::BUNDLED_FONTS;
    use std::io::Write;

    fn bundled(file: &str) -> &'static [u8] {
        BUNDLED_FONTS.iter().find(|font| font.file == file).unwrap().data
    }

    fn file_for(url: &str, download: &[u8], archive_path: Option<&str>, font: &[u8]) -> CatalogFile {
        CatalogFile {
            url: url.to_owned(),
            archive_path: archive_path.map(str::to_owned),
            sha256: sha256_hex(download),
            bytes: download.len() as u64,
            file_sha256: sha256_hex(font),
            file_bytes: font.len() as u64,
        }
    }

    fn zip_of(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, data) in entries {
            writer.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn font_with(regular: CatalogFile, bold: Option<CatalogFile>) -> CatalogFont {
        CatalogFont {
            id: "test".into(),
            name: "測試".into(),
            category: "黑體".into(),
            license: "OFL-1.1".into(),
            homepage: "https://example.com".into(),
            version: "1".into(),
            regular,
            bold,
        }
    }

    fn is_hex64(text: &str) -> bool {
        text.len() == 64 && text.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
    }

    #[test]
    fn the_built_in_catalog_is_well_formed() {
        let fonts = catalog();
        assert!(!fonts.is_empty());
        let mut ids: Vec<&str> = fonts.iter().map(|font| font.id.as_str()).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), fonts.len(), "ids are unique");
        for font in fonts {
            assert!(font.id.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-'), "{}", font.id);
            assert_eq!(font.license, "OFL-1.1", "{}", font.id);
            assert!(!font.name.trim().is_empty() && !font.category.trim().is_empty());
            for file in font.files() {
                // 網址固定版本：release 附檔，或某個 commit 的檔案
                assert!(
                    file.url.starts_with("https://github.com/") && file.url.contains("/releases/download/")
                        || file.url.starts_with("https://raw.githubusercontent.com/"),
                    "{}",
                    file.url
                );
                assert!(is_hex64(&file.sha256) && is_hex64(&file.file_sha256), "{}", font.id);
                assert!(matches!(file.extension().as_str(), "ttf" | "otf"), "{}", font.id);
                assert!(file.file_bytes <= FONT_ASSET_MAX_BYTES as u64, "{}", font.id);
                assert_eq!(file.archive_path.is_some(), file.url.ends_with(".zip"), "{}", font.id);
                if file.archive_path.is_none() {
                    assert_eq!((&file.sha256, file.bytes), (&file.file_sha256, file.file_bytes), "{}", font.id);
                }
            }
        }
        assert!(find("jf-openhuninn").is_ok());
        assert!(find("nope").is_err());
    }

    #[test]
    fn checks_downloads_and_zip_entries_against_the_catalog() {
        let regular = bundled("Geist-Regular.ttf");
        let direct = file_for("https://x/a.ttf", regular, None, regular);
        assert_eq!(font_from_download(&direct, regular).unwrap(), regular);
        // 少一個位元組、多一個位元組、內容不同
        assert!(font_from_download(&direct, &regular[1..]).is_err());
        let mut changed = regular.to_vec();
        changed[100] ^= 1;
        assert!(font_from_download(&direct, &changed).is_err());

        let archive = zip_of(&[("dir/A-R.ttf", regular), ("dir/readme.txt", b"hi")]);
        let zipped = file_for("https://x/a.zip", &archive, Some("dir/A-R.ttf"), regular);
        assert_eq!(font_from_download(&zipped, &archive).unwrap(), regular);
        let wrong_path = CatalogFile { archive_path: Some("dir/missing.ttf".into()), ..zipped.clone() };
        assert!(font_from_download(&wrong_path, &archive).is_err());
        // zip 對了、裡面的字型和清單不符
        let wrong_font = CatalogFile { file_sha256: sha256_hex(b"other"), ..zipped };
        assert!(font_from_download(&wrong_font, &archive).is_err());
    }

    #[test]
    fn caches_files_and_downloads_a_shared_zip_once() {
        let (regular, bold) = (bundled("Geist-Regular.ttf"), bundled("Geist-Bold.ttf"));
        let archive = zip_of(&[("R.ttf", regular), ("B.ttf", bold)]);
        let font = font_with(
            file_for("https://x/f.zip", &archive, Some("R.ttf"), regular),
            Some(file_for("https://x/f.zip", &archive, Some("B.ttf"), bold)),
        );
        let dir = tempfile::tempdir().unwrap();
        let cache = cache_dir(dir.path());

        // 一般與粗體在同一個 zip：只要下載一次
        let missing = missing_downloads(&font, &cache);
        assert_eq!(missing.len(), 1);
        let downloads = HashMap::from([(missing[0].url.clone(), archive.clone())]);
        let (got_regular, got_bold) = font_files(&font, &cache, &downloads).unwrap();
        assert_eq!((got_regular.as_slice(), got_bold.as_deref()), (regular, Some(bold)));
        assert!(cache_path(&cache, &font.regular).is_file());
        assert_eq!(std::fs::read_dir(&cache).unwrap().count(), 2, "no temporary files left");

        // 第二次：全部在快取，不用下載
        assert!(missing_downloads(&font, &cache).is_empty());
        assert_eq!(font_files(&font, &cache, &HashMap::new()).unwrap().0, regular);

        // 快取檔損壞：當成沒有，重新下載
        std::fs::write(cache_path(&cache, &font.regular), b"broken").unwrap();
        assert_eq!(missing_downloads(&font, &cache).len(), 1);
        assert!(font_files(&font, &cache, &HashMap::new()).is_err());
        assert_eq!(font_files(&font, &cache, &downloads).unwrap().0, regular);
        assert_eq!(std::fs::read(cache_path(&cache, &font.regular)).unwrap(), regular);

        // 不符的下載不寫進快取
        let other = tempfile::tempdir().unwrap();
        let bad = HashMap::from([(font.regular.url.clone(), b"not the zip".to_vec())]);
        assert!(font_files(&font, &cache_dir(other.path()), &bad).is_err());
        assert!(!cache_dir(other.path()).exists());

        assert_eq!(cached_ids(&cache), Vec::<String>::new(), "the test font is not in the built-in catalog");
    }
}
