use serde::{ser::SerializeStruct, Serialize, Serializer};

/// Error returned by every `#[tauri::command]`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("state lock poisoned")]
    LockPoisoned,
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("invalid project: {0}")]
    InvalidProject(String),
    #[error("project requires schema version {0}, which is newer than this app supports")]
    UnsupportedVersion(u32),
    #[error("no project is open")]
    NoProject,
    /// PDF export failed; the message is user-facing Chinese.
    #[error("{0}")]
    Export(String),
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            Self::Sqlite(_) => "sqlite",
            Self::LockPoisoned => "lockPoisoned",
            Self::InvalidInput(_) => "invalidInput",
            Self::Io(_) => "io",
            Self::InvalidProject(_) => "invalidProject",
            Self::UnsupportedVersion(_) => "unsupportedVersion",
            Self::NoProject => "noProject",
            Self::Export(_) => "export",
            Self::Tauri(_) => "tauri",
        }
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::InvalidInput(message.into())
    }

    pub fn invalid_project(message: impl Into<String>) -> Self {
        Self::InvalidProject(message.into())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        Self::InvalidProject(error.to_string())
    }
}

// 以 { kind, message } 序列化，前端可依 kind 做 type narrowing，而非解析錯誤字串
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
