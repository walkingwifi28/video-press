pub mod batch;
pub mod encoding;
pub mod model;
pub mod output;
pub mod probe;
use batch::{Active, BatchState, Cancellation};
use model::{Environment, ProbeResult, Progress, Settings};
use std::sync::{atomic::Ordering, Arc};
use tauri::{Emitter, Manager};

#[tauri::command]
async fn get_environment() -> Environment {
    probe::environment().await
}

#[tauri::command]
async fn probe_files(paths: Vec<String>) -> Vec<ProbeResult> {
    let mut results = Vec::new();
    for path in paths {
        results.push(match probe::inspect(&path).await {
            Ok(video) => ProbeResult::Ready { video },
            Err(error) => ProbeResult::Error { path, error },
        });
    }
    results
}

#[tauri::command]
async fn start_batch(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<BatchState>>,
    batch_id: String,
    paths: Vec<String>,
    output_dir: String,
    settings: Settings,
) -> Result<(), String> {
    encoding::validate(&settings)?;
    if batch_id.is_empty() || batch_id.len() > 200 || paths.is_empty() {
        return Err("入力動画とバッチIDが必要です。".into());
    }
    let directory =
        std::fs::canonicalize(&output_dir).map_err(|e| format!("出力先を開けません: {e}"))?;
    if !directory.is_dir() {
        return Err("出力先フォルダーを選択してください。".into());
    }
    let env = probe::environment().await;
    if !env.ffmpeg || !env.ffprobe {
        return Err(env.errors.join("\n"));
    }
    if !env
        .encoders
        .iter()
        .any(|e| e == encoding::encoder(&settings.codec))
    {
        return Err("選択したコーデックを現在のffmpegで使用できません。".into());
    }
    let mut seen = std::collections::HashSet::new();
    let paths: Vec<_> = paths
        .into_iter()
        .filter(|p| seen.insert(p.clone()))
        .collect();
    let cancellation = Cancellation::default();
    {
        let mut active = state
            .active
            .lock()
            .map_err(|_| "処理状態を取得できません。")?;
        if active.is_some() || state.exiting.load(Ordering::SeqCst) {
            return Err("変換が既に実行中です。".into());
        }
        *active = Some(Active {
            id: batch_id.clone(),
            cancellation: cancellation.clone(),
        });
    }
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn(async move {
        let result = batch::run_batch(
            batch_id.clone(),
            paths,
            directory.to_string_lossy().into(),
            settings,
            cancellation,
            |event| {
                if event.status != "finished" {
                    let _ = app.emit("batch-progress", event);
                }
            },
        )
        .await;
        if let Ok(mut active) = state.active.lock() {
            *active = None;
        }
        let _ = app.emit(
            "batch-progress",
            Progress {
                batch_id,
                file_id: String::new(),
                status: "finished".into(),
                progress: 100.0,
                output_path: None,
                error: result.err(),
            },
        );
        if state.exiting.load(Ordering::SeqCst) {
            app.exit(0);
        }
    });
    Ok(())
}

#[tauri::command]
fn cancel_batch(state: tauri::State<'_, Arc<BatchState>>, batch_id: String) -> Result<(), String> {
    let active = state
        .active
        .lock()
        .map_err(|_| "処理状態を取得できません。")?;
    if let Some(active) = active.as_ref() {
        if active.id != batch_id {
            return Err("処理IDが一致しません。".into());
        }
        active.cancellation.cancel();
    }
    Ok(())
}

fn request_exit(state: &BatchState) -> bool {
    if let Ok(active) = state.active.lock() {
        if let Some(active) = active.as_ref() {
            state.exiting.store(true, Ordering::SeqCst);
            active.cancellation.cancel();
            return true;
        }
    }
    false
}

pub fn run() {
    let app = tauri::Builder::default()
        .manage(Arc::new(BatchState::default()))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_environment,
            probe_files,
            start_batch,
            cancel_batch
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if request_exit(window.state::<Arc<BatchState>>().inner()) {
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("アプリケーションを起動できません。");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if request_exit(app.state::<Arc<BatchState>>().inner()) {
                api.prevent_exit();
            }
        }
    });
}
