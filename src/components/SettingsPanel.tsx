import { codecSchema, containerSchema, fpsSchema, resolutionSchema } from '../types';
import type { Environment, Resolution, Settings } from '../types';
import { changeCodec, codecLabels, encoderNames, codecPresets, supportedContainers, maxCrf } from '../settings';

type Props = { settings: Settings; onChange: (settings: Settings) => void; environment: Environment | null; resolutions: Resolution[]; disabled: boolean };
export default function SettingsPanel({ settings, onChange, environment, resolutions, disabled }: Props) {
  const vp9 = settings.codec === 'vp9';
  const av1 = settings.codec === 'av1';
  const crfMax = maxCrf(settings.codec);
  return <section className="section" aria-labelledby="settings-title">
    <div className="section-heading"><h2 id="settings-title"><span className="step-number">2</span>出力設定</h2><span className="muted">すべての動画に共通で適用</span></div>
    <fieldset disabled={disabled} className="settings-grid">
      <legend className="sr-only">出力設定</legend>
      <div className="field"><label htmlFor="codec">コーデック</label><select id="codec" value={settings.codec} onChange={(e) => onChange(changeCodec(settings, codecSchema.parse(e.target.value)))}>
        {codecSchema.options.map((codec) => <option key={codec} value={codec} disabled={!!environment && !environment.encoders.includes(encoderNames[codec])}>{codecLabels[codec]}{environment && !environment.encoders.includes(encoderNames[codec]) ? '（未対応）' : ''}</option>)}
      </select><p className="hint">H.264は幅広いプレーヤーで再生できます。</p></div>
      <div className="field"><label htmlFor="container">出力形式</label><select id="container" value={settings.container} onChange={(e) => onChange({ ...settings, container: containerSchema.parse(e.target.value) })}>
        {supportedContainers(settings.codec).map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
      </select><p className="hint">コーデックに対応する形式を表示します。</p></div>
      <div className="field"><label htmlFor="crf">画質（CRF）</label><input id="crf" type="number" min={0} max={crfMax} step={1} value={Number.isNaN(settings.crf) ? '' : settings.crf} aria-invalid={!Number.isInteger(settings.crf) || settings.crf < 0 || settings.crf > crfMax} aria-describedby="crf-hint" onChange={(e) => onChange({ ...settings, crf: e.target.valueAsNumber })} /><p id="crf-hint" className="hint">0〜{crfMax}。小さいほど高画質・大容量です。</p></div>
      <div className="field"><label htmlFor="resolution">解像度</label><select id="resolution" value={settings.resolution} onChange={(e) => onChange({ ...settings, resolution: resolutionSchema.parse(Number(e.target.value)) })}>
        {resolutions.map((r) => <option key={r} value={r}>{r === 0 ? '元サイズ' : `${r}p 以内`}</option>)}
      </select><p className="hint">縦横比を維持します。小さい動画は拡大しません。</p></div>
      <div className="field"><label htmlFor="fps">フレームレート（FPS）</label><select id="fps" value={settings.fps} onChange={(e) => onChange({ ...settings, fps: fpsSchema.parse(Number(e.target.value)) })}>
        {[0, 60, 30, 24].map((fps) => <option key={fps} value={fps}>{fps === 0 ? '元のまま' : `${fps} fps 以内`}</option>)}
      </select><p className="hint">元動画のFPSが低い場合は、その値を維持します。</p></div>
      <div className="field"><label htmlFor="preset">変換速度（{vp9 ? 'cpu-used' : 'Preset'}）</label><select id="preset" value={settings.preset} onChange={(e) => onChange({ ...settings, preset: e.target.value })}>
        {codecPresets(settings.codec).map((preset) => <option key={preset} value={preset}>{preset}{preset === 'medium' || vp9 && preset === '3' || av1 && preset === '6' ? '（標準）' : ''}</option>)}
      </select><p className="hint">{vp9 || av1 ? '数字が大きいほど高速です。' : 'slowほど圧縮効率を優先し、処理に時間がかかります。'}</p></div>
    </fieldset>
  </section>;
}
