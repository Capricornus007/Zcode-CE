// @vitest-environment jsdom

import type { IPlatformService } from "@zcode/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const entryActionMock = vi.hoisted(() => ({
  contexts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/feedback/useFeedbackEntryAction.js", () => ({
  useFeedbackEntryAction: () => ({
    runFeedbackEntry: (context: Record<string, unknown>) => {
      entryActionMock.contexts.push(context);
      return "opened";
    },
  }),
}));
import { useFeedbackStore } from "@/feedback/feedbackStore.js";
import { PlatformProvider } from "@/hooks/usePlatform.js";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
import { SessionSubscriptionErrorPanel } from "@/v4/SessionSubscriptionErrorPanel.js";

const screenshot = {
  filename: "session-subscription-error.png",
  contentType: "image/png",
  dataBase64: "c2NyZWVuc2hvdA==",
  size: 10,
};
const captureWindowScreenshot = vi.fn(async () => screenshot);
const platform = {
  captureWindowScreenshot,
} as unknown as IPlatformService;

function renderPanel() {
  return render(
    createElement(
      ZCodeIntlProvider,
      { initialLocale: "zh-CN" },
      createElement(
        PlatformProvider,
        { platform },
        createElement(SessionSubscriptionErrorPanel, {
          error: "EPERM: operation not permitted",
          sessionId: "session-1",
          workspacePath: "F:\\ZCode_data",
          onReconnect: vi.fn(),
        }),
      ),
    ),
  );
}

beforeEach(() => {
  useFeedbackStore.setState({
    open: false,
    featureRequestOpen: false,
    tab: "submit",
    submitDraft: null,
    submissionJobId: null,
    selectedTicketId: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SessionSubscriptionErrorPanel", () => {
  it("shows the subscription error with report and reconnect actions", () => {
    renderPanel();

    expect(screen.getByText("EPERM: operation not permitted")).toBeTruthy();
    expect(screen.getByRole("button", { name: "反馈问题" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新连接" })).toBeTruthy();
  });

  it("opens a feedback draft with the subscription error context", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "反馈问题" }));

    // 反馈入口改道 runFeedbackEntry（渠道配置裁决）；错误现场作为上下文进入预填链。
    await waitFor(() => expect(entryActionMock.contexts).toHaveLength(1));
    const context = entryActionMock.contexts[0] ?? {};
    expect(String(context.title)).toContain("EPERM: operation not permitted");
    expect(String(context.description)).toContain("报错摘要：EPERM: operation not permitted");
    expect(String(context.description)).toContain("任务 ID: session-1");
    expect(String(context.description)).toContain("工作区: F:\\ZCode_data");
  });
});
