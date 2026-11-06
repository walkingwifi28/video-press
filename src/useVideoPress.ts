import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open } from '@tauri-apps/plugin-dialog';
import { environmentSchema, probeResultsSchema, progressSchema } from './types';
import type { Environment, FileProgress, ProbeResult, Settings } from './types';
import { availableResolutions, changeCodec, encoderNames, initialSettings, reconcileResolution, validSettings } from './settings';
import { pathKey } from './paths';

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
export const resultPath = (result: ProbeResult) => result.status === 'ready' ? result.video.path : result.path;

export function useVideoPress() {
  const native = isTauri();
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [outputDir, setOutputDir] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [probing, setProbing] = useState(false);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [listenerReady, setListenerReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Record<string, FileProgress>>({});
  const batchRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const busyRef = useRef(false);
  const pathsRef = useRef(new Set<string>());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const videos = useMemo(() => results.flatMap((r) => r.status === 'ready' ? [r.video] : []), [results]);
  const resolutions = useMemo(() => availableResolutions(videos), [videos]);

  const addPaths = useCallback(async (paths: string[]) => {
    if (busyRef.current || batchRef.current || startingRef.current) return;
    const newPaths = paths.filter((path) => {
      const key = pathKey(path);
      if (pathsRef.current.has(key)) return false;
      pathsRef.current.add(key);
      return true;
    });
    if (!newPaths.length) { setNotice('選択した動画はすでに追加されています。'); return; }
    busyRef.current = true;
    setProbing(true);
    setError('');
    setNotice('');
    try {
      const parsed = probeResultsSchema.parse(await invoke<unknown>('probe_files', { paths: newPaths }));
      setResults((current) => {
        const keys = new Set(current.map((r) => pathKey(resultPath(r))));
        return [...current, ...parsed.filter((r) => {
          const key = pathKey(resultPath(r));
          if (keys.has(key)) return false;
          keys.add(key);
          return true;
        })];
      });
    } catch (e) {
      newPaths.forEach((path) => pathsRef.current.delete(pathKey(path)));
      setError(`動画を解析できませんでした。${message(e)}`);
    } finally { busyRef.current = false; setProbing(false); }
  }, []);

  useEffect(() => {
    if (!native) return;
    let disposed = false;
    const cleanup: (() => void)[] = [];
    const retain = (unlisten: () => void) => { if (disposed) unlisten(); else cleanup.push(unlisten); };
    invoke<unknown>('get_environment').then((value) => {
      if (disposed) return;
      const env = environmentSchema.parse(value);
      setEnvironment(env);
      const availableCodec = (['h264', 'h265', 'vp9'] satisfies Settings['codec'][]).find((codec) => env.encoders.includes(encoderNames[codec]));
      if (availableCodec) setSettings((s) => env.encoders.includes(encoderNames[s.codec]) ? s : changeCodec(s, availableCodec));
    }).catch((e: unknown) => { if (!disposed) setError(`実行環境を確認できませんでした。${message(e)}`); });
    listen<unknown>('batch-progress', ({ payload }) => {
      const event = progressSchema.safeParse(payload);
      if (!event.success || event.data.batchId !== batchRef.current) return;
      const update = event.data;
      if (update.status === 'finished') {
        batchRef.current = null;
        setRunning(false);
        setCancelling(false);
        if (update.error) setError(update.error);
        setNotice('処理が終了しました。各動画の処理結果を確認してください。');
      } else setProgress((current) => ({ ...current, [update.fileId]: update }));
    }).then((unlisten) => { retain(unlisten); if (!disposed) setListenerReady(true); }).catch((e: unknown) => {
      if (!disposed) setError(`進捗通知を受信できませんでした。${message(e)}`);
    });
    getCurrentWebviewWindow().onDragDropEvent(({ payload }) => {
      if (disposed || busyRef.current || batchRef.current || startingRef.current) return;
      setDragging(payload.type === 'enter' || payload.type === 'over');
      if (payload.type === 'drop') { setDragging(false); void addPaths(payload.paths); }
    }).then(retain).catch((e: unknown) => { if (!disposed) setError(`ドラッグ＆ドロップを開始できませんでした。［動画を追加］を使ってください。${message(e)}`); });
    return () => { disposed = true; cleanup.forEach((unlisten) => unlisten()); };
  }, [native, addPaths]);

  useEffect(() => {
    const resolution = reconcileResolution(settingsRef.current.resolution, resolutions);
    if (resolution !== settingsRef.current.resolution) {
      setSettings((s) => ({ ...s, resolution }));
      setNotice('入力動画に合わせて、解像度を「元サイズ」に戻しました。');
    }
  }, [resolutions]);

  const selectFiles = async () => {
    if (busyRef.current || batchRef.current || startingRef.current || !native) return;
    try {
      const selected = await open({ multiple: true, title: '変換する動画を選択', filters: [{ name: '動画', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mts', 'm2ts', 'ts', 'wmv', 'flv', 'mpg', 'mpeg'] }, { name: 'すべてのファイル', extensions: ['*'] }] });
      if (selected) await addPaths(typeof selected === 'string' ? [selected] : selected);
    } catch (e) { setError(message(e)); }
  };
  const chooseOutput = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: '出力先フォルダーを選択' });
      if (typeof selected === 'string') setOutputDir(selected);
    } catch (e) { setError(message(e)); }
  };
  const remove = (path: string) => {
    if (busyRef.current || batchRef.current || startingRef.current) return;
    pathsRef.current.delete(pathKey(path));
    setResults((current) => current.filter((r) => resultPath(r) !== path));
    setProgress({});
  };
  const clear = () => {
    if (busyRef.current || batchRef.current || startingRef.current) return;
    pathsRef.current.clear(); setResults([]); setProgress({});
  };
  const canStart = native && listenerReady && !!environment?.ffmpeg && !!environment.ffprobe && environment.encoders.includes(encoderNames[settings.codec]) && !!videos.length && !!outputDir.trim() && validSettings(settings) && !probing && !running && !starting;
  const start = async () => {
    if (!canStart || batchRef.current || busyRef.current || startingRef.current) return;
    const batchId = crypto.randomUUID();
    batchRef.current = batchId;
    startingRef.current = true;
    setStarting(true);
    setRunning(true); setCancelling(false); setProgress({}); setError(''); setNotice('');
    try { await invoke('start_batch', { batchId, paths: videos.map((v) => v.path), outputDir, settings }); }
    catch (e) {
      if (batchRef.current === batchId) { batchRef.current = null; setRunning(false); setCancelling(false); }
      setError(`変換を開始できませんでした。${message(e)}`);
    }
    finally { startingRef.current = false; setStarting(false); }
  };
  const cancel = async () => {
    if (!batchRef.current || cancelling || startingRef.current) return;
    setCancelling(true);
    try { await invoke('cancel_batch', { batchId: batchRef.current }); }
    catch (e) { setCancelling(false); setError(`停止できませんでした。${message(e)}`); }
  };
  return { native, environment, results, videos, settings, setSettings, outputDir, setOutputDir, error, notice, probing, running, starting, cancelling, dragging, progress, resolutions, canStart, selectFiles, chooseOutput, remove, clear, start, cancel };
}
