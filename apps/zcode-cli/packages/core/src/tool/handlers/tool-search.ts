import type {
  ToolEntry,
  ToolExecutionContext,
  ToolHandler,
  ToolSearchControlPort,
  ToolSearchExecutionResult,
} from "../types.js";

/**
 * ToolSearch：延迟工具的 BM25 发现入口（吸收 earendil-works/pi tool_search）。
 *
 * 只有当声明面超过预算（见 runtime/helpers/tool-deferral.ts）时才会出现在
 * 模型可见工具列表里。命中即激活：前 N 个结果恢复声明，会话内持续有效。
 * 端口缺席（如极简宿主没装配）时诚实失败，不装作搜索成功。
 */

export const TOOL_SEARCH_TOOL_NAME = "ToolSearch";

const TOOL_SEARCH_INPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: { type: "string", minLength: 1, description: "What the tool should do, in a few words" },
    limit: { type: "integer", minimum: 1, maximum: 16 },
  },
} as const;

const TOOL_SEARCH_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results", "activated"],
  properties: {
    results: {
      type: "array",
      description: "Matching deferred tools, best first; all listed tools are now activated",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "score"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          score: { type: "number" },
        },
      },
    },
    activated: { type: "array", items: { type: "string" }, description: "Tool names newly activated for this session" },
  },
} as const;

export type ToolSearchOutput = ToolSearchExecutionResult;

export const TOOL_SEARCH_ERROR_NO_PORT = "ToolSearch is unavailable in this runtime context";

export const toolSearchHandler: ToolHandler = async (input, context: ToolExecutionContext) => {
  const parsedInput = typeof input === "object" && input !== null ? (input as { query?: unknown; limit?: unknown }) : {};
  const query = typeof parsedInput.query === "string" ? parsedInput.query : "";
  const limit = typeof parsedInput.limit === "number" ? parsedInput.limit : undefined;
  const port = context.toolSearchControlPort;
  if (!port) {
    throw new Error(TOOL_SEARCH_ERROR_NO_PORT);
  }
  return (await port.search(query, limit)) as unknown;
};

export const toolSearchToolEntry: ToolEntry = {
  capability: "Discover and activate deferred tools by search",
  metadata: {
    name: TOOL_SEARCH_TOOL_NAME,
    description:
      "Search tools that are not currently declared (hidden to save context), activate the best matches, and return them with descriptions. " +
      "Use it when you need a capability you do not see in your tool list — for example an integration from a connected MCP server. " +
      "Activated tools become callable for the rest of the session.",
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: 10_000,
    maxOutputBytes: 16_384,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: toolSearchHandler,
  inputSchema: TOOL_SEARCH_INPUT_JSON_SCHEMA,
  outputSchema: TOOL_SEARCH_OUTPUT_JSON_SCHEMA,
  permission: {
    permission: "toolSearch",
    reason: "ToolSearch only reports tool metadata and activates declarations",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 16_384,
    maxModelBytes: 16_384,
    strategy: "truncate" as const,
    preview: {
      maxBytes: 16_384,
      direction: "head" as const,
    },
  },
  timeout: {
    defaultMs: 10_000,
    maxMs: 10_000,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "ToolSearch was cancelled before returning results",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
