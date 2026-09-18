//! Disk operations on a project folder.

use super::format::{self, ProjectFile, ASSET_DIR, PROJECT_FILE_NAME};
use crate::error::{AppError, AppResult};
use std::collections::HashSet;
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

const MAX_FOLDER_NAME_CHARS: usize = 100;
const WINDOWS_RESERVED_NAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1",
    "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn sibling(root: &Path, suffix: &str) -> PathBuf {
    root.join(format!("{PROJECT_FILE_NAME}{suffix}"))
}

/// Returns `<root>/assets/images`.
pub fn asset_dir(root: &Path) -> PathBuf {
    root.join(ASSET_DIR)
}

/// Writes `project.magproj` so that a crash never leaves a truncated file behind.
///
/// The new content goes to `.tmp` and is flushed first; the previous version is copied to `.bak`;
/// finally `.tmp` replaces the project file with a single rename (atomic on NTFS).
///
/// # Errors
/// Returns `AppError::Io` on any file-system failure.
pub fn write_project_atomic(root: &Path, json: &str) -> AppResult<()> {
    let target = root.join(PROJECT_FILE_NAME);
    let tmp = sibling(root, ".tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(json.as_bytes())?;
        file.sync_all()?;
    }
    // 用 copy 而非 rename 保留舊版：任何時間點 project.magproj 都存在
    if target.exists() {
        fs::copy(&target, sibling(root, ".bak"))?;
    }
    fs::rename(&tmp, &target)?;
    Ok(())
}

/// Reads a project folder, falling back to `project.magproj.bak` when the main file is damaged.
///
/// # Returns
/// The parsed project and whether it came from the backup.
///
/// # Errors
/// - `AppError::UnsupportedVersion` is returned as-is (the backup would be the same version).
/// - Otherwise the main file's error when the backup is missing or also invalid.
pub fn read_project(root: &Path) -> AppResult<(ProjectFile, bool)> {
    let main_error = match read_file(&root.join(PROJECT_FILE_NAME)) {
        Ok(project) => return Ok((project, false)),
        Err(error @ AppError::UnsupportedVersion(_)) => return Err(error),
        Err(error) => error,
    };
    match read_file(&sibling(root, ".bak")) {
        Ok(project) => Ok((project, true)),
        Err(_) => Err(main_error),
    }
}

fn read_file(path: &Path) -> AppResult<ProjectFile> {
    let json = fs::read_to_string(path)?;
    format::parse_project(&json)
}

