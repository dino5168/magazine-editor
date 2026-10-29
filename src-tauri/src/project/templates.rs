//! Document templates (文件範本): reusable designs kept in the app's data folder, shared by every
//! project on this computer.
//!
//! Each template is a trimmed project folder, so the project format's validation, upgrades and
//! asset copying apply unchanged:
//!
//! ```text
//! <base>/<id>/template.json      TemplateMeta
//! <base>/<id>/project.magproj    ProjectFile (pages = the chosen sample pages, or one blank page)
//! <base>/<id>/assets/fonts/…     project font files
//! <base>/<id>/assets/images/…    images on master pages and sample pages
//! ```
//!
//! Creating and replacing write a hidden `.<id>.<uuid>.tmp` folder first and rename it into place,
//! so a failure never leaves half a template. The frontend only ever passes template ids.

use super::format::{self, Document, ProjectContent, ProjectFile, FORMAT_ID, SCHEMA_VERSION};
use super::library::{self, LoadedLibrary};
use super::{create_untitled, io, OpenProject};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Map;
use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

/// Folder under the app data directory that holds every template.
pub const TEMPLATES_DIR: &str = "templates";
/// Current `template.json` version; a newer one is listed but cannot be used.
pub const TEMPLATE_VERSION: u32 = 1;
const META_FILE_NAME: &str = "template.json";
/// Longest template name (characters, after trimming); same as `TEMPLATE_NAME_MAX_LENGTH` in TS.
pub const TEMPLATE_NAME_MAX_LENGTH: usize = 50;
/// Longest description (characters); same as `TEMPLATE_DESCRIPTION_MAX_LENGTH` in TS.
pub const TEMPLATE_DESCRIPTION_MAX_LENGTH: usize = 200;
const TMP_SUFFIX: &str = ".tmp";
const OLD_SUFFIX: &str = ".old";
const NEWER_MESSAGE: &str = "這個範本是較新版本的 App 建立的，請先更新 App";
const DAMAGED_MESSAGE: &str = "範本已損壞，無法使用";

/// `template.json`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TemplateMeta {
    pub template_version: u32,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Why a listed template cannot be used.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TemplateProblem {
    /// Written by a newer app.
    UnsupportedVersion,
    /// `template.json` or `project.magproj` (and its backup) cannot be read.
    Damaged,
}

/// One template as listed for the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateEntry {
    pub id: String,
    /// Absolute folder path; the frontend only uses it to build asset URLs for thumbnails.
    pub root: String,
    /// Missing when `template.json` cannot be read.
    pub meta: Option<TemplateMeta>,
    /// Present only when the template can be used (`problem` is `None`).
    pub document: Option<Document>,
    pub problem: Option<TemplateProblem>,
}

/// Result of writing a template's content.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedTemplate {
    pub id: String,
    /// Referenced font or image files missing from the source project (skipped).
    pub missing_files: usize,
}

// id 會組成資料夾名稱，只接受 UUID 的字元，避免路徑穿越（同 recovery 的檢查）
fn template_dir(base: &Path, id: &str) -> AppResult<PathBuf> {
    let valid = !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if !valid {
        return Err(AppError::invalid_input("範本識別碼不正確"));
    }
    Ok(base.join(id))
}

fn read_meta(dir: &Path) -> AppResult<TemplateMeta> {
    let json = fs::read_to_string(dir.join(META_FILE_NAME))?;
    Ok(serde_json::from_str(&json)?)
}

/// Reads a template's metadata and refuses one this app cannot use (newer or damaged).
fn read_usable_meta(dir: &Path) -> AppResult<TemplateMeta> {
    let meta = read_meta(dir).map_err(|error| match error {
        AppError::Io(error) if error.kind() == ErrorKind::NotFound => AppError::invalid_input("找不到這個範本"),
        _ => AppError::invalid_input(DAMAGED_MESSAGE),
    })?;
    if meta.template_version > TEMPLATE_VERSION {
        return Err(AppError::invalid_input(NEWER_MESSAGE));
    }
    Ok(meta)
}

