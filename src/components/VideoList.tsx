import { codecSchema, containerSchema, fpsSchema, resolutionSchema } from '../types';
import type { Environment, FileProgress, ProbeResult, Settings } from '../types';
import { availableResolutions, changeCodec, codecLabels, codecPresets, dimensions, encoderNames, maxCrf, outputFps, supportedContainers, validSettings } from '../settings';
import { resultPath } from '../useVideoPress';
import InfoPopover from './InfoPopover';

const statusLabels: Record<FileProgress['status'], string> = { queued: '待機中', running: '変換中', completed: '完了', failed: '失敗', cancelled: 'キャンセル', finished: '処理終了' };
const fpsLabel = (fps: number | null) => fps === null ? '不明（元のまま）' : `${Math.round(fps * 100) / 100} fps`;
const durationLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
type Props = { results: ProbeResult[]; progress: Record<string, FileProgress>; settingsFor: (id: string) => Settings; onChange: (id: string, settings: Settings) => void; environment: Environment | null; disabled: boolean; remove: (path: string) => void };
export default function VideoList({ results, progress, settingsFor, onChange, environment, disabled, remove }: Props) {
  if (!results.length) return null;
  return <><p className="hint" id="video-settings-hint">各動画の行で設定できます。画質はCRFの数値が小さいほど高画質です。表は横にスクロールできます。</p><div className="table-scroll" role="region" aria-label="動画ごとの変換設定" tabIndex={0}><table className="video-table"><caption className="sr-only">追加した動画の変換設定・処理状況</caption><thead><tr><th scope="col">動画</th><th scope="col">入力</th><th scope="col">解像度</th><th scope="col">FPS</th><th scope="col">画質<InfoPopover label="画質（CRF）"><p>数値が小さいほど高画質になり、通常はファイル容量も大きくなります。容量を抑えたい場合は数値を上げてください。</p><p>同じ数値でも、コーデックによって画質は異なります。</p></InfoPopover></th><th scope="col">コーデック</th><th scope="col">出力形式</th><th scope="col">変換速度<InfoPopover label="変換速度"><p>速い設定は変換時間を短縮し、遅い設定は圧縮効率を優先します。同程度の画質なら、遅い設定ほど容量を抑えやすくなります。</p><p>H.264・H.265：slow側ほど低速、fast側ほど高速です。<br />VP9・AV1：数字が大きいほど高速です。</p></InfoPopover></th><th scope="col">状態</th><th scope="col">削除</th></tr></thead><tbody>
    {results.map((result) => {
      const path = resultPath(result);
      if (result.status === 'error') return <tr key={path}><td><strong className="file-name">{path.split(/[\\/]/).pop()}</strong></td><td colSpan={8}><span className="status error-text">解析できません</span><details><summary>エラー詳細</summary><pre>{result.error}</pre></details></td><td><button className="text-button" disabled={disabled} onClick={() => remove(path)} aria-label={`${path}を削除`}>削除</button></td></tr>;
      const v = result.video;
      const p = progress[v.id];
      const settings = settingsFor(v.id);
      const speedPresets = [...codecPresets(settings.codec)];
      if (settings.codec === 'vp9' || settings.codec === 'av1') speedPresets.reverse();
      const update = (value: Settings) => onChange(v.id, value);
      const label = (name: string) => `${v.name}の${name}`;
      const supported = !environment || environment.encoders.includes(encoderNames[settings.codec]);
      const [width, height] = dimensions(v, settings.resolution);
      return <tr key={v.id}>
        <td><strong className="file-name" title={v.path}>{v.name}</strong><span className="file-meta">{durationLabel(v.duration)}{!v.hasAudio ? ' ／ 音声なし' : ''}</span></td>
        <td className="numeric">{Math.round(v.width)} × {Math.round(v.height)}<span className="file-meta">{fpsLabel(v.fps)}</span></td>
        <td><select aria-label={label('解像度')} disabled={disabled} value={settings.resolution} onChange={(e) => update({ ...settings, resolution: resolutionSchema.parse(Number(e.target.value)) })}>{availableResolutions([v]).map((r) => <option key={r} value={r}>{r === 0 ? '元サイズ' : `${r}p 以内`}</option>)}</select><span className={`file-meta numeric ${width < 2 || height < 2 ? 'error-text' : ''}`}>{width < 2 || height < 2 ? '寸法が小さすぎます' : `${width} × ${height}`}</span></td>
        <td><select aria-label={label('FPS')} disabled={disabled} value={settings.fps} onChange={(e) => update({ ...settings, fps: fpsSchema.parse(Number(e.target.value)) })}>{[0, 60, 30, 24].map((fps) => <option key={fps} value={fps}>{fps === 0 ? '元のまま' : `${fps} fps 以内`}</option>)}</select><span className="file-meta numeric">{fpsLabel(outputFps(v.fps, settings.fps))}</span></td>
        <td><div className="quality-control"><input aria-label={label('画質（CRF）')} title={`CRF ${settings.crf}`} disabled={disabled} type="range" min={0} max={maxCrf(settings.codec)} step={1} value={settings.crf} aria-invalid={!validSettings(settings)} onChange={(e) => update({ ...settings, crf: e.target.valueAsNumber })} /><span className="slider-value" aria-hidden="true">CRF {settings.crf}</span><div className="quality-labels"><span>高画質</span><span>小容量</span></div></div></td>
        <td><select aria-label={label('コーデック')} disabled={disabled} value={settings.codec} onChange={(e) => update(changeCodec(settings, codecSchema.parse(e.target.value)))}>{codecSchema.options.map((codec) => <option key={codec} value={codec} disabled={!!environment && !environment.encoders.includes(encoderNames[codec])}>{codecLabels[codec]}</option>)}</select>{!supported && <span className="error-text">未対応のエンコーダー</span>}</td>
        <td><select aria-label={label('出力形式')} disabled={disabled} value={settings.container} onChange={(e) => update({ ...settings, container: containerSchema.parse(e.target.value) })}>{supportedContainers(settings.codec).map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select></td>
        <td><div className="quality-control"><input aria-label={label('変換速度')} aria-valuetext={settings.preset} title={settings.preset} disabled={disabled} type="range" min={0} max={speedPresets.length - 1} step={1} value={speedPresets.indexOf(settings.preset)} onChange={(e) => update({ ...settings, preset: speedPresets[e.target.valueAsNumber] })} /><span className="slider-value" aria-hidden="true">{settings.preset}</span><div className="quality-labels"><span>高速</span><span>小容量</span></div></div></td>
        <td className="status-cell"><span className={`status ${p?.status ?? 'ready'}`}>{p ? statusLabels[p.status] : '準備完了'}{p?.status === 'running' ? ` ${Math.round(p.progress)}%` : ''}</span>{p?.status === 'running' && <progress value={p.progress} max={100} aria-label={`${v.name}の変換進捗`} />}{p?.outputPath && <details><summary>保存先</summary><p className="path">{p.outputPath}</p></details>}{p?.error && <details><summary>エラー詳細</summary><pre>{p.error}</pre></details>}</td>
        <td><button className="text-button" disabled={disabled} onClick={() => remove(path)} aria-label={`${v.name}を削除`}>削除</button></td>
      </tr>;
    })}
  </tbody></table></div></>;
}
