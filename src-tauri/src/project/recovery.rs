//! Crash recovery: the editor periodically writes unsaved content to
//! `%LOCALAPPDATA%\<identifier>\recovery\<project id>.json`. A file that still exists at startup
//! means the app did not close normally.

use super::format::{self, ProjectContent};
use super::{io, now, OpenProject};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Map;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

pub const RECOVERY_DIR: &str = "recovery";
const FORMAT_ID: &str = "magazine-editor/recovery";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryFile {
    pub format: String,
    pub project_id: String,
    /// Project folder; for an untitled project this is its staging folder.
    pub project_root: String,
    pub untitled: bool,
    pub created_at: String,
    pub saved_at: String,
    pub content: ProjectContent,
}

/// What the startup prompt shows about a recovery file.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryEntry {
    pub id: String,
    pub document_name: String,
    pub saved_at: String,
    pub untitled: bool,
    pub project_root: String,
}

// id 會組成檔名，只接受 UUID 的字元，避免路徑穿越
fn file_path(dir: &Path, id: &str) -> AppResult<PathBuf> {
    let valid = !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if !valid {
        return Err(AppError::invalid_input("備份識別碼不正確"));
    }
    Ok(dir.join(format!("{id}.json")))
}

/// Writes (or replaces) the recovery file of `project`.
///
/// # Errors
/// Returns `AppError::InvalidProject` for invalid content, `AppError::Io` on write failure.
pub fn write(dir: &Path, project: &OpenProject, content: ProjectContent) -> AppResult<()> {
    format::validate_content(&content.document, &content.assets)?;
    let file = RecoveryFile {
        format: FORMAT_ID.to_owned(),
        project_id: project.id.clone(),
        project_root: project.root.to_string_lossy().into_owned(),
        untitled: project.untitled,
        created_at: project.created_at.clone(),
        saved_at: now(),
        content,
    };
    fs::create_dir_all(dir)?;
    let target = file_path(dir, &project.id)?;
    let tmp = target.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec(&file)?)?;
    fs::rename(&tmp, &target)?;
    Ok(())
}

/// Reads one recovery file.
///
/// # Errors
/// `AppError::Io` when missing, `AppError::InvalidProject` when damaged.
pub fn read(dir: &Path, id: &str) -> AppResult<RecoveryFile> {
    let mut value: serde_json::Value = serde_json::from_slice(&fs::read(file_path(dir, id)?)?)?;
    // 備份檔沒有版本號：舊版 App 當機留下的備份可能還是 v2 的圖形格式
    if let Some(document) = value.pointer_mut("/content/document") {
        format::upgrade_shapes_to_v3(document);
    }
    let file: RecoveryFile = serde_json::from_value(value)?;
    if file.format != FORMAT_ID || file.project_id != id {
        return Err(AppError::invalid_project("not a recovery file"));
    }
    format::validate_content(&file.content.document, &file.content.assets)?;
    Ok(file)
}

/// Lists readable recovery files, newest first. Damaged files are skipped.
///
/// # Errors
/// Returns `AppError::Io` when the directory exists but cannot be listed.
pub fn list(dir: &Path) -> AppResult<Vec<RecoveryEntry>> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut found: Vec<(std::time::SystemTime, RecoveryEntry)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let id = name.strip_suffix(".json")?;
            let file = read(dir, id).ok()?;
            let modified = entry.metadata().and_then(|meta| meta.modified()).ok()?;
            let summary = RecoveryEntry {
                id: file.project_id,
                document_name: file.content.document.name,
                saved_at: file.saved_at,
                untitled: file.untitled,
                project_root: file.project_root,
            };
            Some((modified, summary))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(found.into_iter().map(|(_, entry)| entry).collect())
}

/// Deletes a recovery file; a missing file is not an error.
///
/// # Errors
/// Returns `AppError::Io` when the file exists but cannot be deleted.
pub fn remove(dir: &Path, id: &str) -> AppResult<()> {
    match fs::remove_file(file_path(dir, id)?) {
        Err(error) if error.kind() != ErrorKind::NotFound => Err(error.into()),
        _ => Ok(()),
    }
}

