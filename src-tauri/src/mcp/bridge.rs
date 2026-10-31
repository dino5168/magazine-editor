//! App ↔ 前端：把工具呼叫以 event `mcp://request` 交給前端，等前端呼叫 `mcp_respond` 帶回結果。

use super::attachment::{self, AttachmentRef, Attachments};
use super::pipe;
use super::protocol::{ToolRequest, ToolResponse};
use crate::commands::export::ExportState;
use crate::error::{AppError, AppResult};
use crate::export::page_image::{render_page_image, PageImage, PageImageOptions, PageRegion};
use crate::export::ExportRequest;
use crate::project::ProjectState;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

/// Event the frontend listens to.
pub const REQUEST_EVENT: &str = "mcp://request";

/// How long a tool may take in the frontend. Tools only read, dispatch or import one image, so
/// this only fires when the window is gone or still loading.
pub const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);

/// Payload of `mcp://request`.
#[derive(Debug, Clone, Serialize)]
pub struct FrontendRequest {
    pub id: u64,
    pub tool: String,
    pub args: Value,
    /// The file `import_library_item` names, read by Rust (`mcp_take_attachment`); not in `args`, so
    /// the client cannot make one up.
    pub attachment: Option<AttachmentRef>,
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

/// Reads the file of an `import_library_item` call (a blocking read, off the async runtime).
async fn read_attachment(request: &ToolRequest) -> Result<Option<attachment::Attachment>, String> {
    if request.tool != attachment::IMPORT_TOOL {
        return Ok(None);
    }
    let args = request.args.clone();
    tauri::async_runtime::spawn_blocking(move || attachment::read_import(&args))
        .await
        .map_err(|error| format!("讀取檔案中斷：{error}"))?
}

/// The tool whose answer the frontend leaves to Rust: it sends the export request, Rust draws the
/// page (`render_page_image`), so the picture never goes through the WebView.
pub const RENDER_TOOL: &str = "render_page";

/// What the frontend answers to `render_page`: `{ "render": RenderJob }` (TS `RenderJob` in
/// `src/lib/automation/render-page.ts`).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderJob {
    /// The export request holding only the page to draw.
    request: ExportRequest,
    page_index: usize,
    max_px: u32,
    region: Option<PageRegion>,
    /// Shown in the description, e.g. `3`.
    page_name: String,
}

fn render_job(data: Value) -> Result<RenderJob, String> {
    let job = data.get("render").cloned().ok_or_else(|| "App 沒有交出要畫的頁面".to_owned())?;
    serde_json::from_value(job).map_err(|error| format!("App 交出的頁面格式錯誤：{error}"))
}

/// The line sent with the picture: which page, its size, the picture's size and its scale (so pixel
/// positions can be turned back into pt).
fn describe_image(page_name: &str, image: &PageImage, has_region: bool) -> String {
    let scale = f64::from(image.width_px) / image.area.width;
    let mut text = format!(
        "頁面「{page_name}」，{:.2} × {:.2} pt，輸出 {} × {} px（1 pt = {:.2} px）",
        image.page_width_pt, image.page_height_pt, image.width_px, image.height_px, scale
    );
    if has_region {
        let area = image.area;
        text.push_str(&format!(
            "；只畫 region x {:.1}、y {:.1}、寬 {:.1}、高 {:.1} pt（圖片左上角 = 頁面的 ({:.1}, {:.1})）",
            area.x, area.y, area.width, area.height, area.x, area.y
        ));
    }
    text
}

/// Draws the page the frontend handed over and answers with the picture.
async fn render_answer(app: &AppHandle, data: Value) -> ToolResponse {
    let job = match render_job(data) {
        Ok(job) => job,
        Err(message) => return ToolResponse::error(message),
    };
    let root = match app.state::<ProjectState>().current() {
        Ok(project) => project.root,
        Err(error) => return ToolResponse::error(format!("沒有開啟的專案：{error}")),
    };
    let fonts = app.state::<ExportState>().fonts();
    let RenderJob { request, page_index, max_px, region, page_name } = job;
    let options = PageImageOptions { max_px, region };
    // 排版與點陣化是 CPU 密集工作
    let drawn = tauri::async_runtime::spawn_blocking(move || render_page_image(&root, request, page_index, &options, fonts.to_vec())).await;
    match drawn {
        Ok(Ok(image)) => ToolResponse::Image {
            text: describe_image(&page_name, &image, region.is_some()),
            mime_type: image.image.format.content_type().to_owned(),
            data: base64::engine::general_purpose::STANDARD.encode(&image.image.bytes),
        },
        Ok(Err(error)) => ToolResponse::error(error.to_string()),
        Err(error) => ToolResponse::error(format!("畫頁面中斷：{error}")),
    }
}

