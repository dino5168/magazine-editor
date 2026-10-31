//! Pipe 上的訊息格式（橋接程式與 App 共用）：每行一個 JSON，一個請求對一個回應，依序處理。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Longest line accepted on the pipe (bytes). Tool arguments are small; this only stops a client
/// from making the app buffer without limit.
pub const MAX_LINE_BYTES: usize = 1024 * 1024;

/// Longest answer the bridge reads (bytes): a `render_page` picture in base64 (a 2000 px JPEG is far
/// smaller); requests stay limited to `MAX_LINE_BYTES`.
pub const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;

/// One tool call: `{"tool": "get_document", "args": {}}`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolRequest {
    pub tool: String,
    #[serde(default)]
    pub args: Value,
}

/// Result of one tool call. `error` is Chinese and meant for the model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ToolResponse {
    Ok { data: Value },
    Error { error: String },
    /// A picture (`render_page`): base64 bytes, its MIME type and a line describing it.
    #[serde(rename_all = "camelCase")]
    Image { data: String, mime_type: String, text: String },
}

impl ToolResponse {
    pub fn error(message: impl Into<String>) -> Self {
        Self::Error { error: message.into() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_answers_round_trip_in_camel_case() {
        let image = ToolResponse::Image { data: "iVBO".into(), mime_type: "image/png".into(), text: "頁面".into() };
        let json = serde_json::to_value(&image).unwrap();
        assert_eq!(json, serde_json::json!({ "status": "image", "data": "iVBO", "mimeType": "image/png", "text": "頁面" }));
        assert_eq!(serde_json::from_value::<ToolResponse>(json).unwrap(), image);
    }
}
