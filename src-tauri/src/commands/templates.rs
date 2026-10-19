//! Document template commands (文件範本). Templates live in the app data folder and are named by id
//! only; the frontend never sees or sends their paths except as asset URLs for thumbnails.

use super::project::{activate, untitled_base};
use crate::db::DbState;
use crate::error::AppResult;
use crate::project::format::ProjectContent;
use crate::project::templates::{self, SavedTemplate, TemplateEntry, TemplateMeta, TEMPLATES_DIR};
use crate::project::{self, OpenedProject, ProjectState};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

/// `%APPDATA%\<identifier>\templates`: roaming like the database, since templates are the user's
/// own work rather than a cache.
fn templates_base(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_data_dir()?.join(TEMPLATES_DIR))
}

/// Removes what an interrupted create / replace left behind. Called once at startup.
pub fn clean_up(app: &AppHandle) {
    if let Ok(base) = templates_base(app) {
        templates::clean_up(&base);
    }
}

/// Lists every template, newest update first, and lets the asset protocol read their files
/// (thumbnails show the images on master pages).
#[tauri::command]
pub async fn template_list(app: AppHandle) -> AppResult<Vec<TemplateEntry>> {
    let base = templates_base(&app)?;
    std::fs::create_dir_all(&base)?;
    app.asset_protocol_scope().allow_directory(&base, true)?;
    templates::list(&base)
}

/// Saves `content` (already trimmed to the template's pages by the frontend) as a new template,
/// copying its font and image files from the current project.
#[tauri::command]
pub async fn template_create(
    app: AppHandle,
    state: State<'_, ProjectState>,
    name: String,
    description: String,
    content: ProjectContent,
) -> AppResult<SavedTemplate> {
    let source = state.current()?;
    templates::create(&templates_base(&app)?, &source.root, &name, &description, content, &project::now())
}

/// Replaces a template's content with `content` from the current project, keeping its name.
#[tauri::command]
pub async fn template_replace(
    app: AppHandle,
    state: State<'_, ProjectState>,
    id: String,
    content: ProjectContent,
) -> AppResult<SavedTemplate> {
    let source = state.current()?;
    templates::replace(&templates_base(&app)?, &id, &source.root, content, &project::now())
}

/// Changes a template's name and description.
#[tauri::command]
pub async fn template_update_info(app: AppHandle, id: String, name: String, description: String) -> AppResult<TemplateMeta> {
    templates::update_info(&templates_base(&app)?, &id, &name, &description, &project::now())
}

/// Deletes a template.
#[tauri::command]
pub async fn template_delete(app: AppHandle, id: String) -> AppResult<()> {
    templates::delete(&templates_base(&app)?, &id)
}

/// Creates an untitled project from a template and makes it the current project (the frontend has
/// already handled unsaved changes, as for `project_new`).
#[tauri::command]
pub async fn project_new_from_template(
    app: AppHandle,
    state: State<'_, ProjectState>,
    db: State<'_, DbState>,
    id: String,
) -> AppResult<OpenedProject> {
    let made = templates::new_project_from(&templates_base(&app)?, &id, &untitled_base(&app)?, &project::now())?;
    let info = activate(&app, &state, &db, made.project, "")?;
    Ok(OpenedProject {
        info,
        content: made.content,
        recovered_from_backup: false,
        library: made.library.library,
        library_rebuilt: made.library.rebuilt,
    })
}
