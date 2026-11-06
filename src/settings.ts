import type { Codec, Resolution, Settings } from './types';

export const initialSettings: Settings = { codec: 'h264', container: 'mp4', crf: 23, resolution: 0, fps: 0, preset: 'medium' };
const frames: Record<Resolution, [number, number]> = {
  0: [Infinity, Infinity], 2160: [3840, 2160], 1440: [2560, 1440],
  1080: [1920, 1080], 720: [1280, 720], 480: [854, 480],
};
const resolutions: Resolution[] = [0, 2160, 1440, 1080, 720, 480];
type Size = { width: number; height: number };
export function dimensions(video: Size, resolution: Resolution): [number, number] {
  const [long, short] = frames[resolution];
  const [maxWidth, maxHeight] = video.width >= video.height ? [long, short] : [short, long];
  const ratio = Math.min(1, maxWidth / video.width, maxHeight / video.height);
  return [Math.floor(video.width * ratio / 2) * 2, Math.floor(video.height * ratio / 2) * 2];
}
export function availableResolutions(videos: Size[]): Resolution[] {
  return resolutions.filter((resolution) => resolution === 0 || videos.some((v) => {
    const [long, short] = frames[resolution];
    return Math.max(v.width, v.height) > long || Math.min(v.width, v.height) > short;
  }));
}
export function reconcileResolution(resolution: Resolution, available: Resolution[]): Resolution {
  return available.includes(resolution) ? resolution : 0;
}
export function changeCodec(settings: Settings, codec: Codec): Settings {
  return { ...settings, codec, container: codec === 'vp9' ? 'webm' : 'mp4', crf: codec === 'h264' ? 23 : codec === 'h265' ? 28 : 32, preset: codec === 'vp9' ? '3' : 'medium' };
}
export function outputFps(input: number | null, limit: number): number | null {
  return input === null || limit === 0 ? input : Math.min(input, limit);
}
export const codecLabels: Record<Codec, string> = { h264: 'H.264', h265: 'H.265 / HEVC', vp9: 'VP9' };
export const encoderNames: Record<Codec, string> = { h264: 'libx264', h265: 'libx265', vp9: 'libvpx-vp9' };
export const presets = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];
export function validSettings(settings: Settings): boolean {
  return Number.isInteger(settings.crf) && settings.crf >= 0 && settings.crf <= (settings.codec === 'vp9' ? 63 : 51)
    && (settings.codec === 'vp9' ? ['webm', 'mkv'].includes(settings.container) && ['0', '1', '2', '3', '4', '5'].includes(settings.preset) : ['mp4', 'mkv'].includes(settings.container) && presets.includes(settings.preset));
}
