import { describe, expect, it } from "vitest";

import { buildCompactSummaryRequestMessages } from "../src/runtime/methods/compact-active-helpers.js";
import type { RuntimeMessageEntry } from "../src/agent/message-history.js";

/**
 * 148②（吸收 pi 1.2.0）：compaction 摘要请求剥离历史 reasoning 块。
 * thinking 签名只对产生它的模型有效，重放的推理不在真实上下文里，
 * 原样携带只会撑大摘要请求。live 请求与跨模型卫生（148①）不受影响。
 */

function userEntry(text: string): RuntimeMessageEntry {
  return {
    kind: "message",
    message: { role: "user", content: text },
    metadata: { source: "real_user" },
  } as unknown as RuntimeMessageEntry;
}

function assistantEntryWithReasoning(text: string, reasoning: string): RuntimeMessageEntry {
  return {
    kind: "message",
    message: {
      role: "assistant",
      content: [
        { type: "reasoning", text: reasoning },
        { type: "text", text },
      ],
    },
    metadata: { source: "shared_context" },
  } as unknown as RuntimeMessageEntry;
}

function assistantEntry(text: string): RuntimeMessageEntry {
  return {
    kind: "message",
    message: { role: "assistant", content: text },
    metadata: { source: "shared_context" },
  } as unknown as RuntimeMessageEntry;
}

describe("148② compact summary request omits reasoning blocks", () => {
  it("strips reasoning blocks from assistant history, keeps text and the trailing prompt", () => {
    const entries = [
      userEntry("旧问题"),
      assistantEntryWithReasoning("可见回答", "内部推理，签名只对源模型有效"),
    ];
    const messages = buildCompactSummaryRequestMessages(entries, "SUMMARY PROMPT");

    const assistant = messages.find((message) => message.role === "assistant");
    expect(assistant).toBeDefined();
    const blocks = Array.isArray(assistant?.content) ? assistant.content : [];
    expect(blocks.map((block) => block.type)).toEqual(["text"]);
    expect(blocks[0]).toMatchObject({ type: "text", text: "可见回答" });

    const prompt = messages.at(-1);
    expect(prompt?.role).toBe("user");
    expect(prompt?.content).toBe("SUMMARY PROMPT");
  });

  it("keeps plain string content and user messages untouched", () => {
    const entries = [userEntry("问"), assistantEntry("答")];
    const messages = buildCompactSummaryRequestMessages(entries, "P");
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[1]?.content).toBe("答");
  });
});
