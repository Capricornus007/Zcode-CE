/**
 * 启动预热目标上限(X12,移植上游 v3.15.1)。
 *
 * 钉住的契约:启动只预热 active workspace 一个。会话 CLI 没有 idle 回收,
 * 预热 3 个 = 每个窗口常驻 3 份 Agent 进程内存;recentProjects 保持 dormant,
 * 预热失败也不扫描补位。
 *
 * 运行:cd packages/desktop && node --import tsx --test test/startupWorkspaceWarmup.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  STARTUP_AGENT_WARMUP_LIMIT,
  resolveStartupAgentWarmupTargets,
} from "../src/main/startupWorkspace.js";

test("STARTUP_AGENT_WARMUP_LIMIT 收敛为 1(只预热 active workspace)", () => {
  assert.equal(STARTUP_AGENT_WARMUP_LIMIT, 1);
});

test("多工作区恢复时只返回 active workspace", () => {
  const targets = resolveStartupAgentWarmupTargets(
    {
      recentProjects: ["/projects/b", "/projects/c", "/projects/d"],
    },
    { workspacePath: "/projects/active" },
  );
  assert.deepEqual(
    targets.map((target) => target.workspacePath),
    ["/projects/active"],
  );
});

test("active workspace 路径退化(空串)时回落到最近项目,且仍只取 1 个", () => {
  // 上游语义:candidates 顺序 active → recent;空串 key 不可用被跳过,
  // 第一个可用 recent 接替;上限仍为 1。
  const targets = resolveStartupAgentWarmupTargets(
    { recentProjects: ["/projects/b", "/projects/c"] },
    { workspacePath: "" },
  );
  assert.deepEqual(
    targets.map((target) => target.workspacePath),
    ["/projects/b"],
  );
});

test("recentProjects 与 active 重复时按 identity key 去重", () => {
  const targets = resolveStartupAgentWarmupTargets(
    { recentProjects: ["/projects/active"] },
    { workspacePath: "/projects/active" },
  );
  assert.deepEqual(
    targets.map((target) => target.workspacePath),
    ["/projects/active"],
  );
});
