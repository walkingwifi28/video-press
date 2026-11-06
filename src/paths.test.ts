import { expect, it } from 'vitest';
import { pathKey } from './paths';

it('Windowsの元パスと拡張長の正規化パスを同じキーにする', () => {
  expect(pathKey('C:/Videos/Test.mp4')).toBe(pathKey('\\\\?\\C:\\Videos\\Test.mp4'));
});
it('UNCの元パスと拡張長パスを同じキーにする', () => {
  expect(pathKey('\\\\server\\share\\Test.mp4')).toBe(pathKey('\\\\?\\UNC\\server\\share\\Test.mp4'));
});