async fn call_frontend(app: &AppHandle, pending: &Pending, attachments: &Attachments, request: ToolRequest) -> ToolResponse {
    // 讀不到檔案時直接回給 AI，不必經過前端
    let attachment = match read_attachment(&request).await {
        Ok(attachment) => attachment.map(|attachment| attachments.insert(attachment)),
        Err(message) => return ToolResponse::error(message),
    };
    let token = attachment.as_ref().map(|reference| reference.token.clone());
    let renders = request.tool == RENDER_TOOL;
    let (id, receiver) = pending.register();
    let payload = FrontendRequest { id, tool: request.tool, args: request.args, attachment };
    let response = match app.emit(REQUEST_EVENT, payload) {
        Ok(()) => pending.wait(id, receiver, RESPONSE_TIMEOUT).await,
        Err(error) => {
            pending.lock().remove(&id);
            ToolResponse::error(format!("無法把呼叫交給 App 畫面：{error}"))
        }
    };
    // 前端沒取（參數錯誤）或逾時：附件只屬於這一次呼叫
    if let Some(token) = token {
        attachments.remove(&token);
    }
    match response {
        ToolResponse::Ok { data } if renders => render_answer(app, data).await,
        response => response,
    }
}

/// MCP state managed by Tauri: the pipe server task and the calls waiting for the frontend.
#[derive(Default)]
pub struct McpState {
    pending: Arc<Pending>,
    attachments: Arc<Attachments>,
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
        let attachments = Arc::clone(&self.attachments);
        let handler = move |request: ToolRequest| {
            let app = app.clone();
            let pending = Arc::clone(&pending);
            let attachments = Arc::clone(&attachments);
            async move { call_frontend(&app, &pending, &attachments, request).await }
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

    /// The bytes of a call's attachment, once (`None` when unknown, already taken or expired).
    pub fn take_attachment(&self, token: &str) -> Option<Vec<u8>> {
        self.attachments.take(token)
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
    fn reads_the_render_job_of_render_page() {
        let document = serde_json::to_value(crate::export::test_support::fixture_document()).unwrap();
        let data = json!({ "render": {
            "request": { "document": document, "textLayouts": {} },
            "pageIndex": 0,
            "maxPx": 1200,
            "region": { "x": 10, "y": 20, "width": 100, "height": 50 },
            "pageName": "3",
        } });
        let job = render_job(data).unwrap();
        assert_eq!((job.page_index, job.max_px, job.page_name.as_str()), (0, 1200, "3"));
        assert_eq!(job.region, Some(PageRegion { x: 10.0, y: 20.0, width: 100.0, height: 50.0 }));
        assert!(render_job(json!({ "pages": [] })).unwrap_err().contains("沒有交出"));
        assert!(render_job(json!({ "render": { "pageIndex": 0 } })).unwrap_err().contains("格式錯誤"));
    }

    #[test]
    fn describes_the_picture_and_its_scale() {
        let image = PageImage {
            image: crate::export::pptx::raster::SlideImage { format: crate::export::pptx::raster::SlideImageFormat::Png, bytes: vec![] },
            width_px: 600,
            height_px: 300,
            page_width_pt: 595.28,
            page_height_pt: 841.89,
            area: PageRegion { x: 50.0, y: 0.0, width: 100.0, height: 50.0 },
        };
        let text = describe_image("3", &image, true);
        assert!(text.contains("頁面「3」，595.28 × 841.89 pt，輸出 600 × 300 px（1 pt = 6.00 px）"), "{text}");
        assert!(text.contains("圖片左上角 = 頁面的 (50.0, 0.0)"), "{text}");
        assert!(!describe_image("3", &image, false).contains("region"));
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
