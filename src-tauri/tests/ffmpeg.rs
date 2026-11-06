use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use video_press_lib::{
    batch::{run_batch, Cancellation},
    model::{Codec, Container, Settings},
    probe,
};

fn directory() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("video-press-実変換 {stamp}"));
    fs::create_dir_all(&dir).unwrap();
    dir
}
fn settings() -> Settings {
    Settings {
        codec: Codec::H264,
        container: Container::Mp4,
        crf: 23,
        resolution: 480,
        fps: 24,
        preset: "ultrafast".into(),
    }
}
async fn sample(path: &std::path::Path, duration: &str) {
    let output = probe::command("ffmpeg")
        .args([
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=960x540:rate=30000/1001",
            "-t",
            duration,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-y",
        ])
        .arg(path)
        .output()
        .await
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[tokio::test]
async fn real_batch_continues_after_failure_and_never_overwrites() {
    let dir = directory();
    let input = dir.join("日本語 input.mp4");
    sample(&input, "0.3").await;
    let existing = dir.join("日本語 input_converted.mp4");
    fs::write(&existing, b"keep").unwrap();
    let bad = dir.join("broken.mp4");
    fs::write(&bad, b"invalid").unwrap();
    let events = Arc::new(Mutex::new(Vec::new()));
    let collected = events.clone();
    run_batch(
        "test".into(),
        vec![bad.to_string_lossy().into(), input.to_string_lossy().into()],
        dir.to_string_lossy().into(),
        settings(),
        Cancellation::default(),
        move |e| collected.lock().unwrap().push(e),
    )
    .await
    .unwrap();
    let events = events.lock().unwrap();
    assert!(events.iter().any(|e| e.status == "failed"));
    let result = events
        .iter()
        .find(|e| e.status == "completed")
        .expect("one completed");
    let video = probe::inspect(result.output_path.as_deref().unwrap())
        .await
        .unwrap();
    assert_eq!((video.width, video.height), (852.0, 480.0));
    assert!(!video.has_audio);
    assert_eq!(video.fps, Some(24.0));
    assert_eq!(fs::read(existing).unwrap(), b"keep");
    assert!(input.exists());
    assert_eq!(events.last().unwrap().status, "finished");
    drop(events);
    fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn cancellation_removes_incomplete_output_and_marks_remaining() {
    let dir = directory();
    let input = dir.join("cancel.mp4");
    sample(&input, "2").await;
    let cancellation = Cancellation::default();
    let handle = cancellation.clone();
    let events = Arc::new(Mutex::new(Vec::new()));
    let collected = events.clone();
    run_batch(
        "cancel".into(),
        vec![input.to_string_lossy().into()],
        dir.to_string_lossy().into(),
        settings(),
        cancellation,
        move |e| {
            if e.status == "running" && e.progress > 0.0 {
                handle.cancel();
            }
            collected.lock().unwrap().push(e);
        },
    )
    .await
    .unwrap();
    assert!(events
        .lock()
        .unwrap()
        .iter()
        .any(|e| e.status == "cancelled"));
    assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
    fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn rotated_anamorphic_input_becomes_square_pixel_portrait() {
    let dir = directory();
    let source = dir.join("anamorphic.mp4");
    let rotated = dir.join("rotated.mp4");
    let result = probe::command("ffmpeg")
        .args([
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=720x480:rate=30000/1001",
            "-t",
            "0.3",
            "-vf",
            "setsar=4/3",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-y",
        ])
        .arg(&source)
        .output()
        .await
        .unwrap();
    assert!(result.status.success());
    let result = probe::command("ffmpeg")
        .args(["-v", "error", "-display_rotation", "90", "-i"])
        .arg(&source)
        .args(["-c", "copy", "-y"])
        .arg(&rotated)
        .output()
        .await
        .unwrap();
    assert!(result.status.success());
    let input = probe::inspect(&rotated.to_string_lossy()).await.unwrap();
    assert_eq!((input.width, input.height), (480.0, 960.0));
    let events = Arc::new(Mutex::new(Vec::new()));
    let collected = events.clone();
    let mut config = settings();
    config.fps = 0;
    run_batch(
        "rotation".into(),
        vec![rotated.to_string_lossy().into()],
        dir.to_string_lossy().into(),
        config,
        Cancellation::default(),
        move |e| collected.lock().unwrap().push(e),
    )
    .await
    .unwrap();
    let output_path = events
        .lock()
        .unwrap()
        .iter()
        .find(|e| e.status == "completed")
        .unwrap()
        .output_path
        .clone()
        .unwrap();
    let result = probe::inspect(&output_path).await.unwrap();
    assert_eq!((result.width, result.height), (426.0, 854.0));
    assert_eq!(result.fps_rational.as_deref(), Some("30000/1001"));
    fs::remove_dir_all(dir).unwrap();
}
