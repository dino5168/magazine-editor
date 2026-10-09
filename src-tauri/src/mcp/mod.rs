//! MCP 的 App 端：橋接程式 `magazine-mcp.exe` 經 named pipe 送來工具呼叫，這裡轉給前端執行
//! （文件狀態在前端的 reducer），再把結果寫回 pipe。
//!
//! ```text
//! 橋接程式 ──pipe（一行一個 JSON）──▶ pipe::serve ──▶ bridge ──event mcp://request──▶ 前端
//! (client)  ◀──────────────────────────            ◀── mcp_respond（command）◀──────────
//! ```
//!
//! MCP 協定本身（initialize、tools/list）在橋接程式（`src/bin/magazine-mcp.rs`）；App 只處理「執行
//! 一個工具」。橋接程式只用得到 `client`、`protocol` 與 `pipe_name`，所以只有它們是 `pub`。

pub(crate) mod bridge;
pub mod client;
pub(crate) mod pipe;
pub mod protocol;

pub(crate) use bridge::McpState;

/// Pipe the app listens on and the bridge connects to. One per Windows user, so another account's
/// app (fast user switching) does not collide with or answer for this one.
pub fn pipe_name() -> String {
    let user: String = std::env::var("USERNAME")
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    format!(r"\\.\pipe\magazine-editor-mcp-{}", if user.is_empty() { "default" } else { &user })
}
