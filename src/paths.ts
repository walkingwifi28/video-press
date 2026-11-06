export function pathKey(path: string): string {
  const normalized = path.replaceAll('/', '\\').toLocaleLowerCase();
  if (normalized.startsWith('\\\\?\\unc\\')) return `\\\\${normalized.slice(8)}`;
  return normalized.startsWith('\\\\?\\') ? normalized.slice(4) : normalized;
}
