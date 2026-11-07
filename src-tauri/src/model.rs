use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub id: String,
    pub path: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub duration: f64,
    pub fps: Option<f64>,
    pub fps_rational: Option<String>,
    pub has_audio: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum ProbeResult {
    Ready { video: VideoInfo },
    Error { path: String, error: String },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Codec {
    H264,
    H265,
    Vp9,
    Av1,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Container {
    Mp4,
    Mkv,
    Webm,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub codec: Codec,
    pub container: Container,
    pub crf: u8,
    pub resolution: u32,
    pub fps: u32,
    pub preset: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub batch_id: String,
    pub file_id: String,
    pub status: String,
    pub progress: f64,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Environment {
    pub ffmpeg: bool,
    pub ffprobe: bool,
    pub encoders: Vec<String>,
    pub errors: Vec<String>,
}