fn read_usable_project(dir: &Path) -> AppResult<ProjectFile> {
    match io::read_project(dir) {
        Ok((file, _)) => Ok(file),
        Err(AppError::UnsupportedVersion(_)) => {
            Err(AppError::invalid_input(NEWER_MESSAGE))
        }
        Err(_) => Err(AppError::invalid_input(DAMAGED_MESSAGE)),
    }
}

/// Lists every template in `base`, newest update first. Damaged or newer templates are listed with
/// a `problem` so the user can delete them; they never hide the others.
///
/// # Errors
/// Returns `AppError::Io` when `base` exists but cannot be read.
pub fn list(base: &Path) -> AppResult<Vec<TemplateEntry>> {
    let entries = match fs::read_dir(base) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut templates: Vec<TemplateEntry> = entries
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let id = entry.file_name().to_string_lossy().into_owned();
            // 暫存資料夾以 . 開頭，template_dir 也會擋掉
            let dir = template_dir(base, &id).ok()?;
            Some(read_entry(id, &dir))
        })
        .collect();
    templates.sort_by(|a, b| {
        let updated = |entry: &TemplateEntry| entry.meta.as_ref().map(|meta| meta.updated_at.clone()).unwrap_or_default();
        updated(b).cmp(&updated(a)).then_with(|| a.id.cmp(&b.id))
    });
    Ok(templates)
}

fn read_entry(id: String, dir: &Path) -> TemplateEntry {
    let root = dir.to_string_lossy().into_owned();
    let meta = read_meta(dir).ok();
    let problem = match &meta {
        None => Some(TemplateProblem::Damaged),
        Some(meta) if meta.template_version > TEMPLATE_VERSION => Some(TemplateProblem::UnsupportedVersion),
        Some(_) => None,
    };
    if problem.is_some() {
        return TemplateEntry { id, root, meta, document: None, problem };
    }
    match io::read_project(dir) {
        Ok((file, _)) => TemplateEntry { id, root, meta, document: Some(file.document), problem: None },
        Err(AppError::UnsupportedVersion(_)) => {
            TemplateEntry { id, root, meta, document: None, problem: Some(TemplateProblem::UnsupportedVersion) }
        }
        Err(_) => TemplateEntry { id, root, meta, document: None, problem: Some(TemplateProblem::Damaged) },
    }
}

/// Trims and checks a template name: 1–TEMPLATE_NAME_MAX_LENGTH characters, unique among the
/// templates in `base` (except `own_id`, the template being renamed).
fn validate_name(base: &Path, name: &str, own_id: Option<&str>) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::invalid_input("請輸入範本名稱"));
    }
    if name.chars().count() > TEMPLATE_NAME_MAX_LENGTH {
        return Err(AppError::invalid_input(format!("範本名稱最多 {TEMPLATE_NAME_MAX_LENGTH} 個字")));
    }
    let taken = list(base)?
        .iter()
        .filter(|entry| Some(entry.id.as_str()) != own_id)
        .any(|entry| entry.meta.as_ref().is_some_and(|meta| meta.name == name));
    if taken {
        return Err(AppError::invalid_input(format!("已經有名稱為「{name}」的範本")));
    }
    Ok(name.to_owned())
}

fn validate_description(description: &str) -> AppResult<String> {
    let description = description.trim();
    if description.chars().count() > TEMPLATE_DESCRIPTION_MAX_LENGTH {
        return Err(AppError::invalid_input(format!("範本說明最多 {TEMPLATE_DESCRIPTION_MAX_LENGTH} 個字")));
    }
    Ok(description.to_owned())
}

fn hidden_sibling(base: &Path, id: &str, suffix: &str) -> PathBuf {
    base.join(format!(".{id}.{}{suffix}", uuid::Uuid::new_v4()))
}

