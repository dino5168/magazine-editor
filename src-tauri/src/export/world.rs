//! The `typst::World` used for PDF export: an embedded template, a JSON data file and the
//! project's images. Nothing else on disk is reachable from Typst.

use crate::project::format::{validate_asset_path, ASSET_DIR};
use std::path::{Path, PathBuf};
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

const TEMPLATE: &str = include_str!("template.typ");
pub const DATA_FILE: &str = "data.json";

/// The same four files `src/index.css` loads with `@font-face`; see `fonts/README.md` for why the
/// canvas and the exporters must share them byte for byte.
static BUNDLED_FONTS: &[&[u8]] = &[
    include_bytes!("../../../fonts/Geist-Regular.ttf"),
    include_bytes!("../../../fonts/Geist-Bold.ttf"),
    include_bytes!("../../../fonts/NotoSansTC-Regular.otf"),
    include_bytes!("../../../fonts/NotoSansTC-Bold.otf"),
];

/// Loads the bundled fonts (Geist + Noto Sans TC, regular and bold).
///
/// Nothing is read from the system, so this cannot fail and the exported files render the same on
/// every machine.
pub fn load_fonts() -> Vec<Font> {
    BUNDLED_FONTS.iter().flat_map(|data| Font::iter(Bytes::new(*data))).collect()
}

fn file_id(path: &str) -> FileId {
    // 內部固定的路徑一定合法
    let vpath = VirtualPath::new(path).expect("valid internal virtual path");
    RootedPath::new(VirtualRoot::Project, vpath).intern()
}

pub struct ExportWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main: Source,
    data: Bytes,
    /// Project folder; only `assets/images/*` inside it can be read.
    root: PathBuf,
}

impl ExportWorld {
    /// Creates a world that renders `data` (the JSON built by `build_data`).
    pub fn new(root: &Path, data: Vec<u8>, fonts: Vec<Font>) -> Self {
        Self {
            library: LazyHash::new(Library::builder().build()),
            book: LazyHash::new(FontBook::from_fonts(&fonts)),
            fonts,
            main: Source::new(file_id("main.typ"), TEMPLATE.to_owned()),
            data: Bytes::new(data),
            root: root.to_path_buf(),
        }
    }

    fn read_asset(&self, path: &str) -> FileResult<Bytes> {
        // 與專案檔相同的檢查：只能是 assets/images/<檔名>，擋掉 ../ 與絕對路徑
        validate_asset_path(path).map_err(|_| FileError::AccessDenied)?;
        let full = self.root.join(path);
        std::fs::read(&full).map(Bytes::new).map_err(|error| FileError::from_io(error, &full))
    }
}

impl World for ExportWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main.id()
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main.id() {
            Ok(self.main.clone())
        } else {
            Err(FileError::NotSource)
        }
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        let rooted = id.get();
        if !matches!(rooted.root(), VirtualRoot::Project) {
            return Err(FileError::AccessDenied);
        }
        let path = rooted.vpath().get_without_slash();
        if path == DATA_FILE {
            Ok(self.data.clone())
        } else if path.starts_with(ASSET_DIR) {
            self.read_asset(path)
        } else {
            Err(FileError::AccessDenied)
        }
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        // 模板不使用日期
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_data_and_project_images_are_readable() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join(ASSET_DIR)).unwrap();
        std::fs::write(root.path().join(ASSET_DIR).join("a.png"), b"png").unwrap();
        std::fs::write(root.path().join("secret.txt"), b"x").unwrap();
        let world = ExportWorld::new(root.path(), b"{}".to_vec(), Vec::new());

        assert_eq!(world.file(file_id(DATA_FILE)).unwrap().as_slice(), b"{}");
        assert_eq!(world.file(file_id("assets/images/a.png")).unwrap().as_slice(), b"png");
        assert!(matches!(world.file(file_id("secret.txt")), Err(FileError::AccessDenied)));
        assert!(matches!(world.file(file_id("assets/images/../secret.txt")), Err(FileError::AccessDenied)));
        assert!(matches!(world.file(file_id("assets/images/missing.png")), Err(FileError::NotFound(_))));
        assert!(world.source(file_id(DATA_FILE)).is_err());
    }
}
