//! Pipe 的用戶端（橋接程式 `magazine-mcp.exe` 用）：每次工具呼叫連一次 App，送一行、讀一行。
//!
//! 每次都重新連線：App 重開或還沒開時，Claude Code 那一端的 MCP 連線不受影響。

use super::protocol::{ToolRequest, ToolResponse, MAX_LINE_BYTES};
use std::io;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};

/// Longer than the app's own 30 s wait for the frontend, so the app's message wins.
const CALL_TIMEOUT: Duration = Duration::from_secs(40);

/// `ERROR_PIPE_BUSY`: every instance is in use; the server creates the next one right away.
const ERROR_PIPE_BUSY: i32 = 231;

/// Message when the app is not listening (not running, or MCP not allowed in its preferences).
pub const APP_NOT_RUNNING: &str = "連不到雜誌編輯軟體：請先開啟 App（並在偏好設定允許 Claude Code 連線），再試一次。";

async fn connect(pipe: &str) -> io::Result<NamedPipeClient> {
    let mut attempts = 0;
    loop {
        match ClientOptions::new().open(pipe) {
            Err(error) if error.raw_os_error() == Some(ERROR_PIPE_BUSY) && attempts < 40 => {
                attempts += 1;
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            result => return result,
        }
    }
}

async fn exchange(pipe: &str, request: &ToolRequest) -> Result<ToolResponse, String> {
    let client = match connect(pipe).await {
        Ok(client) => client,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Err(APP_NOT_RUNNING.to_owned()),
        Err(error) => return Err(format!("連線到雜誌編輯軟體失敗：{error}")),
    };
    let mut line = serde_json::to_vec(request).map_err(|error| error.to_string())?;
    line.push(b'\n');
    let mut client = BufReader::new(client);
    client.write_all(&line).await.map_err(|error| format!("送出請求失敗：{error}"))?;
    client.flush().await.map_err(|error| format!("送出請求失敗：{error}"))?;

    let mut answer = Vec::new();
    let read = (&mut client)
        .take(MAX_LINE_BYTES as u64 + 1)
        .read_until(b'\n', &mut answer)
        .await
        .map_err(|error| format!("讀取結果失敗：{error}"))?;
    if read == 0 {
        return Err("雜誌編輯軟體在回應前關閉了連線（App 可能已關閉）".to_owned());
    }
    serde_json::from_slice(answer.trim_ascii()).map_err(|error| format!("App 的回應格式錯誤：{error}"))
}

/// Sends one tool call to the app and waits for its answer. Never fails: problems on the way
/// (app not running, timeout, broken pipe) come back as an error response the model can read.
pub async fn call(pipe: &str, request: &ToolRequest) -> ToolResponse {
    match tokio::time::timeout(CALL_TIMEOUT, exchange(pipe, request)).await {
        Ok(Ok(response)) => response,
        Ok(Err(message)) => ToolResponse::error(message),
        Err(_) => ToolResponse::error(format!("雜誌編輯軟體沒有在 {} 秒內回應", CALL_TIMEOUT.as_secs())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::pipe;
    use serde_json::json;

    fn request(tool: &str) -> ToolRequest {
        ToolRequest { tool: tool.to_owned(), args: json!({ "n": 1 }) }
    }

    #[tokio::test]
    async fn round_trips_through_the_app_pipe() {
        let name = format!(r"\\.\pipe\magazine-editor-mcp-test-client-{}", std::process::id());
        let handler = |request: ToolRequest| async move {
            ToolResponse::Ok { data: json!({ "tool": request.tool, "args": request.args }) }
        };
        tokio::spawn(pipe::serve(pipe::bind(&name).unwrap(), name.clone(), handler));
        // 每次呼叫都重新連線
        for tool in ["get_document", "list_pages"] {
            let response = call(&name, &request(tool)).await;
            assert_eq!(response, ToolResponse::Ok { data: json!({ "tool": tool, "args": { "n": 1 } }) });
        }
    }

    #[tokio::test]
    async fn explains_when_the_app_is_not_running() {
        let response = call(r"\\.\pipe\magazine-editor-mcp-test-nobody-here", &request("x")).await;
        assert_eq!(response, ToolResponse::error(APP_NOT_RUNNING));
    }
}
