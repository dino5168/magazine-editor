//! Export commands, in two steps so the frontend can show progress only while rendering:
//! `export_choose_path` asks where to save (the path stays on the Rust side), then
//! `export_pdf` / `export_flipbook` render the document and the editor's text layout to that path.

use super::project::default_projects_dir;
use crate::error::{AppError, AppResult};
use crate::export::{self, flipbook, world, ExportRequest};
use crate::project::{io, ProjectState};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use typst::text::Font;

const FALLBACK_FILE_NAME: &str = "雜誌";

/// Output formats with a save dialog. EPUB joins here once it is wired up.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    /// One `.pdf` file.
    Pdf,
    /// A folder with `index.html` (HTML5 flip book).
    Flipbook,
}

impl ExportFormat {
    fn dialog_title(self) -> &'static str {
        match self {
            Self::Pdf => "匯出 PDF",
            Self::Flipbook => "匯出翻頁電子書（輸入資料夾名稱）",
        }
    }
}

#[derive(Default)]
pub struct ExportState {
    /// Parsed on the first export; re-parsing the ~11 MB of Noto Sans TC each time is wasteful.
    fonts: OnceLock<Arc<Vec<Font>>>,
    /// Chosen by `export_choose_path`, consumed by the export of the same format.
    pending: Mutex<Option<(ExportFormat, PathBuf)>>,
    /// What `export_open_last` opens: the PDF, or the flip book's `index.html`.
    last_export: Mutex<Option<PathBuf>>,
}

impl ExportState {
    fn fonts(&self) -> Arc<Vec<Font>> {
        Arc::clone(self.fonts.get_or_init(|| Arc::new(world::load_fonts())))
    }

    /// Takes the path chosen for `format`.
    fn take_pending(&self, format: ExportFormat) -> AppResult<PathBuf> {
        match self.pending.lock().map_err(|_| AppError::LockPoisoned)?.take() {
            Some((chosen, path)) if chosen == format => Ok(path),
            _ => Err(AppError::invalid_input("請先選擇儲存位置")),
        }
    }

    fn set_last_export(&self, path: PathBuf) -> AppResult<()> {
        *self.last_export.lock().map_err(|_| AppError::LockPoisoned)? = Some(path);
        Ok(())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub pages: usize,
    pub skipped_images: usize,
}

fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = path.with_extension("pdf.tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// The flip book's folder for what the user typed in the save dialog: an `.html` / `.htm` the user
/// may have added is dropped, the rest is the folder name.
fn flipbook_folder(picked: PathBuf) -> PathBuf {
    let is_html = picked.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("html") || ext.eq_ignore_ascii_case("htm"));
    if is_html {
        picked.with_extension("")
    } else {
        picked
    }
}

/// Asks where to save. Returns the chosen file or folder name, or `None` when the user cancels.
///
/// PDF: a file. Flip book: the name typed in the save dialog becomes a new folder (like "save
/// as"), which must not exist yet or be empty.
#[tauri::command]
pub async fn export_choose_path(
    app: AppHandle,
    window: WebviewWindow,
    project: State<'_, ProjectState>,
    exports: State<'_, ExportState>,
    format: ExportFormat,
    suggested_name: String,
) -> AppResult<Option<String>> {
    let current = project.current()?;
    // 已存檔的專案預設存到專案資料夾；未命名專案的資料夾是暫存區，改用「文件\雜誌編輯軟體」
    let directory = if current.untitled { default_projects_dir(&app) } else { Some(current.root.clone()) };
    let file_name = io::sanitize_folder_name(&suggested_name).unwrap_or_else(|_| FALLBACK_FILE_NAME.to_owned());
    let mut dialog = app.dialog().file().set_parent(&window).set_title(format.dialog_title());
    dialog = match format {
        ExportFormat::Pdf => dialog.set_file_name(format!("{file_name}.pdf")).add_filter("PDF", &["pdf"]),
        // 資料夾沒有副檔名；不加 filter，對話框才不會自己補上
        ExportFormat::Flipbook => dialog.set_file_name(format!("{file_name} 翻頁書")),
    };
    if let Some(directory) = directory {
        dialog = dialog.set_directory(directory);
    }
    let Some(picked) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let picked = picked.into_path().map_err(|_| AppError::invalid_input("無法使用選取的位置"))?;
    let path = match format {
        ExportFormat::Pdf => {
            let mut path = picked;
            if !path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("pdf")) {
                path.set_extension("pdf");
            }
            path
        }
        ExportFormat::Flipbook => {
            let folder = flipbook_folder(picked);
            // 先檢查，使用者不用等排版完才知道名稱不能用（寫入前會再檢查一次）
            flipbook::check_target(&folder)?;
            folder
        }
    };
    let name = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    *exports.pending.lock().map_err(|_| AppError::LockPoisoned)? = Some((format, path));
    Ok(Some(name))
}

