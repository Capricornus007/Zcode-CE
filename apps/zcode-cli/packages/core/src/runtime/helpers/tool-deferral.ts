import type { ModelToolContract } from "@zcode/contracts";
import type { AgentRuntimeInternal } from "../internal.js";
import { TOOL_SEARCH_NAME } from "@zcode/contracts";

/**
 * 工具暴露分级与延迟发现（吸收 earendil-works/pi tool_search + exposure 设计，
 * packages/coding-agent/src/extensions/tool-search/tool.ts）。
 *
 * 问题：MCP 插件装多后，工具描述本身就是几万 token 的固定上下文开销，而单个会话
 * 实际只用其中少数几个。pi 的解法是把超额工具降级为 deferred——不声明给模型，
 * 由模型按需调 ToolSearch（BM25）发现并激活。
 *
 * ZCode 化的取舍：
 * - 预算内（默认 48）全量直declare；超出时从 MCP 工具（metadata.mcpPresentation 在场）
 *   尾部开始降级，内置工具永不降级（它们是产品契约面）。
 * - ToolSearch 命中即激活（pi 同语义）：激活的工具恢复声明，会话内持续有效。
 * - 激活集在 runtime 内存中，会话重启后模型需重新搜索（pi 持久化到 session，
 *   v1 不做——记为已知差异）。
 */

export const TOOL_DECLARATION_BUDGET_DEFAULT = 48;
/** ToolSearch 默认激活条数上限（每次调用把前 N 个命中激活为可声明）。 */
export const TOOL_SEARCH_ACTIVATE_LIMIT_DEFAULT = 4;
export const TOOL_SEARCH_ACTIVATE_LIMIT_MAX = 16;

export interface ToolDeferralPlan {
  /** 预算内应声明给模型的契约（不含 ToolSearch）。 */
  declared: ModelToolContract[];
  /** 被降级、不声明的契约（仍注册、可执行、可被 ToolSearch 发现）。 */
  deferred: ModelToolContract[];
  /** 预算是否被触发（触发时调用方需把 ToolSearch 追加进声明）。 */
  active: boolean;
}

export function resolveToolDeclarationBudget(runtime: Pick<AgentRuntimeInternal, "config">): number {
  const fromConfig = runtime.config.runtimeFeatures?.toolDeclarationBudget;
  if (typeof fromConfig === "number" && Number.isFinite(fromConfig) && fromConfig >= 2) {
    return Math.floor(fromConfig);
  }
  const fromEnv = Number(process.env.ZCODE_TOOL_DECLARATION_BUDGET);
  if (Number.isFinite(fromEnv) && fromEnv >= 2) return Math.floor(fromEnv);
  return TOOL_DECLARATION_BUDGET_DEFAULT;
}

/**
 * 计算暴露计划。deferred 判定只依赖当前可见契约 + 激活集；budget 不足时只降级
 * MCP 工具（内置工具是产品契约面，永不降级），MPC 数量不足时宁可超预算也不动内置。
 */
export function resolveToolDeferralPlan(
  runtime: Pick<AgentRuntimeInternal, "config" | "registry" | "activatedDeferredToolNames">,
  contracts: readonly ModelToolContract[],
): ToolDeferralPlan {
  const toolSearch = contracts.find((contract) => contract.name === TOOL_SEARCH_NAME);
  const candidates = contracts.filter((contract) => contract.name !== TOOL_SEARCH_NAME);
  if (!toolSearch) {
    // 没有 ToolSearch 时降级等于永久不可达——绝不降级。
    return { declared: [...candidates], deferred: [], active: false };
  }
  const budget = resolveToolDeclarationBudget(runtime);
  if (candidates.length <= budget) {
    return { declared: [...candidates], deferred: [], active: false };
  }
  const activated = runtime.activatedDeferredToolNames;
  const overflow = candidates.length - budget;
  const mcpCandidates = candidates.filter(
    (contract) =>
      !activated.has(contract.name) && runtime.registry.get(contract.name)?.metadata.mcpPresentation,
  );
  if (mcpCandidates.length === 0) {
    return { declared: [...candidates], deferred: [], active: false };
  }
  const deferredNames = new Set(mcpCandidates.slice(-overflow).map((contract) => contract.name));
  return {
    declared: candidates.filter((contract) => !deferredNames.has(contract.name)),
    deferred: candidates.filter((contract) => deferredNames.has(contract.name)),
    active: true,
  };
}

