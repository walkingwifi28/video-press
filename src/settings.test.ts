import { describe, expect, it } from 'vitest';
import { availableResolutions, dimensions, initialSettings, changeCodec, reconcileResolution, outputFps } from './settings';

describe('各入力に合わせた共通設定', () => {
  it('1080p以下の動画には上位の解像度候補を出さない', () => {
    expect(availableResolutions([{ width: 1920, height: 1080 }])).toEqual([0, 720, 480]);
  });
  it('縦動画を縦の枠で縮小し、小さい動画は拡大しない', () => {
    expect(dimensions({ width: 1080, height: 1920 }, 720)).toEqual([720, 1280]);
    expect(dimensions({ width: 640, height: 360 }, 1080)).toEqual([640, 360]);
  });
  it('混在する動画のどれかで縮小できる候補を出す', () => {
    expect(availableResolutions([{ width: 3840, height: 2160 }, { width: 640, height: 360 }])).toEqual([0, 1440, 1080, 720, 480]);
  });
  it('選択中の候補がなくなると元サイズに戻す', () => {
    expect(reconcileResolution(1080, [0, 720, 480])).toBe(0);
  });
  it('VP9へ変更すると互換形式とCRFと速度が変わる', () => {
    expect(changeCodec(initialSettings, 'vp9')).toMatchObject({ codec: 'vp9', container: 'webm', crf: 32, preset: '3' });
  });
  it('FPSを増やさず未知FPSは保持する', () => {
    expect(outputFps(29.97002997, 60)).toBe(29.97002997);
    expect(outputFps(60, 24)).toBe(24);
    expect(outputFps(null, 30)).toBe(null);
  });
  it('極端な縦横比では拡大して偶数寸法にせず、無効な寸法として扱う', () => {
    expect(dimensions({ width: 20000, height: 2 }, 480)).toEqual([854, 0]);
  });
});
