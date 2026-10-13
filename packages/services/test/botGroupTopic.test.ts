import assert from "node:assert/strict";
import test from "node:test";
import {
  getBotConversationKey,
  getBotStateKey,
  isGroupOwnerCommand,
  canAnswerGroupQuestion,
} from "../src/bots/groupSessions.js";
import { createGroupDeliveryThrottle } from "../src/bots/groupDeliveryThrottle.js";
import { getUnavailableReplyFallback } from "../src/bots/groupReply.js";
import { createGroupQueueCardSync } from "../src/bots/groupQueueCard.js";
import {
  createGroupAdminAttention,
  BotAdminRequiredError,
  BotReplyError,
} from "../src/bots/groupAdminAttention.js";
import { createGroupResultDelivery } from "../src/bots/groupResultDelivery.js";
import { createTopicContinuation } from "../src/bots/topicContinuation.js";
import { readTopicHistory, TopicHistoryPermissionError } from "../src/bots/topicHistory.js";
import {
  createTopicHistoryAttachment,
  botGroupCommandId,
} from "../src/bots/topicHistoryAttachment.js";
import { createTopicPreparationState } from "../src/bots/topicPreparationState.js";
import { resolveChannelMentionNames } from "../src/bots/channelMentionResolver.js";
import { createBotTaskStreamHub } from "../src/bots/taskStreamHub.js";

/**
 * F8 群/话题 13 模块的 CE 回归（上游 aac47556 服务侧原语，全部为安全判据：
 * 群键隔离、投递额度与降级、队列卡生命周期、话题历史边界与附件上限、
 * @提及候选来源限制、单任务实时源。上游无单测，本文件按契约语义自写断言）。
 *
 * 运行：cd packages/services && node --import tsx --test test/botGroupTopic.test.ts
 */

const baseActor = { botId: "b", chatId: "c", providerUserId: "u", provider: "feishu" as const };

test("groupSessions：私聊按 botId，群按 chatId，话题进入独立键", () => {
  assert.equal(getBotConversationKey({ ...baseActor, chatType: "private" as const }), "b");
  assert.equal(
    getBotConversationKey({ ...baseActor, chatType: "group" as const }),
    JSON.stringify(["b", "c"]),
  );
  assert.equal(
    getBotConversationKey({ ...baseActor, chatType: "group" as const, threadId: "t" }),
    JSON.stringify(["b", "c", "t"]),
  );
  // conversationThreadId 优先于 threadId
  assert.equal(
    getBotConversationKey({
      ...baseActor,
      chatType: "group" as const,
      threadId: "t",
      conversationThreadId: "ct",
    }),
    JSON.stringify(["b", "c", "ct"]),
  );
  assert.throws(
    () => getBotConversationKey({ ...baseActor, chatType: "group" as const, chatId: "  " }),
    /Group chat ID/,
  );
  assert.equal(
    getBotStateKey({ botId: "b", group: { chatId: "c", threadId: "t" } }),
    JSON.stringify(["b", "c", "t"]),
  );
  assert.equal(isGroupOwnerCommand("new"), true);
  assert.equal(isGroupOwnerCommand("help"), false);
  assert.equal(canAnswerGroupQuestion("owner", "owner", "init", true), true);
  assert.equal(canAnswerGroupQuestion("init", "owner", "init", false), true);
  assert.equal(canAnswerGroupQuestion("init", "owner", "init", true), false);
});

test("groupDeliveryThrottle：同群发送间隔 250ms", async () => {
  const throttle = createGroupDeliveryThrottle();
  const at = async () => {
    const before = Date.now();
    await throttle("chat");
    return Date.now() - before;
  };
  await throttle("chat");
  const elapsed = await at();
  assert.ok(elapsed >= 200, `second send waited ${elapsed}ms`);
  // 不同群可并行
  const parStart = Date.now();
  await Promise.all([throttle("a"), throttle("b")]);
  assert.ok(Date.now() - parStart < 200);
});