/// Rebuilds the project a recovery file belongs to. For a saved project the folder must still
/// exist; its metadata (created time, unknown fields) is taken from `project.magproj` when readable.
/// Unreferenced images are **not** cleaned up here: the recovered content may use images that the
/// last saved version does not.
///
/// # Errors
/// `AppError::Io` (NotFound) when a saved project's folder no longer exists.
pub fn restore_project(file: &RecoveryFile) -> AppResult<OpenProject> {
    let root = PathBuf::from(&file.project_root);
    if file.untitled {
        fs::create_dir_all(io::asset_dir(&root))?;
    } else {
        fs::read_dir(&root)?;
    }
    let (created_at, extra) = match io::read_project(&root) {
        Ok((saved, _)) if !file.untitled => (saved.created_at, saved.extra),
        _ => (file.created_at.clone(), Map::new()),
    };
    Ok(OpenProject { root, id: file.project_id.clone(), created_at, untitled: file.untitled, extra })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{create_untitled, save_as};

    const FIXTURE: &str = include_str!("../../../tests/fixtures/sample.magproj");

    fn content() -> ProjectContent {
        let file = format::parse_project(FIXTURE).unwrap();
        ProjectContent { document: file.document, assets: file.assets }
    }

    #[test]
    fn write_list_read_remove_round_trip() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join(RECOVERY_DIR);
        let project = create_untitled(&base.path().join("untitled")).unwrap();
        assert!(list(&dir).unwrap().is_empty());

        write(&dir, &project, content()).unwrap();
        let entries = list(&dir).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, project.id);
        assert_eq!(entries[0].document_name, "範例雜誌");
        assert!(entries[0].untitled);
        assert_eq!(read(&dir, &project.id).unwrap().content, content());

        remove(&dir, &project.id).unwrap();
        remove(&dir, &project.id).unwrap();
        assert!(list(&dir).unwrap().is_empty());
    }

    #[test]
    fn list_skips_damaged_files_and_sorts_newest_first() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join(RECOVERY_DIR);
        let older = create_untitled(&base.path().join("u")).unwrap();
        let newer = create_untitled(&base.path().join("u")).unwrap();
        write(&dir, &older, content()).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        write(&dir, &newer, content()).unwrap();
        fs::write(dir.join("0000-damaged.json"), "{").unwrap();
        let ids: Vec<_> = list(&dir).unwrap().into_iter().map(|e| e.id).collect();
        assert_eq!(ids, vec![newer.id, older.id]);
    }

    #[test]
    fn backups_left_by_a_v2_app_are_upgraded() {
        const FIXTURE_V2: &str = include_str!("../../../tests/fixtures/sample-v2.magproj");
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join(RECOVERY_DIR);
        let project = create_untitled(&base.path().join("u")).unwrap();
        write(&dir, &project, content()).unwrap();
        // 換成舊版 App 會寫出的內容：圖形是 rect / ellipse / polygon / star
        let path = dir.join(format!("{}.json", project.id));
        let mut backup: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        let old: serde_json::Value = serde_json::from_str(FIXTURE_V2).unwrap();
        backup["content"]["document"] = old["document"].clone();
        fs::write(&path, backup.to_string()).unwrap();

        assert_eq!(list(&dir).unwrap().len(), 1, "an old backup must not be skipped as damaged");
        let elements = read(&dir, &project.id).unwrap().content.document.pages.remove(0).elements;
        assert_eq!(elements.iter().filter(|e| matches!(e, format::Element::Shape(_))).count(), 4);
    }

    #[test]
    fn rejects_ids_that_are_not_file_names() {
        let dir = tempfile::tempdir().unwrap();
        for bad in ["", "../x", "a/b", "C:x", "abc.json"] {
            assert!(remove(dir.path(), bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn restore_saved_project_keeps_its_metadata() {
        let base = tempfile::tempdir().unwrap();
        let untitled = create_untitled(&base.path().join("u")).unwrap();
        let target = base.path().join("雜誌");
        let saved = save_as(&untitled, &target, content()).unwrap();
        let dir = base.path().join(RECOVERY_DIR);
        write(&dir, &saved, content()).unwrap();

        let restored = restore_project(&read(&dir, &saved.id).unwrap()).unwrap();
        assert_eq!(restored.root, target);
        assert_eq!(restored.created_at, saved.created_at);
        assert!(!restored.untitled);

        fs::remove_dir_all(&target).unwrap();
        assert!(matches!(restore_project(&read(&dir, &saved.id).unwrap()), Err(AppError::Io(_))));
    }

    #[test]
    fn restore_untitled_recreates_missing_staging_folder() {
        let base = tempfile::tempdir().unwrap();
        let project = create_untitled(&base.path().join("u")).unwrap();
        let dir = base.path().join(RECOVERY_DIR);
        write(&dir, &project, content()).unwrap();
        fs::remove_dir_all(&project.root).unwrap();
        let restored = restore_project(&read(&dir, &project.id).unwrap()).unwrap();
        assert!(restored.untitled);
        assert!(io::asset_dir(&restored.root).is_dir());
    }
}
