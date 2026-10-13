import assert from "node:assert/strict";
import test from "node:test";
// 经 handlers 注册表入口导入（同 queueHeldResetWiring.test.ts 的 TDZ 规避理由）。
import { NATIVE_HANDLERS } from "../src/zcode-protocol-v4/commands/handlers/index.js";
import type {
  CommandEnvelope,
  CommandPayloadMap,
} from "@zcode/shared/zcode-protocol-v4";
import type { ModelSelection, TurnInputIntentMetadata } from "@zcode/contracts";
import type {
  SendInputOptions,
  SendInputResult,
  ZCodeApp,
} from "../src/app/types.js";
import type { TraceContext } from "@zcode/contracts";
import type { V4CommandCoreHost, V4SessionRecordView } from "../src/zcode-protocol-v4/commands/types.js";

/**
 * X1「加速回合中编辑的消息可能丢失」编辑重发关键路径测试（技术清除三件之二）。
 *
 * 上游 1493 行 native harness 不整搬；这里只覆盖 X1 修复的四个判定点
 * （docs/development/173 实现记录）：
 * 1. 跨会话卡（taskId ≠ sessionId）不应用：旧凭据不能加速本次编辑重发；
 * 2. 过期卡退回会话常驻 Selection（禁止只删卡标记保留加速 provider）；
 * 3. 同会话有效卡 + 真指向加速 Provider：intent 写卡快照、换卡 Selection、带执行材料；
 * 4. admission 竞态（rewind 已提交、Core 仍收口旧 turn）→ 原子入队不丢消息。
 *
 * 运行：cd apps/zcode-cli/packages/bootstrap && node --import tsx --test test/x1-fork-edit-retry.test.ts
 * （本地直接跑需源码解析钩子；CI 上由 pnpm test 统一装。）
 */

const editUserQuery = NATIVE_HANDLERS.editUserQuery;

const HIGHSPEED_PROVIDER = "account:zai-highspeed-card";
const SESSION_MODEL: ModelSelection = { providerId: "glm", modelId: "glm-5" };

interface SentInput {
  text: string;
  intent?: TurnInputIntentMetadata;
  modelExecution?: unknown;
  requireQueue?: boolean;
  requireIdle?: boolean;
}

function makeEnvelope(payload: Partial<CommandPayloadMap["editUserQuery"]>): CommandEnvelope {
  return {
    commandId: "cmd-edit-1",
    sessionId: "s1",
    type: "editUserQuery",
    payload: { target: { rowId: 5, entityId: "e1" }, newText: "edited text", ...payload },
    clientId: "cli",
  } as unknown as CommandEnvelope;
}

function makeCard(options: { taskId?: string; expiresAt?: number } = {}) {
  const now = Date.now();
  return {
    schemaVersion: 1 as const,
    cardId: "card-1",
    taskId: options.taskId ?? "s1",
    provider: HIGHSPEED_PROVIDER,
    model: "highspeed-x",
    issuedAt: now - 1000,
    expiresAt: options.expiresAt ?? now + 60_000,
  };
}

function createHarness(options: {
  editTargetModelSelection?: ModelSelection;
  admissions: SendInputResult[];
  activeRuntimeTurn?: boolean;
}) {
  const sent: SentInput[] = [];
  const warns: string[] = [];
  const infos: string[] = [];
  const queuedExecutions = new Map<string, unknown>();
  let activeTurnReleased = options.activeRuntimeTurn !== true;

  const editTarget = {
    entityId: "e1",
    productTurnId: "t1",
    transcriptMessageId: "m1",
    coveredByStableCompact: false,
    intent: {
      kind: "sendText" as const,
      text: "original text",
      modelSelection: options.editTargetModelSelection,
    },
  };

  const app = {
    sessionId: "s1",
    sendInput: async (input: { text: string }, opts: SendInputOptions) => {
      sent.push({
        text: input.text,
        intent: opts.intent,
        modelExecution: opts.modelExecution,
        requireQueue: opts.requireQueue,
        requireIdle: opts.requireIdle,
      });
      return options.admissions[sent.length - 1];
    },
    readTarget: async () => undefined,
    getModel: () => "glm/glm-5",
    runtime: {
      // X1 bug 场景：turn 由 Core runtime 持有（无 Bootstrap activeAbortController）。
      getActiveTurnInfo: () => (activeTurnReleased ? undefined : { turnId: "t-running" }),
      getActiveForegroundExecutionId: () =>
        activeTurnReleased ? undefined : "exec-running",
      stopActiveForegroundExecution: () => {
        activeTurnReleased = true;
        return { kind: "stopped" as const };
      },
      rewindConversationToMessage: async () => ({ strategy: "active_chain" }),
      getSessionModelSelection: () => SESSION_MODEL,
    },
  } as unknown as ZCodeApp;

  const record = {
    app,
    traceContext: { traceId: "tr1", sessionId: "s1" } as TraceContext,
    persistence: "immediate" as const,
    activeAbortController: undefined,
    workspace: { workspacePath: "." },
  } as unknown as V4SessionRecordView;

  const host = {
    getRecord: (sessionId: string) => (sessionId === "s1" ? record : undefined),
    resolveRowActionTarget: () => ({
      ok: true,
      row: { rowId: 5, turnId: "t1" },
      editTarget,
      messageIds: ["m1"],
    }),
    ensureModelReady: async () => {},
    afterLegacyStateMutation: async () => {},
    logger: {
      warn: (message: string) => warns.push(message),
      info: (message: string) => infos.push(message),
    },
    retainQueuedTurnExecution: (_sessionId: string, commandId: string, execution: unknown) => {
      queuedExecutions.set(commandId, execution);
    },
    readQueuedTurnExecution: (_sessionId: string, commandId: string) =>
      queuedExecutions.get(commandId),
    deleteQueuedTurnExecution: (_sessionId: string, commandId: string) => {
      queuedExecutions.delete(commandId);
    },
    clearQueuedTurnExecutions: () => {
      queuedExecutions.clear();
    },
  } as unknown as V4CommandCoreHost;

  return { host, record, sent, warns, infos };
}