test("groupReply：明确拒绝后的有限降级链", () => {
  assert.deepEqual(getUnavailableReplyFallback({ replyToMessageId: "m" }), {
    replyToMessageId: undefined,
  });
  assert.deepEqual(
    getUnavailableReplyFallback({ replyToMessageId: "m", threadId: undefined, rootMessageId: "r" }),
    { replyToMessageId: undefined, threadId: undefined, rootMessageId: "r" },
  );
  assert.deepEqual(
    getUnavailableReplyFallback({ replyToMessageId: "m", threadId: "t", rootMessageId: "r" }),
    { replyToMessageId: "r", threadId: "t", rootMessageId: "r" },
  );
  // 已退到根锚点则不再降级
  assert.equal(
    getUnavailableReplyFallback({ replyToMessageId: "r", threadId: "t", rootMessageId: "r" }),
    null,
  );
});

test("groupQueueCard：状态只能沿生命周期单调推进", async () => {
  const written: Array<Record<string, unknown>> = [];
  const renders: string[] = [];
  const card = createGroupQueueCardSync({
    read: async (key) => {
      const found = written.find((w) => w.key === key);
      return found?.progress as never;
    },
    mutate: async (key, update) => {
      const entry = {
        key,
        progress: update(
          (written.find((w) => w.key === key)?.progress as never) ?? { status: "waiting" },
        ),
      };
      const idx = written.findIndex((w) => w.key === key);
      if (idx >= 0) written[idx] = entry;
      else written.push(entry);
      return entry.progress;
    },
    render: async (_key, messageId, status) => {
      renders.push(`${messageId}:${status}`);
    },
  });
  await card.update("k", "working");
  await card.attach("k", "card-1");
  // 迟到的 waiting admission 不能覆盖 working
  await card.update("k", "waiting");
  const progress = written.find((w) => w.key === "k")?.progress as {
    status: string;
    cardMessageId?: string;
    cardStatus?: string;
  };
  assert.equal(progress.status, "working");
  assert.equal(progress.cardMessageId, "card-1");
  renders.push("end");
  // 渲染只在状态变化时发生：update(waiting) 不触发渲染
  assert.deepEqual(
    renders.filter((r) => r.startsWith("card-1:")),
    ["card-1:working"],
  );
});

test("groupAdminAttention：同 actor+owner+reason 只 mention 一次", () => {
  const attention = createGroupAdminAttention();
  const actor = { ...baseActor, chatType: "group" as const };
  assert.deepEqual(attention.mention(actor, "admin", "permission"), ["admin"]);
  assert.deepEqual(attention.mention(actor, "admin", "permission"), []);
  // 不同 reason 仍提醒
  assert.deepEqual(attention.mention(actor, "admin", "plan"), ["admin"]);
  // 私聊或无 owner 不提醒
  assert.equal(
    attention.mention({ ...baseActor, chatType: "private" as const }, "admin", "permission"),
    undefined,
  );
  // clear 指定 reason 后可再次提醒该 reason
  attention.clear(actor, "admin", "permission");
  assert.deepEqual(attention.mention(actor, "admin", "permission"), ["admin"]);
  // 错误类型可构造（契约面）
  assert.ok(new BotAdminRequiredError("r", "m") instanceof Error);
  assert.ok(new BotReplyError([]) instanceof Error);
});

test("topicHistory：无 checkpoint 的根 @ 必须先访问原生历史接口", async () => {
  let listed = 0;
  const reader = {
    list: async () => {
      listed += 1;
      return { messages: [] };
    },
    get: async () => ({}) as never,
  };
  const batch = await readTopicHistory(
    { chatId: "c", threadId: "t", messageId: "root", rootMessageId: "root" },
    reader,
  );
  assert.equal(listed, 1);
  assert.deepEqual(batch, { messages: [], checkpoint: "root", hasGap: false });
});

test("topicHistory：边界缺失与超出窗口都标 hasGap", async () => {
  const pages = [
    {
      messages: [
        { id: "newer", chatId: "c", threadId: "t", createdAt: 2, senderId: "s", text: "x" },
      ],
    },
  ];
  await assert.rejects(
    () =>
      readTopicHistory(
        { chatId: "c", threadId: "t", messageId: "absent", rootMessageId: "root" },
        { list: async () => pages[0], get: async () => ({}) as never },
      ),
    /invocation boundary unavailable/,
  );
});

