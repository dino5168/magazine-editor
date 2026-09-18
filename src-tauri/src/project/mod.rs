//! Project folders: `project.magproj` + `assets/images/`.
//!
//! The frontend never sends file-system paths. Dialogs run on the Rust side and every command
//! operates on the project held in `ProjectState`.

pub mod assets;
pub mod format;
pub mod io;

use crate::error::{AppError, AppResult};
use format::{ProjectContent, ProjectFile, FORMAT_ID, SCHEMA_VERSION};
use serde::Serialize;
use serde_json::Map;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

/// The project currently open in the editor.
#[derive(Debug, Clone)]
pub struct OpenProject {
    pub root: PathBuf,
    pub id: String,
    pub created_at: String,
    /// True while the project lives in the untitled staging folder and has never been saved.
    pub untitled: bool,
    extra: Map<String, serde_json::Value>,
}

impl OpenProject {
    pub fn info(&self) -> ProjectInfo {
        ProjectInfo { id: self.id.clone(), root: self.root.to_string_lossy().into_owned(), untitled: self.untitled }
    }
}

#[derive(Default)]
pub struct ProjectState(pub Mutex<Option<OpenProject>>);

impl ProjectState {
    /// Locks the current project slot.
    ///
    /// # Errors
    /// Returns `AppError::LockPoisoned` if a previous holder panicked.
    pub fn lock(&self) -> AppResult<MutexGuard<'_, Option<OpenProject>>> {
        self.0.lock().map_err(|_| AppError::LockPoisoned)
    }

    /// Returns a copy of the open project.
    ///
    /// # Errors
    /// Returns `AppError::NoProject` when nothing is open.
    pub fn current(&self) -> AppResult<OpenProject> {
        self.lock()?.clone().ok_or(AppError::NoProject)
    }
}

/// Project metadata sent to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub id: String,
    /// Absolute folder path; the frontend only uses it to build asset URLs.
    pub root: String,
    pub untitled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedProject {
    pub info: ProjectInfo,
    pub content: ProjectContent,
    /// The main file was damaged and the `.bak` copy was loaded instead.
    pub recovered_from_backup: bool,
}

pub(crate) fn now() -> String {
    // Rfc3339 formatting of a UTC timestamp cannot fail
    OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_default()
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Creates an unsaved project in `<untitled_base>/<id>/`.
///
/// # Errors
/// Returns `AppError::Io` when the folder cannot be created.
pub fn create_untitled(untitled_base: &Path) -> AppResult<OpenProject> {
    let id = new_id();
    let root = untitled_base.join(&id);
    io::create_project_dir(&root)?;
    Ok(OpenProject { root, id, created_at: now(), untitled: true, extra: Map::new() })
}

/// Opens the project folder at `root` and removes unreferenced images.
///
/// # Returns
/// The data for the frontend and the project to keep in `ProjectState`.
///
/// # Errors
/// See `io::read_project`.
pub fn open(root: &Path) -> AppResult<(OpenedProject, OpenProject)> {
    let (file, recovered_from_backup) = io::read_project(root)?;
    // 清理失敗不影響開啟，只是多留幾個沒用到的檔案
    let _ = io::remove_orphan_assets(root, &file);
    let project = OpenProject {
        root: root.to_path_buf(),
        id: file.id,
        created_at: file.created_at,
        untitled: false,
        extra: file.extra,
    };
    let opened = OpenedProject {
        info: project.info(),
        content: ProjectContent { document: file.document, assets: file.assets },
        recovered_from_backup,
    };
    Ok((opened, project))
}

fn build_file(project: &OpenProject, content: ProjectContent) -> ProjectFile {
    ProjectFile {
        format: FORMAT_ID.to_owned(),
        schema_version: SCHEMA_VERSION,
        id: project.id.clone(),
        created_at: project.created_at.clone(),
        modified_at: now(),
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        document: content.document,
        assets: content.assets,
        extra: project.extra.clone(),
    }
}

/// Saves content to the project's own folder.
///
/// # Errors
/// Returns `AppError::InvalidProject` for invalid content, `AppError::Io` on write failure.
pub fn save(project: &OpenProject, content: ProjectContent) -> AppResult<()> {
    format::validate_content(&content.document, &content.assets)?;
    let json = format::to_json(&build_file(project, content))?;
    io::write_project_atomic(&project.root, &json)
}

/// Saves content as a new project in `target` (which must not exist or be empty), copying the
/// images it references. The copy gets a new id, so it is independent of the original.
///
/// # Returns
/// The new project, which becomes the one being edited.
///
/// # Errors
/// Returns `AppError::InvalidInput` when `target` is not empty, plus `save` errors.
pub fn save_as(current: &OpenProject, target: &Path, content: ProjectContent) -> AppResult<OpenProject> {
    format::validate_content(&content.document, &content.assets)?;
    io::create_project_dir(target)?;
    let result = (|| {
        io::copy_assets(
            &current.root,
            target,
            format::referenced_assets(&content.document, &content.assets),
        )?;
        let project = OpenProject {
            root: target.to_path_buf(),
            id: new_id(),
            created_at: now(),
            untitled: false,
            extra: current.extra.clone(),
        };
        save(&project, content)?;
        Ok(project)
    })();
    if result.is_err() {
        // 失敗時移除剛建立的資料夾，避免留下半成品讓下次另存時被判定為「非空資料夾」
        let _ = std::fs::remove_dir_all(target);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../../tests/fixtures/sample.magproj");

    fn fixture_content() -> ProjectContent {
        let file = format::parse_project(FIXTURE).unwrap();
        ProjectContent { document: file.document, assets: file.assets }
    }

    #[test]
    fn untitled_then_save_as_then_reopen() {
        let base = tempfile::tempdir().unwrap();
        let untitled = create_untitled(&base.path().join("untitled")).unwrap();
        assert!(untitled.untitled);
        let content = fixture_content();
        std::fs::write(untitled.root.join(&content.assets[0].src), b"img").unwrap();

        let target = base.path().join("我的雜誌");
        let saved = save_as(&untitled, &target, content.clone()).unwrap();
        assert!(!saved.untitled);
        assert_ne!(saved.id, untitled.id);
        assert!(target.join(&content.assets[0].src).exists());

        let (opened, reopened) = open(&target).unwrap();
        assert_eq!(reopened.id, saved.id);
        assert_eq!(opened.content, content);
        assert!(!opened.recovered_from_backup);
    }

    #[test]
    fn save_rejects_invalid_content_without_touching_disk() {
        let base = tempfile::tempdir().unwrap();
        let project = create_untitled(base.path()).unwrap();
        let mut content = fixture_content();
        content.document.pages.clear();
        assert!(save(&project, content).is_err());
        assert!(!project.root.join(format::PROJECT_FILE_NAME).exists());
    }

    #[test]
    fn save_as_into_non_empty_folder_fails_and_keeps_it() {
        let base = tempfile::tempdir().unwrap();
        let project = create_untitled(&base.path().join("u")).unwrap();
        let target = base.path().join("existing");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("keep.txt"), b"x").unwrap();
        assert!(save_as(&project, &target, fixture_content()).is_err());
        assert!(target.join("keep.txt").exists());
    }
}
