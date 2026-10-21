//! The EPUB container: a ZIP whose first entry is an uncompressed `mimetype`.

use crate::error::AppResult;
use crate::export::archive::{write_zip, Packing};

pub const MIMETYPE: &str = "application/epub+zip";

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
    let mimetype = ("mimetype", MIMETYPE.as_bytes(), Packing::Stored);
    let rest = entries.iter().map(|(path, content)| (path.as_str(), content.as_slice(), Packing::Deflated));
    write_zip(std::iter::once(mimetype).chain(rest), "EPUB")
}
