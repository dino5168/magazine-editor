//! Thumbnails of the asset library's images, so cards do not decode full-size photos.
//!
//! A thumbnail lives at `assets/thumbs/<stem>.jpg` (or `.png` when the image has transparency),
//! where `<stem>` is the original's content hash. The path is derived from the original, so
//! `library.json` does not store it; thumbnails can always be regenerated.

use super::format::{self, ASSET_DIR};
use crate::error::{AppError, AppResult};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageReader};
use std::collections::HashSet;
use std::fs;
use std::io::{BufWriter, ErrorKind};
use std::path::Path;

pub const THUMB_DIR: &str = "assets/thumbs";
/// Longest side of a thumbnail (px): cards are at most ~240 css px wide, ×2 for high-DPI screens.
pub const THUMB_MAX_SIDE: u32 = 480;
const JPEG_QUALITY: u8 = 82;
const EXTENSIONS: [&str; 2] = ["jpg", "png"];

/// `assets/images/<stem>.<ext>` → `<stem>`.
fn stem_of(src: &str) -> AppResult<&str> {
    format::validate_asset_path(src)?;
    let file = &src[ASSET_DIR.len() + 1..];
    Ok(file.rsplit_once('.').map_or(file, |(stem, _)| stem))
}

/// The thumbnail of `src` if one was already made.
///
/// # Errors
/// `AppError::InvalidProject` when `src` is not a page image path.
pub fn existing(root: &Path, src: &str) -> AppResult<Option<String>> {
    let stem = stem_of(src)?;
    Ok(EXTENSIONS
        .iter()
        .map(|extension| format!("{THUMB_DIR}/{stem}.{extension}"))
        .find(|thumb| root.join(thumb).is_file()))
}

fn decode(path: &Path) -> AppResult<DynamicImage> {
    let undecodable = |_| AppError::invalid_input("圖片無法解碼，無法產生縮圖");
    let mut decoder = ImageReader::open(path)?.with_guessed_format()?.into_decoder().map_err(undecodable)?;
    // 相機照片常靠 EXIF 方向轉正；瀏覽器顯示原圖時會轉，縮圖也要轉，否則卡片是橫躺的
    let orientation = decoder.orientation().unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut decoded = DynamicImage::from_decoder(decoder).map_err(undecodable)?;
    decoded.apply_orientation(orientation);
    Ok(decoded)
}

/// True when some pixel is not fully opaque (many PNGs have an alpha channel that is all 255).
fn has_transparency(image: &DynamicImage) -> bool {
    image.color().has_alpha() && image.to_rgba8().pixels().any(|pixel| pixel[3] < u8::MAX)
}