/// Writes a complete template folder at `dir` (which must not exist): project file, metadata and
/// the referenced files copied from `source_root`.
///
/// # Returns
/// Number of referenced files missing from `source_root`.
fn write_folder(dir: &Path, id: &str, meta: &TemplateMeta, content: ProjectContent, source_root: &Path) -> AppResult<usize> {
    io::create_project_dir(dir)?;
    let sources: HashSet<&str> = format::referenced_assets(&content.document, &content.assets).collect();
    let missing = sources.iter().filter(|src| !source_root.join(src).is_file()).count();
    io::copy_assets(source_root, dir, sources.into_iter())?;
    let file = ProjectFile {
        format: FORMAT_ID.to_owned(),
        schema_version: SCHEMA_VERSION,
        id: id.to_owned(),
        created_at: meta.created_at.clone(),
        modified_at: meta.updated_at.clone(),
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        document: content.document,
        assets: content.assets,
        extra: Map::new(),
    };
    io::write_project_atomic(dir, &serde_json::to_string_pretty(&file)?)?;
    io::write_atomic(dir, META_FILE_NAME, &serde_json::to_string_pretty(meta)?)?;
    Ok(missing)
}

/// Writes the template into a hidden temp folder, then hands it to `install` (which moves it into
/// place). The temp folder is removed on any failure.
fn write_via_temp(
    base: &Path,
    id: &str,
    meta: &TemplateMeta,
    content: ProjectContent,
    source_root: &Path,
    install: impl FnOnce(&Path) -> AppResult<()>,
) -> AppResult<usize> {
    format::validate_content(&content.document, &content.assets)?;
    fs::create_dir_all(base)?;
    let tmp = hidden_sibling(base, id, TMP_SUFFIX);
    let result = write_folder(&tmp, id, meta, content, source_root).and_then(|missing| install(&tmp).map(|()| missing));
    if result.is_err() {
        let _ = fs::remove_dir_all(&tmp);
    }
    result
}

/// Creates a new template from `content`, copying the font and image files it references from the
/// current project folder `source_root`.
///
/// # Errors
/// `AppError::InvalidInput` for a bad name or description, `AppError::InvalidProject` for invalid
/// content, `AppError::Io` on write failure.
pub fn create(
    base: &Path,
    source_root: &Path,
    name: &str,
    description: &str,
    content: ProjectContent,
    now: &str,
) -> AppResult<SavedTemplate> {
    let meta = TemplateMeta {
        template_version: TEMPLATE_VERSION,
        name: validate_name(base, name, None)?,
        description: validate_description(description)?,
        created_at: now.to_owned(),
        updated_at: now.to_owned(),
    };
    let id = uuid::Uuid::new_v4().to_string();
    let target = base.join(&id);
    let missing = write_via_temp(base, &id, &meta, content, source_root, |tmp| Ok(fs::rename(tmp, &target)?))?;
    Ok(SavedTemplate { id, missing_files: missing })
}

/// Replaces a template's content with `content` (from the current project), keeping its id, name,
/// description and creation time. The old folder stays in place until the new one is complete.
///
/// # Errors
/// `AppError::InvalidInput` when the template does not exist or cannot be used, plus `create` errors.
pub fn replace(base: &Path, id: &str, source_root: &Path, content: ProjectContent, now: &str) -> AppResult<SavedTemplate> {
    let target = template_dir(base, id)?;
    let old = read_usable_meta(&target)?;
    // 新版 App 寫的內容不能蓋掉（會丟資料）；壞掉的專案檔可以，等於修好它
    if matches!(io::read_project(&target), Err(AppError::UnsupportedVersion(_))) {
        return Err(AppError::invalid_input(NEWER_MESSAGE));
    }
    let meta = TemplateMeta { template_version: TEMPLATE_VERSION, updated_at: now.to_owned(), ..old };
    let missing = write_via_temp(base, id, &meta, content, source_root, |tmp| {
        // 先把舊的移開（rename 瞬間完成），新的放上去失敗時再搬回來
        let previous = hidden_sibling(base, id, OLD_SUFFIX);
        fs::rename(&target, &previous)?;
        if let Err(error) = fs::rename(tmp, &target) {
            let _ = fs::rename(&previous, &target);
            return Err(error.into());
        }
        let _ = fs::remove_dir_all(&previous);
        Ok(())
    })?;
    Ok(SavedTemplate { id: id.to_owned(), missing_files: missing })
}

