import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompactSummaryRequestMessages,
  compactSummaryShrinkViolation,
} from "../src/runtime/methods/compact-active-helpers.js";
import { trimLeadingOrphanToolResults } from "../src/runtime/helpers/compact-selection.js";
import type { RuntimeMessageEntry } from "../src/agent/message-history.js";

/**
 * DSH 吸收批次一：压缩管线三项。
 * D1 切口安全防线（trimLeadingOrphanToolResults，吸收 tool-pairing 纪律）；
 * D3 暖前缀复用已是现状（原文在前、指令作最后一条 user），测试钉住不变量；
 * D4 收缩校验（compactSummaryShrinkViolation）。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/compact-dsh-absorptions.test.ts
 */

function entry(role: "user" | "assistant" | "tool", text: string): RuntimeMessageEntry {
  return {
    kind: "message",
    message: { role, content: text, ...(role === "tool" ? { toolCallId: "c1" } : {}) },
    metadata: { source: "shared_context" },
  } as unknown as RuntimeMessageEntry;
}

test("D1 切口安全：保留区以孤儿 tool result 开头时被修剪", () => {
  const trimmed = trimLeadingOrphanToolResults([
    entry("tool", "assistant 已被丢弃的结果"),
    entry("tool", "另一个孤儿结果"),
    entry("assistant", "正常的下一轮"),
    entry("user", "问题"),
  ]);
  assert.equal(trimmed.length, 2);
  assert.equal((trimmed[0]!.message as { role: string }).role, "assistant");
});

test("D1 切口安全：正常轮起点不修剪（结构不变量已满足时零改动）", () => {
  const entries = [entry("assistant", "轮首"), entry("tool", "配对结果"), entry("user", "下一条")];
  const trimmed = trimLeadingOrphanToolResults(entries);
  assert.equal(trimmed.length, 3);
});

test("D3 暖前缀：被压缩原文在前、指令作最后一条 user 消息（摘要请求可命中缓存前缀）", () => {
  const entries = [entry("user", "原始问题"), entry("assistant", "原始回答")];
  const messages = buildCompactSummaryRequestMessages(entries, "总结指令", {
    useMidConversationSystem: false,
  });
  assert.ok(messages.length >= 3, "原文 + 指令都要在场");
  const last = messages.at(-1)!;
  assert.equal(last.role, "user");
  assert.ok(
    JSON.stringify(last.content).includes("总结指令"),
    "指令必须是最后一条消息（DSH 暖前缀语义：辅助调用复用会话缓存前缀）",
  );
  const body = JSON.stringify(messages);
  assert.ok(body.includes("原始问题") && body.includes("原始回答"), "原文逐字在场");
});

test("D4 收缩校验：迷你会话跳过；退化摘要拒绝", () => {
  assert.equal(
    compactSummaryShrinkViolation(500, 600),
    false,
    "被遮蔽区 < 1024 token（手动 /compact 小会话）不校验",
  );
  assert.equal(compactSummaryShrinkViolation(5000, 4999), false, "正常收缩放行");
  assert.equal(
    compactSummaryShrinkViolation(5000, 5000),
    true,
    "摘要不小于原文 = 退化，拒绝",
  );
  assert.equal(compactSummaryShrinkViolation(5000, 8000), true, "摘要膨胀，拒绝");
});
