//! The GraphQL calls of the contract (`login`, `myBooks`, `createBook`), query strings word for
//! word as in web-magazine `A01-Magazine-Server/docs/桌面上傳API.md`.

use super::response::{classify_http, graphql_data, redirect, timeout, Call, UploadCode, UploadFailure};
use super::server_url::{is_openable_reader_url, ServerUrl};
use crate::export::pptx::raster::SlideImage;
use futures_util::StreamExt;
use reqwest::header::{CONTENT_TYPE, RETRY_AFTER};
use reqwest::multipart::{Form, Part};
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

const LOGIN_QUERY: &str =
    "mutation Login($input: LoginInput!) { login(input: $input) { token expiresAt user { id displayName role } } }";
const MY_BOOKS_QUERY: &str = "query MyBooks($after: String) { myBooks(first: 50, after: $after) { nodes { id title status pageCount updatedAt } pageInfo { hasNextPage endCursor } } }";
const CREATE_BOOK_QUERY: &str = "mutation CreateBook($title: String!) { createBook(input: { title: $title }) { id title status } }";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// One GraphQL call, from sending to the last byte of the answer.
const GRAPHQL_TIMEOUT: Duration = Duration::from_secs(30);
/// GraphQL answers are small (50 books at most); a bigger body is not the contract's server.
const GRAPHQL_MAX_BYTES: usize = 2 * 1024 * 1024;
/// The whole upload; longer than the server's 15 minutes, so its 408 arrives first.
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(16 * 60);
/// The zip goes out in pieces of this size; progress and cancel are checked per piece.
const UPLOAD_CHUNK_BYTES: usize = 64 * 1024;
/// The upload answer is three fields.
const UPLOAD_ANSWER_MAX_BYTES: usize = 64 * 1024;
/// How often a waiting upload looks at the cancel flag (before the first piece is sent).
const CANCEL_POLL: Duration = Duration::from_millis(200);
/// Treat the token as expired this long before `expiresAt` (clocks differ a little).
const EXPIRY_MARGIN: time::Duration = time::Duration::seconds(30);
/// `createBook` accepts 1–200 characters after trimming.
const BOOK_TITLE_MAX_CHARS: usize = 200;
/// Book ids go into the upload URL path; the server uses UUIDs.
const BOOK_ID_MAX_LEN: usize = 64;

/// The HTTP client for every call to the server: certificates checked by Windows (Schannel, no
/// way to turn it off), redirects never followed (the `Authorization` header must not go to
/// another address).
///
/// # Errors
/// `UploadCode::Network` when the TLS backend cannot start.
pub fn http_client() -> Result<reqwest::Client, UploadFailure> {
    reqwest::Client::builder()
        .user_agent(concat!("magazine-editor/", env!("CARGO_PKG_VERSION")))
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|_| UploadFailure::new(UploadCode::Network, "無法建立網路連線元件"))
}

/// A request that never got an answer.
pub fn network_failure(error: &reqwest::Error, call: Call) -> UploadFailure {
    if error.is_timeout() {
        timeout(call)
    } else if error.is_redirect() {
        redirect()
    } else {
        // Schannel 的憑證錯誤訊息隨系統語言變，不解析，一起說明
        UploadFailure::new(UploadCode::Network, "連不上伺服器：請確認網址與網路連線（也可能是伺服器的憑證無效）")
    }
}

fn unexpected(what: &str) -> UploadFailure {
    UploadFailure::new(UploadCode::Server, format!("伺服器的回應缺少{what}，可能是 App 與網站的版本不相容"))
}

/// A logged-in account. The token stays here: nothing that holds it is serialized, and `Debug`
/// leaves it out.
#[derive(Clone)]
pub struct Session {
    pub server: ServerUrl,
    token: String,
    pub expires_at: OffsetDateTime,
    pub user_id: String,
    pub display_name: String,
    /// `AUTHOR` / `PUBLISHER_ADMIN` / `ADMIN`.
    pub role: String,
}

impl std::fmt::Debug for Session {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Session")
            .field("server", &self.server)
            .field("expires_at", &self.expires_at)
            .field("user_id", &self.user_id)
            .field("role", &self.role)
            .finish_non_exhaustive()
    }
}

