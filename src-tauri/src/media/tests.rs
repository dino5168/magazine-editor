use super::*;
use image::codecs::jpeg::JpegEncoder;
use image::{ExtendedColorType, ImageEncoder};

const ID: &str = "C5fjrag2Fcg";

fn jpeg(width: u32, height: u32) -> Vec<u8> {
    let pixels = vec![128u8; (width * height * 3) as usize];
    let mut bytes = Vec::new();
    JpegEncoder::new(&mut bytes).write_image(&pixels, width, height, ExtendedColorType::Rgb8).unwrap();
    bytes
}

#[test]
fn builds_fixed_youtube_urls_from_the_id() {
    assert_eq!(thumbnail_url(ID), "https://i.ytimg.com/vi/C5fjrag2Fcg/hqdefault.jpg");
    assert_eq!(
        oembed_url(ID),
        "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DC5fjrag2Fcg"
    );
}

#[test]
fn builds_the_watch_url_like_the_editor() {
    assert_eq!(youtube_watch_url(ID, 0), "https://www.youtube.com/watch?v=C5fjrag2Fcg");
    assert_eq!(youtube_watch_url(ID, 90), "https://www.youtube.com/watch?v=C5fjrag2Fcg&t=90s");
}

#[test]
fn builds_the_player_url_on_the_cookieless_domain() {
    assert_eq!(youtube_embed_url(ID, 0), "https://www.youtube-nocookie.com/embed/C5fjrag2Fcg?autoplay=1&rel=0");
    assert_eq!(youtube_embed_url(ID, 90), "https://www.youtube-nocookie.com/embed/C5fjrag2Fcg?autoplay=1&rel=0&start=90");
}

#[test]
fn reads_availability_from_the_oembed_status() {
    assert_eq!(Availability::from_oembed_status(200), Availability::Ok);
    assert_eq!(Availability::from_oembed_status(401), Availability::NotEmbeddable);
    assert_eq!(Availability::from_oembed_status(403), Availability::NotEmbeddable);
    assert_eq!(Availability::from_oembed_status(404), Availability::NotFound);
    assert_eq!(Availability::from_oembed_status(400), Availability::NotFound);
    assert_eq!(Availability::from_oembed_status(500), Availability::Unknown);
    assert_eq!(Availability::from_oembed_status(302), Availability::Unknown);
}

#[test]
fn cleans_the_oembed_title() {
    assert_eq!(oembed_title(r#"{"title":"  訪談片段 ","author_name":"x"}"#.as_bytes()), Some("訪談片段".into()));
    // 控制字元（換行、tab）拿掉
    assert_eq!(oembed_title(br#"{"title":"a\nb\tc"}"#), Some("abc".into()));
    // 超過上限：截到 MEDIA_TITLE_MAX_CHARS 個字元（不是位元組）
    let long = format!(r#"{{"title":"{}"}}"#, "影".repeat(MEDIA_TITLE_MAX_CHARS + 50));
    assert_eq!(oembed_title(long.as_bytes()).unwrap().chars().count(), MEDIA_TITLE_MAX_CHARS);
    for bad in [&br#"{"title":"   "}"#[..], br#"{"title":null}"#, br#"{}"#, b"not json", b"<html>"] {
        assert_eq!(oembed_title(bad), None, "{}", String::from_utf8_lossy(bad));
    }
}

#[test]
fn stores_the_thumbnail_as_a_project_image() {
    let dir = tempfile::tempdir().unwrap();
    let bytes = jpeg(48, 36);
    let poster = store_poster(dir.path(), &bytes).unwrap();
    assert_eq!((poster.width, poster.height), (48, 36));
    assert!(poster.src.starts_with("assets/images/") && poster.src.ends_with(".jpg"), "{}", poster.src);
    assert!(dir.path().join(&poster.src).is_file());
    // 同一張再存一次：同一個檔案（內容雜湊）
    assert_eq!(store_poster(dir.path(), &bytes).unwrap(), poster);
}

#[test]
fn rejects_thumbnails_that_are_not_usable_images() {
    let dir = tempfile::tempdir().unwrap();
    let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>"#;
    let mut truncated = jpeg(48, 36);
    truncated.truncate(4);
    for bad in [&b""[..], b"<html>error</html>", b"GIF89a\x01\x00\x01\x00", svg, &truncated] {
        assert!(store_poster(dir.path(), bad).is_err());
    }
    let mut huge = jpeg(8, 8);
    huge.resize(THUMBNAIL_MAX_BYTES + 1, 0);
    assert!(store_poster(dir.path(), &huge).is_err());
    // 失敗時不留下檔案
    assert!(!dir.path().join("assets/images").exists());
}

#[test]
fn refuses_ids_that_are_not_youtube_ids_before_any_request() {
    let dir = tempfile::tempdir().unwrap();
    for bad in ["", "short", "C5fjrag2Fc/", "../../../etc", "C5fjrag2Fcg?x"] {
        let result = tauri::async_runtime::block_on(youtube_info(dir.path(), bad));
        assert!(matches!(result, Err(AppError::InvalidInput(_))), "{bad}");
    }
}

/// Manual check over the network (multimedia plan step 3): `cargo test youtube_info_over_the_network
/// -- --ignored --nocapture` fetches the poster and title of the requirement's example video and of a
/// video id that does not exist.
#[test]
#[ignore]
fn youtube_info_over_the_network() {
    let dir = tempfile::tempdir().unwrap();
    let info = tauri::async_runtime::block_on(youtube_info(dir.path(), ID)).unwrap();
    println!("{info:?}");
    assert_eq!(info.availability, Availability::Ok);
    assert!(info.title.is_some());
    let poster = info.poster.expect("poster");
    assert_eq!((poster.width, poster.height), (480, 360));

    let missing = tauri::async_runtime::block_on(youtube_info(dir.path(), "aaaaaaaaaaa")).unwrap();
    println!("{missing:?}");
    assert_eq!(missing.availability, Availability::NotFound);
    assert!(missing.poster.is_none() && missing.title.is_none());
}
