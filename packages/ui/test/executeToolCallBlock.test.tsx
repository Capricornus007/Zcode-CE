import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { ExecuteToolCallBlock } from "../src/ToolCallBlocks/renderers/execute.js";

describe("ExecuteToolCallBlock", () => {
  it("renders execution results from structured output instead of raw JSON", () => {
    const html = renderToStaticMarkup(
      createElement(
        ZCodeIntlProvider,
        { initialLocale: "zh-CN" },
        createElement(ExecuteToolCallBlock, {
          toolCallNode: {
            toolCall: {
              toolId: "tool-execute",
              kind: "execute",
              title: "运行 npm install",
              input: {
                command: "npm install",
              },
              output: {
                stdout: "packages installed successfully",
                exitCode: 0,
              },
              status: "completed",
              raw: {
                rawOutput: {
                  stdout: "packages installed successfully",
                  exitCode: 0,
                },
              },
            },
            childToolCalls: [],
          },
          workspacePath: "/workspace",
          displayModel: {
            inlinePreview: { type: "none" },
            planResult: null,
            viewerSource: null,
            viewerLabelId: "codeViewer.viewCode",
            showSummaryFileLink: true,
            showInput: false,
            showOutput: true,
            showKind: false,
          },
          viewerSource: null,
          rawFileSummaries: [],
          isRunning: false,
          statusLabel: "Completed",
          childToolList: null,
          forceOpen: true,
          canToggle: true,
          showIcon: true,
        }),
      ),
    );

    expect(html).toContain("输出结果");
    expect(html).toContain("packages installed successfully");
    expect(html).not.toContain("&quot;stdout&quot;");
    expect(html).not.toContain("&quot;exitCode&quot;");
  });

  it("shows the elapsed wait for a running Bash command with a progress heartbeat (141)", () => {
    const html = renderToStaticMarkup(
      createElement(
        ZCodeIntlProvider,
        { initialLocale: "zh-CN" },
        createElement(ExecuteToolCallBlock, {
          toolCallNode: {
            toolCall: {
              toolId: "tool-execute-running",
              kind: "execute",
              title: "运行 pnpm build",
              input: { command: "pnpm build" },
              status: "in_progress",
              raw: { progress: { elapsedMs: 15_000, updatedAt: Date.now() } },
            },
            childToolCalls: [],
          },
          workspacePath: "/workspace",
          displayModel: {
            inlinePreview: { type: "none" },
            planResult: null,
            viewerSource: null,
            viewerLabelId: "codeViewer.viewCode",
            showSummaryFileLink: true,
            showInput: false,
            showOutput: true,
            showKind: false,
          },
          viewerSource: null,
          rawFileSummaries: [],
          isRunning: true,
          statusLabel: "Running",
          childToolList: null,
          forceOpen: false,
          canToggle: true,
          showIcon: true,
        }),
      ),
    );

    expect(html).toContain("已等待 15s");
    expect(html).toContain('data-elapsed-ms="15000"');
  });

  it("shows an indeterminate bar without elapsed when a running command has no heartbeat", () => {
    const html = renderToStaticMarkup(
      createElement(
        ZCodeIntlProvider,
        { initialLocale: "zh-CN" },
        createElement(ExecuteToolCallBlock, {
          toolCallNode: {
            toolCall: {
              toolId: "tool-execute-quiet",
              kind: "execute",
              title: "运行 pnpm build",
              input: { command: "pnpm build" },
              status: "in_progress",
              raw: {},
            },
            childToolCalls: [],
          },
          workspacePath: "/workspace",
          displayModel: {
            inlinePreview: { type: "none" },
            planResult: null,
            viewerSource: null,
            viewerLabelId: "codeViewer.viewCode",
            showSummaryFileLink: true,
            showInput: false,
            showOutput: true,
            showKind: false,
          },
          viewerSource: null,
          rawFileSummaries: [],
          isRunning: true,
          statusLabel: "Running",
          childToolList: null,
          forceOpen: false,
          canToggle: true,
          showIcon: true,
        }),
      ),
    );

    expect(html).toContain('data-testid="tool-call-progress"');
    expect(html).not.toContain("已等待");
  });
});
