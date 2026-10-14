//! The `typst::World` used for PDF export: an embedded template, a JSON data file and the
//! project's images. Nothing else on disk is reachable from Typst.

use super::document_fonts::ProjectFace;
use super::fonts::BUNDLED_FONTS;
use crate::project::format::{validate_asset_path, ASSET_DIR};
use std::path::{Path, PathBuf};
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook, FontInfo, FontVariant, FontWeight};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

const TEMPLATE: &str = include_str!("template.typ");
pub const DATA_FILE: &str = "data.json";

/// Loads the bundled fonts (Geist + Noto Sans TC, regular and bold).
///
/// Nothing is read from the system, so this cannot fail and the exported files render the same on
/// every machine.
pub fn load_fonts() -> Vec<Font> {
    BUNDLED_FONTS.iter().flat_map(|font| Font::iter(Bytes::new(font.data))).collect()
}

/// The id Typst uses for a project path such as `assets/images/<file>`.
pub(super) fn file_id(path: &str) -> FileId {
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

/// The font book: the bundled fonts as they name themselves, then each project face under the
/// family the editor uses (`project-font-<id>`) and the weight it stands for (400 / 700), whatever
/// the file calls itself (plan step 1: Typst then picks exactly these files, and never fakes bold).
fn font_book(mut fonts: Vec<Font>, project: &[ProjectFace]) -> (Vec<Font>, FontBook) {
    let mut infos: Vec<FontInfo> = fonts.iter().map(|font| font.info().clone()).collect();
    for face in project {
        // 匯入時已確認 Typst 讀得了；讀不了（檔案被換掉）就略過，文字改用後面的後備字型
        let Some(font) = Font::new(face.data.clone(), 0) else { continue };
        let mut info = font.info().clone();
        info.family = face.family.clone();
        info.variant = FontVariant { weight: FontWeight::from_number(if face.bold { 700 } else { 400 }), ..info.variant };
        infos.push(info);
        fonts.push(font);
    }
    (fonts, FontBook::from_infos(infos))
}

impl ExportWorld {
    /// Creates a world that renders `data` (the JSON built by `build_data`) with the bundled fonts
    /// plus the document's project fonts.
    pub fn new(root: &Path, data: Vec<u8>, fonts: Vec<Font>, project: &[ProjectFace]) -> Self {
        let (fonts, book) = font_book(fonts, project);
        Self {
            library: LazyHash::new(Library::builder().build()),
            book: LazyHash::new(book),
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
        let world = ExportWorld::new(root.path(), b"{}".to_vec(), Vec::new(), &[]);

        assert_eq!(world.file(file_id(DATA_FILE)).unwrap().as_slice(), b"{}");
        assert_eq!(world.file(file_id("assets/images/a.png")).unwrap().as_slice(), b"png");
        assert!(matches!(world.file(file_id("secret.txt")), Err(FileError::AccessDenied)));
        assert!(matches!(world.file(file_id("assets/images/../secret.txt")), Err(FileError::AccessDenied)));
        assert!(matches!(world.file(file_id("assets/images/missing.png")), Err(FileError::NotFound(_))));
        assert!(world.source(file_id(DATA_FILE)).is_err());
    }
}
