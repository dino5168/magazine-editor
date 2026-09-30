//! The EPUB container: a ZIP whose first entry is an uncompressed `mimetype`.

use crate::error::{AppError, AppResult};
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

pub const MIMETYPE: &str = "application/epub+zip";

fn zip_error(error: impl std::fmt::Display) -> AppError {
    AppError::Export(format!("無法產生 EPUB 檔案：{error}"))
}

/// Writes the container.
///
/// EPUB requires `mimetype` to be the first entry, stored without compression and without an
/// extra field, so reading systems can recognise the file from its first bytes. Everything else is
/// deflated.
///
/// # Args
/// * `entries` - `(path inside the archive, content)`; `mimetype` is added automatically.
///
/// # Errors
/// `AppError::Export` when the archive cannot be written.
pub fn write_container(entries: &[(String, Vec<u8>)]) -> AppResult<Vec<u8>> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file("mimetype", stored).map_err(zip_error)?;
    zip.write_all(MIMETYPE.as_bytes()).map_err(zip_error)?;
    for (path, content) in entries {
        zip.start_file(path.as_str(), deflated).map_err(zip_error)?;
        zip.write_all(content).map_err(zip_error)?;
    }
    Ok(zip.finish().map_err(zip_error)?.into_inner())
}