/// Makes (or finds) the thumbnail of a page image.
///
/// # Returns
/// The thumbnail's project-relative path, or `None` when the original is small enough to show as
/// is (longest side ≤ `THUMB_MAX_SIDE`) or is an SVG.
///
/// # Errors
/// `AppError::InvalidProject` for a path outside `assets/images/`, `AppError::InvalidInput` when
/// the image cannot be decoded, `AppError::Io` on read / write failure.
pub fn ensure(root: &Path, src: &str) -> AppResult<Option<String>> {
    if let Some(thumb) = existing(root, src)? {
        return Ok(Some(thumb));
    }
    if src.ends_with(".svg") {
        return Ok(None);
    }
    let original = decode(&root.join(src))?;
    if original.width().max(original.height()) <= THUMB_MAX_SIDE {
        return Ok(None);
    }
    let thumb = original.thumbnail(THUMB_MAX_SIDE, THUMB_MAX_SIDE);
    let transparent = has_transparency(&thumb);
    let relative = format!("{THUMB_DIR}/{}.{}", stem_of(src)?, if transparent { "png" } else { "jpg" });
    let dir = root.join(THUMB_DIR);
    fs::create_dir_all(&dir)?;
    // 同一張圖可能同時被要求兩次：各自寫自己的暫存檔，最後 rename 覆蓋也沒關係（內容相同）
    let tmp = dir.join(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> AppResult<()> {
        let mut writer = BufWriter::new(fs::File::create(&tmp)?);
        let encoded = if transparent {
            let rgba = thumb.to_rgba8();
            PngEncoder::new(&mut writer).write_image(&rgba, rgba.width(), rgba.height(), image::ExtendedColorType::Rgba8)
        } else {
            let rgb = thumb.to_rgb8();
            JpegEncoder::new_with_quality(&mut writer, JPEG_QUALITY).write_image(&rgb, rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        };
        encoded.map_err(|error| AppError::invalid_input(format!("無法產生縮圖（{error}）")))?;
        writer.into_inner().map_err(|error| error.into_error())?.sync_all()?;
        fs::rename(&tmp, root.join(&relative))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result.map(|()| Some(relative))
}

/// Copies the existing thumbnails of `sources` (page image paths) from one project folder to
/// another. Missing thumbnails are skipped (they are made again when needed).
///
/// # Errors
/// `AppError::Io` on copy failure.
pub fn copy_existing<'a>(from: &Path, to: &Path, sources: impl Iterator<Item = &'a str>) -> AppResult<()> {
    for src in sources {
        let Ok(Some(thumb)) = existing(from, src) else { continue };
        fs::create_dir_all(to.join(THUMB_DIR))?;
        match fs::copy(from.join(&thumb), to.join(&thumb)) {
            Ok(_) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

/// Deletes thumbnails whose original is not in `kept` (page image paths), plus leftover temp
/// files.
///
/// # Returns
/// Number of files removed.
///
/// # Errors
/// `AppError::Io` when the directory cannot be listed.
pub fn remove_orphans<'a>(root: &Path, kept: impl Iterator<Item = &'a str>) -> AppResult<usize> {
    let entries = match fs::read_dir(root.join(THUMB_DIR)) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error.into()),
    };
    let stems: HashSet<&str> = kept.filter_map(|src| stem_of(src).ok()).collect();
    let mut removed = 0;
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let keep = name.rsplit_once('.').is_some_and(|(stem, extension)| EXTENSIONS.contains(&extension) && stems.contains(stem));
        if !keep && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage, Rgba, RgbaImage};

    fn write_png(root: &Path, name: &str, image: &DynamicImage) -> String {
        let src = format!("{ASSET_DIR}/{name}.png");
        fs::create_dir_all(root.join(ASSET_DIR)).unwrap();
        image.save(root.join(&src)).unwrap();
        src
    }

    fn opaque(width: u32, height: u32) -> DynamicImage {
        DynamicImage::ImageRgb8(RgbImage::from_fn(width, height, |x, y| Rgb([(x % 256) as u8, (y % 256) as u8, 90])))
    }

    #[test]
    fn makes_a_jpeg_thumbnail_for_large_opaque_images() {
        let dir = tempfile::tempdir().unwrap();
        // 不透明但有 alpha 通道（全 255）也當成不透明
        let rgba = DynamicImage::ImageRgba8(opaque(1200, 600).to_rgba8());
        let src = write_png(dir.path(), "aaaa", &rgba);
        let thumb = ensure(dir.path(), &src).unwrap().unwrap();
        assert_eq!(thumb, format!("{THUMB_DIR}/aaaa.jpg"));
        let made = image::open(dir.path().join(&thumb)).unwrap();
        assert_eq!((made.width(), made.height()), (480, 240));
        // 第二次直接用已經做好的
        assert_eq!(ensure(dir.path(), &src).unwrap(), Some(thumb.clone()));
        assert_eq!(existing(dir.path(), &src).unwrap(), Some(thumb));
    }

    #[test]
    fn keeps_transparency_as_png() {
        let dir = tempfile::tempdir().unwrap();
        let image = DynamicImage::ImageRgba8(RgbaImage::from_fn(600, 900, |x, _| Rgba([200, 30, 30, if x < 300 { 0 } else { 255 }])));
        let src = write_png(dir.path(), "bbbb", &image);
        let thumb = ensure(dir.path(), &src).unwrap().unwrap();
        assert_eq!(thumb, format!("{THUMB_DIR}/bbbb.png"));
        let made = image::open(dir.path().join(&thumb)).unwrap();
        assert_eq!((made.width(), made.height()), (320, 480));
        assert_eq!(made.to_rgba8().get_pixel(0, 0)[3], 0);
    }

    #[test]
    fn small_images_and_svg_use_the_original() {
        let dir = tempfile::tempdir().unwrap();
        let src = write_png(dir.path(), "cccc", &opaque(480, 300));
        assert_eq!(ensure(dir.path(), &src).unwrap(), None);
        assert!(!dir.path().join(THUMB_DIR).exists());
        assert_eq!(ensure(dir.path(), "assets/images/dddd.svg").unwrap(), None);
    }

    #[test]
    fn applies_exif_orientation() {
        let dir = tempfile::tempdir().unwrap();
        // 800×400 的 JPEG 加上 EXIF Orientation = 6（順時針轉 90°）→ 顯示時是直的
        let mut jpeg = Vec::new();
        JpegEncoder::new_with_quality(&mut jpeg, 90)
            .write_image(opaque(800, 400).to_rgb8().as_raw(), 800, 400, image::ExtendedColorType::Rgb8)
            .unwrap();
        let tiff: Vec<u8> = [
            b"II*\0".as_slice(),
            &8u32.to_le_bytes(),
            &1u16.to_le_bytes(),
            &0x0112u16.to_le_bytes(),
            &3u16.to_le_bytes(),
            &1u32.to_le_bytes(),
            &[6, 0, 0, 0],
            &0u32.to_le_bytes(),
        ]
        .concat();
        let payload = [b"Exif\0\0".as_slice(), &tiff].concat();
        let length = u16::try_from(payload.len() + 2).unwrap().to_be_bytes();
        let with_exif = [&jpeg[..2], &[0xFF, 0xE1], &length, &payload, &jpeg[2..]].concat();
        let src = format!("{ASSET_DIR}/eeee.jpg");
        fs::create_dir_all(dir.path().join(ASSET_DIR)).unwrap();
        fs::write(dir.path().join(&src), with_exif).unwrap();

        let thumb = ensure(dir.path(), &src).unwrap().unwrap();
        let made = image::open(dir.path().join(&thumb)).unwrap();
        assert_eq!((made.width(), made.height()), (240, 480));
    }

    #[test]
    fn rejects_bad_paths_and_undecodable_files() {
        let dir = tempfile::tempdir().unwrap();
        assert!(ensure(dir.path(), "assets/texts/a.md").is_err());
        assert!(ensure(dir.path(), "assets/images/../x.png").is_err());
        fs::create_dir_all(dir.path().join(ASSET_DIR)).unwrap();
        fs::write(dir.path().join("assets/images/ffff.png"), b"not an image").unwrap();
        assert!(matches!(ensure(dir.path(), "assets/images/ffff.png"), Err(AppError::InvalidInput(_))));
    }

    /// 量測用：`cargo test thumbnail_timing -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn thumbnail_timing() {
        let dir = tempfile::tempdir().unwrap();
        let mut jpeg = Vec::new();
        JpegEncoder::new_with_quality(&mut jpeg, 90)
            .write_image(opaque(6000, 4000).to_rgb8().as_raw(), 6000, 4000, image::ExtendedColorType::Rgb8)
            .unwrap();
        let src = format!("{ASSET_DIR}/timing.jpg");
        fs::create_dir_all(dir.path().join(ASSET_DIR)).unwrap();
        fs::write(dir.path().join(&src), &jpeg).unwrap();
        let start = std::time::Instant::now();
        let thumb = ensure(dir.path(), &src).unwrap().unwrap();
        let bytes = fs::metadata(dir.path().join(&thumb)).unwrap().len();
        println!("24 MP JPEG（{} KB）→ 縮圖 {} KB：{:?}", jpeg.len() / 1024, bytes / 1024, start.elapsed());
    }

    #[test]
    fn copies_and_cleans_up_by_original() {
        let from = tempfile::tempdir().unwrap();
        let to = tempfile::tempdir().unwrap();
        let kept = write_png(from.path(), "1111", &opaque(1000, 500));
        let gone = write_png(from.path(), "2222", &opaque(1000, 500));
        ensure(from.path(), &kept).unwrap();
        ensure(from.path(), &gone).unwrap();
        fs::write(from.path().join(THUMB_DIR).join("x.tmp"), b"x").unwrap();

        copy_existing(from.path(), to.path(), [kept.as_str()].into_iter()).unwrap();
        assert!(to.path().join(THUMB_DIR).join("1111.jpg").exists());
        assert!(!to.path().join(THUMB_DIR).join("2222.jpg").exists());

        assert_eq!(remove_orphans(from.path(), [kept.as_str()].into_iter()).unwrap(), 2);
        assert!(from.path().join(THUMB_DIR).join("1111.jpg").exists());
    }
}
