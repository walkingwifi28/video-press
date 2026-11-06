use std::{
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
static NEXT: AtomicU64 = AtomicU64::new(0);

pub struct TemporaryOutput {
    pub path: PathBuf,
}

impl Drop for TemporaryOutput {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

pub fn reserve(directory: &Path, extension: &str) -> Result<TemporaryOutput, String> {
    for _ in 0..100 {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let path = directory.join(format!(
            ".video-press-{}-{stamp}-{}.tmp.{extension}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(_) => return Ok(TemporaryOutput { path }),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("出力先に書き込めません: {e}")),
        }
    }
    Err("一時出力ファイルを確保できません。".into())
}
pub fn finalize(
    temp: &TemporaryOutput,
    directory: &Path,
    stem: &str,
    extension: &str,
) -> Result<PathBuf, String> {
    for n in 0..10000 {
        let suffix = if n == 0 {
            String::new()
        } else {
            format!("_{n}")
        };
        let path = directory.join(format!("{stem}_converted{suffix}.{extension}"));
        match rename_no_replace(&temp.path, &path) {
            Ok(()) => return Ok(path),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("出力の保存に失敗しました: {e}")),
        }
    }
    Err("重複しない出力ファイル名を確保できません。".into())
}

#[cfg(windows)]
fn rename_no_replace(from: &Path, to: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileW(existing: *const u16, new: *const u16) -> i32;
    }
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    // MoveFileW is atomic on the same volume and, unlike rename, never replaces an existing file.
    if unsafe { MoveFileW(from.as_ptr(), to.as_ptr()) } != 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}
#[cfg(not(windows))]
fn rename_no_replace(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::hard_link(from, to)?;
    fs::remove_file(from)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reserves_and_finalizes_without_overwrite() {
        let dir =
            std::env::temp_dir().join(format!("video-press-output-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let temp = reserve(&dir, "mp4").unwrap();
        fs::write(&temp.path, b"new").unwrap();
        fs::write(dir.join("sample_converted.mp4"), b"existing").unwrap();
        let final_path = finalize(&temp, &dir, "sample", "mp4").unwrap();
        assert_eq!(
            fs::read(dir.join("sample_converted.mp4")).unwrap(),
            b"existing"
        );
        assert_eq!(fs::read(&final_path).unwrap(), b"new");
        assert_ne!(final_path, dir.join("sample_converted.mp4"));
        fs::remove_dir_all(dir).unwrap();
    }
}
