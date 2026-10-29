//! The web-magazine server address the user types in the upload dialog. Rules: the contract
//! (web-magazine `A01-Magazine-Server/docs/桌面上傳API.md`,「用戶端的資安要求」) and the plan
//! `docs/13-Plans-電子書上傳/5-desktop上傳-實作-V2.md` §4.1.

use crate::error::{AppError, AppResult};
use reqwest::Url;
use std::net::IpAddr;

/// A checked server address.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerUrl {
    /// `scheme://host[:port]` without a trailing slash; every request URL starts with it.
    pub origin: String,
    /// The host as shown to the user (「將傳送密碼到 …」). International domain names stay in
    /// punycode, so a look-alike domain does not pass for the real one.
    pub host: String,
    /// Plain `http` to this computer or a private address: the password travels unencrypted.
    pub insecure: bool,
}

/// Whether plain `http` may be used: this computer, or a literal private IP address. Host names
/// other than `localhost` are refused even when they resolve to a private address (no DNS lookup).
fn allows_plain_http(host: &str) -> bool {
    match host.parse::<IpAddr>() {
        // 10/8、172.16/12、192.168/16 與 127/8
        Ok(IpAddr::V4(ip)) => ip.is_loopback() || ip.is_private(),
        Ok(IpAddr::V6(ip)) => ip.is_loopback(),
        Err(_) => host == "localhost",
    }
}

/// Whether the app may open `url` in the browser: the `readerUrl` an upload returns lives on the
/// server's flip book domain (not the API host), so only the scheme rules apply: https, or http to
/// this computer or a private address.
pub fn is_openable_reader_url(url: &str) -> bool {
    let Ok(url) = Url::parse(url) else { return false };
    let host = url.host_str().unwrap_or_default().trim_start_matches('[').trim_end_matches(']');
    match url.scheme() {
        "https" => !host.is_empty(),
        "http" => allows_plain_http(host),
        _ => false,
    }
}

/// Checks the address the user typed.
///
/// # Args
/// * `input` - `https://example.com`, `example.com` (`https://` is added), `http://localhost:8081`…
///
/// # Returns
/// The origin (scheme, host, port) and whether it is unencrypted.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) for anything but a bare https origin, or an http origin
/// on this computer or a private address.
pub fn parse_server_url(input: &str) -> AppResult<ServerUrl> {
    let input = input.trim();
    if input.is_empty() {
        return Err(AppError::invalid_input("請輸入伺服器網址"));
    }
    // 沒寫 scheme 時補 https；不能用 Url::parse 判斷（「localhost:8081」會被當成 scheme「localhost」）
    let with_scheme = if input.contains("://") { input.to_owned() } else { format!("https://{input}") };
    let url = Url::parse(&with_scheme).map_err(|_| AppError::invalid_input("伺服器網址的格式不正確"))?;
    let insecure = match url.scheme() {
        "https" => false,
        "http" => true,
        _ => return Err(AppError::invalid_input("伺服器網址要用 https://")),
    };
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AppError::invalid_input("伺服器網址不能包含帳號或密碼"));
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err(AppError::invalid_input("伺服器網址只要填到主機（例如 https://example.com），後面不加路徑"));
    }
    // IPv6 的 host_str 帶中括號（[::1]）
    let host = url.host_str().map(|host| host.trim_start_matches('[').trim_end_matches(']').to_owned());
    let host = host.filter(|host| !host.is_empty()).ok_or_else(|| AppError::invalid_input("伺服器網址缺少主機名稱"))?;
    if insecure && !allows_plain_http(&host) {
        return Err(AppError::invalid_input(
            "網際網路上的伺服器要用 https://；http:// 只能連這台電腦或區域網路（例如 192.168.x.x）",
        ));
    }
    Ok(ServerUrl { origin: url.origin().ascii_serialization(), host, insecure })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(input: &str) -> ServerUrl {
        parse_server_url(input).unwrap_or_else(|error| panic!("{input}: {error}"))
    }

    fn refused(input: &str) -> String {
        match parse_server_url(input) {
            Err(AppError::InvalidInput(message)) => message,
            other => panic!("{input}: expected InvalidInput, got {other:?}"),
        }
    }

    #[test]
    fn https_origins_pass_and_get_https_added() {
        assert_eq!(ok("https://x.com"), ServerUrl { origin: "https://x.com".into(), host: "x.com".into(), insecure: false });
        assert_eq!(ok("  x.com  ").origin, "https://x.com");
        assert_eq!(ok("https://x.com/").origin, "https://x.com", "a lone slash is not a path");
        assert_eq!(ok("HTTPS://API.Example.COM:8443").origin, "https://api.example.com:8443");
        assert_eq!(ok("https://x.com:443").origin, "https://x.com", "default port dropped");
        assert_eq!(ok("https://203.0.113.5").host, "203.0.113.5", "public IPs are fine over https");
    }

    #[test]
    fn plain_http_only_reaches_this_computer_or_a_private_address() {
        for input in ["http://localhost:8081", "http://127.0.0.1:8081", "http://[::1]:8081", "http://10.1.2.3", "http://172.16.0.1", "http://172.31.255.255", "http://192.168.1.10:8081"] {
            assert!(ok(input).insecure, "{input}");
        }
        assert_eq!(ok("http://[::1]:8081").host, "::1");
        assert_eq!(ok("localhost:8081").origin, "https://localhost:8081", "no scheme means https, even for localhost");
        for input in ["http://203.0.113.5", "http://172.32.0.1", "http://172.15.0.1", "http://example.com", "http://192.168.1.10.nip.io", "http://[2001:db8::1]"] {
            assert!(refused(input).contains("https://"), "{input}");
        }
    }

    #[test]
    fn credentials_paths_and_other_schemes_are_refused() {
        assert!(refused("https://user:pw@host.com").contains("帳號或密碼"));
        assert!(refused("https://user@host.com").contains("帳號或密碼"));
        for input in ["https://x.com/path", "https://x.com/graphql", "https://x.com/?a=1", "https://x.com/#top"] {
            assert!(refused(input).contains("路徑"), "{input}");
        }
        assert!(refused("ftp://x.com").contains("https://"));
        assert!(refused("   ").contains("請輸入"));
        assert!(refused("https://").contains("格式"));
    }

    #[test]
    fn reader_urls_open_only_over_https_or_on_a_private_network() {
        assert!(is_openable_reader_url("https://books.example.com/0192/3/index.html"));
        assert!(is_openable_reader_url("http://localhost:8082/0192/3/index.html"));
        assert!(is_openable_reader_url("http://192.168.1.10:8082/b/index.html"));
        for url in ["http://books.example.com/b/index.html", "file:///C:/Windows/notepad.exe", "javascript:alert(1)", "ms-settings:", "not a url"] {
            assert!(!is_openable_reader_url(url), "{url}");
        }
    }

    #[test]
    fn international_domains_are_shown_in_punycode() {
        assert_eq!(ok("https://例子.tw").host, "xn--fsqu00a.tw");
    }
}