impl Session {
    /// Whether the token can still be used at `now`.
    pub fn is_valid_at(&self, now: OffsetDateTime) -> bool {
        now + EXPIRY_MARGIN < self.expires_at
    }

    /// `ADMIN` belongs to no publisher, so `createBook` answers FORBIDDEN.
    pub fn can_create_books(&self) -> bool {
        self.role != "ADMIN"
    }

    /// What the upload dialog may know about the session (no token).
    pub fn info(&self) -> SessionInfo {
        SessionInfo {
            origin: self.server.origin.clone(),
            host: self.server.host.clone(),
            insecure: self.server.insecure,
            display_name: self.display_name.clone(),
            role: self.role.clone(),
            can_create_books: self.can_create_books(),
            expires_at: self.expires_at.format(&Rfc3339).unwrap_or_default(),
        }
    }
}

/// The session as the WebView sees it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub origin: String,
    pub host: String,
    pub insecure: bool,
    pub display_name: String,
    pub role: String,
    pub can_create_books: bool,
    /// RFC 3339.
    pub expires_at: String,
}

/// A book the account may overwrite.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadBook {
    pub id: String,
    pub title: String,
    /// `DRAFT` / `PUBLIC` / `HIDDEN`.
    pub status: String,
    /// `None`: nothing uploaded yet (or a just created book).
    pub page_count: Option<u32>,
    /// RFC 3339; absent for a just created book.
    pub updated_at: Option<String>,
}

/// One page of `myBooks`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookPage {
    pub books: Vec<UploadBook>,
    /// Pass back as `after` for the next 50; `None` on the last page.
    pub next_cursor: Option<String>,
}

/// Whether `id` can go into the upload URL: ASCII letters, digits and `-` only.
pub fn is_valid_book_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= BOOK_ID_MAX_LEN && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

/// The title for `createBook`, trimmed.
///
/// # Errors
/// `UploadCode::BadInput` when it is empty or longer than the server accepts.
pub fn book_title(title: &str) -> Result<String, UploadFailure> {
    let title = title.trim();
    if title.is_empty() {
        return Err(UploadFailure::new(UploadCode::BadInput, "請輸入書名"));
    }
    if title.chars().count() > BOOK_TITLE_MAX_CHARS {
        return Err(UploadFailure::new(UploadCode::BadInput, format!("書名最多 {BOOK_TITLE_MAX_CHARS} 個字")));
    }
    Ok(title.to_owned())
}

fn text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

/// The session in a `login` answer's `data`.
pub fn session_from_login(server: ServerUrl, data: &Value) -> Result<Session, UploadFailure> {
    let login = data.get("login").ok_or_else(|| unexpected("登入資料"))?;
    let token = text(login, "token").filter(|token| !token.is_empty()).ok_or_else(|| unexpected("登入憑證"))?;
    let expires_at = text(login, "expiresAt")
        .and_then(|value| OffsetDateTime::parse(&value, &Rfc3339).ok())
        .ok_or_else(|| unexpected("有效期限"))?;
    let user = login.get("user").ok_or_else(|| unexpected("使用者資料"))?;
    Ok(Session {
        server,
        token,
        expires_at,
        user_id: text(user, "id").ok_or_else(|| unexpected("使用者 id"))?,
        display_name: text(user, "displayName").unwrap_or_default(),
        role: text(user, "role").ok_or_else(|| unexpected("使用者角色"))?,
    })
}

fn book_from(node: &Value) -> Result<UploadBook, UploadFailure> {
    let id = text(node, "id").filter(|id| is_valid_book_id(id)).ok_or_else(|| unexpected("正確的書本 id"))?;
    Ok(UploadBook {
        id,
        title: text(node, "title").unwrap_or_default(),
        status: text(node, "status").ok_or_else(|| unexpected("書本狀態"))?,
        page_count: node.get("pageCount").and_then(Value::as_u64).and_then(|n| u32::try_from(n).ok()),
        updated_at: text(node, "updatedAt"),
    })
}

