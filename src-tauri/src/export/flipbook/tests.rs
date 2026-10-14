use super::*;
use crate::export::test_support::{fixture_document, project_with_image, request};
use crate::export::TextLayout;
use crate::project::format::Document;
use sha2::{Digest, Sha256};

fn export(document: Document) -> FlipbookOutput {
    let root = project_with_image();
    build_flipbook(root.path(), &request(document)).unwrap()
}

fn file<'a>(output: &'a FlipbookOutput, name: &str) -> &'a str {
    let (_, data) = output.files.iter().find(|(n, _)| n == name).unwrap_or_else(|| panic!("missing {name}"));
    std::str::from_utf8(data).unwrap()
}

/// The fixture document with its only page repeated `count` times (fresh page ids).
fn document_with_pages(count: usize) -> Document {
    let mut document = fixture_document();
    let page = document.pages[0].clone();
    document.pages = (0..count)
        .map(|n| {
            let mut copy = page.clone();
            copy.id = format!("page-{n}");
            copy.name = format!("P{}", n + 1);
            copy
        })
        .collect();
    document
}

/// Every `attr="…"` value in `html`.
fn attribute_values<'a>(html: &'a str, attr: &str) -> Vec<&'a str> {
    let needle = format!(r#" {attr}=""#);
    html.split(needle.as_str()).skip(1).map(|rest| rest.split('"').next().unwrap()).collect()
}

/// Resolves `reference` relative to the folder of `from` (both `/`-separated, inside the book).
fn resolve(from: &str, reference: &str) -> String {
    let mut parts: Vec<&str> = from.split('/').collect();
    parts.pop();
    for part in reference.split('/') {
        match part {
            ".." => {
                parts.pop();
            }
            "." => {}
            _ => parts.push(part),
        }
    }
    parts.join("/")
}

#[test]
fn book_layout() {
    let output = export(fixture_document());
    let names: Vec<&str> = output.files.iter().map(|(name, _)| name.as_str()).collect();
    for expected in [
        "index.html",
        "viewer/page-flip.browser.js",
        "viewer/page-flip.LICENSE",
        "viewer/viewer.js",
        "viewer/viewer.css",
        "styles/page.css",
        "fonts/Geist-Regular.ttf",
        "fonts/NotoSansTC-Bold.otf",
        "images/image-1.png",
    ] {
        assert!(names.contains(&expected), "missing {expected}: {names:?}");
    }
    let mut unique = names.clone();
    unique.sort_unstable();
    unique.dedup();
    assert_eq!(unique.len(), names.len(), "duplicate files: {names:?}");
    assert_eq!(output.pages, 1);
    assert_eq!(output.skipped_images, 0);
}

