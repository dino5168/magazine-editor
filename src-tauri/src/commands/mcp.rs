//! MCP commands：前端開 / 關 pipe，並把工具的執行結果交回給等待中的呼叫。

use crate::error::{AppError, AppResult};
use crate::mcp::protocol::ToolResponse;
use crate::mcp::McpState;
use tauri::ipc::Response;
use tauri::{AppHandle, State};

/// Starts or stops listening for the MCP bridge. The frontend calls it once its event listener
/// is ready, so no request is emitted before someone can answer it.
// async：建立 pipe 需要在 tokio runtime 裡
#[tauri::command]
pub async fn mcp_set_enabled(app: AppHandle, state: State<'_, McpState>, enabled: bool) -> AppResult<()> {
    state.set_enabled(app, enabled)
}

/// Result of the tool call `id` (from the `mcp://request` event).
#[tauri::command]
pub fn mcp_respond(state: State<'_, McpState>, id: u64, response: ToolResponse) {
    state.respond(id, response);
}

/// The file an `import_library_item` call names (the `attachment.token` of its `mcp://request`),
/// as raw bytes. Each token works once, and only while that call waits for its answer.
///
/// # Errors
/// `AppError::InvalidInput` when the token is unknown, already used or expired.
#[tauri::command]
pub fn mcp_take_attachment(state: State<'_, McpState>, token: String) -> AppResult<Response> {
    state
        .take_attachment(&token)
        .map(Response::new)
        .ok_or_else(|| AppError::invalid_input("附件已經用過或過期，請重新呼叫工具"))
}
