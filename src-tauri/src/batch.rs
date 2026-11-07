use crate::{
    encoding,
    model::{ConversionJob, Progress},
    output, probe,
};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    sync::Notify,
};

#[derive(Clone)]
pub struct Cancellation {
    pub cancelled: Arc<AtomicBool>,
    pub notify: Arc<Notify>,
}
impl Default for Cancellation {
    fn default() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
            notify: Arc::new(Notify::new()),
        }
    }
}
impl Cancellation {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
    }
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
    async fn wait(&self) {
        while !self.is_cancelled() {
            tokio::select! {_=self.notify.notified()=>{},_=tokio::time::sleep(Duration::from_millis(100))=>{}}
        }
    }
}

pub struct Active {
    pub id: String,
    pub cancellation: Cancellation,
}
#[derive(Default)]
pub struct BatchState {
    pub active: Mutex<Option<Active>>,
    pub exiting: AtomicBool,
}

pub async fn run_batch(
    batch_id: String,
    jobs: Vec<ConversionJob>,
    directory: String,
    cancel: Cancellation,
    emit: impl Fn(Progress) + Send + Sync,
) -> Result<(), String> {
    for job in &jobs {
        encoding::validate(&job.settings)?;
    }
    let event = |file_id: &str,
                 status: &str,
                 progress: f64,
                 output_path: Option<String>,
                 error: Option<String>| {
        emit(Progress {
            batch_id: batch_id.clone(),
            file_id: file_id.into(),
            status: status.into(),
            progress,
            output_path,
            error,
        })
    };
    for job in &jobs {
        event(&job.path, "queued", 0.0, None, None);
    }
    for ConversionJob { path, settings } in jobs {
        if cancel.is_cancelled() {
            event(&path, "cancelled", 0.0, None, None);
            continue;
        }
        event(&path, "running", 0.0, None, None);
        let work = async {
            let video = tokio::select! {res=probe::inspect(&path)=>res?,_=cancel.wait()=>return Err("変換を中止しました。".into())};
            if cancel.is_cancelled() {
                return Err("変換を中止しました。".into());
            }
            let directory = Path::new(&directory);
            let temp = output::reserve(directory, encoding::extension(&settings.container))?;
            let args = encoding::arguments(&video, &settings, &temp.path.to_string_lossy())?;
            let mut child = probe::command("ffmpeg")
                .args(args)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| format!("ffmpegを実行できません: {e}"))?;
            let stdout = child.stdout.take().ok_or("進捗を取得できません。")?;
            let mut stderr = child.stderr.take().ok_or("ログを取得できません。")?;
            let logs = tokio::spawn(async move {
                let mut tail = Vec::new();
                let mut chunk = [0u8; 4096];
                loop {
                    match stderr.read(&mut chunk).await {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            tail.extend_from_slice(&chunk[..n]);
                            if tail.len() > 16384 {
                                tail.drain(..tail.len() - 16384);
                            }
                        }
                    }
                }
                String::from_utf8_lossy(&tail).into_owned()
            });
            let mut lines = BufReader::new(stdout).lines();
            let mut stream_open = true;
            let mut tick = tokio::time::interval(Duration::from_millis(100));
            let result = loop {
                if cancel.is_cancelled() {
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                    break Err("変換を中止しました。".to_string());
                }
                match child.try_wait() {
                    Ok(Some(status)) => {
                        break if status.success() {
                            Ok(())
                        } else {
                            Err(format!("ffmpegが失敗しました（{status}）。"))
                        }
                    }
                    Err(e) => break Err(e.to_string()),
                    Ok(None) => {}
                }
                tokio::select! {
                    _=tick.tick()=>{},
                    next=lines.next_line(),if stream_open=>match next {
                        Ok(Some(line))=>if let Some(value)=line.strip_prefix("out_time_us=").and_then(|s|s.parse::<f64>().ok()) {if video.duration>0.0 {event(&path,"running",(value/1_000_000.0/video.duration*100.0).clamp(0.0,99.9),None,None);}},
                        _=>stream_open=false,
                    }
                }
            };
            // Always reap the process before releasing the temporary output.
            if result.is_err() {
                let _ = child.kill().await;
            }
            let _ = child.wait().await;
            let log = logs.await.unwrap_or_default();
            result.map_err(|e| {
                if log.is_empty() {
                    e
                } else {
                    format!("{e}\n{log}")
                }
            })?;
            if cancel.is_cancelled() {
                return Err("変換を中止しました。".into());
            }
            let stem = Path::new(&video.path)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy();
            output::finalize(
                &temp,
                directory,
                &stem,
                encoding::extension(&settings.container),
            )
            .map(|p| p.to_string_lossy().into_owned())
        };
        let result = work.await;
        match result {
            Ok(output_path) => event(&path, "completed", 100.0, Some(output_path), None),
            Err(_) if cancel.is_cancelled() => event(&path, "cancelled", 0.0, None, None),
            Err(error) => event(&path, "failed", 0.0, None, Some(error)),
        }
    }
    event("", "finished", 100.0, None, None);
    Ok(())
}