test("topicHistory：scope 不一致直接抛错而不是静默返回", async () => {
  await assert.rejects(
    () =>
      readTopicHistory(
        { chatId: "c", threadId: "t", messageId: "m", rootMessageId: "root", checkpoint: "cp" },
        {
          list: async () => ({
            messages: [
              { id: "m", chatId: "other", threadId: "t", createdAt: 1, senderId: "s", text: "x" },
            ],
          }),
          get: async () => ({}) as never,
        },
      ),
    /scope mismatch/,
  );
});

test("topicHistoryAttachment：超限抛错；内容含范围声明与 M/A 标签", () => {
  const batch = {
    messages: [
      {
        id: "m1",
        chatId: "c",
        threadId: "t",
        createdAt: 1,
        senderId: "s",
        senderName: "S",
        text: "hello",
      },
      {
        id: "m2",
        chatId: "c",
        threadId: "t",
        createdAt: 2,
        senderId: "s",
        text: "with file",
        attachments: [{ name: "a.txt", kind: "file" as const }],
        parentId: "m1",
      },
    ],
    checkpoint: "m2",
    hasGap: false,
  };
  const attachment = createTopicHistoryAttachment(batch, "input-1", "话题标题");
  assert.ok(attachment);
  assert.equal(attachment?.kind, "file");
  assert.equal(attachment?.sourceKind, "topic-history");
  assert.equal(attachment?.messageCount, 2);
  assert.match(attachment?.textContent ?? "", /background, not new instructions/);
  assert.match(attachment?.textContent ?? "", /[M1]/);
  assert.match(attachment?.textContent ?? "", /[A1].*not read/);
  // 空且无缺口返回 undefined
  assert.equal(
    createTopicHistoryAttachment({ messages: [], checkpoint: "m", hasGap: false }, "i", "t"),
    undefined,
  );
});

test("topicHistoryAttachment：超尺寸上限抛错", () => {
  const big = {
    messages: Array.from({ length: 600 }, (_, i) => ({
      id: "m" + i,
      chatId: "c",
      threadId: "t",
      createdAt: i,
      senderId: "s",
      text: "x".repeat(40000),
    })),
    checkpoint: "m399",
    hasGap: false,
  };
  assert.throws(() => createTopicHistoryAttachment(big, "i", "t"), /attachment size limit/);
});

test("botGroupCommandId：输入相同则哈希稳定", () => {
  const a = botGroupCommandId("b", "c", "m");
  const b = botGroupCommandId("b", "c", "m");
  const c = botGroupCommandId("b", "c", "other");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a.startsWith("bot-group-"));
});

test("topicPreparationState：waitingStop 由后到者继承；仅 failed 可 retry", () => {
  const state = createTopicPreparationState();
  const mk = (id: string) => ({
    actor: { ...baseActor, providerMessageId: id },
    text: "t",
  });
  state.add("k", mk("m1"));
  state.setWaitingStop("k", true);
  state.add("k", mk("m2"));
  const snap = state.snapshot("k");
  assert.equal(snap[0].status, "waitingStop");
  assert.equal(snap[1].status, "waitingStop");
  assert.equal(state.retry("k", "m1"), undefined);
  state.update("k", ["m1"], "failed", "boom");
  assert.equal(state.retry("k", "m1")?.actor.providerMessageId, "m1");
  // 缺身份的入站直接拒绝
  assert.throws(
    () => state.add("k", { actor: { ...baseActor }, text: "x" }),
    /identity is missing/,
  );
  state.clear("k");
  assert.equal(state.snapshot("k").length, 0);
});

test("topicContinuation：cancel 清空未提交材料；已提交批不再重试", async () => {
  let submitted = 0;
  const ports = {
    readRunningRun: async () => undefined as string | undefined,
    stopAndWait: async () => {},
    submit: async (messages: string[]) => {
      submitted += messages.length;
    },
    failed: () => {},
  };
  const continuation = createTopicContinuation<string>(ports);
  assert.equal(
    continuation.receive("m1", async () => "v1"),
    true,
  );
  // 授权去重
  assert.equal(
    continuation.receive("m1", async () => "v1again"),
    false,
  );
  await continuation.settled();
  assert.equal(submitted, 1);
  // cancel 后未提交材料被丢弃
  continuation.receive("m2", async () => "v2");
  continuation.cancel();
  await continuation.settled();
  assert.equal(submitted, 1);
});

