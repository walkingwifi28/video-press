import { useVideoPress } from './useVideoPress';
import SettingsPanel from './components/SettingsPanel';
import VideoList from './components/VideoList';
import { encoderNames, validSettings } from './settings';

export default function App() {
  const app = useVideoPress();
  const locked = app.running || app.probing || app.starting;
  const terminal = Object.values(app.progress).filter((p) => ['completed', 'failed', 'cancelled'].includes(p.status));
  const completed = terminal.filter((p) => p.status === 'completed').length;
  const failed = terminal.filter((p) => p.status === 'failed').length;
  const cancelled = terminal.filter((p) => p.status === 'cancelled').length;
  const progress = app.videos.length ? Object.values(app.progress).reduce((sum, p) => sum + (p.status === 'running' ? p.progress : ['completed', 'failed', 'cancelled'].includes(p.status) ? 100 : 0), 0) / app.videos.length : 0;
  const ready = !!app.environment?.ffmpeg && !!app.environment.ffprobe;
  return <>
    <a href="#main" className="skip-link">本文へ移動</a>
    <header className="app-header"><div className="header-inner"><div className="brand"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="2" y="4" width="28" height="24" rx="4" stroke="currentColor" strokeWidth="2" /><path d="M7 4v24M25 4v24M2 11h5m-5 10h5m18-10h5m-5 10h5M13 11l8 5-8 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg><span>Video Press</span></div><span className="header-description">動画の一括変換</span><span className={`environment ${ready ? 'available' : ''}`}><span className="status-dot" />{!app.native ? 'ブラウザプレビュー' : !app.environment ? '実行環境を確認中' : ready ? 'ffmpeg 接続済み' : 'ffmpeg を確認してください'}</span></div></header>
    <main id="main" tabIndex={-1}>
      <div className="page-title"><h1>動画を変換する</h1><p>動画を追加し、出力設定と保存先を選んでください。動画はこのPC内で処理します。</p></div>
      {!app.native && <div className="notification" role="status"><strong>Windowsアプリで開いてください</strong><p>この画面はプレビューです。動画の選択・解析・変換は、デスクトップアプリで利用できます。</p></div>}
      {app.environment && (!ready || app.environment.errors.length > 0) && <div className="notification danger" role="alert"><strong>実行環境の確認</strong><p>ffmpegとffprobeをインストールし、PATHに追加してからアプリを再起動してください。</p>{app.environment.errors.map((error) => <p key={error}>{error}</p>)}</div>}
      {app.error && <div className="notification danger" role="alert"><strong>操作を完了できませんでした</strong><p>{app.error}</p></div>}
      {app.notice && <div className="notification compact" role="status">{app.notice}</div>}
      <section className="section" aria-labelledby="videos-title">
        <div className="section-heading"><h2 id="videos-title"><span className="step-number">1</span>動画を追加</h2><div className="heading-actions"><span className="count">{app.results.length}本</span>{app.results.length > 0 && <button className="text-button" disabled={locked} onClick={app.clear}>すべて削除</button>}</div></div>
        <div className={`drop-zone ${app.dragging ? 'dragging' : ''} ${app.results.length ? 'has-files' : ''}`} aria-busy={app.probing}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M18 23V5m0 0l-7 7m7-7l7 7M6 23v8h24v-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div><strong>{app.probing ? '動画の情報を解析しています…' : '動画をここにドラッグ＆ドロップ'}</strong><p className="hint">複数の動画をまとめて追加できます。</p></div>
          <button className="button outline" disabled={!app.native || locked || !app.environment?.ffprobe} onClick={() => void app.selectFiles()}>動画を追加</button>
        </div>
        <VideoList results={app.results} progress={app.progress} settings={app.settings} disabled={locked} remove={app.remove} />
      </section>
      <SettingsPanel settings={app.settings} onChange={app.setSettings} environment={app.environment} resolutions={app.resolutions} disabled={locked} />
      <section className="section output-section" aria-labelledby="output-title">
        <div className="section-heading"><h2 id="output-title"><span className="step-number">3</span>保存先と出力</h2></div>
        <label htmlFor="output-dir">保存先フォルダー<span className="required">必須</span></label>
        <div className="output-path"><input id="output-dir" type="text" placeholder="保存先フォルダーを選択してください" value={app.outputDir} disabled={locked || !app.native} onChange={(e) => app.setOutputDir(e.target.value)} /><button className="button outline" disabled={locked || !app.native} onClick={() => void app.chooseOutput()}>フォルダーを選択</button></div>
        <p className="hint">元ファイルは上書きしません。同じ名前がある場合は連番を付けて保存します。</p>
        {!validSettings(app.settings) && <p className="error-text" role="alert">CRFの範囲と設定の組み合わせを確認してください。</p>}
        {app.environment && ready && !app.environment.encoders.includes(encoderNames[app.settings.codec]) && <p className="error-text">選択したコーデックのエンコーダーが見つかりません。別のコーデックを選択してください。</p>}
        <div className="output-actions"><div><strong>{app.starting ? '開始準備中…' : app.running ? `処理中：${terminal.length} / ${app.videos.length}本` : `${app.videos.length}本の動画を順番に変換`}</strong><p className="hint">{app.probing ? '解析が終わるまでお待ちください。' : !app.videos.length ? '動画を追加してください。' : !app.outputDir.trim() ? '保存先フォルダーを指定してください。' : app.starting ? '実行環境を確認しています。' : '設定を確認して［出力］を押してください。'}</p></div><div className="action-buttons">{app.running && <button className="button outline" disabled={app.cancelling || app.starting} onClick={() => void app.cancel()}>{app.cancelling ? '停止中…' : 'キャンセル'}</button>}<button className="button primary" disabled={!app.canStart} onClick={() => void app.start()}>{app.starting ? '開始準備中…' : app.running ? '変換中…' : '出力'}</button></div></div>
        {Object.keys(app.progress).length > 0 && <div className="batch-progress"><div className="progress-summary" role="status"><span>{app.running ? '全体の進捗' : '処理結果'}</span><span>完了 {completed}本{failed ? ` ／ 失敗 ${failed}本` : ''}{cancelled ? ` ／ キャンセル ${cancelled}本` : ''}</span></div><progress value={progress} max={100} aria-label="バッチ全体の処理進捗" /></div>}
      </section>
      <footer><p>Video Press <span>v0.1.1</span></p><p>デジタル庁デザインシステムに基づくUI</p></footer>
    </main>
  </>;
}