/// Changes a template's name and description.
///
/// # Errors
/// `AppError::InvalidInput` for a bad name / description or a template that cannot be used.
pub fn update_info(base: &Path, id: &str, name: &str, description: &str, now: &str) -> AppResult<TemplateMeta> {
    let dir = template_dir(base, id)?;
    let old = read_usable_meta(&dir)?;
    let meta = TemplateMeta {
        name: validate_name(base, name, Some(id))?,
        description: validate_description(description)?,
        updated_at: now.to_owned(),
        ..old
    };
    io::write_atomic(&dir, META_FILE_NAME, &serde_json::to_string_pretty(&meta)?)?;
    Ok(meta)
}

/// Deletes a template folder; deleting one that is already gone is not an error.
///
/// # Errors
/// `AppError::InvalidInput` for a bad id, `AppError::Io` when the folder cannot be removed.
pub fn delete(base: &Path, id: &str) -> AppResult<()> {
    match fs::remove_dir_all(template_dir(base, id)?) {
        Err(error) if error.kind() != ErrorKind::NotFound => Err(error.into()),
        _ => Ok(()),
    }
}

/// A new untitled project made from a template.
pub struct NewFromTemplate {
    pub project: OpenProject,
    pub content: ProjectContent,
    pub library: LoadedLibrary,
}

/// Creates an untitled project in `untitled_base` from a template: copies the template's font and
/// image files and builds the asset library from its images (all unsorted).
///
/// # Errors
/// `AppError::InvalidInput` when the template cannot be used, `AppError::Io` on copy failure.
pub fn new_project_from(base: &Path, id: &str, untitled_base: &Path, now: &str) -> AppResult<NewFromTemplate> {
    let dir = template_dir(base, id)?;
    read_usable_meta(&dir)?;
    let file = read_usable_project(&dir)?;
    let project = create_untitled(untitled_base)?;
    let result = (|| {
        io::copy_assets(&dir, &project.root, format::referenced_assets(&file.document, &file.assets))?;
        library::load_or_create(&project.root, &file.assets, now)
    })();
    match result {
        Ok(library) => {
            Ok(NewFromTemplate { project, content: ProjectContent { document: file.document, assets: file.assets }, library })
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&project.root);
            Err(error)
        }
    }
}