/// Renders every page with Typst and writes the PDF to the path chosen by `export_choose_path`.
#[tauri::command]
pub async fn export_pdf(
    project: State<'_, ProjectState>,
    exports: State<'_, ExportState>,
    request: ExportRequest,
) -> AppResult<ExportResult> {
    let path = exports.take_pending(ExportFormat::Pdf)?;
    let fonts = exports.fonts();
    let root = project.current()?.root;
    // Typst 排版是 CPU 密集工作，放到 blocking 執行緒，避免佔住 async runtime
    let output = tauri::async_runtime::spawn_blocking(move || export::render_pdf(&root, &request, fonts.to_vec()))
        .await
        .map_err(|error| AppError::Export(format!("匯出中斷：{error}")))??;
    write_atomic(&path, &output.bytes)?;
    exports.set_last_export(path)?;
    Ok(ExportResult { pages: output.pages, skipped_images: output.skipped_images })
}

/// Builds the HTML5 flip book and writes it as the folder chosen by `export_choose_path`.
#[tauri::command]
pub async fn export_flipbook(
    project: State<'_, ProjectState>,
    exports: State<'_, ExportState>,
    request: ExportRequest,
) -> AppResult<ExportResult> {
    let folder = exports.take_pending(ExportFormat::Flipbook)?;
    let root = project.current()?.root;
    let target = folder.clone();
    // 讀圖片、複製字型（十幾 MB）與寫檔都在 blocking 執行緒
    let output = tauri::async_runtime::spawn_blocking(move || -> AppResult<flipbook::FlipbookOutput> {
        let output = flipbook::build_flipbook(&root, &request)?;
        flipbook::write_folder(&target, &output.files)?;
        Ok(output)
    })
    .await
    .map_err(|error| AppError::Export(format!("匯出中斷：{error}")))??;
    exports.set_last_export(folder.join("index.html"))?;
    Ok(ExportResult { pages: output.pages, skipped_images: output.skipped_images })
}

/// Opens the most recent export with the default app (PDF viewer, or the browser for a flip book).
#[tauri::command]
pub async fn export_open_last(app: AppHandle, exports: State<'_, ExportState>) -> AppResult<()> {
    let path = exports
        .last_export
        .lock()
        .map_err(|_| AppError::LockPoisoned)?
        .clone()
        .ok_or_else(|| AppError::invalid_input("還沒有匯出過檔案"))?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|error| AppError::Export(format!("無法開啟匯出的檔案：{error}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_format_names_match_the_frontend() {
        assert_eq!(serde_json::from_str::<ExportFormat>(r#""pdf""#).unwrap(), ExportFormat::Pdf);
        assert_eq!(serde_json::from_str::<ExportFormat>(r#""flipbook""#).unwrap(), ExportFormat::Flipbook);
        assert!(serde_json::from_str::<ExportFormat>(r#""epub""#).is_err());
    }

    #[test]
    fn pending_path_only_serves_its_own_format() {
        let state = ExportState::default();
        *state.pending.lock().unwrap() = Some((ExportFormat::Flipbook, PathBuf::from("book")));
        assert!(matches!(state.take_pending(ExportFormat::Pdf), Err(AppError::InvalidInput(_))));
        // 格式不符也會用掉（不能拿 PDF 的位置去寫翻頁書）
        assert!(state.take_pending(ExportFormat::Flipbook).is_err());
        *state.pending.lock().unwrap() = Some((ExportFormat::Flipbook, PathBuf::from("book")));
        assert_eq!(state.take_pending(ExportFormat::Flipbook).unwrap(), PathBuf::from("book"));
    }

    #[test]
    fn flipbook_folder_drops_an_html_extension() {
        assert_eq!(flipbook_folder(PathBuf::from(r"C:\out\雜誌.html")), PathBuf::from(r"C:\out\雜誌"));
        assert_eq!(flipbook_folder(PathBuf::from(r"C:\out\雜誌.HTM")), PathBuf::from(r"C:\out\雜誌"));
        assert_eq!(flipbook_folder(PathBuf::from(r"C:\out\雜誌 翻頁書")), PathBuf::from(r"C:\out\雜誌 翻頁書"));
        assert_eq!(flipbook_folder(PathBuf::from(r"C:\out\v1.2")), PathBuf::from(r"C:\out\v1.2"));
    }
}
