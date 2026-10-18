// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";
import { StreamSpeedPill } from "../src/v4/composer/StreamSpeedPill.js";

const baseUsage: SessionUsageState = {
  contextWindow: null,
  cumulative: {
    inputTokens: 0,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
};

function render(usage: SessionUsageState | null, active = false): string {
  return renderToStaticMarkup(
    createElement(StreamSpeedPill, {
      usage,
      streamingChars: 0,
      active,
      title: "speed",
      cacheLabel: "cache hit",
    }),
  );
}

describe("StreamSpeedPill · DSH decode 口径", () => {
  it("有 usage.decode 时直接显示权威值，不再显示实时估算点", () => {
    const html = render({ ...baseUsage, decode: { tokens: 100, ms: 2_000 } });
    expect(html).toContain(">50<");
    expect(html).toContain("tok/s");
    expect(html).not.toContain("·");
  });

  it("低速率保留一位小数，与 DSH formatTokensPerSecond 一致", () => {
    const html = render({ ...baseUsage, decode: { tokens: 3, ms: 2_000 } });
    expect(html).toContain(">1.5<");
  });

  it("旧 CLI 无 decode 时仍走本地估算（无样本显示 --）", () => {
    const html = render(baseUsage);
    expect(html).toContain(">--<");
  });
});