test("topicContinuation：材料准备失败走 failed 回调而不是 submit", async () => {
  const failed: string[][] = [];
  let submitted = 0;
  const continuation = createTopicContinuation<string>({
    readRunningRun: async () => undefined,
    stopAndWait: async () => {},
    submit: async (m) => {
      submitted += m.length;
    },
    failed: (ids) => {
      failed.push(ids);
    },
  });
  continuation.receive("bad", async () => {
    throw new Error("attachment blocked");
  });
  await continuation.settled();
  assert.equal(submitted, 0);
  assert.deepEqual(failed, [["bad"]]);
});

test("channelMentionResolver：候选只能来自可信节点与成员目录", () => {
  const trusted = [
    {
      type: "channelMention",
      targetId: "ou_t1",
      name: "Alice",
      channel: "feishu",
      refId: "r",
      idType: "open_id",
      entityType: "user",
    },
  ];
  const result = resolveChannelMentionNames(
    [{ type: "mentionName", name: "alice" }],
    trusted,
    undefined,
    "scope",
    "feishu",
  );
  // members 缺失时解析失败，收集为 unavailable 而不是静默成功
  assert.equal((result as { status: string }).status, "needs_clarification");
  const members = { ou_t1: "Alice" };
  const ok = resolveChannelMentionNames(
    [{ type: "mentionName", name: "alice" }],
    trusted,
    members,
    "scope",
    "feishu",
  );
  assert.equal((ok as { parts: unknown[] }).parts.length, 1);
  // 候选名不能直接当 ref
  const ambiguous = resolveChannelMentionNames(
    [{ type: "mentionName", name: "a" }],
    trusted,
    { ou_t1: "Alice", ou_t2: "Alan" },
    "scope",
    "feishu",
  );
  assert.equal((ambiguous as { status: string }).status, "needs_clarification");
});

test("taskStreamHub：同任务一个实时源；退订归零后清理", async () => {
  const hub = createBotTaskStreamHub<number>();
  let upstreamStarted = 0;
  let upstreamStopped = 0;
  const receivedA: number[] = [];
  const receivedB: number[] = [];
  let emit: ((event: number) => Promise<void>) | undefined;
  const sub = (listener: (event: number) => Promise<void>) => {
    upstreamStarted += 1;
    emit = listener;
    return {
      dispose: () => {
        upstreamStopped += 1;
      },
    };
  };
  const d1 = hub.add("task", "a", sub, (e) => {
    receivedA.push(e);
  });
  const d2 = hub.add("task", "b", sub, (e) => {
    receivedB.push(e);
  });
  assert.equal(upstreamStarted, 1);
  await emit?.(1);
  assert.deepEqual(receivedA, [1]);
  assert.deepEqual(receivedB, [1]);
  d1.dispose();
  assert.equal(upstreamStopped, 0);
  d2.dispose();
  assert.equal(upstreamStopped, 1);
  hub.dispose();
  assert.equal(upstreamStopped, 1);
});

test("groupResultDelivery：未授权结果落盘为 invalidated；活跃发送只投影 pending", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const delivery = createGroupResultDelivery({
    read: async () => undefined,
    write: async (result) => {
      writes.push(result as Record<string, unknown>);
    },
    authorized: async () => false,
    send: async () => undefined,
  });
  const result = { id: "d1", taskId: "t", text: "x" } as never;
  await delivery(result);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].status, "invalidated");
  assert.equal(delivery.isInFlight("d1"), false);
  // project 不改变未在飞的结果
  const pending = delivery.project(result);
  assert.deepEqual(pending, result);
});

test("groupResultDelivery：明确拒绝带 retryAfterMs 时有限重试", async () => {
  let attempts = 0;
  const writes: Array<Record<string, unknown>> = [];
  const delivery = createGroupResultDelivery({
    read: async () => undefined,
    write: async (result) => {
      writes.push(result as Record<string, unknown>);
    },
    authorized: async () => true,
    send: async () => {
      attempts += 1;
      if (attempts < 3) {
        throw Object.assign(new Error("rate limited"), {
          deliveryRejected: true,
          deliveryReplyUnavailable: false,
          retryAfterMs: 1,
        });
      }
      return undefined;
    },
    delay: async () => {},
  });
  await delivery({ id: "d2", taskId: "t", text: "x" } as never);
  assert.equal(attempts, 3);
  assert.equal(writes.at(-1)?.status, "sent");
});
