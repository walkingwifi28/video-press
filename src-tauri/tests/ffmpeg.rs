use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use video_press_lib::{
    batch::{run_batch, Cancellation},
    model::{Codec, Container, ConversionJob, Settings},
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
async fn av1_encodes_mp4_mkv_and_webm() {
    let dir = directory();
    let input = dir.join("AV1 input.mp4");
    sample(&input, "0.3").await;
    for container in ["mp4", "mkv", "webm"] {
        let config: Settings = serde_json::from_value(serde_json::json!({
            "codec":"av1","container":container,"crf":32,"resolution":480,"fps":24,"preset":"12"
        }))
        .expect("AV1 settings must be supported");
        let events = Arc::new(Mutex::new(Vec::new()));
        let collected = events.clone();
        run_batch(
            "av1-test".into(),
            vec![ConversionJob {
                path: input.to_string_lossy().into(),
                settings: config,
            }],
            Cancellation::default(),
            move |event| collected.lock().unwrap().push(event),
        )
        .await
        .unwrap();
        let events = events.lock().unwrap();
        let output = events
            .iter()
            .find(|event| event.status == "completed")
            .unwrap_or_else(|| panic!("AV1 failed: {:?}", *events))
            .output_path
            .as_deref()
            .unwrap();
        let inspected = probe::inspect(output).await.unwrap();
        assert_eq!(
            PathBuf::from(output).file_name().unwrap().to_str().unwrap(),
            format!("AV1 input_12_av1_852x480_24fps_crf32.{container}")
        );
        assert_eq!((inspected.width, inspected.height), (852.0, 480.0));
        assert_eq!(inspected.fps, Some(24.0));
        let codec = probe::command("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=codec_name",
                "-of",
                "csv=p=0",
                output,
            ])
            .output()
            .await
            .unwrap();
        assert!(codec.status.success());
        assert_eq!(String::from_utf8_lossy(&codec.stdout).trim(), "av1");
    }
    fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn real_batch_continues_after_failure_and_never_overwrites() {
    let dir = directory();
    let input = dir.join("日本語 input.mp4");
    sample(&input, "0.3").await;
    let existing = dir.join("日本語 input_ultrafast_h264_852x480_24fps_crf23.mp4");
    fs::write(&existing, b"keep").unwrap();
    let bad = dir.join("broken.mp4");
    fs::write(&bad, b"invalid").unwrap();
    let events = Arc::new(Mutex::new(Vec::new()));
    let collected = events.clone();
    run_batch(
        "test".into(),
        vec![
            ConversionJob {
                path: bad.to_string_lossy().into(),
                settings: settings(),
            },
            ConversionJob {
                path: input.to_string_lossy().into(),
                settings: settings(),
            },
        ],
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
    assert!(result
        .output_path
        .as_deref()
        .unwrap()
        .ends_with("日本語 input_ultrafast_h264_852x480_24fps_crf23_1.mp4"));
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
        vec![ConversionJob {
            path: input.to_string_lossy().into(),
            settings: settings(),
        }],
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
        vec![ConversionJob {
            path: rotated.to_string_lossy().into(),
            settings: config,
        }],
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
    assert!(output_path.ends_with("rotated_ultrafast_h264_426x854_29.97fps_crf23.mp4"));
    fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn mixed_jobs_keep_their_own_settings() {
    let dir = directory();
    let first = dir.join("first.mp4");
    let second_dir = dir.join("別のフォルダー");
    fs::create_dir(&second_dir).unwrap();
    let second = second_dir.join("second.mp4");
    sample(&first, "0.3").await;
    fs::copy(&first, &second).unwrap();
    let mut other = settings();
    other.container = Container::Mkv;
    other.resolution = 0;
    other.fps = 0;
    other.crf = 35;
    other.preset = "veryfast".into();
    let events = Arc::new(Mutex::new(Vec::new()));
    let collected = events.clone();
    run_batch(
        "mixed".into(),
        vec![
            ConversionJob {
                path: first.to_string_lossy().into(),
                settings: settings(),
            },
            ConversionJob {
                path: second.to_string_lossy().into(),
                settings: other,
            },
        ],
        Cancellation::default(),
        move |e| collected.lock().unwrap().push(e),
    )
    .await
    .unwrap();
    let outputs: Vec<_> = events
        .lock()
        .unwrap()
        .iter()
        .filter(|e| e.status == "completed")
        .map(|e| e.output_path.clone().unwrap())
        .collect();
    assert_eq!(outputs.len(), 2);
    assert_eq!(
        fs::canonicalize(&outputs[0]).unwrap().parent().unwrap(),
        fs::canonicalize(&dir).unwrap()
    );
    assert_eq!(
        fs::canonicalize(&outputs[1]).unwrap().parent().unwrap(),
        fs::canonicalize(&second_dir).unwrap()
    );
    let a = probe::inspect(&outputs[0]).await.unwrap();
    let b = probe::inspect(&outputs[1]).await.unwrap();
    assert_eq!((a.width, a.height, a.fps), (852.0, 480.0, Some(24.0)));
    assert_eq!((b.width, b.height), (960.0, 540.0));
    assert!((b.fps.unwrap() - 29.97).abs() < 0.01);
    assert!(outputs[0].ends_with("first_ultrafast_h264_852x480_24fps_crf23.mp4"));
    assert!(outputs[1].ends_with("second_veryfast_h264_960x540_29.97fps_crf35.mkv"));
    fs::remove_dir_all(dir).unwrap();
}
