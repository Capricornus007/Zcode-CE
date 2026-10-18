/** 长等待的时长文本：<60s 用秒，之后用「分 秒」，与 ToolCallProgressIndicator 同口径。 */
export function formatElapsedDuration(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}
