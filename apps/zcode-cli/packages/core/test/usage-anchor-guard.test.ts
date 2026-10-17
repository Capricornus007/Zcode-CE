import assert from "node:assert/strict";
import test from "node:test";

import { buildProviderUsageTokenOverride } from "../src/runtime/methods/compact.js";
import { estimateMessageTokens } from "../src/compact/manual.js";
import type { RuntimeMessageEntry } from "../src/agent/message-history.js";

/**
 * D12 usage 锚点防低估（吸收 DSH token-meter:158-171）：provider usage 明显小于
 * 本地启发式估算（< 50%）时不可信——低估会推迟压缩直到真溢出。整体回退启发式。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/usage-anchor-guard.test.ts
 */

function assistantEntryWithUsage(
  text: string,
  inputTokens: number,
  output = 10,
): RuntimeMessageEntry {
  return {
    kind: "message",
    message: { role: "assistant", content: text },
    metadata: { source: "shared_context" },
    tokens: { input: inputTokens, output, total: inputTokens + output, cache: { read: 0, write: 0 } },
  } as unknown as RuntimeMessageEntry;
}

function userEntry(text: string): RuntimeMessageEntry {
  return {
    kind: "message",
    message: { role: "user", content: text },
    metadata: { source: "real_user" },
  } as unknown as RuntimeMessageEntry;
}

test("provider usage 与启发式锚点相当时照常信任", () => {
  // 锚点用同一估算函数计算，不假设估算器内部常数。
  const messages = [
    { role: "user", content: "u".repeat(8000) },
    { role: "assistant", content: "a".repeat(8000) },
    { role: "user", content: "tail" },
  ] as never;
  const anchor = estimateMessageTokens(messages.slice(0, 2) as never);
  const sourceEntries = [
    userEntry("u".repeat(8000)),
    assistantEntryWithUsage("a".repeat(8000), Math.floor(anchor * 0.9)),
    undefined,
  ] as never[];
  const override = buildProviderUsageTokenOverride(messages, sourceEntries);
  assert.ok(override, "锚点之上必须返回 override");
  assert.equal(override!.source, "provider_usage");
});

test("provider usage 明显低于锚点（< 50%）时整体回退启发式", () => {
  const big = "x".repeat(8000);
  const messages = [
    { role: "user", content: big },
    { role: "assistant", content: big },
    { role: "user", content: "tail" },
  ] as never;
  const anchor = estimateMessageTokens(messages.slice(0, 2) as never);
  const sourceEntries = [
    userEntry(big),
    assistantEntryWithUsage(big, Math.floor(anchor * 0.2)),
    undefined,
  ] as never[];
  const override = buildProviderUsageTokenOverride(messages, sourceEntries, {
    warn() {},
  });
  assert.equal(override, undefined, "低估的 usage 必须被拒绝（回退启发式估算）");
});

test("无已提交 usage 时本来就回退启发式（回归护栏）", () => {
  const override = buildProviderUsageTokenOverride(
    [{ role: "user", content: "hi" }] as never,
    [undefined] as never[],
  );
  assert.equal(override, undefined);
});

test("50% 边界值：恰好一半及以上可信，之下不可信", () => {
  const big = "y".repeat(8000);
  const messages = [
    { role: "user", content: big },
    { role: "assistant", content: big },
  ] as never;
  const anchor = estimateMessageTokens(messages as never);
  const sourceEntries = [userEntry(big), assistantEntryWithUsage(big, Math.ceil(anchor * 0.5), 0)];
  assert.ok(
    buildProviderUsageTokenOverride(messages as never, sourceEntries as never),
    "恰好 50% 应当可信（边界含在可信侧）",
  );
  const below = [userEntry(big), assistantEntryWithUsage(big, Math.ceil(anchor * 0.5) - 1, 0)];
  assert.equal(
    buildProviderUsageTokenOverride(messages as never, below as never),
    undefined,
    "低于 50% 必须拒绝",
  );
});