/// Creates an empty project folder with its `assets/images` directory.
///
/// # Errors
/// Returns `AppError::InvalidInput` when the folder already exists and is not empty.
pub fn create_project_dir(root: &Path) -> AppResult<()> {
    match fs::read_dir(root) {
        Ok(mut entries) => {
            if entries.next().is_some() {
                return Err(AppError::invalid_input(format!(
                    "資料夾「{}」已存在而且不是空的，請換一個專案名稱",
                    root.display()
                )));
            }
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    fs::create_dir_all(asset_dir(root))?;
    Ok(())
}

/// Copies the given project-relative assets from one project folder to another.
/// Missing source files are skipped (the element then shows a placeholder, as before).
///
/// # Errors
/// Returns `AppError::InvalidProject` for unsafe paths and `AppError::Io` on copy failure.
pub fn copy_assets<'a>(from: &Path, to: &Path, sources: impl Iterator<Item = &'a str>) -> AppResult<()> {
    fs::create_dir_all(asset_dir(to))?;
    let unique: HashSet<&str> = sources.collect();
    for src in unique {
        format::validate_asset_path(src)?;
        match fs::copy(from.join(src), to.join(src)) {
            Ok(_) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

/// Deletes images in `assets/images` that the project no longer references, plus leftover temp
/// files. Only called right after opening, when the undo history is empty and nothing else can
/// bring a deleted image back.
///
/// # Returns
/// Number of files removed.
///
/// # Errors
/// Returns `AppError::Io` when the directory cannot be listed.
pub fn remove_orphan_assets(root: &Path, project: &ProjectFile) -> AppResult<usize> {
    let dir = asset_dir(root);
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error.into()),
    };
    let keep: HashSet<String> = format::referenced_assets(&project.document, &project.assets)
        .filter_map(|src| src.rsplit('/').next())
        .map(str::to_owned)
        .collect();
    let mut removed = 0;
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !keep.contains(&name) && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

/// Turns a user-entered project name into a valid Windows folder name.
///
/// # Errors
/// Returns `AppError::InvalidInput` when nothing usable is left.
pub fn sanitize_folder_name(name: &str) -> AppResult<String> {
    let replaced: String = name
        .trim()
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { '_' } else { c })
        .take(MAX_FOLDER_NAME_CHARS)
        .collect();
    // Windows 會自動去掉結尾的句點與空白，事先處理才能讓建立的資料夾名稱和預期一致
    let trimmed = replaced.trim_end_matches(['.', ' ']).trim_start();
    if trimmed.is_empty() {
        return Err(AppError::invalid_input("專案名稱不可為空白"));
    }
    let stem = trimmed.split('.').next().unwrap_or(trimmed);
    if WINDOWS_RESERVED_NAMES.iter().any(|reserved| reserved.eq_ignore_ascii_case(stem)) {
        return Ok(format!("{trimmed}_"));
    }
    Ok(trimmed.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::format::parse_project;

    const FIXTURE: &str = include_str!("../../../tests/fixtures/sample.magproj");

    #[test]
    fn atomic_write_keeps_previous_version_as_backup() {
        let dir = tempfile::tempdir().unwrap();
        write_project_atomic(dir.path(), "first").unwrap();
        write_project_atomic(dir.path(), "second").unwrap();
        assert_eq!(fs::read_to_string(dir.path().join(PROJECT_FILE_NAME)).unwrap(), "second");
        assert_eq!(fs::read_to_string(sibling(dir.path(), ".bak")).unwrap(), "first");
        assert!(!sibling(dir.path(), ".tmp").exists());
    }

    #[test]
    fn read_falls_back_to_backup_when_main_file_is_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        write_project_atomic(dir.path(), FIXTURE).unwrap();
        write_project_atomic(dir.path(), "{ truncated").unwrap();
        let (project, from_backup) = read_project(dir.path()).unwrap();
        assert!(from_backup);
        assert_eq!(project.document.name, "範例雜誌");
    }

    #[test]
    fn read_reports_main_error_without_backup() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(PROJECT_FILE_NAME), "{").unwrap();
        assert!(matches!(read_project(dir.path()), Err(AppError::InvalidProject(_))));
        let empty = tempfile::tempdir().unwrap();
        assert!(matches!(read_project(empty.path()), Err(AppError::Io(_))));
    }

    #[test]
    fn create_project_dir_rejects_non_empty_folder() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("新專案");
        create_project_dir(&root).unwrap();
        assert!(asset_dir(&root).is_dir());
        assert!(create_project_dir(&root).is_err());
    }

    #[test]
    fn remove_orphan_assets_keeps_referenced_files() {
        let dir = tempfile::tempdir().unwrap();
        let project = parse_project(FIXTURE).unwrap();
        fs::create_dir_all(asset_dir(dir.path())).unwrap();
        let used = dir.path().join(&project.assets[0].src);
        fs::write(&used, b"x").unwrap();
        fs::write(asset_dir(dir.path()).join("orphan.png"), b"x").unwrap();
        fs::write(asset_dir(dir.path()).join("half.png.tmp"), b"x").unwrap();
        assert_eq!(remove_orphan_assets(dir.path(), &project).unwrap(), 2);
        assert!(used.exists());
    }

    #[test]
    fn copy_assets_copies_and_skips_missing() {
        let from = tempfile::tempdir().unwrap();
        let to = tempfile::tempdir().unwrap();
        fs::create_dir_all(asset_dir(from.path())).unwrap();
        fs::write(asset_dir(from.path()).join("a.png"), b"a").unwrap();
        let sources = ["assets/images/a.png", "assets/images/missing.png", "assets/images/a.png"];
        copy_assets(from.path(), to.path(), sources.into_iter()).unwrap();
        assert_eq!(fs::read(asset_dir(to.path()).join("a.png")).unwrap(), b"a");
        assert!(copy_assets(from.path(), to.path(), ["../x.png"].into_iter()).is_err());
    }

    #[test]
    fn sanitize_folder_name_handles_windows_rules() {
        assert_eq!(sanitize_folder_name("  我的雜誌  ").unwrap(), "我的雜誌");
        assert_eq!(sanitize_folder_name("a<b>:c\"d/e\\f|g?h*").unwrap(), "a_b__c_d_e_f_g_h_");
        assert_eq!(sanitize_folder_name("雜誌. . ").unwrap(), "雜誌");
        assert_eq!(sanitize_folder_name("con").unwrap(), "con_");
        assert_eq!(sanitize_folder_name("LPT1.txt").unwrap(), "LPT1.txt_");
        assert!(sanitize_folder_name(" . ").is_err());
        assert_eq!(sanitize_folder_name(&"字".repeat(150)).unwrap().chars().count(), MAX_FOLDER_NAME_CHARS);
    }
}
