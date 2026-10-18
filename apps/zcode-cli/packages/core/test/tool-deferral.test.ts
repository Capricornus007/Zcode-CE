import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveToolDeferralPlan,
  searchDeferredTools,
  searchAndActivateDeferredTools,
  TOOL_SEARCH_ACTIVATE_LIMIT_DEFAULT,
} from "../src/runtime/helpers/tool-deferral.js";
import { getTools } from "../src/runtime/methods/config.js";
import { TOOL_SEARCH_TOOL_NAME } from "../src/tool/handlers/tool-search.js";

/**
 * 工具暴露分级 + BM25 延迟发现（吸收 earendil-works/pi tool_search）：
 * 声明面超预算时 MCP 工具尾部降级，模型经 ToolSearch 发现并激活。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/tool-deferral.test.ts
 */

function fakeRuntime(options: {
  contractNames: readonly string[];
  mcpNames: readonly string[];
  budget?: number;
  activated?: Set<string>;
}) {
  const cachedTools = options.contractNames.map((name) => ({
    name,
    description:
      name === "DatabaseQuery"
        ? "Run a SQL query against the connected postgres database"
        : name === "JiraSearch"
          ? "Search issues in the Jira tracker"
          : `${name} tool does things`,
    inputSchema: { type: "object" as const },
  }));
  const mcp = new Set(options.mcpNames);
  return {
    config: {
      ...(options.budget === undefined
        ? {}
        : { runtimeFeatures: { toolDeclarationBudget: options.budget } }),
    },
    registry: {
      get: (name: string) =>
        mcp.has(name)
          ? { metadata: { mcpPresentation: { serverName: "srv", toolName: name } } }
          : undefined,
    },
    activatedDeferredToolNames: options.activated ?? new Set<string>(),
    cachedTools,
    logger: { info() {}, warn() {} },
  };
}

function withToolSearch(names: readonly string[]): readonly string[] {
  return [...names, TOOL_SEARCH_TOOL_NAME];
}

test("预算内不降级：全部照常声明，ToolSearch 不单独出现", () => {
  const runtime = fakeRuntime({
    contractNames: withToolSearch(["Read", "Bash", "mcp__srv__a"]),
    mcpNames: ["mcp__srv__a"],
    budget: 48,
  });
  const plan = resolveToolDeferralPlan(
    runtime as never,
    runtime.cachedTools as never,
  );
  assert.equal(plan.active, false);
  assert.equal(plan.deferred.length, 0);
  assert.equal(plan.declared.length, 3);
});

test("超预算：只降级 MCP 工具尾部，内置永不降级，ToolSearch 被排除在候选外", () => {
  const mcpNames = ["mcp__srv__t0", "mcp__srv__t1", "mcp__srv__t2"];
  const runtime = fakeRuntime({
    contractNames: withToolSearch(["Read", "Bash", ...mcpNames]),
    mcpNames,
    budget: 4,
  });
  const plan = resolveToolDeferralPlan(runtime as never, runtime.cachedTools as never);
  assert.equal(plan.active, true);
  // 候选 = Read/Bash + 3 MCP = 5，预算 4 → 降级 1 个（最后一个 MCP）
  assert.equal(plan.deferred.length, 1);
  assert.equal(plan.deferred[0]!.name, "mcp__srv__t2", "从 MCP 尾部降级");
  assert.ok(
    plan.declared.every((tool) => tool.name !== "mcp__srv__t2"),
    "被降级工具不得出现在声明面",
  );
  assert.ok(
    plan.declared.some((tool) => tool.name === "Read") &&
      plan.declared.some((tool) => tool.name === "Bash"),
    "内置工具永不降级",
  );
  assert.ok(
    plan.declared.every((tool) => tool.name !== TOOL_SEARCH_TOOL_NAME),
    "ToolSearch 由调用方单独追加，不在候选内",
  );
});

test("激活集内的工具不再降级", () => {
  const mcpNames = ["mcp__srv__t0", "mcp__srv__t1", "mcp__srv__t2"];
  const runtime = fakeRuntime({
    contractNames: withToolSearch(["Read", ...mcpNames]),
    mcpNames,
    budget: 3,
    activated: new Set(["mcp__srv__t2"]),
  });
  // 候选 = Read + 3 MCP = 4，预算 3 → 降级 1 个；t2 已激活不参与降级 → 降 t1
  const plan = resolveToolDeferralPlan(runtime as never, runtime.cachedTools as never);
  assert.equal(plan.deferred.length, 1);
  assert.equal(plan.deferred[0]!.name, "mcp__srv__t1", "已激活的 t2 不参与降级");
  assert.ok(
    plan.declared.some((tool) => tool.name === "mcp__srv__t2"),
    "已激活工具必须声明",
  );
});

test("无 ToolSearch 契约时永不降级（降级等于永久不可达）", () => {
  const mcpNames = ["mcp__srv__t0", "mcp__srv__t1"];
  const runtime = fakeRuntime({
    contractNames: ["Read", ...mcpNames],
    mcpNames,
    budget: 2,
  });
  const plan = resolveToolDeferralPlan(runtime as never, runtime.cachedTools as never);
  assert.equal(plan.active, false);
  assert.equal(plan.deferred.length, 0);
});

