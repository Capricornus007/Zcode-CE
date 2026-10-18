import assert from "node:assert/strict";
import test from "node:test";

import { formatTaskOutputModelContent } from "../src/tool/handlers/task-output.js";

/**
 * TaskOutput 等待体验改造（消除「正在获取任务输出像卡死」）：
 * - timeout 返回必须携带模型可操作的引导（再次调用续等 + 分段播报进度）；
 * - success 不得携带该引导。
 * 等待期心跳（每 15s ToolCallProgress.elapsedMs）属运行时行为，由开发模式实测。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/task-output-timeout-hint.test.ts
 */

const runningTask = {
  task_id: "t1",
  task_type: "bash",
  status: "running",
  description: "full test suite",
  output: "log line 1\nlog line 2",
};

test("timeout 返回携带续等与分段播报引导", () => {
  const content = formatTaskOutputModelContent({
    retrieval_status: "timeout",
    task: runningTask,
  });
  assert.ok(content.includes("<retrieval_status>timeout</retrieval_status>"));
  assert.ok(
    content.includes("<hint>Task is still running"),
    "timeout 必须提示任务仍在运行",
  );
  assert.ok(
    content.includes("Call TaskOutput again (block=true)"),
    "必须给出再次调用续等的可操作指令",
  );
  assert.ok(
    content.includes("narrate the latest output tail"),
    "必须建议段间播报进度（消除长等待的卡死观感）",
  );
});

test("success 不携带引导", () => {
  const content = formatTaskOutputModelContent({
    retrieval_status: "success",
    task: { ...runningTask, status: "completed", exitCode: 0, output: "done" },
  });
  assert.ok(!content.includes("<hint>"), "成功结果不得混入等待引导");
});
