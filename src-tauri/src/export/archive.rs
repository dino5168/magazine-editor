//! ZIP archives shared by the formats that are one: EPUB and PowerPoint.

use crate::error::{AppError, AppResult};
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// How one entry is written.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Packing {
    /// As is: entries that must be read without inflating (EPUB `mimetype`), or are already
    /// compressed (PNG, JPEG).
    Stored,
    Deflated,
}

/// Writes a ZIP archive, entries in the given order.
///
/// # Args
/// * `entries` - `(path inside the archive, content, packing)`.
/// * `format_name` - Shown in the error message ("EPUB", "PowerPoint").
///
/// # Errors
/// `AppError::Export` when the archive cannot be written.
pub fn write_zip<'a>(entries: impl IntoIterator<Item = (&'a str, &'a [u8], Packing)>, format_name: &str) -> AppResult<Vec<u8>> {
    let error = |error: zip::result::ZipError| AppError::Export(format!("無法產生 {format_name} 檔案：{error}"));
    let io_error = |error: std::io::Error| AppError::Export(format!("無法產生 {format_name} 檔案：{error}"));
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    for (path, content, packing) in entries {
        let method = match packing {
            Packing::Stored => CompressionMethod::Stored,
            Packing::Deflated => CompressionMethod::Deflated,
        };
        zip.start_file(path, SimpleFileOptions::default().compression_method(method)).map_err(error)?;
        zip.write_all(content).map_err(io_error)?;
    }
    Ok(zip.finish().map_err(error)?.into_inner())
}