/// The books in a `myBooks` answer's `data`.
pub fn books_from(data: &Value) -> Result<BookPage, UploadFailure> {
    let connection = data.get("myBooks").ok_or_else(|| unexpected("書單"))?;
    let nodes = connection.get("nodes").and_then(Value::as_array).ok_or_else(|| unexpected("書單"))?;
    let books = nodes.iter().map(book_from).collect::<Result<Vec<_>, _>>()?;
    let page_info = connection.get("pageInfo");
    let has_next = page_info.and_then(|info| info.get("hasNextPage")).and_then(Value::as_bool).unwrap_or(false);
    let next_cursor = if has_next { page_info.and_then(|info| text(info, "endCursor")) } else { None };
    Ok(BookPage { books, next_cursor })
}

/// The book in a `createBook` answer's `data`.
pub fn created_book_from(data: &Value) -> Result<UploadBook, UploadFailure> {
    book_from(data.get("createBook").ok_or_else(|| unexpected("新書資料"))?)
}

/// Reads the answer, at most `max` bytes (the server is on the network: do not trust its size).
async fn read_body(mut response: reqwest::Response, max: usize, call: Call) -> Result<Vec<u8>, UploadFailure> {
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| network_failure(&error, call))? {
        if body.len() + chunk.len() > max {
            return Err(UploadFailure::new(UploadCode::Server, "伺服器的回應太大，請確認網址是雜誌網站的伺服器"));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/// Sends one GraphQL request (`POST {origin}/graphql`, JSON) and returns its `data`.
async fn graphql(client: &reqwest::Client, server: &ServerUrl, token: Option<&str>, query: &str, variables: Value, call: Call) -> Result<Value, UploadFailure> {
    let body = serde_json::to_vec(&json!({ "query": query, "variables": variables })).map_err(|_| unexpected("請求"))?;
    let mut request = client
        .post(format!("{}/graphql", server.origin))
        .header(CONTENT_TYPE, "application/json")
        .timeout(GRAPHQL_TIMEOUT)
        .body(body);
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.map_err(|error| network_failure(&error, call))?;
    let status = response.status().as_u16();
    let retry_after = response.headers().get(RETRY_AFTER).and_then(|value| value.to_str().ok()).map(str::to_owned);
    let body = read_body(response, GRAPHQL_MAX_BYTES, call).await?;
    graphql_data(status, retry_after.as_deref(), &body, call)
}

/// Logs in.
///
/// # Errors
/// `Unauthenticated` for a wrong email or password (the server answers both the same), or the
/// failure of the call.
pub async fn login(client: &reqwest::Client, server: ServerUrl, email: &str, password: &str) -> Result<Session, UploadFailure> {
    let variables = json!({ "input": { "email": email.trim(), "password": password } });
    let data = graphql(client, &server, None, LOGIN_QUERY, variables, Call::Login).await?;
    session_from_login(server, &data)
}

/// One page of the books the account may overwrite, newest first.
pub async fn my_books(client: &reqwest::Client, session: &Session, after: Option<&str>) -> Result<BookPage, UploadFailure> {
    let data = graphql(client, &session.server, Some(&session.token), MY_BOOKS_QUERY, json!({ "after": after }), Call::Query).await?;
    books_from(&data)
}

/// Creates a draft book (the server always makes new books `DRAFT`).
pub async fn create_book(client: &reqwest::Client, session: &Session, title: &str) -> Result<UploadBook, UploadFailure> {
    let title = book_title(title)?;
    let data = graphql(client, &session.server, Some(&session.token), CREATE_BOOK_QUERY, json!({ "title": title }), Call::Query).await?;
    created_book_from(&data)
}

/// What the server answers to a successful upload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedBook {
    pub page_count: u32,
    /// The book on the server's flip book domain; checked with `is_openable_reader_url`.
    pub reader_url: String,
}

/// The upload answer (`{ pageCount, readerUrl, coverUrl }`).
pub fn uploaded_from(body: &[u8]) -> Result<UploadedBook, UploadFailure> {
    let json: Value = serde_json::from_slice(body).map_err(|_| unexpected("上傳結果"))?;
    let page_count = json.get("pageCount").and_then(Value::as_u64).and_then(|n| u32::try_from(n).ok()).ok_or_else(|| unexpected("頁數"))?;
    let reader_url = text(&json, "readerUrl").filter(|url| is_openable_reader_url(url)).ok_or_else(|| unexpected("可以開啟的閱讀網址"))?;
    Ok(UploadedBook { page_count, reader_url })
}

/// Lets the caller follow and stop an upload.
pub struct UploadControl {
    /// Set to stop: the request is dropped and `upload_package` returns `Ok(None)`. Ignored once
    /// every byte is sent (the server is then replacing the book; stopping would only hide the
    /// result).
    pub cancel: Arc<AtomicBool>,
    /// Called with (bytes handed to the connection, zip size) as the zip goes out.
    pub on_sent: Arc<dyn Fn(u64, u64) + Send + Sync>,
}

/// Resolves when the user cancels while bytes are still to be sent.
async fn cancelled(cancel: &AtomicBool, all_sent: &AtomicBool) {
    while !cancel.load(Ordering::SeqCst) || all_sent.load(Ordering::SeqCst) {
        tokio::time::sleep(CANCEL_POLL).await;
    }
}

/// Uploads the flip book and its cover (`POST {origin}/api/books/{book_id}/package`, multipart
/// `package` + `cover`). The zip is streamed in pieces so progress can be shown and the upload
/// stopped.
///
/// # Args
/// * `book_id` - From `my_books` / `create_book` (checked again: it goes into the URL).
/// * `zip` - `upload::package::prepare`.
/// * `cover` - `export::cover::render_cover`; `None` keeps the book's current cover.
///
/// # Returns
/// The result, or `None` when cancelled.
pub async fn upload_package(
    client: &reqwest::Client,
    session: &Session,
    book_id: &str,
    zip: Vec<u8>,
    cover: Option<SlideImage>,
    control: &UploadControl,
) -> Result<Option<UploadedBook>, UploadFailure> {
    if !is_valid_book_id(book_id) {
        return Err(UploadFailure::new(UploadCode::BadInput, "書本 id 不正確"));
    }
    let total = zip.len();
    let all_sent = Arc::new(AtomicBool::new(total == 0));
    let pieces = {
        let zip = Arc::new(zip);
        let (cancel, on_sent, all_sent) = (Arc::clone(&control.cancel), Arc::clone(&control.on_sent), Arc::clone(&all_sent));
        futures_util::stream::iter((0..total).step_by(UPLOAD_CHUNK_BYTES)).map(move |start| {
            // 回傳錯誤會讓 reqwest 中止請求：伺服器收到不完整的內容，不會換掉原本的書
            if cancel.load(Ordering::SeqCst) {
                return Err(std::io::Error::other("cancelled"));
            }
            let end = (start + UPLOAD_CHUNK_BYTES).min(total);
            if end == total {
                all_sent.store(true, Ordering::SeqCst);
            }
            on_sent(end as u64, total as u64);
            Ok(zip[start..end].to_vec())
        })
    };
    let part_error = |_| unexpected("上傳格式");
    let package = Part::stream_with_length(reqwest::Body::wrap_stream(pieces), total as u64)
        .file_name("book.zip")
        .mime_str("application/zip")
        .map_err(part_error)?;
    let mut form = Form::new().part("package", package);
    if let Some(cover) = cover {
        let part = Part::bytes(cover.bytes)
            .file_name(format!("cover.{}", cover.format.extension()))
            .mime_str(cover.format.content_type())
            .map_err(part_error)?;
        form = form.part("cover", part);
    }
    let request = client
        .post(format!("{}/api/books/{book_id}/package", session.server.origin))
        .bearer_auth(&session.token)
        .timeout(UPLOAD_TIMEOUT)
        .multipart(form)
        .send();
    let response = tokio::select! {
        response = request => response,
        () = cancelled(&control.cancel, &all_sent) => return Ok(None),
    };
    let response = match response {
        Ok(response) => response,
        Err(_) if control.cancel.load(Ordering::SeqCst) && !all_sent.load(Ordering::SeqCst) => return Ok(None),
        Err(error) => return Err(network_failure(&error, Call::Upload)),
    };
    let status = response.status().as_u16();
    let retry_after = response.headers().get(RETRY_AFTER).and_then(|value| value.to_str().ok()).map(str::to_owned);
    let body = read_body(response, UPLOAD_ANSWER_MAX_BYTES, Call::Upload).await?;
    if status != 200 {
        return Err(classify_http(status, retry_after.as_deref(), &body, Call::Upload));
    }
    uploaded_from(&body).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upload::server_url::parse_server_url;

    fn local() -> ServerUrl {
        parse_server_url("http://localhost:8081").unwrap()
    }

    fn login_data() -> Value {
        json!({ "login": {
            "token": "secret-token",
            "expiresAt": "2026-10-28T09:00:00Z",
            "user": { "id": "0192-user", "displayName": "Ann", "role": "AUTHOR" }
        } })
    }

    #[test]
    fn login_answer_becomes_a_session_whose_token_never_leaves() {
        let session = session_from_login(local(), &login_data()).unwrap();
        assert_eq!((session.display_name.as_str(), session.role.as_str()), ("Ann", "AUTHOR"));
        assert!(session.can_create_books());
        let info = serde_json::to_value(session.info()).unwrap();
        assert_eq!(info["expiresAt"], "2026-10-28T09:00:00Z");
        assert_eq!(info["host"], "localhost");
        assert_eq!(info["canCreateBooks"], true);
        assert!(!info.to_string().contains("secret-token"), "the WebView never sees the token");
        assert!(!format!("{session:?}").contains("secret-token"), "nor does a log line");
    }

    #[test]
    fn login_answer_without_token_or_expiry_is_refused() {
        for broken in [json!({}), json!({ "login": { "token": "", "expiresAt": "2026-10-28T09:00:00Z", "user": {} } }), json!({ "login": { "token": "t", "expiresAt": "tomorrow", "user": {} } })] {
            assert_eq!(session_from_login(local(), &broken).unwrap_err().code, UploadCode::Server, "{broken}");
        }
    }

    #[test]
    fn admins_cannot_create_books() {
        let mut data = login_data();
        data["login"]["user"]["role"] = json!("ADMIN");
        let session = session_from_login(local(), &data).unwrap();
        assert!(!session.can_create_books());
        assert!(!session.info().can_create_books);
    }

    #[test]
    fn sessions_expire_a_little_early() {
        let session = session_from_login(local(), &login_data()).unwrap();
        let expires = session.expires_at;
        assert!(session.is_valid_at(expires - time::Duration::minutes(5)));
        assert!(!session.is_valid_at(expires - time::Duration::seconds(10)));
        assert!(!session.is_valid_at(expires + time::Duration::minutes(1)));
    }

    #[test]
    fn book_pages_follow_the_cursor() {
        let data = json!({ "myBooks": {
            "nodes": [
                { "id": "0192aaaa-0000-7000-8000-000000000001", "title": "秋季號", "status": "PUBLIC", "pageCount": 24, "updatedAt": "2026-10-28T08:00:00Z" },
                { "id": "0192aaaa-0000-7000-8000-000000000002", "title": "草稿", "status": "DRAFT", "pageCount": null, "updatedAt": "2026-10-27T08:00:00Z" }
            ],
            "pageInfo": { "hasNextPage": true, "endCursor": "cursor-2" }
        } });
        let page = books_from(&data).unwrap();
        assert_eq!(page.next_cursor.as_deref(), Some("cursor-2"));
        assert_eq!(page.books[0].page_count, Some(24));
        assert_eq!(page.books[1].page_count, None, "not uploaded yet");
        let mut last = data.clone();
        last["myBooks"]["pageInfo"] = json!({ "hasNextPage": false, "endCursor": "cursor-2" });
        assert_eq!(books_from(&last).unwrap().next_cursor, None);
    }

    #[test]
    fn books_with_ids_unfit_for_a_url_are_refused() {
        for id in ["../admin", "a/b", "", "id?x=1", &"a".repeat(65)] {
            assert!(!is_valid_book_id(id), "{id}");
            let data = json!({ "myBooks": { "nodes": [{ "id": id, "title": "t", "status": "DRAFT" }], "pageInfo": { "hasNextPage": false } } });
            assert_eq!(books_from(&data).unwrap_err().code, UploadCode::Server, "{id}");
        }
        assert!(is_valid_book_id("0192aaaa-0000-7000-8000-000000000001"));
    }

    #[test]
    fn created_books_are_read_without_page_count() {
        let data = json!({ "createBook": { "id": "0192bbbb-0000-7000-8000-000000000003", "title": "新書", "status": "DRAFT" } });
        let book = created_book_from(&data).unwrap();
        assert_eq!((book.status.as_str(), book.page_count, book.updated_at), ("DRAFT", None, None));
    }

    #[test]
    fn upload_answers_need_a_page_count_and_an_openable_reader_url() {
        let ok = br#"{"pageCount":2,"readerUrl":"https://books.example.com/b/1/index.html","coverUrl":"https://books.example.com/b/cover-1.png"}"#;
        assert_eq!(uploaded_from(ok).unwrap(), UploadedBook { page_count: 2, reader_url: "https://books.example.com/b/1/index.html".into() });
        for bad in [&br#"{"readerUrl":"https://books.example.com/b/1/index.html"}"#[..], br#"{"pageCount":2,"readerUrl":"file:///C:/x.exe"}"#, br#"{"pageCount":2,"readerUrl":"http://books.example.com/x"}"#, b"<html>"] {
            assert_eq!(uploaded_from(bad).unwrap_err().code, UploadCode::Server, "{}", String::from_utf8_lossy(bad));
        }
    }

    #[test]
    fn book_titles_are_trimmed_and_limited() {
        assert_eq!(book_title("  我的雜誌 2026 秋季號 ").unwrap(), "我的雜誌 2026 秋季號");
        assert_eq!(book_title("   ").unwrap_err().message, "請輸入書名");
        assert!(book_title(&"字".repeat(200)).is_ok());
        assert_eq!(book_title(&"字".repeat(201)).unwrap_err().code, UploadCode::BadInput);
    }

    /// Against a running web-magazine server (plan step 2):
    ///
    /// ```powershell
    /// $env:UPLOAD_SERVER = "http://localhost:8081"; $env:UPLOAD_EMAIL = "<email>"; $env:UPLOAD_PASSWORD = "<password>"
    /// cargo test --manifest-path src-tauri/Cargo.toml --lib -j 2 login_and_books_over_the_network -- --ignored --nocapture
    /// ```
    ///
    /// `--lib`: without it cargo also builds `magazine-mcp` and the other test targets in
    /// parallel, which can run Windows out of memory (os error 1455).
    ///
    /// Creates one draft book named 「magazine-editor 連線測試 …」 unless the account is ADMIN, and
    /// uses one failed login of the server's limit (10 per 15 minutes).
    #[test]
    #[ignore]
    fn login_and_books_over_the_network() {
        let env = |name: &str| std::env::var(name).unwrap_or_else(|_| panic!("set {name}"));
        let server = parse_server_url(&env("UPLOAD_SERVER")).unwrap();
        let (email, password) = (env("UPLOAD_EMAIL"), env("UPLOAD_PASSWORD"));
        tauri::async_runtime::block_on(async {
            let client = http_client().unwrap();

            let wrong = login(&client, server.clone(), &email, "not-the-password-123").await.unwrap_err();
            assert_eq!((wrong.code, wrong.message.as_str()), (UploadCode::Unauthenticated, "帳號或密碼錯誤"));

            let session = login(&client, server, &email, &password).await.unwrap();
            assert!(session.is_valid_at(OffsetDateTime::now_utc()));
            println!("logged in: {} ({}), expires {}", session.display_name, session.role, session.info().expires_at);

            let mut after = None;
            let mut total = 0;
            loop {
                let page = my_books(&client, &session, after.as_deref()).await.unwrap();
                total += page.books.len();
                match page.next_cursor {
                    Some(cursor) => after = Some(cursor),
                    None => break,
                }
            }
            println!("books: {total}");

            if session.can_create_books() {
                let title = format!("magazine-editor 連線測試 {}", OffsetDateTime::now_utc().unix_timestamp());
                let book = create_book(&client, &session, &title).await.unwrap();
                assert_eq!((book.title.as_str(), book.status.as_str()), (title.as_str(), "DRAFT"));
                let first = my_books(&client, &session, None).await.unwrap();
                assert!(first.books.iter().any(|listed| listed.id == book.id), "the new book is listed first");
                println!("created draft {}", book.id);
            }

            let mut expired = session.clone();
            expired.token = "not-a-token".into();
            assert_eq!(my_books(&client, &expired, None).await.unwrap_err().code, UploadCode::Unauthenticated);
        });
    }

    /// Uploads the fixture flip book to a running web-magazine server (plan step 4). Same
    /// environment variables as `login_and_books_over_the_network`:
    ///
    /// ```powershell
    /// cargo test --manifest-path src-tauri/Cargo.toml --lib -j 2 upload_over_the_network -- --ignored --nocapture
    /// ```
    ///
    /// Creates a draft 「magazine-editor 上傳測試 …」 (or, for ADMIN, overwrites the newest book:
    /// set `UPLOAD_BOOK_ID` to choose one), uploads twice (new content, then overwrite without a
    /// cover) and checks that a cancelled upload sends nothing.
    #[test]
    #[ignore]
    fn upload_over_the_network() {
        use crate::export::cover::render_cover;
        use crate::export::flipbook::build_flipbook;
        use crate::export::test_support::{fixture_document, fonts, project_with_image, request};
        use crate::upload::package::prepare;

        let env = |name: &str| std::env::var(name).unwrap_or_else(|_| panic!("set {name}"));
        let server = parse_server_url(&env("UPLOAD_SERVER")).unwrap();
        let root = project_with_image();
        let output = build_flipbook(root.path(), &request(fixture_document())).unwrap();
        let zip = prepare(&output.files).unwrap();
        let cover = render_cover(root.path(), request(fixture_document()), fonts()).unwrap();
        assert!(cover.is_some());

        tauri::async_runtime::block_on(async {
            let client = http_client().unwrap();
            let session = login(&client, server, &env("UPLOAD_EMAIL"), &env("UPLOAD_PASSWORD")).await.unwrap();
            let book_id = match std::env::var("UPLOAD_BOOK_ID") {
                Ok(id) => id,
                Err(_) if session.can_create_books() => {
                    let title = format!("magazine-editor 上傳測試 {}", OffsetDateTime::now_utc().unix_timestamp());
                    create_book(&client, &session, &title).await.unwrap().id
                }
                Err(_) => my_books(&client, &session, None).await.unwrap().books.first().expect("no book to overwrite").id.clone(),
            };
            println!("book {book_id}");

            let sent = Arc::new(std::sync::atomic::AtomicU64::new(0));
            let seen = Arc::clone(&sent);
            let control = UploadControl {
                cancel: Arc::new(AtomicBool::new(false)),
                on_sent: Arc::new(move |bytes, _| seen.store(bytes, Ordering::SeqCst)),
            };
            let uploaded = upload_package(&client, &session, &book_id, zip.clone(), cover, &control).await.unwrap().unwrap();
            assert_eq!(uploaded.page_count, u32::try_from(output.pages).unwrap());
            assert_eq!(sent.load(Ordering::SeqCst), zip.len() as u64, "progress reached the end");
            println!("reader: {}", uploaded.reader_url);

            let again = upload_package(&client, &session, &book_id, zip.clone(), None, &control).await.unwrap().unwrap();
            assert_eq!(again.page_count, uploaded.page_count, "overwriting works, the cover stays");

            let cancelled = UploadControl { cancel: Arc::new(AtomicBool::new(true)), on_sent: Arc::new(|_, _| {}) };
            assert_eq!(upload_package(&client, &session, &book_id, zip.clone(), None, &cancelled).await.unwrap(), None);

            let missing = upload_package(&client, &session, "00000000-0000-7000-8000-000000000000", zip, None, &control).await.unwrap_err();
            assert_eq!(missing.code, UploadCode::NotFound);
        });
    }
}
