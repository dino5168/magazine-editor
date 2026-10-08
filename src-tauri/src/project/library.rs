//! The project's asset library: `library.json` (folders, items, trash).
//!
//! Unlike `project.magproj`, the library is written immediately after every change and is not part
//! of the undo history. Same rules as `src/lib/library/` on the frontend; both are tested against
//! `tests/fixtures/sample-library.json`.

use super::format::{self, AssetInfo, ASSET_DIR, AUDIO_ASSET_DIR, TEXT_ASSET_DIR};
use super::io;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

pub const LIBRARY_FILE_NAME: &str = "library.json";
pub const LIBRARY_VERSION: u32 = 1;
/// Longest folder chain, counting the top folder.
pub const LIBRARY_DEPTH_MAX: usize = 8;
pub const FOLDER_NAME_MAX_CHARS: usize = 100;
pub const ITEM_NAME_MAX_CHARS: usize = 255;
/// Characters of a text asset kept in `library.json` for the card preview.
pub const TEXT_EXCERPT_MAX_CHARS: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub library_version: u32,
    /// Array order is the order among siblings.
    pub folders: Vec<LibraryFolder>,
    pub items: Vec<LibraryItem>,
}

impl Default for Library {
    fn default() -> Self {
        Self { library_version: LIBRARY_VERSION, folders: Vec::new(), items: Vec::new() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum LibraryItem {
    Image(ImageItem),
    Text(TextItem),
    Audio(AudioItem),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemBase {
    pub id: String,
    /// Display name (the original file name, renamable).
    pub name: String,
    /// Project-relative path in the directory of the item's kind.
    pub src: String,
    /// File size in bytes.
    pub bytes: u64,
    /// `None` = 未分類. Always `None` while the item is in the trash.
    pub folder_id: Option<String>,
    /// RFC 3339.
    pub imported_at: String,
    pub trashed: Option<Trashed>,
}

/// Where a trashed item came from; the folder may no longer exist.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Trashed {
    pub at: String,
    pub from_folder_id: Option<String>,
    /// Folder path shown in the trash, e.g. `封面 / 人物`.
    pub from_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ImageItem {
    #[serde(flatten)]
    pub base: ItemBase,
    /// Intrinsic size in pixels.
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TextItem {
    #[serde(flatten)]
    pub base: ItemBase,
    /// The first `TEXT_EXCERPT_MAX_CHARS` characters, for the card preview.
    pub excerpt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AudioItem {
    #[serde(flatten)]
    pub base: ItemBase,
}

impl LibraryItem {
    pub fn base(&self) -> &ItemBase {
        match self {
            Self::Image(item) => &item.base,
            Self::Text(item) => &item.base,
            Self::Audio(item) => &item.base,
        }
    }

    /// The asset directory files of this kind live in.
    pub fn asset_dir(&self) -> &'static str {
        match self {
            Self::Image(_) => ASSET_DIR,
            Self::Text(_) => TEXT_ASSET_DIR,
            Self::Audio(_) => AUDIO_ASSET_DIR,
        }
    }
}

/// Folder and item names: stored trimmed, non-empty, single line.
fn require_name(name: &str, max_chars: usize, what: &str) -> AppResult<()> {
    let count = name.chars().count();
    if count == 0 || count > max_chars || name.trim() != name || name.contains(['\r', '\n']) {
        return Err(AppError::invalid_project(format!("invalid {what} name {name:?}")));
    }
    Ok(())
}

fn validate_folders(folders: &[LibraryFolder]) -> AppResult<()> {
    let parents: HashMap<&str, Option<&str>> =
        folders.iter().map(|folder| (folder.id.as_str(), folder.parent_id.as_deref())).collect();
    if parents.len() != folders.len() {
        return Err(AppError::invalid_project("duplicate folder id"));
    }
    let mut sibling_names = HashSet::new();
    for folder in folders {
        format::require_id(&folder.id)?;
        require_name(&folder.name, FOLDER_NAME_MAX_CHARS, "folder")?;
        if !sibling_names.insert((folder.parent_id.as_deref(), folder.name.as_str())) {
            return Err(AppError::invalid_project(format!("duplicate folder name {:?}", folder.name)));
        }
        // 往上走到最上層：步數超過資料夾總數就是循環
        let mut depth = 1;
        let mut parent = folder.parent_id.as_deref();
        while let Some(id) = parent {
            let next = parents
                .get(id)
                .ok_or_else(|| AppError::invalid_project(format!("folder parent {id:?} does not exist")))?;
            depth += 1;
            if depth > folders.len() {
                return Err(AppError::invalid_project("folder parents form a cycle"));
            }
            parent = *next;
        }
        if depth > LIBRARY_DEPTH_MAX {
            return Err(AppError::invalid_project(format!("folder {:?} is nested too deeply", folder.name)));
        }
    }
    Ok(())
}

fn validate_item(item: &LibraryItem, folder_ids: &HashSet<&str>) -> AppResult<()> {
    let base = item.base();
    format::require_id(&base.id)?;
    require_name(&base.name, ITEM_NAME_MAX_CHARS, "item")?;
    format::validate_asset_path_in(&base.src, item.asset_dir())?;
    match (&base.folder_id, &base.trashed) {
        (Some(_), Some(_)) => return Err(AppError::invalid_project("trashed item is still in a folder")),
        (Some(id), None) if !folder_ids.contains(id.as_str()) => {
            return Err(AppError::invalid_project(format!("item folder {id:?} does not exist")));
        }
        _ => {}
    }
    match item {
        LibraryItem::Image(image) => {
            let positive = |value: f64| value.is_finite() && value > 0.0;
            if !positive(image.width) || !positive(image.height) {
                return Err(AppError::invalid_project("image item size must be positive"));
            }
        }
        LibraryItem::Text(text) => {
            if text.excerpt.chars().count() > TEXT_EXCERPT_MAX_CHARS {
                return Err(AppError::invalid_project("text excerpt is too long"));
            }
        }
        LibraryItem::Audio(_) => {}
    }
    Ok(())
}

/// Checks folder ids, names, nesting and every item (ids, names, paths, folders, sizes).
///
/// # Errors
/// Returns `AppError::InvalidProject` describing the first problem found.
pub fn validate_library(library: &Library) -> AppResult<()> {
    // 比 App 新的版本不能當成損壞：重建會丟掉新版的資料
    if library.library_version > LIBRARY_VERSION {
        return Err(AppError::UnsupportedVersion(library.library_version));
    }
    if library.library_version != LIBRARY_VERSION {
        return Err(AppError::invalid_project(format!("unsupported library version {}", library.library_version)));
    }
    validate_folders(&library.folders)?;
    let folder_ids: HashSet<&str> = library.folders.iter().map(|folder| folder.id.as_str()).collect();
    let mut item_ids = HashSet::new();
    let mut sources = HashSet::new();
    for item in &library.items {
        validate_item(item, &folder_ids)?;
        let base = item.base();
        if !item_ids.insert(base.id.as_str()) {
            return Err(AppError::invalid_project(format!("duplicate item id {:?}", base.id)));
        }
        // 同一個檔案只留一筆
        if !sources.insert(base.src.as_str()) {
            return Err(AppError::invalid_project(format!("duplicate item src {:?}", base.src)));
        }
    }
    Ok(())
}

/// Parses and validates `library.json` content.
///
/// # Errors
/// Returns `AppError::InvalidProject` for malformed JSON or content that fails validation.
pub fn parse_library(json: &str) -> AppResult<Library> {
    let library: Library = serde_json::from_str(json)?;
    validate_library(&library)?;
    Ok(library)
}

fn read_file(path: &Path) -> AppResult<Library> {
    parse_library(&fs::read_to_string(path)?)
}

/// Reads `<root>/library.json`, falling back to `library.json.bak` when the main file is missing
/// or damaged.
///
/// # Returns
/// `None` when the project has no library yet (neither file exists).
///
/// # Errors
/// The main file's error when it exists but neither it nor the backup can be read.
pub fn read(root: &Path) -> AppResult<Option<Library>> {
    let main_error = match read_file(&root.join(LIBRARY_FILE_NAME)) {
        Ok(library) => return Ok(Some(library)),
        Err(AppError::Io(error)) if error.kind() == ErrorKind::NotFound => None,
        Err(error @ AppError::UnsupportedVersion(_)) => return Err(error),
        Err(error) => Some(error),
    };
    match read_file(&io::with_suffix(root, LIBRARY_FILE_NAME, ".bak")) {
        Ok(library) => Ok(Some(library)),
        Err(_) => main_error.map_or(Ok(None), Err),
    }
}

/// Validates and writes `<root>/library.json` atomically (previous version kept as `.bak`).
///
/// # Errors
/// Returns `AppError::InvalidProject` for invalid content (nothing is written), `AppError::Io` on
/// write failure.
pub fn write(root: &Path, library: &Library) -> AppResult<()> {
    validate_library(library)?;
    io::write_atomic(root, LIBRARY_FILE_NAME, &serde_json::to_string_pretty(library)?)
}

/// Turns any string into a valid item name; falls back to the file name of `src`.
fn sanitize_item_name(name: &str, src: &str) -> String {
    let single_line = name.replace(['\r', '\n'], " ");
    let trimmed: String = single_line.trim().chars().take(ITEM_NAME_MAX_CHARS).collect();
    let trimmed = trimmed.trim_end();
    if trimmed.is_empty() {
        src.rsplit('/').next().unwrap_or(src).to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// Builds the library of a project saved before the library existed: every image of the upload
/// panel (`ProjectFile.assets`) becomes an unsorted item. Invalid or duplicate entries are skipped.
///
/// # Args
/// * `root` - Project folder, to read file sizes (missing files count as 0 bytes).
/// * `assets` - The project's image list.
/// * `now` - Import time to record (RFC 3339).
pub fn from_assets(root: &Path, assets: &[AssetInfo], now: &str) -> Library {
    let mut seen = HashSet::new();
    let items = assets
        .iter()
        .filter(|asset| format::validate_asset_path(&asset.src).is_ok() && seen.insert(asset.src.as_str()))
        .filter(|asset| asset.width.is_finite() && asset.width > 0.0 && asset.height.is_finite() && asset.height > 0.0)
        .map(|asset| {
            LibraryItem::Image(ImageItem {
                base: ItemBase {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: sanitize_item_name(&asset.name, &asset.src),
                    src: asset.src.clone(),
                    bytes: fs::metadata(root.join(&asset.src)).map_or(0, |meta| meta.len()),
                    folder_id: None,
                    imported_at: now.to_owned(),
                    trashed: None,
                },
                width: asset.width,
                height: asset.height,
            })
        })
        .collect();
    Library { items, ..Library::default() }
}

/// Name of the copy kept when an unreadable `library.json` is replaced.
pub const DAMAGED_SUFFIX: &str = ".damaged";

/// The library to show when a project is opened.
#[derive(Debug)]
pub struct LoadedLibrary {
    pub library: Library,
    /// `library.json` and its backup were unreadable: the library was rebuilt from the project's
    /// image list and the damaged file kept as `library.json.damaged`.
    pub rebuilt: bool,
}

/// Reads the project's library; creates it from `assets` when there is none yet (projects saved
/// before the library existed) or when it cannot be read. A failed write is ignored: the library is
/// still returned and the next change writes it again.
///
/// # Errors
/// Only `AppError::UnsupportedVersion` (written by a newer app; rebuilding would lose its data).
pub fn load_or_create(root: &Path, assets: &[AssetInfo], now: &str) -> AppResult<LoadedLibrary> {
    let rebuilt = match read(root) {
        Ok(Some(library)) => return Ok(LoadedLibrary { library, rebuilt: false }),
        Ok(None) => false,
        Err(error @ AppError::UnsupportedVersion(_)) => return Err(error),
        Err(_) => {
            // 損壞的檔案留著給使用者（或之後的版本）救資料，不直接覆蓋
            let damaged = io::with_suffix(root, LIBRARY_FILE_NAME, DAMAGED_SUFFIX);
            let _ = fs::remove_file(&damaged);
            let _ = fs::rename(root.join(LIBRARY_FILE_NAME), &damaged);
            true
        }
    };
    let library = from_assets(root, assets, now);
    let _ = write(root, &library);
    Ok(LoadedLibrary { library, rebuilt })
}

/// Every file the library refers to, including items in the trash (they can be restored).
pub fn referenced(library: &Library) -> impl Iterator<Item = &str> {
    library.items.iter().map(|item| item.base().src.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const FIXTURE: &str = include_str!("../../../tests/fixtures/sample-library.json");

    /// Breaks one thing in the fixture JSON.
    type EditValue = fn(&mut Value);

    fn fixture_value() -> Value {
        serde_json::from_str(FIXTURE).unwrap()
    }

    fn parse_value(value: &Value) -> AppResult<Library> {
        parse_library(&value.to_string())
    }

    #[test]
    fn fixture_is_valid_and_round_trips() {
        let library = parse_library(FIXTURE).unwrap();
        assert_eq!(library.folders.len(), 4);
        assert_eq!(library.items.len(), 6);
        assert!(matches!(library.items[2], LibraryItem::Text(_)));
        assert!(matches!(library.items[3], LibraryItem::Audio(_)));
        let again = parse_library(&serde_json::to_string(&library).unwrap()).unwrap();
        assert_eq!(again, library);
        // 序列化的欄位名稱和前端一致
        let value: Value = serde_json::to_value(&library).unwrap();
        assert_eq!(value["items"][0]["kind"], "image");
        assert!(value["items"][0]["folderId"].is_string());
        assert!(value["items"][1]["folderId"].is_null());
        assert!(value["items"][5]["trashed"]["fromFolderId"].is_string());
    }

    #[test]
    fn rejects_bad_folders() {
        let cases: [(&str, EditValue); 6] = [
            ("cycle", |v| {
                v["folders"][0]["parentId"] = Value::from("f-people");
            }),
            ("missing parent", |v| {
                v["folders"][1]["parentId"] = Value::from("nope");
            }),
            ("duplicate sibling name", |v| {
                v["folders"][3]["name"] = v["folders"][0]["name"].clone();
            }),
            ("duplicate id", |v| {
                v["folders"][3]["id"] = v["folders"][0]["id"].clone();
            }),
            ("untrimmed name", |v| {
                v["folders"][0]["name"] = Value::from(" 封面");
            }),
            ("empty name", |v| {
                v["folders"][0]["name"] = Value::from("");
            }),
        ];
        for (label, edit) in cases {
            let mut value = fixture_value();
            edit(&mut value);
            assert!(parse_value(&value).is_err(), "{label} should be rejected");
        }
    }

    #[test]
    fn same_name_in_different_parents_is_allowed() {
        let mut value = fixture_value();
        // 「人物」在「封面」底下；最上層再放一個「人物」
        value["folders"][3]["name"] = Value::from("人物");
        assert!(parse_value(&value).is_ok());
    }

    #[test]
    fn depth_limit() {
        let chain = |count: usize| -> Value {
            let folders: Vec<Value> = (0..count)
                .map(|i| {
                    let parent = if i == 0 { Value::Null } else { Value::from(format!("d{}", i - 1)) };
                    serde_json::json!({ "id": format!("d{i}"), "name": format!("層{i}"), "parentId": parent })
                })
                .collect();
            serde_json::json!({ "libraryVersion": 1, "folders": folders, "items": [] })
        };
        assert!(parse_value(&chain(LIBRARY_DEPTH_MAX)).is_ok());
        assert!(parse_value(&chain(LIBRARY_DEPTH_MAX + 1)).is_err());
    }

    #[test]
    fn rejects_bad_items() {
        let cases: [(&str, EditValue); 9] = [
            ("image in texts dir", |v| {
                v["items"][0]["src"] = Value::from("assets/texts/0123456789abcdef0123456789abcdef.png");
            }),
            ("text in images dir", |v| {
                v["items"][2]["src"] = Value::from("assets/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md");
            }),
            ("path escape", |v| {
                v["items"][3]["src"] = Value::from("assets/audio/../../secret.mp3");
            }),
            ("duplicate src", |v| {
                v["items"][1]["src"] = v["items"][0]["src"].clone();
            }),
            ("duplicate id", |v| {
                v["items"][1]["id"] = v["items"][0]["id"].clone();
            }),
            ("missing folder", |v| {
                v["items"][0]["folderId"] = Value::from("nope");
            }),
            ("trashed but in a folder", |v| {
                v["items"][5]["folderId"] = Value::from("f-cover");
            }),
            ("zero size image", |v| {
                v["items"][0]["width"] = Value::from(0);
            }),
            ("long excerpt", |v| {
                v["items"][2]["excerpt"] = Value::from("字".repeat(TEXT_EXCERPT_MAX_CHARS + 1));
            }),
        ];
        for (label, edit) in cases {
            let mut value = fixture_value();
            edit(&mut value);
            assert!(parse_value(&value).is_err(), "{label} should be rejected");
        }
        let mut value = fixture_value();
        value["libraryVersion"] = Value::from(2);
        assert!(matches!(parse_value(&value), Err(AppError::UnsupportedVersion(2))));
        value["libraryVersion"] = Value::from(0);
        assert!(matches!(parse_value(&value), Err(AppError::InvalidProject(_))));
    }

    fn cover_asset() -> AssetInfo {
        AssetInfo {
            src: "assets/images/0123456789abcdef0123456789abcdef.png".to_owned(),
            name: "封面照片.png".to_owned(),
            width: 1600.0,
            height: 900.0,
        }
    }

    #[test]
    fn load_or_create_reads_creates_and_rebuilds() {
        let dir = tempfile::tempdir().unwrap();
        let assets = [cover_asset()];
        // 沒有素材庫：由專案圖片建立並寫入
        let created = load_or_create(dir.path(), &assets, "2026-10-08T00:00:00Z").unwrap();
        assert!(!created.rebuilt);
        assert_eq!(created.library.items.len(), 1);
        assert_eq!(read(dir.path()).unwrap(), Some(created.library.clone()));
        // 已經有：照原樣讀回，不再由專案圖片產生
        let again = load_or_create(dir.path(), &[], "2026-10-09T00:00:00Z").unwrap();
        assert_eq!(again.library, created.library);

        // 主檔與 .bak 都壞：重建、留下 .damaged
        fs::write(dir.path().join(LIBRARY_FILE_NAME), "{ broken").unwrap();
        fs::write(io::with_suffix(dir.path(), LIBRARY_FILE_NAME, ".bak"), "{ broken").unwrap();
        let rebuilt = load_or_create(dir.path(), &assets, "2026-10-09T00:00:00Z").unwrap();
        assert!(rebuilt.rebuilt);
        assert_eq!(rebuilt.library.items.len(), 1);
        let damaged = io::with_suffix(dir.path(), LIBRARY_FILE_NAME, DAMAGED_SUFFIX);
        assert_eq!(fs::read_to_string(damaged).unwrap(), "{ broken");
        assert!(read(dir.path()).unwrap().is_some());
    }

    #[test]
    fn load_or_create_refuses_newer_library() {
        let dir = tempfile::tempdir().unwrap();
        let mut value = fixture_value();
        value["libraryVersion"] = Value::from(2);
        fs::write(dir.path().join(LIBRARY_FILE_NAME), value.to_string()).unwrap();
        assert!(matches!(load_or_create(dir.path(), &[], "now"), Err(AppError::UnsupportedVersion(2))));
        // 新版的檔案不能被動到
        assert_eq!(fs::read_to_string(dir.path().join(LIBRARY_FILE_NAME)).unwrap(), value.to_string());
    }

    #[test]
    fn trashed_item_may_point_to_a_deleted_folder() {
        // fixture 的垃圾桶素材來自已刪除的資料夾
        let library = parse_library(FIXTURE).unwrap();
        let trashed = library.items[5].base().trashed.as_ref().unwrap();
        assert!(!library.folders.iter().any(|f| Some(&f.id) == trashed.from_folder_id.as_ref()));
    }

    #[test]
    fn read_write_and_backup() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read(dir.path()).unwrap(), None);

        let library = parse_library(FIXTURE).unwrap();
        write(dir.path(), &library).unwrap();
        assert_eq!(read(dir.path()).unwrap(), Some(library.clone()));

        // 第二次寫入時上一版留成 .bak；主檔壞掉時改讀 .bak
        let mut changed = library.clone();
        changed.folders[0].name = "封面（改）".to_owned();
        write(dir.path(), &changed).unwrap();
        fs::write(dir.path().join(LIBRARY_FILE_NAME), "{ broken").unwrap();
        assert_eq!(read(dir.path()).unwrap(), Some(library));

        // 兩個都壞 → 主檔的錯誤
        fs::write(io::with_suffix(dir.path(), LIBRARY_FILE_NAME, ".bak"), "{ broken").unwrap();
        assert!(read(dir.path()).is_err());
    }

    #[test]
    fn write_rejects_invalid_library_without_touching_disk() {
        let dir = tempfile::tempdir().unwrap();
        let mut library = parse_library(FIXTURE).unwrap();
        library.folders[0].name = String::new();
        assert!(write(dir.path(), &library).is_err());
        assert!(!dir.path().join(LIBRARY_FILE_NAME).exists());
    }

    #[test]
    fn from_assets_makes_unsorted_items() {
        let dir = tempfile::tempdir().unwrap();
        let src = "assets/images/0123456789abcdef0123456789abcdef.png";
        fs::create_dir_all(dir.path().join(ASSET_DIR)).unwrap();
        fs::write(dir.path().join(src), b"12345").unwrap();
        let asset = |src: &str, name: &str, width: f64| AssetInfo {
            src: src.to_owned(),
            name: name.to_owned(),
            width,
            height: 10.0,
        };
        let assets = [
            asset(src, " 封面\n照片.png ", 20.0),
            asset(src, "重複", 20.0),
            asset("assets/images/../x.png", "壞路徑", 20.0),
            asset("assets/images/ffffffffffffffffffffffffffffffff.png", "", 20.0),
            asset("assets/images/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png", "沒有尺寸", 0.0),
        ];
        let library = from_assets(dir.path(), &assets, "2026-10-08T00:00:00Z");
        validate_library(&library).unwrap();
        let names: Vec<_> = library.items.iter().map(|item| item.base().name.as_str()).collect();
        assert_eq!(names, ["封面 照片.png", "ffffffffffffffffffffffffffffffff.png"]);
        let first = library.items[0].base();
        assert_eq!((first.bytes, first.folder_id.as_ref(), first.trashed.as_ref()), (5, None, None));
        assert_eq!(library.items[1].base().bytes, 0);
    }

    #[test]
    fn referenced_includes_trash() {
        let library = parse_library(FIXTURE).unwrap();
        let all: Vec<_> = referenced(&library).collect();
        assert_eq!(all.len(), 6);
        assert!(all.contains(&library.items[5].base().src.as_str()));
    }
}
