import assert from "node:assert/strict";
import test from "node:test";
import {
  reduceConcurrencyChanged,
  reduceRunStartedConcurrency,
} from "../src/zcode-protocol-v4/workflow-runs-concurrency.js";
import type { WorkflowRunState } from "@zcode/shared/zcode-protocol-v4";

/**
 * F6「运行中改并发」3.15.1 演进的回归网（默认并发 D / 两条界）。
 *
 * 上游 3.15.1 把工作流并发模型从「本机天花板」改为「默认并发 D」：
 *   - run-started 载荷带 concurrencyCeiling（= D，CLI 铸载荷时拼入）；
 *   - run 有两条界：ceiling（共享桶水位，可自动增长到 2D）与 limit（run 自己的界，
 *     amendWorkflowRunSettings 改的就是它）；
 *   - concurrency-changed 的 ceiling 计算优先取 run.concurrencyCeiling，只有老 CLI
 *     不发它时才退回 Math.max(previous, next) 推导。
 *
 * 上游没有 shared 测试（git ls-tree 命中 0）；这三条语义错读的表现是面板把用户调过的界
 * 显示成默认值、或把共享桶的涨落覆盖掉 run 自己的界——静默分叉。这里钉住从 3.14.3
 * 语义变过来的三处关键行为。
 *
 * 运行：cd packages/shared && node --import tsx --test test/workflowRunsConcurrencyV3151.test.ts
 */

function baseRun(overrides: Partial<WorkflowRunState> = {}): WorkflowRunState {
  return {
    runId: "run-1",
    status: "running",
    usage: { spentTokens: 0, nodesUsed: 0 },
    ...overrides,
  };
}

test("run-started 记录 concurrencyCeiling，且 limit 等于 D 时不挂自己的界", () => {
  const run = reduceRunStartedConcurrency(baseRun(), {
    caps: { maxConcurrency: 13 },
    concurrencyCeiling: 13,
  });
  assert.equal(run.concurrencyCeiling, 13);
  assert.equal(run.concurrency, undefined);
});

test("run-started 在 limit 不等于 D 时记 limit（高于或低于都记）", () => {
  const lowered = reduceRunStartedConcurrency(baseRun(), {
    caps: { maxConcurrency: 4 },
    concurrencyCeiling: 13,
  });
  assert.equal(lowered.concurrency?.limit, 4);
  assert.equal(lowered.concurrency?.ceiling, 13);

  const raised = reduceRunStartedConcurrency(baseRun(), {
    caps: { maxConcurrency: 20 },
    concurrencyCeiling: 13,
  });
  assert.equal(raised.concurrency?.limit, 20);
});

test("concurrency-changed 优先取 run.concurrencyCeiling，而非 previous/next 水位", () => {
  const run = reduceRunStartedConcurrency(
    baseRun({ concurrency: { cap: 5, ceiling: 6, limit: 2 } }),
    {
      caps: { maxConcurrency: 2 },
      concurrencyCeiling: 13,
    },
  );
  const changed = reduceConcurrencyChanged(run, { previous: 6, next: 26 });
  // 若按旧的 Math.max 推导会得 26；3.15.1 一律取 run-started 记下的 D = 13。
  assert.equal(changed.concurrency?.ceiling, 13);
  assert.equal(changed.concurrency?.cap, 26);
  assert.equal(changed.concurrency?.limit, 2);
});

test("concurrency-changed 在老 CLI 不发 concurrencyCeiling 时退回水位推导", () => {
  const changed = reduceConcurrencyChanged(baseRun(), { previous: 6, next: 8 });
  assert.equal(changed.concurrency?.ceiling, 8);
  assert.equal(changed.concurrency?.cap, 8);
});

test("run-started 的 D 不覆盖共享桶已学到的 cap（resume 的重臂）", () => {
  const run = baseRun({ concurrency: { cap: 3, ceiling: 3 } });
  const next = reduceRunStartedConcurrency(run, {
    caps: { maxConcurrency: 13 },
    concurrencyCeiling: 13,
  });
  // 旧 cap = 3（被限流压低）必须保留，不能被 D = 13 抬回假值。
  assert.equal(next.concurrency?.cap, 3);
  assert.equal(next.concurrencyCeiling, 13);
});
