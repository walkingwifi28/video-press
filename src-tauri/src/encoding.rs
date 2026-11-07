use crate::model::{Codec, Container, Settings, VideoInfo};

pub fn validate(settings: &Settings) -> Result<(), String> {
    let compatible = matches!(
        (&settings.codec, &settings.container),
        (Codec::H264 | Codec::H265, Container::Mp4 | Container::Mkv)
            | (Codec::Vp9, Container::Webm | Container::Mkv)
            | (
                Codec::Av1,
                Container::Mp4 | Container::Mkv | Container::Webm
            )
    );
    if !compatible {
        return Err("コーデックと出力形式の組み合わせが無効です。".into());
    }
    if settings.crf
        > if matches!(settings.codec, Codec::Vp9 | Codec::Av1) {
            63
        } else {
            51
        }
    {
        return Err("CRFが範囲外です。".into());
    }
    if ![0, 2160, 1440, 1080, 720, 480].contains(&settings.resolution)
        || ![0, 60, 30, 24].contains(&settings.fps)
    {
        return Err("解像度またはFPSが無効です。".into());
    }
    let presets = [
        "ultrafast",
        "superfast",
        "veryfast",
        "faster",
        "fast",
        "medium",
        "slow",
        "slower",
        "veryslow",
    ];
    if if settings.codec == Codec::Vp9 {
        !["0", "1", "2", "3", "4", "5"].contains(&settings.preset.as_str())
    } else if settings.codec == Codec::Av1 {
        !settings
            .preset
            .parse::<u8>()
            .is_ok_and(|preset| preset <= 13)
    } else {
        !presets.contains(&settings.preset.as_str())
    } {
        return Err("Presetが無効です。".into());
    }
    Ok(())
}

pub fn dimensions(video: &VideoInfo, resolution: u32) -> Result<(u32, u32), String> {
    if !video.width.is_finite()
        || !video.height.is_finite()
        || video.width < 2.0
        || video.height < 2.0
    {
        return Err("動画の解像度が無効です。".into());
    }
    let (mut max_w, mut max_h) = match resolution {
        0 => (video.width, video.height),
        2160 => (3840.0, 2160.0),
        1440 => (2560.0, 1440.0),
        1080 => (1920.0, 1080.0),
        720 => (1280.0, 720.0),
        480 => (854.0, 480.0),
        _ => return Err("解像度が無効です。".into()),
    };
    if resolution != 0 && video.height > video.width {
        std::mem::swap(&mut max_w, &mut max_h);
    }
    let factor = (max_w / video.width).min(max_h / video.height).min(1.0);
    let w = ((video.width * factor / 2.0).floor() as u32) * 2;
    let h = ((video.height * factor / 2.0).floor() as u32) * 2;
    if w < 2 || h < 2 {
        return Err("指定解像度では動画の幅または高さが小さすぎます。".into());
    }
    Ok((w, h))
}

pub fn encoder(codec: &Codec) -> &'static str {
    match codec {
        Codec::H264 => "libx264",
        Codec::H265 => "libx265",
        Codec::Vp9 => "libvpx-vp9",
        Codec::Av1 => "libsvtav1",
    }
}
pub fn extension(container: &Container) -> &'static str {
    match container {
        Container::Mp4 => "mp4",
        Container::Mkv => "mkv",
        Container::Webm => "webm",
    }
}

