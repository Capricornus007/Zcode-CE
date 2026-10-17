import type { ModelInputMessage, ModelToolCall } from "@zcode/contracts";
import type { RuntimeMessageEntry } from "../../agent/message-history.js";

/**
 * 跨 provider 消息清洗（吸收 earendil-works/pi transform-messages.ts:91-256）。
 *
 * 会话中途切换模型后，历史里的 assistant 消息带着上一个模型的私有数据：
 * - reasoning 块（thinking/签名）：签名只对产生它的模型有效；可读 thinking 原样重放
 *   会被新模型当成可见回复的一部分。仅在 provider+model 与目标完全一致时保留。
 * - 工具调用/结果配对：被中断的 turn 会留下没有结果的 tool call（严格 provider 直接
 *   报协议错误），或没有调用的孤儿结果。发送前统一补/删，保证每轮请求都是合法序列。
 *
 * 与 pi 的差异（如实记录）：pi 还跳过 stopReason=error/aborted 的 assistant 整条消息；
 * ZCode 的 ModelInputMessage 不携带终止态字段，该判定发生在持久化层之外，
 * 本层无法可靠识别，不实现。
 */

export interface CrossProviderHygieneTarget {
  providerId: string;
  modelId: string;
}

export interface CrossProviderHygieneResult {
  messages: ModelInputMessage[];
  /** 与返回的 messages 按索引对应；传入 sourceEntries 时保证长度一致。 */
  sourceEntries: Array<RuntimeMessageEntry | undefined>;
  diagnostics: {
    droppedReasoningBlockCount: number;
    synthesizedOrphanToolResultCount: number;
    droppedOrphanToolResultCount: number;
  };
}

const ORPHAN_TOOL_RESULT_TEXT =
  "No result was recorded for this tool call (the producing turn was interrupted). " +
  "Treat the call as not executed and re-issue it with complete arguments if still needed.";

export function applyCrossProviderMessageHygiene(
  messages: readonly ModelInputMessage[],
  target: CrossProviderHygieneTarget,
  sourceEntries?: readonly (RuntimeMessageEntry | undefined)[],
): CrossProviderHygieneResult {
  const diagnostics = {
    droppedReasoningBlockCount: 0,
    synthesizedOrphanToolResultCount: 0,
    droppedOrphanToolResultCount: 0,
  };
  const out: ModelInputMessage[] = [];
  const outSource: Array<RuntimeMessageEntry | undefined> = [];
  /** 当前未闭合的 assistant 工具调用（插入点之后的配对判断范围）。 */
  let pendingCalls = new Map<string, ModelToolCall>();
  let answeredCallIds = new Set<string>();
  /** 整个投影里出现过的调用 id；迟到结果只在从未见过时才丢弃。 */
  const everSeenCallIds = new Set<string>();

  const push = (message: ModelInputMessage, source?: RuntimeMessageEntry | undefined) => {
    out.push(message);
    if (sourceEntries) outSource.push(source);
  };

  // 为未闭合调用补合成结果（在下一个 assistant/user 之前插入，保持配对相邻）。
  const closePendingCalls = () => {
    if (pendingCalls.size === 0) return;
    for (const call of pendingCalls.values()) {
      if (answeredCallIds.has(call.id)) continue;
      diagnostics.synthesizedOrphanToolResultCount += 1;
      push({
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
        content: ORPHAN_TOOL_RESULT_TEXT,
        isError: true,
      });
    }
    pendingCalls = new Map();
    answeredCallIds = new Set();
  };

  for (const [index, message] of messages.entries()) {
    const source = sourceEntries?.[index];

    if (message.role === "assistant") {
      closePendingCalls();
      const isSameModel =
        message.providerId === undefined ||
        (message.providerId === target.providerId && message.modelId === target.modelId);
      let projected = message;
      if (!isSameModel && Array.isArray(message.content)) {
        const hasReasoning = message.content.some((block) => block.type === "reasoning");
        if (hasReasoning) {
          projected = {
            ...message,
            content: message.content.filter((block) => block.type !== "reasoning"),
          };
          diagnostics.droppedReasoningBlockCount += message.content.filter(
            (block) => block.type === "reasoning",
          ).length;
        }
      }
      for (const toolCall of message.toolCalls ?? []) {
        pendingCalls.set(toolCall.id, toolCall);
        everSeenCallIds.add(toolCall.id);
      }
      push(projected, source);
      continue;
    }

    if (message.role === "tool") {
      const callId = message.toolCallId ?? "";
      if (pendingCalls.has(callId)) {
        answeredCallIds.add(callId);
        push(message, source);
        continue;
      }
      // 从未见过对应调用的结果 = 历史损坏（严格 provider 会直接拒绝整次请求）；
      // 曾见过的迟到结果保留，由 provider 决定是否接受。
      if (!everSeenCallIds.has(callId)) {
        diagnostics.droppedOrphanToolResultCount += 1;
        continue;
      }
      push(message, source);
      continue;
    }

    if (message.role === "user") {
      closePendingCalls();
      push(message, source);
      continue;
    }

    push(message, source);
  }
  closePendingCalls();

  // 无任何修正时原样返回输入（调用方依赖引用相等短路复制）。本函数从不原地修改
  // 输入数组，返回同一引用是安全的；入参声明为 readonly 只是投影层的只读约定。
  if (
    diagnostics.droppedReasoningBlockCount === 0 &&
    diagnostics.synthesizedOrphanToolResultCount === 0 &&
    diagnostics.droppedOrphanToolResultCount === 0
  ) {
    return {
      messages: messages as ModelInputMessage[],
      sourceEntries: sourceEntries ? [...sourceEntries] : [],
      diagnostics,
    };
  }

  return { messages: out, sourceEntries: outSource, diagnostics };
}
