export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 185 -> "03:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function storageGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
export function storageSet(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* modo privado */ }
}
export function storageRemove(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* modo privado */ }
}
