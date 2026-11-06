use crate::model::{Environment, VideoInfo};
use serde_json::Value;
use std::{path::Path, process::Stdio, time::Duration};
use tokio::process::Command;

pub fn command(program: &str) -> Command {
    let mut c = Command::new(program);
    c.stdin(Stdio::null()).kill_on_drop(true);
    #[cfg(windows)]
    c.creation_flags(0x08000000);
    c
}

pub fn parse(path: &str, json: &Value) -> Result<VideoInfo, String> {
    let streams = json["streams"]
        .as_array()
        .ok_or("動画ストリームが見つかりません。")?;
    let video = streams
        .iter()
        .find(|v| {
            v["codec_type"] == "video"
                && v["disposition"]["attached_pic"].as_u64().unwrap_or(0) == 0
        })
        .ok_or("動画ストリームが見つかりません。")?;
    let mut width = video["width"].as_f64().unwrap_or(0.0);
    let mut height = video["height"].as_f64().unwrap_or(0.0);
    let sar = video["sample_aspect_ratio"]
        .as_str()
        .and_then(|s| ratio(s, ':'))
        .unwrap_or(1.0);
    width *= sar;
    let rotation = video["side_data_list"]
        .as_array()
        .and_then(|list| list.iter().find_map(|v| v["rotation"].as_f64()))
        .or_else(|| {
            video["tags"]["rotate"]
                .as_str()
                .and_then(|v| v.parse().ok())
        })
        .unwrap_or(0.0);
    if (rotation.abs() % 180.0 - 90.0).abs() < 0.1 {
        std::mem::swap(&mut width, &mut height);
    }
    if width < 2.0 || height < 2.0 || !width.is_finite() || !height.is_finite() {
        return Err("動画の解像度が無効です。".into());
    }
    let fps_rational = video["avg_frame_rate"]
        .as_str()
        .filter(|s| ratio(s, '/').is_some())
        .map(str::to_string);
    let fps = fps_rational.as_deref().and_then(|s| ratio(s, '/'));
    let duration = json["format"]["duration"]
        .as_str()
        .or_else(|| video["duration"].as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|n| n.is_finite() && *n >= 0.0)
        .unwrap_or(0.0);
    Ok(VideoInfo {
        id: path.into(),
        path: path.into(),
        name: Path::new(path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        width,
        height,
        duration,
        fps,
        fps_rational,
        has_audio: streams.iter().any(|v| v["codec_type"] == "audio"),
    })
}

fn ratio(s: &str, separator: char) -> Option<f64> {
    let (a, b) = s.split_once(separator)?;
    let n = a.parse::<f64>().ok()? / b.parse::<f64>().ok()?;
    (n.is_finite() && n > 0.0).then_some(n)
}

pub async fn inspect(path: &str) -> Result<VideoInfo, String> {
    let full = std::fs::canonicalize(path).map_err(|e| format!("入力ファイルを開けません: {e}"))?;
    if !full.is_file() {
        return Err("入力がファイルではありません。".into());
    }
    let full = full.to_string_lossy().to_string();
    let output = tokio::time::timeout(
        Duration::from_secs(30),
        command("ffprobe")
            .args([
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                &full,
            ])
            .output(),
    )
    .await
    .map_err(|_| "動画の解析がタイムアウトしました。")?
    .map_err(|e| format!("ffprobeを実行できません: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "動画を解析できません: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let json: Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("解析結果が無効です: {e}"))?;
    parse(&full, &json)
}

pub async fn environment() -> Environment {
    let mut env = Environment {
        ffmpeg: false,
        ffprobe: false,
        encoders: vec![],
        errors: vec![],
    };
    for program in ["ffmpeg", "ffprobe"] {
        match tokio::time::timeout(
            Duration::from_secs(10),
            command(program).arg("-version").output(),
        )
        .await
        {
            Ok(Ok(result)) if result.status.success() => {
                if program == "ffmpeg" {
                    env.ffmpeg = true;
                } else {
                    env.ffprobe = true;
                }
            }
            _ => env.errors.push(format!(
                "{program}を起動できません。インストールしてPATHを設定してください。"
            )),
        }
    }
    if env.ffmpeg {
        match tokio::time::timeout(
            Duration::from_secs(10),
            command("ffmpeg")
                .args(["-hide_banner", "-encoders"])
                .output(),
        )
        .await
        {
            Ok(Ok(result)) if result.status.success() => {
                env.encoders = String::from_utf8_lossy(&result.stdout)
                    .lines()
                    .filter_map(|line| {
                        let cols: Vec<_> = line.split_whitespace().collect();
                        (cols.len() > 1 && (cols[0].starts_with('V') || cols[0].starts_with('A')))
                            .then(|| cols[1].to_string())
                    })
                    .collect();
            }
            _ => env
                .errors
                .push("ffmpegのエンコーダー一覧を取得できません。".into()),
        }
    }
    env
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn applies_sar_and_rotation_and_preserves_fps_fraction() {
        let data = serde_json::json!({"streams":[{"codec_type":"video","width":720,"height":480,"sample_aspect_ratio":"4:3","avg_frame_rate":"30000/1001","side_data_list":[{"rotation":90}]},{"codec_type":"audio"}],"format":{"duration":"2.5"}});
        let v = parse("x.mp4", &data).unwrap();
        assert_eq!((v.width, v.height), (480.0, 960.0));
        assert_eq!(v.fps_rational.as_deref(), Some("30000/1001"));
        assert!(v.has_audio);
    }
    #[test]
    fn rejects_non_video_and_tiny_invalid_dimensions() {
        assert!(parse("x", &serde_json::json!({"streams":[]})).is_err());
        assert!(parse(
            "x",
            &serde_json::json!({"streams":[{"codec_type":"video","width":0,"height":0}]})
        )
        .is_err());
    }
}
