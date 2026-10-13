import assert from "node:assert/strict";
import test from "node:test";
import {
  channelContentPartsSchema,
  channelContentText,
  channelReplyPartsSchema,
  channelReplyRequestSchema,
  channelReplyResultSchema,
  resolveChannelReplyParts,
} from "../src/channel-mention.js";

/**
 * X6 channel-mention 契约测试（上游 aac47556 搬运后的回归网）。
 *
 * 上游在该文件里没有任何测试；本仓把它作为 Bot 反向回复三端共用的严格 schema，
 * 解析规则出错的表现是「模型投递的回复投不出去 / 提及被解析成平台 ID」——静默失败。
 * 这里钉住四条语义：Host 来源解析、mentionName 必须由 Host 解析、正文长度界、冲突 ref。
 *
 * 运行：cd packages/shared && node --import tsx --test test/channelMentionResolve.test.ts
 */

const mention = {
  type: "channelMention" as const,
  refId: "r1",
  name: "alice",
  channel: "feishu" as const,
  targetId: "ou_abc123",
  idType: "open_id" as const,
  entityType: "user" as const,
};

test("channelContentText 把提及渲染为 @name", () => {
  const parts = channelContentPartsSchema.parse([{ type: "text", text: "hi " }, mention]);
  assert.equal(channelContentText(parts), "hi @alice");
});

test("resolveChannelReplyParts 用 source 里的 ref 解析 mention", () => {
  const resolved = resolveChannelReplyParts(
    channelReplyPartsSchema.parse([{ type: "mention", refId: "r1" }]),
    [mention],
  );
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.type, "channelMention");
  assert.equal((resolved[0] as { targetId: string }).targetId, "ou_abc123");
});

test("resolveChannelReplyParts 拒绝 source 里不存在的 ref", () => {
  assert.throws(() =>
    resolveChannelReplyParts(channelReplyPartsSchema.parse([{ type: "mention", refId: "ghost" }]), [
      mention,
    ]),
  );
});

test("resolveChannelReplyParts 拒绝未由 Host 解析的 mentionName", () => {
  assert.throws(() =>
    resolveChannelReplyParts(
      channelReplyPartsSchema.parse([{ type: "mentionName", name: "alice" }]),
      [mention],
    ),
  );
});

test("resolveChannelReplyParts 拒绝对同一 refId 的冲突描述", () => {
  const other = { ...mention, name: "bob" };
  assert.throws(() =>
    resolveChannelReplyParts(channelReplyPartsSchema.parse([{ type: "mention", refId: "r1" }]), [
      mention,
      other,
    ]),
  );
});

test("resolveChannelReplyParts 拒绝空正文与超长正文", () => {
  assert.throws(() =>
    resolveChannelReplyParts(channelReplyPartsSchema.parse([{ type: "text", text: "   " }]), []),
  );
  const long = "x".repeat(2001);
  assert.throws(() =>
    resolveChannelReplyParts(channelReplyPartsSchema.parse([{ type: "text", text: long }]), []),
  );
});

test("channelReplyResultSchema 接受投递结果与待澄清两种形态", () => {
  assert.deepEqual(channelReplyResultSchema.parse({ status: "sent", deliveryId: "d1" }), {
    status: "sent",
    deliveryId: "d1",
  });
  const clarification = channelReplyResultSchema.parse({
    status: "needs_clarification",
    unresolved: [{ name: "alice", reason: "ambiguous", candidates: [], truncated: false }],
  });
  assert.equal(clarification.status, "needs_clarification");
});

test("channelReplyRequestSchema 是 strict：多余键被拒", () => {
  assert.throws(() =>
    channelReplyRequestSchema.parse({
      taskId: "t",
      inputId: "i",
      toolCallId: "c",
      parts: [],
      extra: 1,
    }),
  );
});
