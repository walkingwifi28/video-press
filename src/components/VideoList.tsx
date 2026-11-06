import type { FileProgress, ProbeResult, Settings } from '../types';
import { dimensions, outputFps } from '../settings';
import { resultPath } from '../useVideoPress';

const statusLabels: Record<FileProgress['status'], string> = { queued: '待機中', running: '変換中', completed: '完了', failed: '失敗', cancelled: 'キャンセル', finished: '処理終了' };
const fpsLabel = (fps: number | null) => fps === null ? '不明（元のまま）' : `${Math.round(fps * 100) / 100} fps`;
const durationLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
type Props = { results: ProbeResult[]; progress: Record<string, FileProgress>; settings: Settings; disabled: boolean; remove: (path: string) => void };
export default function VideoList({ results, progress, settings, disabled, remove }: Props) {
  if (!results.length) return null;
  return <div className="table-scroll"><table><caption className="sr-only">追加した動画と出力予定・処理状況</caption><thead><tr><th scope="col">動画</th><th scope="col">入力</th><th scope="col">出力予定</th><th scope="col">状態</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead><tbody>
    {results.map((result) => {
      const path = resultPath(result);
      if (result.status === 'error') return <tr key={path}><td><strong className="file-name">{path.split(/[\\/]/).pop()}</strong></td><td colSpan={3}><span className="status error-text">解析できません</span><details><summary>エラー詳細</summary><pre>{result.error}</pre></details></td><td><button className="text-button" disabled={disabled} onClick={() => remove(path)} aria-label={`${path}を削除`}>削除</button></td></tr>;
      const v = result.video;
      const p = progress[v.id];
      const [width, height] = dimensions(v, settings.resolution);
      return <tr key={v.id}>
        <td><strong className="file-name" title={v.path}>{v.name}</strong><span className="file-meta">{durationLabel(v.duration)}{!v.hasAudio ? ' ／ 音声なし' : ''}</span></td>
        <td className="numeric">{Math.round(v.width)} × {Math.round(v.height)}<span className="file-meta">{fpsLabel(v.fps)}</span></td>
        <td className="numeric">{width < 2 || height < 2 ? <span className="error-text">寸法が小さすぎます</span> : <>{width} × {height}</>}<span className="file-meta">{fpsLabel(outputFps(v.fps, settings.fps))}</span></td>
        <td className="status-cell"><span className={`status ${p?.status ?? 'ready'}`}>{p ? statusLabels[p.status] : '準備完了'}{p?.status === 'running' ? ` ${Math.round(p.progress)}%` : ''}</span>{p?.status === 'running' && <progress value={p.progress} max={100} aria-label={`${v.name}の変換進捗`} />}{p?.outputPath && <details><summary>保存先</summary><p className="path">{p.outputPath}</p></details>}{p?.error && <details><summary>エラー詳細</summary><pre>{p.error}</pre></details>}</td>
        <td><button className="text-button" disabled={disabled} onClick={() => remove(path)} aria-label={`${v.name}を削除`}>削除</button></td>
      </tr>;
    })}
  </tbody></table></div>;
}
