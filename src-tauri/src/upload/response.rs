//! What the web-magazine server answered, turned into an `UploadFailure` the upload dialog acts on.
//! The error table of the contract (web-magazine `A01-Magazine-Server/docs/桌面上傳API.md`,「錯誤」);
//! decisions go by `code`, never by the server's (English) `message`.

use serde::Serialize;
use serde_json::Value;

/// What went wrong; the dialog decides from this which step to show (plan §4.5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UploadCode {
    /// Wrong email / password, or the token expired: ask for the password again.
    Unauthenticated,
    /// Too many logins or requests; `retry_after` says how long to wait when the server told.
    TooManyRequests,
    Forbidden,
    /// The book was deleted.
    NotFound,
    /// The server refused the content (book title, zip, cover).
    BadInput,
    /// This account is uploading another book.
    UploadInProgress,
    /// The publisher's storage is full.
    QuotaExceeded,
    /// Bigger than the server's upload limit.
    TooLarge,
    Timeout,
    /// The server answered 3xx; redirects are never followed (the token would go elsewhere).
    Redirect,
    /// No connection, or the certificate is not valid.
    Network,
    /// The server failed, or answered something this app does not understand.
    Server,
}

/// A failed call, with a user-facing message (Chinese).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UploadFailure {
    pub code: UploadCode,
    pub message: String,
    /// Seconds to wait before trying again (`TooManyRequests` only, when the server told).
    pub retry_after: Option<u64>,
}

impl UploadFailure {
    pub fn new(code: UploadCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), retry_after: None }
    }
}

/// Which call failed: some messages depend on it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Call {
    /// `login`: UNAUTHENTICATED means a wrong email or password.
    Login,
    /// `myBooks` / `createBook`.
    Query,
    /// `POST /api/books/{id}/package`.
    Upload,
}

/// Server messages are shown as text but come from the network: keep them short.
const SERVER_MESSAGE_MAX_CHARS: usize = 300;

fn server_message(message: Option<&str>) -> Option<String> {
    let message = message?.trim();
    (!message.is_empty()).then(|| message.chars().take(SERVER_MESSAGE_MAX_CHARS).collect())
}

/// 「30 秒」/「3 分鐘」(rounded up).
fn wait_text(seconds: u64) -> String {
    if seconds < 60 {
        format!("{seconds} 秒")
    } else {
        format!("{} 分鐘", seconds.div_ceil(60))
    }
}

/// The failure for an error code of the contract, or `None` for a code this app does not know.
fn from_code(code: &str, message: Option<&str>, retry_after: Option<u64>, call: Call) -> Option<UploadFailure> {
    let failure = match code {
        "UNAUTHENTICATED" if call == Call::Login => UploadFailure::new(UploadCode::Unauthenticated, "帳號或密碼錯誤"),
        "UNAUTHENTICATED" => UploadFailure::new(UploadCode::Unauthenticated, "登入已過期，請重新輸入密碼"),
        "TOO_MANY_REQUESTS" => UploadFailure {
            code: UploadCode::TooManyRequests,
            message: match retry_after {
                Some(seconds) => format!("嘗試太多次，請 {}後再試", wait_text(seconds)),
                None => "請求太頻繁，請稍後再試".to_owned(),
            },
            retry_after,
        },
        "FORBIDDEN" if call == Call::Upload => UploadFailure::new(UploadCode::Forbidden, "你沒有權限上傳這本書"),
        "FORBIDDEN" => UploadFailure::new(UploadCode::Forbidden, "這個帳號沒有權限做這件事"),
        "NOT_FOUND" => UploadFailure::new(UploadCode::NotFound, "這本書已被刪除"),
        "BAD_USER_INPUT" => UploadFailure::new(
            UploadCode::BadInput,
            server_message(message).map_or_else(|| "伺服器拒絕了這個請求".to_owned(), |message| format!("伺服器拒絕：{message}")),
        ),
        "UPLOAD_IN_PROGRESS" => UploadFailure::new(UploadCode::UploadInProgress, "這個帳號正在上傳另一本書，請等它完成"),
        "QUOTA_EXCEEDED" => UploadFailure::new(
            UploadCode::QuotaExceeded,
            match server_message(message) {
                Some(message) => format!("出版社容量不足，請洽出版社管理者（{message}）"),
                None => "出版社容量不足，請洽出版社管理者".to_owned(),
            },
        ),
        "PAYLOAD_TOO_LARGE" => UploadFailure::new(UploadCode::TooLarge, "檔案超過網站的上限"),
        "INTERNAL_SERVER_ERROR" => UploadFailure::new(UploadCode::Server, "伺服器發生錯誤，請稍後再試"),
        _ => return None,
    };
    Some(failure)
}

