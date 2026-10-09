//! App ↔ 前端：把工具呼叫以 event `mcp://request` 交給前端，等前端呼叫 `mcp_respond` 帶回結果。

use super::pipe;
use super::protocol::{ToolRequest, ToolResponse};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

/// Event the frontend listens to.
pub const REQUEST_EVENT: &str = "mcp://request";

/// How long a tool may take in the frontend. Tools only read or dispatch, so this only fires
/// when the window is gone or still loading.
pub const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);

/// Payload of `mcp://request`.
#[derive(Debug, Clone, Serialize)]
pub struct FrontendRequest {
    pub id: u64,
    pub tool: String,
    pub args: Value,
}

/// Calls waiting for the frontend, by request id.
#[derive(Default)]
pub struct Pending {
    next_id: AtomicU64,
    waiting: Mutex<HashMap<u64, oneshot::Sender<ToolResponse>>>,
}

impl Pending {
    pub fn register(&self) -> (u64, oneshot::Receiver<ToolResponse>) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let (sender, receiver) = oneshot::channel();
        self.lock().insert(id, sender);
        (id, receiver)
    }

    /// Delivers the frontend's answer; false when nobody waits for `id` any more (timed out).
    pub fn resolve(&self, id: u64, response: ToolResponse) -> bool {
        match self.lock().remove(&id) {
            Some(sender) => sender.send(response).is_ok(),
            None => false,
        }
    }

    /// Waits for the answer to `id`, giving up after `timeout` (a late answer is then dropped).
    pub async fn wait(&self, id: u64, receiver: oneshot::Receiver<ToolResponse>, timeout: Duration) -> ToolResponse {
        match tokio::time::timeout(timeout, receiver).await {
            Ok(Ok(response)) => response,
            Ok(Err(_)) => ToolResponse::error("App 沒有回應這次呼叫"),
            Err(_) => {
                self.lock().remove(&id);
                ToolResponse::error(format!(
                    "App 沒有在 {} 秒內回應：視窗可能還在載入，請稍後再試",
                    timeout.as_secs()
                ))
            }
        }
    }

    // 鎖只保護 HashMap 的插入與移除，不會在持有時 panic；中毒時沿用內容即可
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<u64, oneshot::Sender<ToolResponse>>> {
        self.waiting.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

async fn call_frontend(app: &AppHandle, pending: &Pending, request: ToolRequest) -> ToolResponse {
    let (id, receiver) = pending.register();
    let payload = FrontendRequest { id, tool: request.tool, args: request.args };
    if let Err(error) = app.emit(REQUEST_EVENT, payload) {
        pending.lock().remove(&id);
        return ToolResponse::error(format!("無法把呼叫交給 App 畫面：{error}"));
    }
    pending.wait(id, receiver, RESPONSE_TIMEOUT).await
}

/// MCP state managed by Tauri: the pipe server task and the calls waiting for the frontend.
#[derive(Default)]
pub struct McpState {
    pending: Arc<Pending>,
    server: Mutex<Option<JoinHandle<()>>>,
}

impl McpState {
    /// Starts or stops listening on the pipe. Starting while already listening does nothing.
    /// Must run inside the tokio runtime (an async command).
    pub fn set_enabled(&self, app: AppHandle, enabled: bool) -> AppResult<()> {
        let mut server = self.server.lock().map_err(|_| AppError::LockPoisoned)?;
        if !enabled {
            if let Some(task) = server.take() {
                task.abort();
            }
            return Ok(());
        }
        if server.as_ref().is_some_and(|task| !task.is_finished()) {
            return Ok(());
        }
        let name = super::pipe_name();
        let first = pipe::bind(&name).map_err(|error| AppError::invalid_input(format!("無法開啟 MCP 連線：{error}")))?;
        let pending = Arc::clone(&self.pending);
        let handler = move |request: ToolRequest| {
            let app = app.clone();
            let pending = Arc::clone(&pending);
            async move { call_frontend(&app, &pending, request).await }
        };
        *server = Some(tokio::spawn(async move {
            if let Err(error) = pipe::serve(first, name, handler).await {
                eprintln!("MCP pipe server stopped: {error}");
            }
        }));
        Ok(())
    }

    pub fn respond(&self, id: u64, response: ToolResponse) {
        // 逾時之後才到的回應沒有人在等，丟掉即可
        self.pending.resolve(id, response);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn delivers_the_answer_to_the_waiting_call() {
        let pending = Arc::new(Pending::default());
        let (id, receiver) = pending.register();
        let answer = ToolResponse::Ok { data: json!(1) };
        let resolver = Arc::clone(&pending);
        let expected = answer.clone();
        tokio::spawn(async move { assert!(resolver.resolve(id, expected)) });
        assert_eq!(pending.wait(id, receiver, Duration::from_secs(5)).await, answer);
    }

    #[tokio::test]
    async fn gives_up_after_the_timeout_and_drops_late_answers() {
        let pending = Pending::default();
        let (id, receiver) = pending.register();
        let response = pending.wait(id, receiver, Duration::from_millis(10)).await;
        assert!(matches!(response, ToolResponse::Error { ref error } if error.contains("沒有在 0 秒內回應")));
        assert!(!pending.resolve(id, ToolResponse::Ok { data: json!(null) }));
    }

    #[test]
    fn ids_are_unique() {
        let pending = Pending::default();
        let (first, _a) = pending.register();
        let (second, _b) = pending.register();
        assert_ne!(first, second);
        assert!(!pending.resolve(999, ToolResponse::error("x")));
    }
}
