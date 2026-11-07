import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import VideoList from './VideoList';
import { changeCodec, initialSettings } from '../settings';
import type { Codec, ProbeResult } from '../types';

const results: ProbeResult[] = [
  { status: 'ready', video: { id: 'a', path: 'a.mp4', name: 'a.mp4', width: 1920, height: 1080, duration: 60, fps: 60, fpsRational: '60/1', hasAudio: true } },
  { status: 'ready', video: { id: 'b', path: 'b.mp4', name: 'b.mp4', width: 640, height: 360, duration: 30, fps: 30, fpsRational: '30/1', hasAudio: false } },
];
describe('動画ごとの設定一覧', () => {
  it('画質の現在値をホバーで表示し、コーデックごとのスライダー範囲を使う', () => {
    const html = renderToStaticMarkup(<VideoList results={results} progress={{}} settingsFor={(id) => id === 'a' ? initialSettings : { ...changeCodec(initialSettings, 'av1'), crf: 63 }} onChange={() => {}} environment={null} disabled={false} remove={() => {}} />);
    const sliders = [...html.matchAll(/<input\b[^>]*type="range"[^>]*>/g)].map((match) => match[0]).filter((input) => input.includes('画質（CRF）'));
    expect(sliders).toHaveLength(2);
    expect(sliders[0]).toContain('aria-label="a.mp4の画質（CRF）"');
    expect(sliders[0]).toContain('min="0"');
    expect(sliders[0]).toContain('max="51"');
    expect(sliders[0]).toContain('step="1"');
    expect(sliders[0]).toContain('value="23"');
    expect(sliders[1]).toContain('max="63"');
    expect(sliders[1]).toContain('value="63"');
    expect(sliders[0]).toContain('title="CRF 23"');
    expect(sliders[1]).toContain('title="CRF 63"');
    expect(html).not.toContain('quality-value');
    expect(html).toContain('高画質');
    expect(html).toContain('小容量');
  });
  it.each<{ codec: Codec; fast: string; small: string; max: number }>([
    { codec: 'h264', fast: 'ultrafast', small: 'veryslow', max: 8 },
    { codec: 'h265', fast: 'ultrafast', small: 'veryslow', max: 8 },
    { codec: 'vp9', fast: '5', small: '0', max: 5 },
    { codec: 'av1', fast: '13', small: '0', max: 13 },
  ])('$codec: 速度は左が高速、右が小容量で、ホバーに現在値を表示する', ({ codec, fast, small, max }) => {
    const html = renderToStaticMarkup(<VideoList results={results} progress={{}} settingsFor={(id) => ({ ...changeCodec(initialSettings, codec), preset: id === 'a' ? fast : small })} onChange={() => {}} environment={null} disabled={false} remove={() => {}} />);
    const sliders = [...html.matchAll(/<input\b[^>]*type="range"[^>]*>/g)].map((match) => match[0]).filter((input) => input.includes('変換速度'));
    expect(sliders).toHaveLength(2);
    expect(sliders[0]).toContain('min="0"');
    expect(sliders[0]).toContain(`max="${max}"`);
    expect(sliders[0]).toContain('step="1"');
    expect(sliders[0]).toContain('value="0"');
    expect(sliders[0]).toContain(`title="${fast}"`);
    expect(sliders[0]).toContain(`aria-valuetext="${fast}"`);
    expect(sliders[1]).toContain(`value="${max}"`);
    expect(sliders[1]).toContain(`title="${small}"`);
    expect(html).toContain('<span>高速</span><span>小容量</span>');
  });
  it('指定された列順で表示し、動画ごとに異なる設定と解像度候補を持つ', () => {
    const html = renderToStaticMarkup(<VideoList results={results} progress={{}} settingsFor={(id) => id === 'a' ? initialSettings : changeCodec(initialSettings, 'vp9')} onChange={() => {}} environment={null} disabled={false} remove={() => {}} />);
    expect([...html.matchAll(/<th scope="col">(.*?)<\/th>/g)].map((m) => m[1].split('<')[0])).toEqual(['動画', '入力', '解像度', 'FPS', '画質', 'コーデック', '出力形式', '変換速度', '状態', '削除']);
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
