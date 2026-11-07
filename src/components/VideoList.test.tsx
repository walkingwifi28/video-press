import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import VideoList from './VideoList';
import { changeCodec, initialSettings } from '../settings';
import type { ProbeResult } from '../types';

const results: ProbeResult[] = [
  { status: 'ready', video: { id: 'a', path: 'a.mp4', name: 'a.mp4', width: 1920, height: 1080, duration: 60, fps: 60, fpsRational: '60/1', hasAudio: true } },
  { status: 'ready', video: { id: 'b', path: 'b.mp4', name: 'b.mp4', width: 640, height: 360, duration: 30, fps: 30, fpsRational: '30/1', hasAudio: false } },
];
describe('動画ごとの設定一覧', () => {
  it('指定された列順で表示し、動画ごとに異なる設定と解像度候補を持つ', () => {
    const html = renderToStaticMarkup(<VideoList results={results} progress={{}} settingsFor={(id) => id === 'a' ? initialSettings : changeCodec(initialSettings, 'vp9')} onChange={() => {}} environment={null} disabled={false} remove={() => {}} />);
    expect([...html.matchAll(/<th scope="col">(.*?)<\/th>/g)].map((m) => m[1])).toEqual(['動画', '入力', '解像度', 'FPS', '画質', 'コーデック', '出力形式', '変換速度', '状態', '削除']);
    const rows = html.split('<tbody>')[1].split('</tr>');
    expect(rows[0]).toContain('value="h264" selected=""');
    expect(rows[1]).toContain('value="vp9" selected=""');
    expect(rows[1]).toContain('value="webm" selected=""');
    expect(rows[0]).toContain('720p 以内');
    expect(rows[1]).not.toContain('720p 以内');
  });
  it('変換中はすべての設定欄をロックする', () => {
    const html = renderToStaticMarkup(<VideoList results={results} progress={{}} settingsFor={() => initialSettings} onChange={() => {}} environment={null} disabled={true} remove={() => {}} />);
    const controls = [...html.matchAll(/<(?:select|input)\b[^>]*>/g)].map((m) => m[0]);
    expect(controls).toHaveLength(12);
    expect(controls.every((control) => control.includes('disabled=""'))).toBe(true);
  });
  it('解析失敗した動画でも削除とエラーを表示する', () => {
    const html = renderToStaticMarkup(<VideoList results={[{ status: 'error', path: 'bad.mp4', error: 'invalid video' }]} progress={{}} settingsFor={() => initialSettings} onChange={() => {}} environment={null} disabled={false} remove={() => {}} />);
    expect(html).toContain('colSpan="8"');
    expect(html).toContain('invalid video');
    expect(html).toContain('bad.mp4を削除');
  });
});
