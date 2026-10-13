import assert from "node:assert/strict";
import test from "node:test";
import { actorsWithTranscriptSession } from "../src/zcode-protocol-v4/workflow-runs-actor-session.js";
import type { WorkflowRunActor } from "@zcode/shared/zcode-protocol-v4";

/**
 * X2「工作流恢复/修改后任务状态显示错误」的回归网（actor sessionId 语义，3.15.1）。
 *
 * 3.14.3 的 actor.sessionId 是 run service 铸造时一次性写死的本 run 会话；3.15.1 改为
 * 「转录此刻在哪条会话」：缓存命中的结算带 sourceSessionId（读自前驱），第一次 live 派发
 * 后回本 run 会话。错读的表现是修订/恢复后转录面板指向一条不存在的会话，只剩 error + retry。
 * 上游无 shared 测试；此处钉住三种迁移与两条不动情形。
 *
 * 运行：cd packages/shared && node --import tsx --test test/workflowActorSession.test.ts
 */

const actors: WorkflowRunActor[] = [
  { siteId: "s1", ordinal: 0, status: "waiting", sessionId: "run-session" },
  { siteId: "s1", ordinal: 1, status: "running", sessionId: "run-session-2" },
];

test("没有 actor ref 的事件（world-read 等）一律不动", () => {
  assert.strictEqual(actorsWithTranscriptSession(actors, "world-read", {}, null, "other"), actors);
});

test("缓存命中的结算把 sessionId 指向前驱会话（sourceSessionId 优先）", () => {
  const next = actorsWithTranscriptSession(
    actors,
    "node-settled",
    { cached: true, sourceSessionId: "pred-session" },
    { siteId: "s1", ordinal: 0 },
    "run-session",
  );
  assert.equal(next[0]?.sessionId, "pred-session");
  // 没动的那条保持引用相等。
  assert.strictEqual(next[1], actors[1]);
});

test("缓存命中但无 sourceSessionId 时回退到信封会话", () => {
  const next = actorsWithTranscriptSession(
    actors,
    "node-settled",
    { cached: true },
    { siteId: "s1", ordinal: 0 },
    "run-session",
  );
  assert.equal(next[0]?.sessionId, "run-session");
});

test("live 派发把 sessionId 换回本 run 会话", () => {
  const next = actorsWithTranscriptSession(
    actors,
    "node-dispatched",
    {},
    { siteId: "s1", ordinal: 0 },
    "run-session",
  );
  assert.equal(next[0]?.sessionId, "run-session");
});

test("sessionId 未变时保持引用（键级增量按引用判变）", () => {
  const next = actorsWithTranscriptSession(
    actors,
    "node-dispatched",
    {},
    { siteId: "s1", ordinal: 1 },
    "run-session-2",
  );
  assert.strictEqual(next[1], actors[1]);
});

test("不在表上的子代理：不新增条目", () => {
  const next = actorsWithTranscriptSession(
    actors,
    "node-dispatched",
    {},
    { siteId: "s2", ordinal: 9 },
    "run-session",
  );
  assert.equal(next.length, 2);
});
