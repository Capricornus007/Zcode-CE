import {
  CoreErrorType,
  KB_SEARCH_TOOL_NAME,
  KbSearchInputJsonSchema,
  KbSearchInputSchema,
  KbSearchOutputJsonSchema,
  KbSearchOutputSchema,
  createCoreError,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";

/**
 * KbSearch：工作区知识卡语料的主动检索（140 §P1-5）。
 *
 * 与每轮注入的 kb_recall 提醒互补：提醒是默认的 top-5 线索，本工具是模型按需
 * 查询（可带 family 限定家族）。只返回锚点，正文由模型 Read 源文件。
 */
export const kbSearchHandler: ToolHandler = async (input, context) => {
  const request = KbSearchInputSchema.parse(input);
  const port = context.kbSearchControlPort;
  if (!port) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "KbSearch requires a workspace filesystem",
      {
        context: { toolCallId: context.toolCallId, toolName: KB_SEARCH_TOOL_NAME },
        recoverable: false,
      },
    );
  }
  const result = await port.search(request);
  return KbSearchOutputSchema.parse(result) as unknown;
};

export const kbSearchToolEntry: ToolEntry = {
  capability: "Search the workspace knowledge-card corpus and return source anchors",
  metadata: {
    name: KB_SEARCH_TOOL_NAME,
    description:
      "Search the workspace knowledge base (`.zcode/kb-cards`) and return up to 20 source anchors. " +
      "Each anchor is `<source file>#<heading>` plus a short summary and the card path; it is a pointer, not content. " +
      "Use this instead of guessing when a question depends on project-specific domain knowledge (e.g. divination skill rules); " +
      "then Read the anchored source file for the full passage. " +
      "Optional `family` restricts the search to one card family by filename prefix (e.g. qimen, liuren, ziwei). " +
      "Returns an empty `anchors` list when the workspace has no knowledge cards or nothing matches — do not invent sources.",
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: 5_000,
    maxOutputBytes: 8_192,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: kbSearchHandler,
  inputSchema: KbSearchInputJsonSchema,
  outputSchema: KbSearchOutputJsonSchema,
  runtimeInputSchema: KbSearchInputSchema,
  runtimeOutputSchema: KbSearchOutputSchema,
  permission: {
    permission: "kbSearch",
    reason: "KbSearch only reads the workspace knowledge-card corpus",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 8_192,
    maxModelBytes: 8_192,
    strategy: "truncate",
    preview: {
      maxBytes: 8_192,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: 5_000,
    maxMs: 5_000,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "KbSearch was cancelled before the knowledge anchors were returned",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
