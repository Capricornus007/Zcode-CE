// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  TID_TOOL_CALL_PROGRESS,
  ToolCallProgressIndicator,
  readToolCallProgress,
} from "@/ToolCallBlocks/ToolCallProgressIndicator.js";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";

afterEach(cleanup);

/**
 * 工具摘要行进度指示器（spec: docs/development/139-tool-waiting-progress.md）。
 * 回归：TaskOutput 阻塞等待心跳只带 elapsedMs，旧实现只渲染 fraction/message，
 * 心跳到达后 UI 仍是无信息的转圈——长等待必须显示「已等待 N」。
 */

function renderIndicator(progress: Parameters<typeof ToolCallProgressIndicator>[0]["progress"]) {
  return render(
    createElement(
      ZCodeIntlProvider,
      { initialLocale: "zh-CN" },
      createElement(ToolCallProgressIndicator, { progress }),
    ),
  );
}

const updatedAt = 1_700_000_000_000;

describe("ToolCallProgressIndicator waiting elapsed", () => {
  it("renders 已等待 seconds for elapsedMs-only heartbeat", () => {
    const { container } = renderIndicator({ elapsedMs: 15_000, updatedAt });
    const root = container.querySelector(`[data-testid="${TID_TOOL_CALL_PROGRESS}"]`)!;
    expect(root.getAttribute("data-elapsed-ms")).toBe("15000");
    const elapsed = container.querySelector(`[data-testid="${TID_TOOL_CALL_PROGRESS}-elapsed"]`);
    expect(elapsed?.textContent).toContain("已等待");
    expect(elapsed?.textContent).toContain("15s");
    // 无 fraction 时保持 indeterminate（aria 不报 valuenow）
    expect(root.getAttribute("aria-valuenow")).toBeNull();
  });

  it("formats minute-scale waits", () => {
    const { container } = renderIndicator({ elapsedMs: 125_000, updatedAt });
    const elapsed = container.querySelector(`[data-testid="${TID_TOOL_CALL_PROGRESS}-elapsed"]`);
    expect(elapsed?.textContent).toContain("2m 05s");
  });

  it("keeps fraction bar behavior and shows message side by side", () => {
    const { container } = renderIndicator({
      fraction: 0.5,
      message: "downloading",
      elapsedMs: 3_000,
      updatedAt,
    });
    const root = container.querySelector(`[data-testid="${TID_TOOL_CALL_PROGRESS}"]`)!;
    expect(root.getAttribute("aria-valuenow")).toBe("0.5");
    expect(container.textContent).toContain("downloading");
    expect(container.textContent).toContain("3s");
  });

  it("readToolCallProgress drops unknown/absent progress payloads", () => {
    expect(readToolCallProgress({})).toBeNull();
    expect(readToolCallProgress({ progress: { elapsedMs: -1, updatedAt } })).toBeNull();
    expect(readToolCallProgress({ progress: { elapsedMs: 1_000, updatedAt } })?.elapsedMs).toBe(
      1_000,
    );
  });
});