/// The failure for an HTTP status, when the body says nothing usable (a proxy's HTML page, or a
/// code this app does not know).
fn from_status(status: u16, retry_after: Option<u64>, call: Call) -> UploadFailure {
    let code = match status {
        401 => "UNAUTHENTICATED",
        403 => "FORBIDDEN",
        404 => "NOT_FOUND",
        400 => "BAD_USER_INPUT",
        413 => "PAYLOAD_TOO_LARGE",
        429 => "TOO_MANY_REQUESTS",
        408 => return timeout(call),
        300..=399 => return redirect(),
        _ => return UploadFailure::new(UploadCode::Server, format!("伺服器發生錯誤（HTTP {status}），請稍後再試")),
    };
    from_code(code, None, retry_after, call).unwrap_or_else(|| UploadFailure::new(UploadCode::Server, format!("伺服器回應 HTTP {status}")))
}

/// A call that took too long (the server's 408, or the client's own time limit).
pub fn timeout(call: Call) -> UploadFailure {
    let message = if call == Call::Upload { "上傳逾時，請檢查網路後再試" } else { "連線逾時，請檢查網路後再試" };
    UploadFailure::new(UploadCode::Timeout, message)
}

/// A 3xx answer: never followed, so the token cannot reach another address.
pub fn redirect() -> UploadFailure {
    UploadFailure::new(UploadCode::Redirect, "伺服器要求轉到別的網址；為了安全不會跟著轉，請確認網址（例如改用 https://）")
}

/// The `Retry-After` header in seconds (the HTTP-date form is ignored).
pub fn parse_retry_after(header: Option<&str>) -> Option<u64> {
    header?.trim().parse().ok()
}

/// Classifies a non-2xx answer of the upload API (or of `/graphql`, whose rate limit answers the
/// same way): `{"error": {"code", "message"}}`, or any body at all from a proxy.
///
/// # Args
/// * `status` - HTTP status, not 2xx.
/// * `retry_after` - The `Retry-After` header, if any.
/// * `body` - The response body.
/// * `call` - Which call it answers.
pub fn classify_http(status: u16, retry_after: Option<&str>, body: &[u8], call: Call) -> UploadFailure {
    let retry_after = parse_retry_after(retry_after);
    if (300..400).contains(&status) {
        return redirect();
    }
    let error = serde_json::from_slice::<Value>(body).ok().and_then(|json| json.get("error").cloned());
    let code = error.as_ref().and_then(|error| error.get("code")).and_then(Value::as_str);
    let message = error.as_ref().and_then(|error| error.get("message")).and_then(Value::as_str);
    code.and_then(|code| from_code(code, message, retry_after, call)).unwrap_or_else(|| from_status(status, retry_after, call))
}