// -----------------------------------------------
// BM25 检索（pi 用同款排序；k1/b 取标准值）
// -----------------------------------------------

const BM25_K1 = 1.5;
const BM25_B = 0.75;

function tokenizeToolText(text: string): string[] {
  // 驼峰/下划线拆词 + 小写化：MCP 工具名常是 snake_case 或 camelCase，
  // 描述是自然语言；两侧统一成词袋才能对上。
  return (text.match(/[A-Za-z][A-Za-z0-9]*|[\u4e00-\u9fff]/gu) ?? [])
    .map((token) => token.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase())
    .flatMap((token) => token.split(" "))
    .filter((token) => token.length > 0);
}

export interface ToolSearchHit {
  name: string;
  description: string;
  score: number;
}

/**
 * 对延迟工具做 BM25 检索。语料 = 工具名 + 描述；查询与文档用同一分词器。
 */
export function searchDeferredTools(
  deferred: readonly { name: string; description?: string }[],
  query: string,
  limit: number,
): ToolSearchHit[] {
  const queryTokens = tokenizeToolText(query);
  if (queryTokens.length === 0 || deferred.length === 0) return [];

  const docs = deferred.map((tool) => {
    const tokens = tokenizeToolText(`${tool.name} ${tool.description ?? ""}`);
    const termFreq = new Map<string, number>();
    for (const token of tokens) termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
    return { tool, termFreq, length: tokens.length };
  });
  const totalLength = docs.reduce((sum, doc) => sum + doc.length, 0) || 1;
  const averageLength = totalLength / docs.length;
  const documentFreq = new Map<string, number>();
  for (const token of new Set(queryTokens)) {
    let count = 0;
    for (const doc of docs) if (doc.termFreq.has(token)) count += 1;
    documentFreq.set(token, count);
  }

  const hits: ToolSearchHit[] = [];
  for (const doc of docs) {
    let score = 0;
    for (const token of queryTokens) {
      const freq = doc.termFreq.get(token);
      if (!freq) continue;
      const df = documentFreq.get(token) ?? 0;
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      score +=
        (idf * freq * (BM25_K1 + 1)) /
        (freq + BM25_K1 * (1 - BM25_B + (BM25_B * doc.length) / averageLength));
    }
    if (score > 0) {
      hits.push({ name: doc.tool.name, description: doc.tool.description ?? "", score });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, Math.max(1, limit));
}

// -----------------------------------------------
// Runtime 侧：检索并激活
// -----------------------------------------------

export interface ToolSearchActivationOutcome {
  results: ToolSearchHit[];
  activated: string[];
}

/**
 * ToolSearch 的执行体：检索当前 deferred 集，并把前 N 个命中激活（恢复声明）。
 * 只激活当前确实处于 deferred 状态的工具；已激活/内置/不存在的名字静默忽略。
 */
export function searchAndActivateDeferredTools(
  runtime: Pick<
    AgentRuntimeInternal,
    "config" | "registry" | "activatedDeferredToolNames" | "cachedTools" | "logger"
  >,
  query: string,
  limit?: number,
): ToolSearchActivationOutcome {
  const baseContracts = runtime.cachedTools ?? [];
  const plan = resolveToolDeferralPlan(runtime, baseContracts);
  if (!plan.active) {
    return { results: [], activated: [] };
  }
  const boundedLimit = Math.min(
    Math.max(1, Math.floor(limit ?? TOOL_SEARCH_ACTIVATE_LIMIT_DEFAULT)),
    TOOL_SEARCH_ACTIVATE_LIMIT_MAX,
  );
  const results = searchDeferredTools(plan.deferred, query, boundedLimit);
  const activated: string[] = [];
  for (const hit of results) {
    if (runtime.activatedDeferredToolNames.has(hit.name)) continue;
    runtime.activatedDeferredToolNames.add(hit.name);
    activated.push(hit.name);
  }
  if (activated.length > 0) {
    // 激活集只影响 getTools 内的"全量→声明面"拆分，该拆分按调用即时计算，
    // cachedTools 全量基线不受影响，因此无需失效缓存。
    runtime.logger?.info?.("Deferred tools activated by ToolSearch", {
      activated,
      event: "tools.deferred.activated",
      module: "core.runtime",
      query,
      status: "completed",
    });
  }
  return { results, activated };
}
