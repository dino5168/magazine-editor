//! PDF export commands, in two steps so the frontend can show progress only while rendering:
//! `export_pdf_choose_path` asks where to save (the path stays on the Rust side), then
//! `export_pdf` renders the document and the editor's text layout to that path.

use super::project::default_projects_dir;
use crate::error::{AppError, AppResult};
use crate::export::{self, world, ExportRequest};
use crate::project::{io, ProjectState};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use typst::text::Font;

const FALLBACK_FILE_NAME: &str = "雜誌";

#[derive(Default)]
pub struct ExportState {
    /// Loaded on the first export; reading the ~40 MB of Microsoft JhengHei again each time is wasteful.
    fonts: Mutex<Option<Arc<Vec<Font>>>>,
    /// Chosen by `export_pdf_choose_path`, consumed by `export_pdf`.
    pending: Mutex<Option<PathBuf>>,
    last_export: Mutex<Option<PathBuf>>,
}

impl ExportState {
    fn fonts(&self) -> AppResult<Arc<Vec<Font>>> {
        let mut slot = self.fonts.lock().map_err(|_| AppError::LockPoisoned)?;
        if let Some(fonts) = slot.as_ref() {
            return Ok(Arc::clone(fonts));
        }
        let fonts = Arc::new(world::load_fonts(&world::system_font_dir())?);
        *slot = Some(Arc::clone(&fonts));
        Ok(fonts)
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

/// Asks where to save the PDF. Returns the chosen file name, or `None` when the user cancels.
#[tauri::command]
pub async fn export_pdf_choose_path(
    app: AppHandle,
    window: WebviewWindow,
    project: State<'_, ProjectState>,
    exports: State<'_, ExportState>,
    suggested_name: String,
) -> AppResult<Option<String>> {
    let current = project.current()?;
    // 已存檔的專案預設存到專案資料夾；未命名專案的資料夾是暫存區，改用「文件\雜誌編輯軟體」
    let directory = if current.untitled { default_projects_dir(&app) } else { Some(current.root.clone()) };
    let file_name = io::sanitize_folder_name(&suggested_name).unwrap_or_else(|_| FALLBACK_FILE_NAME.to_owned());
    let mut dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("匯出 PDF")
        .set_file_name(format!("{file_name}.pdf"))
        .add_filter("PDF", &["pdf"]);
    if let Some(directory) = directory {
        dialog = dialog.set_directory(directory);
    }
    let Some(picked) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let mut path = picked.into_path().map_err(|_| AppError::invalid_input("無法使用選取的位置"))?;
    if !path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("pdf")) {
        path.set_extension("pdf");
    }
    let name = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    *exports.pending.lock().map_err(|_| AppError::LockPoisoned)? = Some(path);
    Ok(Some(name))
}

/// Renders every page with Typst and writes the PDF to the path chosen by
/// `export_pdf_choose_path`.
#[tauri::command]
pub async fn export_pdf(
    project: State<'_, ProjectState>,
    exports: State<'_, ExportState>,
    request: ExportRequest,
) -> AppResult<ExportResult> {
    let path = exports
        .pending
        .lock()
        .map_err(|_| AppError::LockPoisoned)?
        .take()
        .ok_or_else(|| AppError::invalid_input("請先選擇 PDF 的儲存位置"))?;
    let fonts = exports.fonts()?;
    let root = project.current()?.root;
    // Typst 排版是 CPU 密集工作，放到 blocking 執行緒，避免佔住 async runtime
    let output = tauri::async_runtime::spawn_blocking(move || export::render_pdf(&root, &request, fonts.to_vec()))
        .await
        .map_err(|error| AppError::Export(format!("匯出中斷：{error}")))??;
    write_atomic(&path, &output.pdf)?;
    *exports.last_export.lock().map_err(|_| AppError::LockPoisoned)? = Some(path);
    Ok(ExportResult { pages: output.pages, skipped_images: output.skipped_images })
}

/// Opens the most recently exported PDF with the default viewer.
#[tauri::command]
pub async fn export_open_last(app: AppHandle, exports: State<'_, ExportState>) -> AppResult<()> {
    let path = exports
        .last_export
        .lock()
        .map_err(|_| AppError::LockPoisoned)?
        .clone()
        .ok_or_else(|| AppError::invalid_input("還沒有匯出過 PDF"))?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|error| AppError::Export(format!("無法開啟 PDF：{error}")))
}