/// The `data` of a `/graphql` answer, or why there is none.
///
/// # Args
/// * `status` - HTTP status (GraphQL errors come with 200; rate limits and proxies use others).
/// * `retry_after` - The `Retry-After` header, if any.
/// * `body` - The response body.
/// * `call` - `Call::Login` or `Call::Query`.
///
/// # Errors
/// The first GraphQL error, or the HTTP failure.
pub fn graphql_data(status: u16, retry_after: Option<&str>, body: &[u8], call: Call) -> Result<Value, UploadFailure> {
    if status != 200 {
        return Err(classify_http(status, retry_after, body, call));
    }
    let malformed = || UploadFailure::new(UploadCode::Server, "伺服器的回應格式不正確，請確認網址是雜誌網站的伺服器");
    let mut json = serde_json::from_slice::<Value>(body).map_err(|_| malformed())?;
    if let Some(error) = json.get("errors").and_then(Value::as_array).and_then(|errors| errors.first()) {
        let extensions = error.get("extensions");
        let code = extensions.and_then(|extensions| extensions.get("code")).and_then(Value::as_str).unwrap_or_default();
        let retry_after = extensions.and_then(|extensions| extensions.get("retryAfter")).and_then(Value::as_u64);
        let message = error.get("message").and_then(Value::as_str);
        return Err(from_code(code, message, retry_after, call).unwrap_or_else(|| {
            // 查詢字串照合約逐字送出；不認得的錯誤（例如複雜度上限）多半代表 App 與網站的版本對不上
            let code = if code.is_empty() { "沒有錯誤碼" } else { code };
            UploadFailure::new(UploadCode::Server, format!("伺服器不接受這個請求（{code}），可能是 App 與網站的版本不相容"))
        }));
    }
    match json.get_mut("data").map(Value::take) {
        Some(data) if data.is_object() => Ok(data),
        _ => Err(malformed()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn graphql_error(code: &str, extra: Value) -> Vec<u8> {
        let mut extensions = json!({ "code": code });
        if let (Some(extensions), Some(extra)) = (extensions.as_object_mut(), extra.as_object()) {
            extensions.extend(extra.clone());
        }
        serde_json::to_vec(&json!({ "data": null, "errors": [{ "message": "english text", "extensions": extensions }] })).unwrap()
    }

    fn rest_error(code: &str, message: &str) -> Vec<u8> {
        serde_json::to_vec(&json!({ "error": { "code": code, "message": message } })).unwrap()
    }

    fn graphql_failure(body: &[u8], call: Call) -> UploadFailure {
        graphql_data(200, None, body, call).unwrap_err()
    }

    #[test]
    fn graphql_data_comes_back_on_success() {
        let body = br#"{"data":{"login":{"token":"t","expiresAt":"2026-10-28T09:00:00Z"}}}"#;
        assert_eq!(graphql_data(200, None, body, Call::Login).unwrap(), json!({ "login": { "token": "t", "expiresAt": "2026-10-28T09:00:00Z" } }));
    }

    #[test]
    fn wrong_password_and_expired_token_are_both_unauthenticated() {
        let body = graphql_error("UNAUTHENTICATED", json!({}));
        assert_eq!(graphql_failure(&body, Call::Login), UploadFailure::new(UploadCode::Unauthenticated, "帳號或密碼錯誤"));
        assert_eq!(graphql_failure(&body, Call::Query).message, "登入已過期，請重新輸入密碼");
        let upload = classify_http(401, None, &rest_error("UNAUTHENTICATED", "token expired"), Call::Upload);
        assert_eq!(upload.code, UploadCode::Unauthenticated);
        assert_eq!(upload.message, "登入已過期，請重新輸入密碼");
    }

    #[test]
    fn too_many_logins_carry_the_wait_from_extensions() {
        let failure = graphql_failure(&graphql_error("TOO_MANY_REQUESTS", json!({ "retryAfter": 540 })), Call::Login);
        assert_eq!(failure.code, UploadCode::TooManyRequests);
        assert_eq!(failure.retry_after, Some(540));
        assert_eq!(failure.message, "嘗試太多次，請 9 分鐘後再試");
        let soon = graphql_failure(&graphql_error("TOO_MANY_REQUESTS", json!({ "retryAfter": 61 })), Call::Login);
        assert_eq!(soon.message, "嘗試太多次，請 2 分鐘後再試", "minutes round up");
    }

    #[test]
    fn rate_limits_carry_the_retry_after_header_on_graphql_and_upload() {
        let body = br#"{"error":{"code":"TOO_MANY_REQUESTS"}}"#;
        for call in [Call::Query, Call::Upload] {
            let failure = classify_http(429, Some("30"), body, call);
            assert_eq!((failure.code, failure.retry_after), (UploadCode::TooManyRequests, Some(30)), "{call:?}");
            assert_eq!(failure.message, "嘗試太多次，請 30 秒後再試");
        }
        // /graphql 被限流時也不是 200：graphql_data 交給 classify_http
        assert_eq!(graphql_data(429, Some("30"), body, Call::Query).unwrap_err().retry_after, Some(30));
        // 沒有標頭、或是 HTTP-date 格式：沒有秒數
        let failure = classify_http(429, Some("Wed, 21 Oct 2026 07:28:00 GMT"), b"", Call::Upload);
        assert_eq!((failure.code, failure.retry_after), (UploadCode::TooManyRequests, None));
        assert_eq!(failure.message, "請求太頻繁，請稍後再試");
    }

    #[test]
    fn forbidden_depends_on_the_call() {
        assert_eq!(graphql_failure(&graphql_error("FORBIDDEN", json!({})), Call::Query).message, "這個帳號沒有權限做這件事");
        let upload = classify_http(403, None, &rest_error("FORBIDDEN", "not yours"), Call::Upload);
        assert_eq!((upload.code, upload.message.as_str()), (UploadCode::Forbidden, "你沒有權限上傳這本書"));
    }

    #[test]
    fn upload_errors_of_the_contract() {
        let check = |status: u16, body: Vec<u8>, code: UploadCode| {
            let failure = classify_http(status, None, &body, Call::Upload);
            assert_eq!(failure.code, code, "{status}");
            failure.message
        };
        assert_eq!(check(404, rest_error("NOT_FOUND", "no book"), UploadCode::NotFound), "這本書已被刪除");
        assert_eq!(check(400, rest_error("BAD_USER_INPUT", "index.html has no flip book pages (.fb-page)"), UploadCode::BadInput), "伺服器拒絕：index.html has no flip book pages (.fb-page)");
        assert_eq!(check(429, rest_error("UPLOAD_IN_PROGRESS", "busy"), UploadCode::UploadInProgress), "這個帳號正在上傳另一本書，請等它完成");
        assert_eq!(check(413, rest_error("QUOTA_EXCEEDED", "needs 120 MB, 950 of 1000 MB used"), UploadCode::QuotaExceeded), "出版社容量不足，請洽出版社管理者（needs 120 MB, 950 of 1000 MB used）");
        assert_eq!(check(413, rest_error("PAYLOAD_TOO_LARGE", "too big"), UploadCode::TooLarge), "檔案超過網站的上限");
        assert_eq!(check(408, b"".to_vec(), UploadCode::Timeout), "上傳逾時，請檢查網路後再試");
        assert_eq!(check(500, rest_error("INTERNAL_SERVER_ERROR", "db down"), UploadCode::Server), "伺服器發生錯誤，請稍後再試");
    }

    #[test]
    fn graphql_bad_input_shows_the_server_message() {
        let failure = graphql_failure(&graphql_error("BAD_USER_INPUT", json!({})), Call::Query);
        assert_eq!((failure.code, failure.message.as_str()), (UploadCode::BadInput, "伺服器拒絕：english text"));
    }

    #[test]
    fn proxy_pages_fall_back_to_the_status() {
        let html = b"<html><body><h1>502 Bad Gateway</h1></body></html>";
        let failure = classify_http(502, None, html, Call::Upload);
        assert_eq!((failure.code, failure.message.as_str()), (UploadCode::Server, "伺服器發生錯誤（HTTP 502），請稍後再試"));
        assert_eq!(graphql_data(504, None, html, Call::Login).unwrap_err().message, "伺服器發生錯誤（HTTP 504），請稍後再試");
        // 413 不是 JSON（例如 Nginx 的 client_max_body_size）：當成太大，不是容量不足
        assert_eq!(classify_http(413, None, html, Call::Upload).code, UploadCode::TooLarge);
        // 不認得的錯誤碼：看狀態碼
        assert_eq!(classify_http(404, None, &rest_error("SOMETHING_NEW", "x"), Call::Upload).code, UploadCode::NotFound);
    }

    #[test]
    fn redirects_are_failures_never_followed() {
        for status in [301, 302, 307, 308] {
            assert_eq!(classify_http(status, None, b"", Call::Upload).code, UploadCode::Redirect);
            assert_eq!(graphql_data(status, None, b"", Call::Login).unwrap_err().code, UploadCode::Redirect);
        }
    }

    #[test]
    fn answers_that_are_not_the_contract_are_server_failures() {
        // 200 但不是 JSON：網址填到別的網站（例如 GraphiQL 網頁或首頁）
        assert_eq!(graphql_data(200, None, b"<!DOCTYPE html>", Call::Login).unwrap_err().code, UploadCode::Server);
        assert_eq!(graphql_data(200, None, br#"{"data":null}"#, Call::Login).unwrap_err().code, UploadCode::Server);
        let unknown = graphql_failure(&graphql_error("GRAPHQL_VALIDATION_FAILED", json!({})), Call::Query);
        assert_eq!(unknown.code, UploadCode::Server);
        assert!(unknown.message.contains("GRAPHQL_VALIDATION_FAILED") && unknown.message.contains("版本"));
        assert!(graphql_failure(br#"{"errors":[{"message":"x"}]}"#, Call::Query).message.contains("沒有錯誤碼"));
    }

    #[test]
    fn server_messages_are_cut_short() {
        let long = "x".repeat(1000);
        let failure = classify_http(400, None, &rest_error("BAD_USER_INPUT", &long), Call::Upload);
        assert_eq!(failure.message.chars().count(), "伺服器拒絕：".chars().count() + SERVER_MESSAGE_MAX_CHARS);
        assert_eq!(classify_http(400, None, &rest_error("BAD_USER_INPUT", "  "), Call::Upload).message, "伺服器拒絕了這個請求");
    }
}