#[test]
fn every_reference_resolves_to_a_file_of_the_book() {
    let output = export(fixture_document());
    let names: Vec<&str> = output.files.iter().map(|(name, _)| name.as_str()).collect();
    let index = file(&output, "index.html");
    let mut references: Vec<(&str, String)> = Vec::new();
    for attr in ["src", "href"] {
        references.extend(attribute_values(index, attr).into_iter().map(|v| ("index.html", v.to_owned())));
    }
    let css = file(&output, "styles/page.css");
    references.extend(css.split(r#"url(""#).skip(1).map(|rest| ("styles/page.css", rest.split('"').next().unwrap().to_owned())));
    assert!(references.iter().any(|(_, r)| r.starts_with("images/")), "the fixture image is referenced");
    assert!(references.iter().any(|(_, r)| r.starts_with("../fonts/")), "fonts are referenced");
    for (from, reference) in &references {
        let target = resolve(from, reference);
        assert!(names.contains(&target.as_str()), "{from} → {reference} ({target}) is not in the book");
    }
}

#[test]
fn nothing_loads_from_outside_the_book() {
    let output = export(fixture_document());
    for (name, data) in &output.files {
        if !(name.ends_with(".html") || name.ends_with(".js") || name.ends_with(".css")) {
            continue;
        }
        // 只有 inline SVG 的 namespace 是 URL（不會載入）
        let text = std::str::from_utf8(data).unwrap().replace("http://www.w3.org/2000/svg", "");
        assert!(!text.contains("http://") && !text.contains("https://") && !text.contains("//cdn"), "{name} links outside");
    }
    assert!(file(&output, "index.html").contains(r#"http-equiv="Content-Security-Policy""#));
}

#[test]
fn user_text_is_data_not_markup() {
    let hostile = r#"<script>alert(1)</script> & "q" ]]> <!--"#;
    let mut document = fixture_document();
    document.name = hostile.to_owned();
    document.pages[0].name = hostile.to_owned();
    let mut req = request(document);
    req.text_layouts.insert(
        "el-text".into(),
        TextLayout { lines: vec![hostile.into()], baseline: 30.0, line_widths: vec![], line_gaps: vec![] },
    );
    let root = project_with_image();
    let output = build_flipbook(root.path(), &req).unwrap();
    let index = file(&output, "index.html");
    assert!(!index.contains("<script>alert"), "user text became markup");
    assert_eq!(index.matches("<script").count(), 2, "only the viewer's two scripts");
    let escaped = "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot; ]]&gt; &lt;!--";
    assert!(index.contains(&format!("<title>{escaped}</title>")));
    assert!(index.contains(&format!(r#"data-name="{escaped}""#)));
    // fixture 的文字是斜體，每行的 <div> 帶 skewX 的 style
    assert!(index.contains(&format!(">{escaped}</div>")));
}

#[test]
fn one_page_box_per_page_in_reading_order() {
    let output = export(document_with_pages(5));
    let index = file(&output, "index.html");
    assert_eq!(output.pages, 5);
    assert_eq!(attribute_values(index, "data-name"), vec!["P1", "P2", "P3", "P4", "P5"]);
    assert_eq!(index.matches(r#"<div class="page""#).count(), 5);
    // 同一張圖片只放一份
    assert_eq!(output.files.iter().filter(|(name, _)| name.starts_with("images/")).count(), 1);
}

#[test]
fn book_takes_the_first_page_size_and_fits_other_sizes() {
    let mut document = document_with_pages(3);
    let (width, height) = (document.pages[0].width, document.pages[0].height);
    // 第 2 頁橫式：寬放不下，等比例縮到書的寬度、上下置中
    document.pages[1].width = height;
    document.pages[1].height = width;
    let index = file(&export(document), "index.html").to_owned();
    assert!(index.contains(&format!(r#"data-width="{}" data-height="{}""#, num(width), num(height))));
    let styles: Vec<&str> = index
        .split(r#"<div class="fb-scale""#)
        .skip(1)
        .map(|rest| rest.split('>').next().unwrap())
        .collect();
    assert_eq!(styles[0], "");
    assert_eq!(styles[2], "");
    // 只有縮小置中的頁面標上 fb-fitted（留白是淺灰）
    let classes: Vec<&str> = index.split(r#"<div class=""#).skip(1).map(|r| r.split('"').next().unwrap()).filter(|c| c.starts_with("fb-page")).collect();
    assert_eq!(classes, vec!["fb-page", "fb-page fb-fitted", "fb-page"]);
    let k = width / height;
    let dy = (height - width * k) / 2.0;
    assert_eq!(
        styles[1],
        format!(r#" style="transform:scale(var(--s,1)) translate(0px,{}px) scale({})""#, num(dy), num(k))
    );
}

#[test]
fn only_named_pages_go_into_the_table_of_contents() {
    for name in ["Page-1", "Page-12", " Page-3 ", "", "   "] {
        assert!(is_default_page_name(name), "{name:?} is a default name");
    }
    for name in ["封面", "Page-", "Page-1 副本", "page-1", "Page-1a", "Page-１", "目錄 Page-2"] {
        assert!(!is_default_page_name(name), "{name:?} was named by the user");
    }
    let mut document = document_with_pages(4);
    document.pages[0].name = "封面".into();
    document.pages[1].name = "Page-2".into();
    document.pages[2].name = String::new();
    document.pages[3].name = "專題報導".into();
    let index = file(&export(document), "index.html").to_owned();
    let tagged: Vec<&str> = index
        .split(r#"<div class="fb-page" "#)
        .skip(1)
        .map(|rest| rest.split('>').next().unwrap())
        .collect();
    assert_eq!(
        tagged,
        vec![r#"data-name="封面" data-toc="""#, r#"data-name="Page-2""#, r#"data-name="第 3 頁""#, r#"data-name="專題報導" data-toc="""#]
    );
}

fn sample_files() -> Vec<(String, Vec<u8>)> {
    vec![("index.html".into(), b"<!DOCTYPE html>".to_vec()), ("viewer/viewer.js".into(), b"//".to_vec())]
}

#[test]
fn writes_the_book_folder() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("雜誌 翻頁書");
    write_folder(&target, &sample_files()).unwrap();
    assert_eq!(std::fs::read(target.join("index.html")).unwrap(), b"<!DOCTYPE html>");
    assert_eq!(std::fs::read(target.join("viewer").join("viewer.js")).unwrap(), b"//");
    // 只剩書的資料夾，沒有暫存資料夾
    let entries: Vec<_> = std::fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert_eq!(entries, vec![std::ffi::OsString::from("雜誌 翻頁書")]);
}

#[test]
fn an_empty_folder_is_reused() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("book");
    std::fs::create_dir(&target).unwrap();
    write_folder(&target, &sample_files()).unwrap();
    assert!(target.join("index.html").is_file());
}

#[test]
fn existing_content_is_never_overwritten() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("book");
    std::fs::create_dir(&target).unwrap();
    std::fs::write(target.join("keep.txt"), b"mine").unwrap();
    let error = write_folder(&target, &sample_files()).unwrap_err();
    assert!(matches!(&error, AppError::InvalidInput(message) if message.contains("不是空的")), "{error:?}");
    assert_eq!(std::fs::read(target.join("keep.txt")).unwrap(), b"mine");
    assert!(!target.join("index.html").exists());

    let file = dir.path().join("book.html");
    std::fs::write(&file, b"x").unwrap();
    let error = write_folder(&file, &sample_files()).unwrap_err();
    assert!(matches!(&error, AppError::InvalidInput(message) if message.contains("檔案")), "{error:?}");
    // 兩次失敗都沒有留下暫存資料夾
    let count = std::fs::read_dir(dir.path()).unwrap().count();
    assert_eq!(count, 2, "only book/ and book.html");
}

#[test]
fn a_failed_write_leaves_nothing_behind() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("book");
    // 同一個路徑既是檔案又是資料夾：寫到一半失敗
    let files = vec![("a".to_owned(), b"1".to_vec()), ("a/b".to_owned(), b"2".to_vec())];
    assert!(write_folder(&target, &files).is_err());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0, "no book and no temporary folder");
}

#[test]
fn missing_images_are_skipped_not_fatal() {
    let root = tempfile::tempdir().unwrap();
    let output = build_flipbook(root.path(), &request(fixture_document())).unwrap();
    assert_eq!(output.skipped_images, 1);
    assert!(!file(&output, "index.html").contains("<img"));
    assert!(output.files.iter().all(|(name, _)| !name.starts_with("images/")));
}

#[test]
fn a_document_without_pages_is_rejected() {
    let mut document = fixture_document();
    document.pages.clear();
    let root = project_with_image();
    // 檔案驗證（build_render）先擋下；build_flipbook 自己的檢查是保險
    let error = build_flipbook(root.path(), &request(document)).unwrap_err();
    assert!(matches!(error, AppError::InvalidProject(_) | AppError::InvalidInput(_)), "{error:?}");
}

#[test]
fn bundled_page_flip_is_the_recorded_release() {
    // vendor/README.md 記錄的 page-flip 2.0.7；換版本時一起更新
    let hash = Sha256::digest(PAGE_FLIP_JS.as_bytes());
    let hex: String = hash.iter().map(|b| format!("{b:02X}")).collect();
    assert_eq!(hex, "BBACA0BBEF57A22BB66A3FC69D67BAF9A17FB9A9C89EC9ED35E2B91ABE4BD1E7");
    assert!(PAGE_FLIP_LICENSE.starts_with("MIT License"));
}

/// Writes the book to `<EXPORT_PREVIEW_DIR>/flipbook/` for opening in a browser (not part of the
/// normal run).
///
/// `EXPORT_PREVIEW_DIR=<dir> [EXPORT_REQUEST_JSON=<file>] [EXPORT_PROJECT_DIR=<project>] [FLIPBOOK_PAGES=<n>] cargo test flipbook_preview -- --ignored`
#[test]
#[ignore]
fn flipbook_preview() {
    let dir = std::env::var("EXPORT_PREVIEW_DIR").expect("set EXPORT_PREVIEW_DIR");
    // 暫存資料夾要活到最後（_temp）
    let (_temp, root) = crate::export::test_support::preview_root();
    let req = match std::env::var("EXPORT_REQUEST_JSON") {
        Ok(path) => serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap(),
        Err(_) => {
            let pages = std::env::var("FLIPBOOK_PAGES").ok().and_then(|n| n.parse().ok()).unwrap_or(7);
            let mut document = document_with_pages(pages);
            // 目錄與搜尋用：第 1、4 頁有自己的名稱，其他是預設名稱；每頁的標題多一行只有這頁有的文字
            for (n, page) in document.pages.iter_mut().enumerate() {
                page.name = match n {
                    0 => "封面".into(),
                    3 => "專題報導".into(),
                    _ => format!("Page-{}", n + 1),
                };
                for element in &mut page.elements {
                    if let crate::project::format::Element::Text(text) = element {
                        text.text = format!("{}\n第{}頁 Unique", text.text, n + 1);
                    }
                }
            }
            request(document)
        }
    };
    let output = build_flipbook(&root, &req).unwrap();
    let book = std::path::Path::new(&dir).join("flipbook");
    let _ = std::fs::remove_dir_all(&book);
    for (name, data) in &output.files {
        let path = book.join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, data).unwrap();
    }
}

#[test]
fn project_fonts_ship_with_the_book() {
    use crate::export::test_support::{document_with_project_font, write_project_fonts};
    let root = project_with_image();
    let document = document_with_project_font("font-book", false);
    write_project_fonts(root.path(), &document);
    let output = build_flipbook(root.path(), &request(document)).unwrap();
    let css = file(&output, "styles/page.css");
    assert!(css.contains(r#"font-family: "project-font-font-book"; font-weight: 400; font-style: normal; src: url("../fonts/project-font-1.ttf"); ascent-override: 95.2%;"#), "{css}");
    assert_eq!(output.files.iter().filter(|(name, _)| name.starts_with("fonts/project-font-")).count(), 1);
    assert!(file(&output, "index.html").contains("font-family:'project-font-font-book','Noto Sans TC',sans-serif"));
}