const STARTED = {
  kind: "started_turn" as const,
  turnId: "t-new" as never,
  completion: Promise.resolve(),
};
const REJECTED_STEER = {
  kind: "rejected" as const,
  activeTurnId: "t-running" as never,
  reason: "turn_not_steerable" as never,
};
const QUEUED = {
  kind: "queued" as const,
  pendingInputId: "pending-1",
  queueLength: 1,
  turnId: "t-queued" as never,
};

test("X1-1 跨会话卡不应用：taskId ≠ sessionId 时退回会话常驻 Selection", async () => {
  const harness = createHarness({
    editTargetModelSelection: { providerId: HIGHSPEED_PROVIDER, modelId: "highspeed-x" },
    admissions: [STARTED],
  });
  const result = await editUserQuery(
    harness.host,
    makeEnvelope({
      highspeedMeta: makeCard({ taskId: "another-session" }),
      modelSelection: { providerId: HIGHSPEED_PROVIDER, modelId: "highspeed-x" },
      modelExecution: { selectionScope: "execution" },
    }),
  );
  assert.equal(result?.disposition, "rewind");
  const sent = harness.sent[0];
  assert.equal(sent?.text, "edited text");
  assert.equal(sent?.intent?.highspeed, undefined, "跨会话卡不得进入 intent");
  assert.equal(
    sent?.intent?.modelSelection?.providerId,
    SESSION_MODEL.providerId,
    "旧加速 Selection 必须回落会话常驻模型",
  );
  assert.equal(sent?.modelExecution, undefined, "回落时不得残留执行材料");
});

test("X1-2 过期卡退回会话常驻 Selection（只删卡标记而留 provider 是 bug）", async () => {
  const harness = createHarness({
    editTargetModelSelection: { providerId: HIGHSPEED_PROVIDER, modelId: "highspeed-x" },
    admissions: [STARTED],
  });
  await editUserQuery(
    harness.host,
    makeEnvelope({
      highspeedMeta: makeCard({ expiresAt: Date.now() - 60_000 }),
      modelSelection: { providerId: HIGHSPEED_PROVIDER, modelId: "highspeed-x" },
      modelExecution: { selectionScope: "execution" },
    }),
  );
  const sent = harness.sent[0];
  assert.equal(sent?.intent?.highspeed, undefined, "过期卡不得进入 intent");
  assert.equal(sent?.intent?.modelSelection?.providerId, SESSION_MODEL.providerId);
  assert.equal(sent?.modelExecution, undefined);
});

test("X1-3 同会话有效卡且真指向加速 Provider：写卡快照、换 Selection、带执行材料", async () => {
  const harness = createHarness({ admissions: [STARTED] });
  const card = makeCard();
  await editUserQuery(
    harness.host,
    makeEnvelope({
      highspeedMeta: card,
      modelSelection: { providerId: HIGHSPEED_PROVIDER, modelId: "highspeed-x" },
      modelExecution: { selectionScope: "execution" },
    }),
  );
  const sent = harness.sent[0];
  assert.equal(sent?.intent?.highspeed?.cardId, "card-1", "卡快照进 intent");
  assert.equal(
    sent?.intent?.modelSelection?.providerId,
    HIGHSPEED_PROVIDER,
    "canonical intent 换成本次卡的 Selection",
  );
  assert.notEqual(sent?.modelExecution, undefined, "执行材料随重发提交");
});

test("X1-4 admission 竞态：rewind 已提交后 Core 拒 steer → 原子入队，消息不丢", async () => {
  const harness = createHarness({
    admissions: [REJECTED_STEER, QUEUED],
    activeRuntimeTurn: true,
  });
  const result = await editUserQuery(
    harness.host,
    makeEnvelope({ highspeedMeta: makeCard(), modelExecution: { selectionScope: "execution" } }),
  );
  // 第一条被 turn_not_steerable 拒（Core 仍在收口旧 turn）；修复前这里就抛出、
  // 旧消息已截断而新文本随异常丢失。
  assert.equal(result?.disposition, "rewind");
  assert.equal(harness.sent.length, 2, "必须重试一次");
  assert.deepEqual(
    harness.sent.map((sent) => Boolean(sent.requireQueue)),
    [false, true],
    "重试必须以 requireQueue 原子入队",
  );
  assert.equal(
    harness.sent[1]?.text,
    "edited text",
    "重试提交的是编辑后的新文本，不是旧文本",
  );
  assert.ok(
    harness.warns.some((message) => message.includes("recovered by queue")),
    "竞态恢复必须有 warn 审计日志",
  );
});

test("X1-5 纯引用编辑放行：正文空但带 conversationQuotes 不被 empty 拒绝", async () => {
  const harness = createHarness({ admissions: [STARTED] });
  await editUserQuery(
    harness.host,
    makeEnvelope({ newText: "", conversationQuotes: [{ text: "引用上文" }] }),
  );
  assert.equal(harness.sent[0]?.text, "");
  assert.deepEqual(harness.sent[0]?.intent?.conversationQuotes, [{ text: "引用上文" }]);
});
