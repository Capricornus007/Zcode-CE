import assert from "node:assert/strict";
import test from "node:test";

import { TurnMachineImpl } from "../src/agent/turn-machine.js";
import {
  createTruncatedToolCallResult,
  executeToolCallsForModelStep,
} from "../src/runtime/methods/turn-tools.js";
import { toScheduleState } from "../src/runtime/methods/resume.js";
import type { AgentRuntimeInternal } from "../src/runtime/internal.js";
import type { RegularTurnLoopState } from "../src/runtime/methods/turn-loop-state.js";

/**
 * 截断保护（吸收 earendil-works/pi failToolCallsFromTruncatedMessage）：
 * finishReason === "length" 说明输出被 token 上限截断，消息内工具调用参数可能被
 * 流式 JSON 修复成"能解析但静默不完整"的形状。全部工具必须按"未执行"结算，
 * 不得进入真实执行器。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/length-truncated-tool-calls.test.ts
 */

function createStubRuntime() {
  const persistedParts: Array<Record<string, unknown>> = [];
  const committedEntries: Array<Record<string, unknown>> = [];
  let executeToolsCalls = 0;
  const stub = {
    sessionId: "sess-test",
    turnNumber: 1,
    config: {},
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    registry: { get: () => undefined, getMetadata: () => undefined },
    messageHistory: {
      addEntries: (entries: Array<Record<string, unknown>>) => {
        committedEntries.push(...entries);
      },
      getMessageCount: () => committedEntries.length,
    },
    // 反向断言的锚点：截断路径绝不允许触碰真实执行器。
    executeTools: async () => {
      executeToolsCalls += 1;
      throw new Error("executeTools must not be called for truncated tool calls");
    },
    scheduleTools: async (toolCalls: Array<{ id: string }>) => ({
      items: toolCalls.map((toolCall) => ({
        toolCallId: toolCall.id,
        dependencies: [],
        canRunParallel: true,
      })),
      parallelGroups: [],
      executionOrder: toolCalls.map((toolCall) => toolCall.id),
    }),
    toScheduleState(schedule: {
      items: Array<{ toolCallId: string; dependencies: string[]; canRunParallel: boolean }>;
      parallelGroups: string[][];
      executionOrder: string[];
    }) {
      return {
        items: schedule.items.map((item) => ({
          toolCallId: item.toolCallId,
          dependencies: item.dependencies,
          canRunParallel: item.canRunParallel,
        })),
        parallelGroups: schedule.parallelGroups,
        executionOrder: schedule.executionOrder,
      };
    },
    persistPart: async (part: Record<string, unknown>) => {
      persistedParts.push(part);
    },
    persistAssistantMessage: async () => {},
    emitFileMutationCheckpoint: async () => {},
    createEvent: (eventType: string, payload: unknown) => ({ eventType, payload }),
    appendEvent: async () => {},
  };
  return { stub, persistedParts, committedEntries, executeToolsRef: () => executeToolsCalls };
}

function createStubState() {
  // 与生产一致的相变序列：start → startModelRequest → receiveModelResponse。
  let machine = TurnMachineImpl.create("sess-test", 1, "test input");
  machine = new TurnMachineImpl(machine.start());
  machine = new TurnMachineImpl(machine.startModelRequest("stub-model", []));
  machine = new TurnMachineImpl(machine.receiveModelResponse(""));
  return {
    model: { providerId: "stub-provider", modelId: "stub-model" },
    turnMachine: machine,
    events: [] as unknown[],
    turnRequestState: { entries: [] as unknown[] },
    turnId: "turn-1",
    userMessageId: "user-1",
    currentUserMessageId: "user-1",
    turnAbortSignal: undefined,
    toolCallCount: 0,
    activeTurn: undefined,
    compactTracking: undefined,
  } as unknown as RegularTurnLoopState;
}

