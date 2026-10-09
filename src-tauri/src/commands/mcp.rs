//! MCP commands：前端開 / 關 pipe，並把工具的執行結果交回給等待中的呼叫。

use crate::error::AppResult;
use crate::mcp::protocol::ToolResponse;
use crate::mcp::McpState;
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