test("BM25：相关工具排前，无关查询返回空，limit 生效", () => {
  const deferred = [
    { name: "mcp__srv__DatabaseQuery", description: "Run a SQL query against the database" },
    { name: "mcp__srv__JiraSearch", description: "Search issues in the Jira tracker" },
    { name: "mcp__srv__Weather", description: "Get the weather forecast" },
  ];
  const hits = searchDeferredTools(deferred, "database sql query", 10);
  assert.equal(hits[0]!.name, "mcp__srv__DatabaseQuery");
  assert.equal(hits.length, 1, "只有相关工具得分 > 0");

  const none = searchDeferredTools(deferred, "quantum chromodynamics", 10);
  assert.equal(none.length, 0, "无关词不得强行匹配");

  const limited = searchDeferredTools(
    [
      { name: "a_x_database", description: "database tools" },
      { name: "b_x_database", description: "more database tools" },
      { name: "c_x_database", description: "even more database tools" },
    ],
    "database",
    2,
  );
  assert.equal(limited.length, 2, "limit 截断生效");
});

test("searchAndActivate：激活前 N 个命中；重复搜索不重复激活；未触发时返回空", () => {
  const deferredNames = [
    "mcp__srv__DatabaseQuery",
    "mcp__srv__SqlExplain",
    "mcp__srv__SqlMigration",
    "mcp__srv__SqlBackup",
  ];
  const mcpNames = ["mcp__srv__JiraSearch", "mcp__srv__Weather", ...deferredNames];
  const activated = new Set<string>();
  // 候选 = Read + 6 MCP = 7，预算 3 → 降级最后 4 个 MCP（正是 deferredNames）
  const runtime = fakeRuntime({
    contractNames: withToolSearch(["Read", ...mcpNames]),
    mcpNames,
    budget: 3,
    activated,
  });
  const outcome = searchAndActivateDeferredTools(runtime as never, "sql database query");
  assert.equal(outcome.activated.length, TOOL_SEARCH_ACTIVATE_LIMIT_DEFAULT);
  assert.equal(activated.size, TOOL_SEARCH_ACTIVATE_LIMIT_DEFAULT, "激活集必须被写入");

  const again = searchAndActivateDeferredTools(runtime as never, "sql database query");
  assert.equal(again.activated.length, 0, "已激活的不得重复计入");

  const belowBudget = fakeRuntime({
    contractNames: withToolSearch(["Read", "mcp__srv__a"]),
    mcpNames: ["mcp__srv__a"],
    budget: 48,
  });
  const inactive = searchAndActivateDeferredTools(belowBudget as never, "anything");
  assert.equal(inactive.results.length, 0, "未触发预算时 ToolSearch 搜索必须返回空");
});

// -----------------------------------------------
// getTools 声明面组装（回归锚点：2026-10-18 GLM 会话「工具缺失」事故）
// -----------------------------------------------

function fakeRuntimeForGetTools(options: {
  contractNames: readonly string[];
  mcpNames: readonly string[];
  budget?: number;
}) {
  const runtime = fakeRuntime(options);
  return {
    ...runtime,
    // getTools 走预填缓存，不触发 registry.toContracts/filterRuntimeVisibleTools。
    cachedTools: runtime.cachedTools,
  };
}

test("getTools 预算内：ToolSearch 不得泄漏进声明面（GLM「工具缺失」事故回归锚点）", () => {
  // 事故形态：ToolSearch 无条件注册进 registry，getTools 在 !active 分支直接返回
  // filtered，把 ToolSearch 带进了 38 工具（≤48 预算）的声明面。模型看到 ToolSearch
  // 即推断其余工具藏在延迟池里，改用空搜而不是直接调用，整会话退化成纯聊天。
  const runtime = fakeRuntimeForGetTools({
    contractNames: withToolSearch(["Read", "Bash", "mcp__srv__a"]),
    mcpNames: ["mcp__srv__a"],
    budget: 48,
  });
  const declared = getTools.call(runtime as never);
  const names = declared.map((tool) => tool.name);
  assert.ok(!names.includes(TOOL_SEARCH_TOOL_NAME), "预算内 ToolSearch 不得声明");
  assert.equal(names.length, 3, "其余工具照常全量声明");
  assert.ok(names.includes("Bash") && names.includes("mcp__srv__a"));
});

test("getTools 超预算：ToolSearch 随降级一起声明，被降级工具不出现", () => {
  const mcpNames = ["mcp__srv__t0", "mcp__srv__t1", "mcp__srv__t2"];
  const runtime = fakeRuntimeForGetTools({
    contractNames: withToolSearch(["Read", "Bash", ...mcpNames]),
    mcpNames,
    budget: 4,
  });
  const declared = getTools.call(runtime as never);
  const names = declared.map((tool) => tool.name);
  assert.ok(names.includes(TOOL_SEARCH_TOOL_NAME), "降级触发时 ToolSearch 必须声明");
  assert.ok(!names.includes("mcp__srv__t2"), "被降级工具不得声明");
  assert.ok(names.includes("Bash"), "内置工具永不降级");
});

test("getTools 预算内且 ToolSearch 未注册：原样全量声明", () => {
  const runtime = fakeRuntimeForGetTools({
    contractNames: ["Read", "Bash"],
    mcpNames: [],
    budget: 48,
  });
  const declared = getTools.call(runtime as never);
  assert.deepEqual(
    declared.map((tool) => tool.name).sort(),
    ["Bash", "Read"],
  );
});
