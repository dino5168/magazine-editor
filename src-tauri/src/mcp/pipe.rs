//! Named pipe server：一個連線可以送很多行請求，每行依序處理、回一行結果。
//!
//! 不知道工具的內容；`handler` 決定怎麼執行（App 交給前端，測試直接回傳）。

use super::protocol::{ToolRequest, ToolResponse, MAX_LINE_BYTES};
use std::future::Future;
use std::io;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

fn server_options() -> ServerOptions {
    let mut options = ServerOptions::new();
    // 只接受本機：網路上的 SMB 用戶端不能連進來
    options.reject_remote_clients(true);
    options
}

/// Creates the first instance of the pipe. Fails when the name is already taken (another app is
/// listening), so two apps never answer on the same pipe. Must run inside the tokio runtime.
pub fn bind(name: &str) -> io::Result<NamedPipeServer> {
    server_options().first_pipe_instance(true).create(name)
}

/// Accepts clients forever, each on its own task; returns only when creating a pipe instance fails.
pub async fn serve<H, F>(mut server: NamedPipeServer, name: String, handler: H) -> io::Result<()>
where
    H: Fn(ToolRequest) -> F + Clone + Send + Sync + 'static,
    F: Future<Output = ToolResponse> + Send + 'static,
{
    loop {
        server.connect().await?;
        // 先建立下一個 instance 再處理這個連線，下一個用戶端才不會碰到「pipe 不存在」
        let connected = std::mem::replace(&mut server, server_options().create(&name)?);
        let handler = handler.clone();
        tokio::spawn(async move {
            // 用戶端中途斷線只影響這個連線
            let _ = handle_connection(connected, handler).await;
        });
    }
}

/// Reads requests line by line until the client disconnects; answers each with one line.
pub async fn handle_connection<S, H, F>(stream: S, handler: H) -> io::Result<()>
where
    S: AsyncRead + AsyncWrite + Unpin,
    H: Fn(ToolRequest) -> F,
    F: Future<Output = ToolResponse>,
{
    let (read, mut write) = tokio::io::split(stream);
    let mut reader = BufReader::new(read);
    let mut line = Vec::new();
    loop {
        line.clear();
        let read = (&mut reader).take(MAX_LINE_BYTES as u64 + 1).read_until(b'\n', &mut line).await?;
        if read == 0 {
            return Ok(());
        }
        if read > MAX_LINE_BYTES {
            // 讀不到行尾就無法對齊下一個請求：回錯誤後關閉連線
            write_line(&mut write, &ToolResponse::error("請求太大（上限 1 MB）")).await?;
            return Ok(());
        }
        let text = line.trim_ascii();
        if text.is_empty() {
            continue;
        }
        let response = match serde_json::from_slice::<ToolRequest>(text) {
            Ok(request) => handler(request).await,
            Err(error) => ToolResponse::error(format!("請求格式錯誤：{error}")),
        };
        write_line(&mut write, &response).await?;
    }
}

async fn write_line<W: AsyncWrite + Unpin>(write: &mut W, response: &ToolResponse) -> io::Result<()> {
    let mut bytes = serde_json::to_vec(response).map_err(io::Error::other)?;
    bytes.push(b'\n');
    write.write_all(&bytes).await?;
    write.flush().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::windows::named_pipe::ClientOptions;

    async fn echo(request: ToolRequest) -> ToolResponse {
        ToolResponse::Ok { data: json!({ "tool": request.tool, "args": request.args }) }
    }

    fn test_pipe_name(test: &str) -> String {
        format!(r"\\.\pipe\magazine-editor-mcp-test-{test}-{}", std::process::id())
    }

    async fn send(client: &mut (impl AsyncBufReadExt + AsyncWriteExt + Unpin), line: &str) -> serde_json::Value {
        client.write_all(format!("{line}\n").as_bytes()).await.unwrap();
        let mut answer = String::new();
        client.read_line(&mut answer).await.unwrap();
        serde_json::from_str(&answer).unwrap()
    }

    #[tokio::test]
    async fn answers_each_line_in_order_and_serves_new_clients() {
        let name = test_pipe_name("order");
        let server = bind(&name).unwrap();
        tokio::spawn(serve(server, name.clone(), echo));

        for _ in 0..2 {
            let mut client = BufReader::new(ClientOptions::new().open(&name).unwrap());
            let first = send(&mut client, r#"{"tool":"get_document","args":{}}"#).await;
            assert_eq!(first, json!({ "status": "ok", "data": { "tool": "get_document", "args": {} } }));
            // args 可以省略；空行略過
            let second = send(&mut client, "\n{\"tool\":\"list_pages\"}").await;
            assert_eq!(second["data"]["tool"], "list_pages");
            assert_eq!(second["data"]["args"], serde_json::Value::Null);
        }
    }

    #[tokio::test]
    async fn reports_malformed_requests_and_keeps_the_connection() {
        let name = test_pipe_name("malformed");
        tokio::spawn(serve(bind(&name).unwrap(), name.clone(), echo));
        let mut client = BufReader::new(ClientOptions::new().open(&name).unwrap());

        let bad = send(&mut client, "not json").await;
        assert_eq!(bad["status"], "error");
        assert!(bad["error"].as_str().unwrap().starts_with("請求格式錯誤"));
        let good = send(&mut client, r#"{"tool":"x"}"#).await;
        assert_eq!(good["status"], "ok");
    }

    #[tokio::test]
    async fn closes_after_an_oversized_line() {
        let (client, server) = tokio::io::duplex(64 * 1024);
        let task = tokio::spawn(handle_connection(server, echo));
        let mut client = BufReader::new(client);
        let huge = vec![b'x'; MAX_LINE_BYTES + 10];
        client.write_all(&huge).await.unwrap();
        let mut answer = String::new();
        client.read_line(&mut answer).await.unwrap();
        assert!(answer.contains("請求太大"));
        task.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn a_second_app_cannot_take_the_pipe() {
        let name = test_pipe_name("single");
        let _first = bind(&name).unwrap();
        assert!(bind(&name).is_err());
    }
}
