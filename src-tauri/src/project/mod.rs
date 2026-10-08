//! Project folders: `project.magproj` + `assets/images/`.
//!
//! The frontend never sends file-system paths. Dialogs run on the Rust side and every command
//! operates on the project held in `ProjectState`.

pub mod assets;
pub mod format;
pub mod io;
pub mod library;
pub mod recovery;
pub mod shape;

use crate::error::{AppError, AppResult};
use format::{ProjectContent, ProjectFile, FORMAT_ID, SCHEMA_VERSION};
use library::Library;
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
    /// The project's asset library (`library.json`).
    pub library: Library,
    /// `library.json` could not be read and was rebuilt from the project's images.
    pub library_rebuilt: bool,
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

/// Opens the project folder at `root`, loads (or creates) its asset library and removes asset
/// files that nothing references.
///
/// # Returns
/// The data for the frontend and the project to keep in `ProjectState`.
///
/// # Errors
/// See `io::read_project`; also `AppError::UnsupportedVersion` for a library from a newer app.
pub fn open(root: &Path) -> AppResult<(OpenedProject, OpenProject)> {
    let (file, recovered_from_backup) = io::read_project(root)?;
    let loaded = library::load_or_create(root, &file.assets, &now())?;
    // 素材庫是重建的時候不清理：損壞的檔案裡可能有還沒放到頁面上的素材
    if !loaded.rebuilt {
        // 清理失敗不影響開啟，只是多留幾個沒用到的檔案
        let _ = io::remove_orphan_assets(root, &file, &loaded.library);
    }
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
        library: loaded.library,
        library_rebuilt: loaded.rebuilt,
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
    let json = serde_json::to_string_pretty(&build_file(project, content))?;
    io::write_project_atomic(&project.root, &json)
}

/// Saves content as a new project in `target` (which must not exist or be empty), copying the
/// images it references and the whole asset library (`library.json` and every file it lists).
/// The copy gets a new id, so it is independent of the original.
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
        // 素材庫是立即寫入的，磁碟上的就是最新的；讀不到（沒有或損壞）就不複製
        if let Ok(Some(library)) = library::read(&current.root) {
            io::copy_assets(&current.root, target, library::referenced(&library))?;
            library::write(target, &library)?;
        }
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

    const LIBRARY_FIXTURE: &str = include_str!("../../../tests/fixtures/sample-library.json");

    fn write_files<'a>(root: &Path, sources: impl Iterator<Item = &'a str>) {
        for src in sources {
            let path = root.join(src);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, src).unwrap();
        }
    }

    #[test]
    fn opening_an_old_project_creates_its_library() {
        let base = tempfile::tempdir().unwrap();
        let project = create_untitled(base.path()).unwrap();
        let content = fixture_content();
        save(&project, content.clone()).unwrap();
        assert!(!project.root.join(library::LIBRARY_FILE_NAME).exists());

        let (opened, _) = open(&project.root).unwrap();
        assert!(!opened.library_rebuilt);
        let sources: Vec<_> = library::referenced(&opened.library).collect();
        assert_eq!(sources, [content.assets[0].src.as_str()]);
        assert_eq!(library::read(&project.root).unwrap(), Some(opened.library.clone()));
        // 再開一次讀回同一份（id 不會每次重新產生）
        let (again, _) = open(&project.root).unwrap();
        assert_eq!(again.library, opened.library);
    }

    #[test]
    fn library_files_survive_open_and_follow_save_as() {
        let base = tempfile::tempdir().unwrap();
        let project = create_untitled(&base.path().join("untitled")).unwrap();
        let content = fixture_content();
        let library = library::parse_library(LIBRARY_FIXTURE).unwrap();
        save(&project, content.clone()).unwrap();
        library::write(&project.root, &library).unwrap();
        write_files(&project.root, library::referenced(&library));

        // 只在素材庫裡的檔案（含垃圾桶），開檔清理後還在
        let (opened, current) = open(&project.root).unwrap();
        assert_eq!(opened.library, library);
        assert!(library::referenced(&library).all(|src| project.root.join(src).exists()));

        let target = base.path().join("另存");
        save_as(&current, &target, content).unwrap();
        assert_eq!(library::read(&target).unwrap(), Some(library.clone()));
        for src in library::referenced(&library) {
            assert_eq!(std::fs::read_to_string(target.join(src)).unwrap(), src);
        }
    }

    #[test]
    fn damaged_library_is_rebuilt_without_cleaning() {
        let base = tempfile::tempdir().unwrap();
        let project = create_untitled(base.path()).unwrap();
        save(&project, fixture_content()).unwrap();
        let library = library::parse_library(LIBRARY_FIXTURE).unwrap();
        write_files(&project.root, library::referenced(&library));
        std::fs::write(project.root.join(library::LIBRARY_FILE_NAME), "{ broken").unwrap();

        let (opened, _) = open(&project.root).unwrap();
        assert!(opened.library_rebuilt);
        assert_eq!(opened.library.items.len(), 1);
        // 損壞的素材庫可能還引用這些檔案，這次不清理
        assert!(library::referenced(&library).all(|src| project.root.join(src).exists()));
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
