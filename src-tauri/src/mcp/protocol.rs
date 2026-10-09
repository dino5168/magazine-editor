//! Pipe 上的訊息格式（橋接程式與 App 共用）：每行一個 JSON，一個請求對一個回應，依序處理。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Longest line accepted on the pipe (bytes). Tool arguments are small; this only stops a client
/// from making the app buffer without limit.
pub const MAX_LINE_BYTES: usize = 1024 * 1024;

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
}

impl ToolResponse {
    pub fn error(message: impl Into<String>) -> Self {
        Self::Error { error: message.into() }
    }
}
