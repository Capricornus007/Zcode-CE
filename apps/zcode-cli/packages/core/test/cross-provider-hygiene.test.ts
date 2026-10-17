import assert from "node:assert/strict";
import test from "node:test";

import { applyCrossProviderMessageHygiene } from "../src/runtime/helpers/cross-provider-message-hygiene.js";

/**
 * 跨 provider 消息清洗（吸收 earendil-works/pi transform-messages.ts:91-256）：
 * 换模型后异源 thinking 必须丢弃、被中断 turn 留下的孤儿工具调用必须补合成结果、
 * 从未配对的孤儿工具结果必须剔除——否则严格 provider 直接拒绝整次请求。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/cross-provider-hygiene.test.ts
 */

const TARGET = { providerId: "anthropic", modelId: "claude-x" };
const OTHER = { providerId: "openai", modelId: "gpt-y" };

function assistant(
  text: string,
  options: {
    providerId?: string;
    modelId?: string;
    reasoning?: string;
    toolCalls?: { id: string; name: string; input: unknown }[];
  } = {},
) {
  const content: Array<Record<string, unknown>> = [];
  if (options.reasoning) content.push({ type: "reasoning", text: options.reasoning });
  content.push({ type: "text", text });
  return {
    role: "assistant",
    content,
    ...(options.providerId ? { providerId: options.providerId } : {}),
    ...(options.modelId ? { modelId: options.modelId } : {}),
    ...(options.toolCalls ? { toolCalls: options.toolCalls } : {}),
  };
}

test("同模型保留 reasoning，异模型丢弃 reasoning 块", () => {
  const same = applyCrossProviderMessageHygiene(
    [
      assistant("第一轮", { providerId: TARGET.providerId, modelId: TARGET.modelId, reasoning: "想法" }),
      { role: "user", content: "继续" },
    ] as never,
    TARGET,
  );
  assert.equal(same.diagnostics.droppedReasoningBlockCount, 0);
  assert.equal(
    (same.messages[0]!.content as Array<{ type: string }>).some((b) => b.type === "reasoning"),
    true,
    "同模型的 reasoning 必须保留（签名只对产生它的模型有效，但同模型回放合法）",
  );

  const cross = applyCrossProviderMessageHygiene(
    [
      assistant("旧模型轮", { ...OTHER, reasoning: "上一个模型的想法" }),
      { role: "user", content: "继续" },
    ] as never,
    TARGET,
  );
  assert.equal(cross.diagnostics.droppedReasoningBlockCount, 1);
  const blocks = cross.messages[0]!.content as Array<{ type: string }>;
  assert.equal(blocks.some((b) => b.type === "reasoning"), false, "异源 reasoning 必须丢弃");
  assert.equal(
    blocks.some((b) => b.type === "text" && (b as { text: string }).text === "旧模型轮"),
    true,
    "正文必须保留",
  );
});

test("孤儿工具调用：turn 中断留下的无结果调用在下一个 user 前补合成错误结果", () => {
  const result = applyCrossProviderMessageHygiene(
    [
      assistant("我来读文件", {
        toolCalls: [{ id: "call-1", name: "Read", input: { file_path: "/a" } }],
      }),
      { role: "user", content: "算了，换一个做法" },
    ] as never,
    TARGET,
  );
  assert.equal(result.diagnostics.synthesizedOrphanToolResultCount, 1);
  assert.equal(result.messages.length, 3);
  const synthetic = result.messages[1]!;
  assert.equal(synthetic.role, "tool");
  assert.equal(synthetic.toolCallId, "call-1");
  assert.equal(synthetic.isError, true);
  // 合成结果必须插在打断的 user 消息之前，保持调用/结果相邻
  assert.equal((result.messages[2] as { role: string }).role, "user");
});

test("已配对调用不补；结尾未闭合调用同样补齐", () => {
  const paired = applyCrossProviderMessageHygiene(
    [
      assistant("读文件", {
        toolCalls: [{ id: "call-1", name: "Read", input: {} }],
      }),
      { role: "tool", toolCallId: "call-1", toolName: "Read", content: "内容", isError: false },
    ] as never,
    TARGET,
  );
  assert.equal(paired.diagnostics.synthesizedOrphanToolResultCount, 0);
  assert.equal(paired.messages.length, 2, "配对完整时不得插入任何合成消息");

  const tailOrphan = applyCrossProviderMessageHygiene(
    [
      { role: "user", content: "开始" },
      assistant("查一下", {
        toolCalls: [{ id: "call-9", name: "Grep", input: { pattern: "x" } }],
      }),
    ] as never,
    TARGET,
  );
  assert.equal(tailOrphan.diagnostics.synthesizedOrphanToolResultCount, 1);
  assert.equal(tailOrphan.messages.at(-1)!.role, "tool", "末尾孤儿调用在投影末尾补结果");
});

test("从未配对的孤儿工具结果被剔除；跨边界迟到结果保留", () => {
  const neverSeen = applyCrossProviderMessageHygiene(
    [
      { role: "user", content: "开始" },
      { role: "tool", toolCallId: "ghost-1", toolName: "Read", content: "无主结果", isError: false },
      assistant("好", {}),
    ] as never,
    TARGET,
  );
  assert.equal(neverSeen.diagnostics.droppedOrphanToolResultCount, 1);
  assert.equal(
    neverSeen.messages.some((m) => m.role === "tool" && m.toolCallId === "ghost-1"),
    false,
  );

  const lateAnswer = applyCrossProviderMessageHygiene(
    [
      assistant("调用", {
        toolCalls: [{ id: "call-1", name: "Read", input: {} }],
      }),
      assistant("继续", {}),
      { role: "tool", toolCallId: "call-1", toolName: "Read", content: "迟到", isError: false },
    ] as never,
    TARGET,
  );
  assert.equal(
    lateAnswer.messages.some((m) => m.role === "tool" && m.toolCallId === "call-1"),
    true,
    "曾经见过的迟到结果不得丢弃（交给 provider 决定）",
  );
});

test("无修正时原样返回输入引用（调用方可短路复制）", () => {
  const messages = [
    { role: "user", content: "hello" },
    assistant("hi", { providerId: TARGET.providerId, modelId: TARGET.modelId }),
  ] as never;
  const result = applyCrossProviderMessageHygiene(messages, TARGET);
  assert.equal(result.messages, messages as never, "无修正必须返回原引用");
});

test("sourceEntries 与输出消息按索引对齐", () => {
  const source = [{ id: "s1" }, { id: "s2" }, { id: "s3" }] as never[];
  const result = applyCrossProviderMessageHygiene(
    [
      assistant("调用", {
        toolCalls: [{ id: "call-1", name: "Read", input: {} }],
      }),
      { role: "tool", toolCallId: "ghost", toolName: "Read", content: "x", isError: false },
      { role: "user", content: "下一步" },
    ] as never,
    TARGET,
    source,
  );
  // ghost 结果被剔除；孤儿调用补 1 条合成结果 → 3 进 3 出，但索引内容变了
  assert.equal(result.messages.length, 3);
  assert.equal(result.sourceEntries.length, 3);
  assert.equal((result.sourceEntries[0] as { id: string }).id, "s1");
  assert.equal(result.sourceEntries[1], undefined, "合成结果没有 canonical 来源");
  assert.equal((result.sourceEntries[2] as { id: string }).id, "s3");
});