pub fn arguments(
    video: &VideoInfo,
    settings: &Settings,
    output: &str,
) -> Result<Vec<String>, String> {
    validate(settings)?;
    let (w, h) = dimensions(video, settings.resolution)?;
    let mut filter = format!("scale={w}:{h}:flags=lanczos,setsar=1");
    if settings.fps > 0 && video.fps.is_some_and(|fps| fps > settings.fps as f64) {
        filter.push_str(&format!(",fps={}", settings.fps));
    }
    let mut args = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-y".into(),
        "-i".into(),
        video.path.clone(),
        "-map".into(),
        "0:V:0".into(),
        "-map".into(),
        "0:a:0?".into(),
        "-sn".into(),
        "-dn".into(),
        "-map_metadata".into(),
        "-1".into(),
        "-vf".into(),
        filter,
        "-c:v".into(),
        encoder(&settings.codec).into(),
        "-crf".into(),
        settings.crf.to_string(),
        "-pix_fmt".into(),
        "yuv420p".into(),
    ];
    if settings.codec == Codec::Vp9 {
        args.extend([
            "-b:v".into(),
            "0".into(),
            "-cpu-used".into(),
            settings.preset.clone(),
        ]);
    } else {
        args.extend(["-preset".into(), settings.preset.clone()]);
    }
    if settings.codec == Codec::H265 && settings.container == Container::Mp4 {
        args.extend(["-tag:v".into(), "hvc1".into()]);
    }
    if video.has_audio {
        args.extend([
            "-c:a".into(),
            if settings.container == Container::Webm {
                "libopus"
            } else {
                "aac"
            }
            .into(),
            "-b:a".into(),
            "128k".into(),
        ]);
    }
    if settings.container == Container::Mp4 {
        args.extend(["-movflags".into(), "+faststart".into()]);
    }
    args.extend([
        "-fps_mode".into(),
        "passthrough".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.into(),
    ]);
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn av1_supports_containers_and_its_own_quality_and_presets() {
        let mut settings: Settings = serde_json::from_value(serde_json::json!({
            "codec":"av1","container":"mp4","crf":63,"resolution":0,"fps":0,"preset":"13"
        }))
        .expect("AV1 settings must deserialize");
        for container in [Container::Mp4, Container::Mkv, Container::Webm] {
            settings.container = container;
            let args = arguments(&video(960.0, 540.0), &settings, "out.av1").unwrap();
            assert!(args.windows(2).any(|pair| pair == ["-c:v", "libsvtav1"]));
            assert!(args.windows(2).any(|pair| pair == ["-preset", "13"]));
            assert!(!args.iter().any(|arg| arg == "-cpu-used"));
        }
        settings.crf = 64;
        assert!(validate(&settings).is_err());
        settings.crf = 32;
        for preset in ["14", "-1", "medium"] {
            settings.preset = preset.into();
            assert!(validate(&settings).is_err());
        }
        settings.preset = "0".into();
        assert!(validate(&settings).is_ok());
    }
    fn video(w: f64, h: f64) -> VideoInfo {
        VideoInfo {
            id: "x".into(),
            path: "x".into(),
            name: "x".into(),
            width: w,
            height: h,
            duration: 1.0,
            fps: Some(29.97),
            fps_rational: Some("30000/1001".into()),
            has_audio: false,
        }
    }
    fn settings() -> Settings {
        Settings {
            codec: Codec::H264,
            container: Container::Mp4,
            crf: 23,
            resolution: 720,
            fps: 30,
            preset: "medium".into(),
        }
    }
    #[test]
    fn landscape_and_portrait_fit_without_upscale() {
        assert_eq!(
            dimensions(&video(1920.0, 1080.0), 720).unwrap(),
            (1280, 720)
        );
        assert_eq!(
            dimensions(&video(1080.0, 1920.0), 720).unwrap(),
            (720, 1280)
        );
        assert_eq!(dimensions(&video(640.0, 360.0), 720).unwrap(), (640, 360));
        assert_eq!(dimensions(&video(1001.0, 999.0), 0).unwrap(), (1000, 998));
    }
    #[test]
    fn validate_compatibility_and_ranges() {
        let mut s = settings();
        assert!(validate(&s).is_ok());
        s.container = Container::Webm;
        assert!(validate(&s).is_err());
        s.container = Container::Mp4;
        s.crf = 52;
        assert!(validate(&s).is_err());
        s.crf = 23;
        s.preset = "shell command".into();
        assert!(validate(&s).is_err());
    }
    #[test]
    fn no_audio_input_does_not_require_audio_encoder() {
        let args = arguments(&video(960.0, 540.0), &settings(), "out.mp4").unwrap();
        assert!(!args
            .iter()
            .any(|arg| arg == "-c:a" || arg == "aac" || arg == "libopus"));
    }
}