/// Cleans up after an interrupted create / replace (call at startup, when nothing else writes):
/// temp folders are deleted; a moved-away old template comes back when its replacement never
/// arrived, otherwise it is deleted.
pub fn clean_up(base: &Path) {
    let Ok(entries) = fs::read_dir(base) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(hidden) = name.strip_prefix('.') else {
            continue;
        };
        if hidden.ends_with(TMP_SUFFIX) {
            let _ = fs::remove_dir_all(entry.path());
        } else if let Some(stem) = hidden.strip_suffix(OLD_SUFFIX) {
            // .<id>.<uuid>.old：id 本身含 -，用最後一個 . 切開
            let Some((id, _)) = stem.rsplit_once('.') else {
                continue;
            };
            match template_dir(base, id) {
                Ok(target) if !target.exists() => {
                    let _ = fs::rename(entry.path(), target);
                }
                Ok(_) => {
                    let _ = fs::remove_dir_all(entry.path());
                }
                Err(_) => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::format::{Element, FONT_ASSET_DIR};

    const FIXTURE: &str = include_str!("../../../tests/fixtures/sample.magproj");
    const NOW: &str = "2026-10-19T00:00:00Z";
    const LATER: &str = "2026-10-20T00:00:00Z";

    fn fixture_content() -> ProjectContent {
        let file = format::parse_project(FIXTURE).unwrap();
        ProjectContent { document: file.document, assets: file.assets }
    }

    /// A project folder holding every file the fixture references, except `skip`.
    fn source_with_files(skip: &[&str]) -> tempfile::TempDir {
        let source = tempfile::tempdir().unwrap();
        let content = fixture_content();
        for src in format::referenced_assets(&content.document, &content.assets) {
            if skip.contains(&src) {
                continue;
            }
            let path = source.path().join(src);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, src.as_bytes()).unwrap();
        }
        source
    }

    fn referenced(content: &ProjectContent) -> Vec<String> {
        let mut all: Vec<String> =
            format::referenced_assets(&content.document, &content.assets).map(str::to_owned).collect();
        all.sort();
        all.dedup();
        all
    }

    fn master_image(content: &ProjectContent) -> String {
        content
            .document
            .masters
            .iter()
            .flat_map(|master| &master.elements)
            .find_map(|element| match element {
                Element::Image(image) => Some(image.src.clone()),
                _ => None,
            })
            .expect("fixture has an image on a master page")
    }

    #[test]
    fn create_then_list_returns_the_same_document_and_copies_fonts_and_images() {
        let base = tempfile::tempdir().unwrap();
        let content = fixture_content();
        let source = source_with_files(&[]);
        let saved = create(base.path(), source.path(), "  校刊 2026 ", "週報用", content.clone(), NOW).unwrap();
        assert_eq!(saved.missing_files, 0);

        let listed = list(base.path()).unwrap();
        assert_eq!(listed.len(), 1);
        let entry = &listed[0];
        assert_eq!(entry.id, saved.id);
        assert_eq!(entry.problem, None);
        assert_eq!(entry.meta.as_ref().unwrap().name, "校刊 2026");
        assert_eq!(entry.meta.as_ref().unwrap().description, "週報用");
        assert_eq!(entry.document.as_ref(), Some(&content.document));

        let dir = base.path().join(&saved.id);
        for src in referenced(&content) {
            assert!(dir.join(&src).is_file(), "{src} copied");
        }
        assert!(referenced(&content).iter().any(|src| src.starts_with(FONT_ASSET_DIR)));
        assert!(dir.join(master_image(&content)).is_file());
        // 暫存資料夾不會留下
        assert!(fs::read_dir(base.path()).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with('.')));
    }

    #[test]
    fn missing_source_files_are_skipped_and_counted() {
        let base = tempfile::tempdir().unwrap();
        let content = fixture_content();
        let image = master_image(&content);
        let source = source_with_files(&[image.as_str()]);
        let saved = create(base.path(), source.path(), "A", "", content, NOW).unwrap();
        assert_eq!(saved.missing_files, 1);
        assert!(!base.path().join(&saved.id).join(image).exists());
    }

    #[test]
    fn rejects_blank_long_and_duplicate_names() {
        let base = tempfile::tempdir().unwrap();
        let source = source_with_files(&[]);
        let create_named = |name: &str| create(base.path(), source.path(), name, "", fixture_content(), NOW);
        assert!(matches!(create_named("   "), Err(AppError::InvalidInput(_))));
        assert!(matches!(create_named(&"字".repeat(TEMPLATE_NAME_MAX_LENGTH + 1)), Err(AppError::InvalidInput(_))));
        create_named(&"字".repeat(TEMPLATE_NAME_MAX_LENGTH)).unwrap();
        create_named("週報").unwrap();
        assert!(matches!(create_named(" 週報 "), Err(AppError::InvalidInput(_))));
        let long_description = "字".repeat(TEMPLATE_DESCRIPTION_MAX_LENGTH + 1);
        let result = create(base.path(), source.path(), "B", &long_description, fixture_content(), NOW);
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
        assert_eq!(list(base.path()).unwrap().len(), 2);
    }

    #[test]
    fn invalid_content_leaves_nothing_behind() {
        let base = tempfile::tempdir().unwrap();
        let mut content = fixture_content();
        content.document.pages.clear();
        let result = create(base.path(), source_with_files(&[]).path(), "A", "", content, NOW);
        assert!(matches!(result, Err(AppError::InvalidProject(_))));
        assert_eq!(fs::read_dir(base.path()).unwrap().count(), 0);
    }

    #[test]
    fn replace_keeps_identity_and_swaps_content() {
        let base = tempfile::tempdir().unwrap();
        let source = source_with_files(&[]);
        let saved = create(base.path(), source.path(), "校刊", "說明", fixture_content(), NOW).unwrap();

        let mut changed = fixture_content();
        changed.document.pages.truncate(1);
        changed.document.margins.top = 99.0;
        let replaced = replace(base.path(), &saved.id, source.path(), changed.clone(), LATER).unwrap();
        assert_eq!(replaced.id, saved.id);

        let entry = list(base.path()).unwrap().remove(0);
        let meta = entry.meta.unwrap();
        assert_eq!((meta.name.as_str(), meta.description.as_str()), ("校刊", "說明"));
        assert_eq!((meta.created_at.as_str(), meta.updated_at.as_str()), (NOW, LATER));
        assert_eq!(entry.document.unwrap(), changed.document);
        assert_eq!(fs::read_dir(base.path()).unwrap().count(), 1, "no .old / .tmp left");
    }

    #[test]
    fn failed_replace_keeps_the_old_template() {
        let base = tempfile::tempdir().unwrap();
        let source = source_with_files(&[]);
        let saved = create(base.path(), source.path(), "校刊", "", fixture_content(), NOW).unwrap();
        let mut invalid = fixture_content();
        invalid.document.pages.clear();
        assert!(replace(base.path(), &saved.id, source.path(), invalid, LATER).is_err());
        let entry = list(base.path()).unwrap().remove(0);
        assert_eq!(entry.document.unwrap(), fixture_content().document);
        assert_eq!(fs::read_dir(base.path()).unwrap().count(), 1);
    }

    #[test]
    fn replace_repairs_a_damaged_project_file() {
        let base = tempfile::tempdir().unwrap();
        let source = source_with_files(&[]);
        let saved = create(base.path(), source.path(), "校刊", "", fixture_content(), NOW).unwrap();
        let dir = base.path().join(&saved.id);
        for file in [format::PROJECT_FILE_NAME.to_owned(), format!("{}.bak", format::PROJECT_FILE_NAME)] {
            let _ = fs::write(dir.join(file), "{ broken");
        }
        assert_eq!(list(base.path()).unwrap()[0].problem, Some(TemplateProblem::Damaged));
        replace(base.path(), &saved.id, source.path(), fixture_content(), LATER).unwrap();
        assert_eq!(list(base.path()).unwrap()[0].problem, None);
    }

    #[test]
    fn update_info_renames_without_touching_content() {
        let base = tempfile::tempdir().unwrap();
        let source = source_with_files(&[]);
        let a = create(base.path(), source.path(), "A", "", fixture_content(), NOW).unwrap();
        create(base.path(), source.path(), "B", "", fixture_content(), NOW).unwrap();
        assert!(matches!(update_info(base.path(), &a.id, "B", "", LATER), Err(AppError::InvalidInput(_))));
        // 改成自己的名稱（只改說明）可以
        update_info(base.path(), &a.id, "A", "新的說明", LATER).unwrap();
        let meta = update_info(base.path(), &a.id, "A2", "新的說明", LATER).unwrap();
        assert_eq!((meta.name.as_str(), meta.description.as_str(), meta.created_at.as_str()), ("A2", "新的說明", NOW));
        let entry = list(base.path()).unwrap().into_iter().find(|entry| entry.id == a.id).unwrap();
        assert_eq!(entry.document.unwrap(), fixture_content().document);
    }

    #[test]
    fn list_marks_damaged_and_newer_templates_without_hiding_others() {
        let base = tempfile::tempdir().unwrap();
        let source = source_with_files(&[]);
        let good = create(base.path(), source.path(), "good", "", fixture_content(), NOW).unwrap();
        let newer_meta = create(base.path(), source.path(), "newer meta", "", fixture_content(), NOW).unwrap();
        let newer_project = create(base.path(), source.path(), "newer project", "", fixture_content(), NOW).unwrap();
        let damaged = create(base.path(), source.path(), "damaged", "", fixture_content(), NOW).unwrap();

        let meta_path = base.path().join(&newer_meta.id).join(META_FILE_NAME);
        let mut meta: serde_json::Value = serde_json::from_str(&fs::read_to_string(&meta_path).unwrap()).unwrap();
        meta["templateVersion"] = serde_json::json!(TEMPLATE_VERSION + 1);
        fs::write(&meta_path, meta.to_string()).unwrap();

        let project_path = base.path().join(&newer_project.id).join(format::PROJECT_FILE_NAME);
        let mut project: serde_json::Value = serde_json::from_str(&fs::read_to_string(&project_path).unwrap()).unwrap();
        project["schemaVersion"] = serde_json::json!(SCHEMA_VERSION + 1);
        fs::write(&project_path, project.to_string()).unwrap();

        fs::write(base.path().join(&damaged.id).join(META_FILE_NAME), "{ broken").unwrap();
        // 不是範本的東西：一般檔案、不合法的名稱
        fs::write(base.path().join("notes.txt"), "x").unwrap();
        fs::create_dir(base.path().join("not a template")).unwrap();

        let listed = list(base.path()).unwrap();
        let problem = |id: &str| listed.iter().find(|entry| entry.id == id).unwrap().problem;
        assert_eq!(listed.len(), 4);
        assert_eq!(problem(&good.id), None);
        assert_eq!(problem(&newer_meta.id), Some(TemplateProblem::UnsupportedVersion));
        assert_eq!(problem(&newer_project.id), Some(TemplateProblem::UnsupportedVersion));
        assert_eq!(problem(&damaged.id), Some(TemplateProblem::Damaged));

        let untitled = tempfile::tempdir().unwrap();
        for id in [&newer_meta.id, &newer_project.id, &damaged.id] {
            assert!(matches!(new_project_from(base.path(), id, untitled.path(), NOW), Err(AppError::InvalidInput(_))));
            assert!(replace(base.path(), id, source.path(), fixture_content(), LATER).is_err());
        }
        assert_eq!(fs::read_dir(untitled.path()).map(|d| d.count()).unwrap_or(0), 0);
        delete(base.path(), &damaged.id).unwrap();
        delete(base.path(), &damaged.id).unwrap();
        assert_eq!(list(base.path()).unwrap().len(), 3);
    }

    #[test]
    fn rejects_ids_that_are_not_folder_names() {
        let base = tempfile::tempdir().unwrap();
        for id in ["", "..", "../x", "a/b", "C:\\x", ".hidden"] {
            assert!(matches!(delete(base.path(), id), Err(AppError::InvalidInput(_))), "{id:?}");
        }
    }

    #[test]
    fn new_project_from_copies_files_and_builds_an_unsorted_library() {
        let base = tempfile::tempdir().unwrap();
        let content = fixture_content();
        let saved = create(base.path(), source_with_files(&[]).path(), "A", "", content.clone(), NOW).unwrap();
        let untitled = tempfile::tempdir().unwrap();

        let made = new_project_from(base.path(), &saved.id, untitled.path(), NOW).unwrap();
        assert!(made.project.untitled);
        assert_ne!(made.project.id, saved.id);
        assert_eq!(made.content, content);
        for src in referenced(&content) {
            assert!(made.project.root.join(&src).is_file(), "{src} copied");
        }
        let library = made.library.library;
        assert!(!made.library.rebuilt);
        assert_eq!(library.items.len(), content.assets.len());
        assert!(library.items.iter().all(|item| item.base().folder_id.is_none()));
        assert!(made.project.root.join("library.json").is_file());
        assert!(matches!(new_project_from(base.path(), "0000", untitled.path(), NOW), Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn clean_up_removes_temp_folders_and_restores_an_orphaned_old_template() {
        let base = tempfile::tempdir().unwrap();
        let source = source_with_files(&[]);
        let kept = create(base.path(), source.path(), "kept", "", fixture_content(), NOW).unwrap();
        let moved = create(base.path(), source.path(), "moved", "", fixture_content(), NOW).unwrap();
        // replace 中途當機：舊的已搬走、新的還在暫存資料夾
        let old = hidden_sibling(base.path(), &moved.id, OLD_SUFFIX);
        fs::rename(base.path().join(&moved.id), &old).unwrap();
        fs::create_dir(hidden_sibling(base.path(), &moved.id, TMP_SUFFIX)).unwrap();
        // 已完成的 replace 留下的舊資料夾
        let stale = hidden_sibling(base.path(), &kept.id, OLD_SUFFIX);
        fs::create_dir(&stale).unwrap();

        clean_up(base.path());
        let names: Vec<String> = fs::read_dir(base.path()).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names.len(), 2, "{names:?}");
        let listed = list(base.path()).unwrap();
        assert!(listed.iter().all(|entry| entry.problem.is_none()));
        assert!(listed.iter().any(|entry| entry.id == moved.id));
    }
}
