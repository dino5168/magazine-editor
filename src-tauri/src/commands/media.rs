//! Video links: what YouTube says about a video before it is added to a page.

use crate::error::AppResult;
use crate::media::{self, YouTubeInfo};
use crate::project::ProjectState;
use tauri::State;

/// Fetches the thumbnail (stored in the current project's `assets/images/`) and the title of a
/// YouTube video. Only fixed YouTube URLs built from the validated id are requested.
///
/// # Returns
/// Poster and title (each null when unavailable) and whether the video can be embedded.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) for an id that is not a YouTube video id; the project
/// errors of `ProjectState::current`.
#[tauri::command]
pub async fn media_youtube_info(state: State<'_, ProjectState>, video_id: String) -> AppResult<YouTubeInfo> {
    let root = state.current()?.root;
    media::youtube_info(&root, &video_id).await
}
