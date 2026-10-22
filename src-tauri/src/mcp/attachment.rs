//! 匯入素材用的附件：`import_library_item` 的 `path` 只在這裡讀（Rust），前端只拿得到這一次呼叫
//! 讀好的位元組（`mcp_take_attachment(token)`）。
//!
//! WebView 因此沒有「讀任意路徑」的能力（「前端不傳路徑給 Rust」）；token 放在 `args` 外面，
//! AI 也不能自己編一個。內容的真正檢查（檔頭、SVG）照舊在 `library_import`（`assets::import_asset`）。

use crate::project::assets::MAX_ASSET_BYTES;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;

/// The only tool whose arguments name a file.
pub const IMPORT_TOOL: &str = "import_library_item";

/// Image extensions the library accepts (`KIND_OF_EXTENSION` in `src/lib/library/library-files.ts`).
const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

/// A file read for one tool call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Attachment {
    /// File name with extension (the frontend derives the item name and kind from it).
    pub file_name: String,
    pub bytes: Vec<u8>,
}

/// What the frontend receives next to `args` in `mcp://request`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRef {
    pub token: String,
    pub file_name: String,
}

/// Reads the file named by the `path` argument of `import_library_item`.
///
/// # Returns
/// `Ok(None)` when `path` is missing or not a string (the frontend's schema then explains the
/// problem), `Ok(Some(_))` with the file, or `Err` with a Chinese message for the model.
pub fn read_import(args: &Value) -> Result<Option<Attachment>, String> {
    let Some(raw) = args.get("path").and_then(Value::as_str) else {
        return Ok(None);
    };
    let path = Path::new(raw);
    // Windows 的 `C:foo`、`\foo` 不是絕對路徑：會依 App 的工作目錄解讀，和 Claude Code 的不同
    if !path.is_absolute() {
        return Err(format!("path 必須是絕對路徑（例如 C:\\Users\\me\\Pictures\\photo.png）：{raw}"));
    }
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!("只能匯入圖片（PNG、JPEG、WebP、GIF、SVG）：{raw}"));
    }
    let metadata = fs::metadata(path).map_err(|_| format!("找不到檔案：{raw}"))?;
    if !metadata.is_file() {
        return Err(format!("不是檔案：{raw}"));
    }
    // 先看大小再讀，太大的檔案不整份讀進記憶體
    if metadata.len() > MAX_ASSET_BYTES as u64 {
        return Err(format!("圖片超過 20 MB 上限：{raw}"));
    }
    let bytes = fs::read(path).map_err(|error| format!("無法讀取檔案 {raw}：{error}"))?;
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(format!("圖片超過 20 MB 上限：{raw}"));
    }
    let file_name = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(Some(Attachment { file_name, bytes }))
}

/// Attachments of the calls waiting for the frontend, by token. Each is taken at most once and
/// removed when its call is answered or times out, so nothing accumulates.
#[derive(Default)]
pub struct Attachments {
    stored: Mutex<HashMap<String, Vec<u8>>>,
}

impl Attachments {
    /// Keeps the bytes until `take` or `remove`; returns what goes into the event.
    pub fn insert(&self, attachment: Attachment) -> AttachmentRef {
        let token = uuid::Uuid::new_v4().to_string();
        self.lock().insert(token.clone(), attachment.bytes);
        AttachmentRef { token, file_name: attachment.file_name }
    }

    /// The bytes for `token`, once.
    pub fn take(&self, token: &str) -> Option<Vec<u8>> {
        self.lock().remove(token)
    }

    pub fn remove(&self, token: &str) {
        self.lock().remove(token);
    }

    // 鎖只保護 HashMap 的插入與移除；中毒時沿用內容即可
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Vec<u8>>> {
        self.stored.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn path_arg(path: &Path) -> Value {
        json!({ "path": path.to_string_lossy() })
    }

    #[test]
    fn reads_an_image_by_absolute_path() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("封面.PNG");
        fs::write(&file, b"\x89PNG data").unwrap();
        let attachment = read_import(&path_arg(&file)).unwrap().unwrap();
        assert_eq!(attachment, Attachment { file_name: "封面.PNG".into(), bytes: b"\x89PNG data".to_vec() });
    }

    #[test]
    fn leaves_a_missing_or_non_string_path_to_the_frontend() {
        assert_eq!(read_import(&json!({})), Ok(None));
        assert_eq!(read_import(&json!({ "path": 3 })), Ok(None));
    }

    #[test]
    fn refuses_relative_paths_folders_and_other_kinds() {
        let dir = tempfile::tempdir().unwrap();
        for relative in ["photo.png", r"images\photo.png", r"\photo.png", "C:photo.png"] {
            let error = read_import(&json!({ "path": relative })).unwrap_err();
            assert!(error.contains("絕對路徑"), "{relative}: {error}");
        }
        let folder = dir.path().join("folder.png");
        fs::create_dir(&folder).unwrap();
        assert!(read_import(&path_arg(&folder)).unwrap_err().contains("不是檔案"));
        let text = dir.path().join("note.txt");
        fs::write(&text, "x").unwrap();
        assert!(read_import(&path_arg(&text)).unwrap_err().contains("只能匯入圖片"));
        let no_extension = dir.path().join("photo");
        fs::write(&no_extension, "x").unwrap();
        assert!(read_import(&path_arg(&no_extension)).unwrap_err().contains("只能匯入圖片"));
        assert!(read_import(&path_arg(&dir.path().join("missing.png"))).unwrap_err().contains("找不到檔案"));
    }

    #[test]
    fn refuses_files_over_the_limit_without_reading_them() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("big.jpg");
        fs::File::create(&file).unwrap().set_len(MAX_ASSET_BYTES as u64 + 1).unwrap();
        assert!(read_import(&path_arg(&file)).unwrap_err().contains("20 MB"));
        fs::File::create(&file).unwrap().set_len(MAX_ASSET_BYTES as u64).unwrap();
        assert_eq!(read_import(&path_arg(&file)).unwrap().unwrap().bytes.len(), MAX_ASSET_BYTES);
    }

    #[test]
    fn an_attachment_is_taken_once() {
        let attachments = Attachments::default();
        let reference = attachments.insert(Attachment { file_name: "a.png".into(), bytes: vec![1, 2] });
        assert_eq!(reference.file_name, "a.png");
        assert_eq!(attachments.take(&reference.token), Some(vec![1, 2]));
        assert_eq!(attachments.take(&reference.token), None);
        assert_eq!(attachments.take("made-up"), None);
        let other = attachments.insert(Attachment { file_name: "b.png".into(), bytes: vec![3] });
        attachments.remove(&other.token);
        assert_eq!(attachments.take(&other.token), None);
    }

    #[test]
    fn the_event_uses_camel_case() {
        let reference = AttachmentRef { token: "t".into(), file_name: "a.png".into() };
        assert_eq!(serde_json::to_value(reference).unwrap(), json!({ "token": "t", "fileName": "a.png" }));
    }
}
