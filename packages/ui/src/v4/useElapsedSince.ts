import { useEffect, useState } from "react";

/**
 * 从权威开始时间推导「已运行时长」（141）。
 *
 * 显隐不依赖这个值：调用方仍用 projection 的 running 状态裁决；这里只让文本每秒更新，
 * 避免把本地计时当成第二份运行状态。`startedAt` 缺失（旧快照）返回 undefined。
 */
export function useElapsedSince(startedAt: number | undefined): number | undefined {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === undefined) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  if (startedAt === undefined) return undefined;
  return Math.max(0, now - startedAt);
}
