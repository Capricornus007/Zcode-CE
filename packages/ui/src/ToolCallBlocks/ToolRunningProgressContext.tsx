import { createContext, useContext } from "react";
import type { ToolProgress } from "@zcode/shared/zcode-protocol-v4";

/**
 * 运行中工具的进度上下文（141）。
 *
 * 由 `ToolCallBlock` 统一提供，`ToolLayout` 统一消费：任何正在执行的工具卡片
 * 只要没有自己的状态位（`showStatusLabel`），就显示同一套进度条 + 已等待时长。
 * 数据优先用投影的 `progress`；没有服务端进度时退回工具行 `startedAt` 的本地计时，
 * 仍然没有任何时间源时至少显示 indeterminate 进度条。
 */
export interface ToolRunningProgressState {
  startedAt?: number;
  progress: ToolProgress | null;
  /** 真正在执行（in_progress）；pending / 等待审批不算，避免把等待用户操作画成进度。 */
  executing: boolean;
}

const ToolRunningProgressContext = createContext<ToolRunningProgressState | null>(null);

export const ToolRunningProgressProvider = ToolRunningProgressContext.Provider;

export function useToolRunningProgress(): ToolRunningProgressState | null {
  return useContext(ToolRunningProgressContext);
}