test("截断保护：length 响应的工具全部按未执行结算，不进真实执行器", async () => {
  const { stub, persistedParts, committedEntries, executeToolsRef } = createStubRuntime();
  const state = createStubState();

  const outcome = await executeToolCallsForModelStep.call(
    stub as unknown as AgentRuntimeInternal,
    state,
    {
      assistantCreatedAt: Date.now(),
      assistantMessageId: "assistant-1",
      modelTraceContext: { traceId: "trace-1", turnId: "turn-1" } as never,
      result: {
        finishReason: "length",
        text: "",
        toolCalls: [],
        usage: {},
        providerMetadata: {},
      } as never,
      toolCalls: [
        { id: "call-1", name: "Read", input: { file_path: "/tmp/a.ts" } },
        { id: "call-2", name: "Bash", input: { command: "ls -la" } },
      ],
      streamedToolResults: [],
      suppressExecutionReason: "output_token_limit",
    } as never,
  );

  assert.equal(outcome, "continue", "结算后应交还 turn loop 让模型重新发起");
  assert.equal(executeToolsRef(), 0, "被截断的工具绝不允许进入真实执行器");
  assert.equal(committedEntries.length, 2, "两个工具结果必须进入请求历史");
  for (const entry of committedEntries) {
    const message = (entry as { message?: { isError?: boolean; role?: string } }).message;
    assert.equal(message?.isError, true, "工具结果必须标记为错误");
    assert.equal(message?.role, "tool");
    const content = JSON.stringify(entry);
    assert.ok(
      content.includes("output token limit") && content.includes("Re-issue"),
      `错误文案必须说明截断因果并给出重新发起指令，实际：${content.slice(0, 200)}`,
    );
  }

  // 机器必须走完 schedule → execute → complete → aggregate，与正常工具批次同构。
  const phase = (state as unknown as { turnMachine: { state: { phase: string } } }).turnMachine
    .state.phase;
  assert.equal(phase, "aggregating_results", `终态应为 aggregating_results，实际 ${phase}`);
  assert.ok(persistedParts.length >= 2, "每个工具调用都必须有持久化的 tool part");
  const errorParts = persistedParts.filter(
    (part) => (part as { state?: { status?: string } }).state?.status === "error",
  );
  assert.equal(errorParts.length, 2, "最终落盘的 tool part 必须是 error 态");
});

test("截断保护：流式已执行的只读工具结果同样被丢弃（参数不可信）", async () => {
  const { stub, committedEntries } = createStubRuntime();
  const state = createStubState();

  const outcome = await executeToolCallsForModelStep.call(
    stub as unknown as AgentRuntimeInternal,
    state,
    {
      assistantCreatedAt: Date.now(),
      assistantMessageId: "assistant-1",
      modelTraceContext: { traceId: "trace-1", turnId: "turn-1" } as never,
      result: {
        finishReason: "length",
        text: "",
        toolCalls: [],
        usage: {},
        providerMetadata: {},
      } as never,
      toolCalls: [{ id: "call-1", name: "Read", input: { file_path: "/tmp/a.ts" } }],
      // 流式协调器已经执行过的只读工具：结果存在，但参数完整性不可信，必须覆盖为未执行。
      streamedToolResults: [
        {
          toolCallId: "call-1",
          partID: "part-streamed-1",
          input: { file_path: "/tmp/a.ts" },
          ledgerRecorded: true,
          result: {
            toolCallId: "call-1",
            toolName: "Read",
            success: true,
            output: "file contents that may come from truncated arguments",
            durationMs: 5,
            startedAt: new Date(),
            completedAt: new Date(),
          },
        },
      ] as never,
      suppressExecutionReason: "output_token_limit",
    } as never,
  );

  assert.equal(outcome, "continue");
  assert.equal(committedEntries.length, 1, "流式结果必须被合成错误覆盖");
  const entry = committedEntries[0] as { message?: { isError?: boolean } };
  assert.equal(entry.message?.isError, true, "流式已执行的结果在截断响应中必须按未执行结算");
});

test("纯工厂：createTruncatedToolCallResult 产出可操作的错误结果", () => {
  const result = createTruncatedToolCallResult({ id: "call-9", name: "Write", input: {} });
  assert.equal(result.toolCallId, "call-9");
  assert.equal(result.toolName, "Write");
  assert.equal(result.success, false);
  assert.equal(result.error?.type, "tool_call_not_executed_output_limit");
  assert.ok(result.error?.message.includes("Write"));
  assert.ok(
    result.error?.message.includes("Re-issue the tool call with complete arguments"),
    "错误文案必须包含重新发起指令",
  );
  assert.equal(result.durationMs, 0);
});
