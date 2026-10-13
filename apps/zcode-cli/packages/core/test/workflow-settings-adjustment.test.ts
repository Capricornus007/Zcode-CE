import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWorkflowSettingsAdjustment,
  type ModelCatalogEntry,
  type ModelCatalogPort,
  type DynamicWorkflowRunPort,
} from "@zcode/contracts";
import {
  applyWorkflowSettingsAdjustments,
  describeWorkflowRunSettings,
  readAppliedWorkflowSettings,
  withWorkflowAdjustableSettings,
} from "../src/tool/handlers/workflow-settings-adjustment.js";
import { AmendWorkflowInputSchema, CreateWorkflowInputSchema } from "@zcode/contracts";

/**
 * F6（171）：确认窗调参链路的纯函数判定（B1-B7）。
 *
 * 上游为 vitest；CE 移植为 node:test + assert/strict，直接断言
 * applyWorkflowSettingsAdjustments / withWorkflowAdjustableSettings / 文案三函数。
 * executor 侧的接线（permission-flow 的调整透传、call-runner 的 inputAdjustments）
 * 由既有 dangerousCommandPolicy / 子代理覆盖测试间接回归，不在此 mock 整条执行器。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/workflow-settings-adjustment.test.ts
 */

const MODEL: ModelCatalogEntry = {
  providerId: "zai-org",
  modelId: "main/sub",
  reasoningLevels: [],
  current: true,
};

function catalog(): ModelCatalogPort {
  return { listModels: () => [MODEL] } as unknown as ModelCatalogPort;
}

function runPort(defaultConcurrency?: number): DynamicWorkflowRunPort {
  return {
    defaultConcurrency: defaultConcurrency === undefined ? undefined : () => defaultConcurrency,
  } as unknown as DynamicWorkflowRunPort;
}

function context(options?: {
  catalog?: ModelCatalogPort;
  defaultConcurrency?: number;
}) {
  // 显式传 undefined（宿主无目录）与不传（默认有目录）必须区分：
  // 无目录时调整模型应失败，而不是退回默认目录。
  const hasCatalog = options === undefined || !("catalog" in options);
  return {
    dynamicWorkflowRunPort: runPort(options?.defaultConcurrency),
    modelCatalogPort: hasCatalog ? catalog() : options?.catalog,
  };
}

function apply(
  input: unknown,
  adjustments: Record<string, unknown>,
  options: { catalog?: ModelCatalogPort; defaultConcurrency?: number } = {},
) {
  return applyWorkflowSettingsAdjustments(input, adjustments, context(options), {
    errorCode: 400,
    schema: CreateWorkflowInputSchema,
  });
}

test("B1 窗里改 subagent_model 为合法规范串：入参落规范形，applied 记录，文案说出来", () => {
  const outcome = apply(
    { script: "export default {}", subagent_model: "old" },
    { subagent_model: "zai-org/main/sub" },
  );
  assert.deepEqual(outcome, {
    result: true,
    input: { script: "export default {}", subagent_model: "zai-org/main/sub" },
    applied: { subagent_model: "zai-org/main/sub" },
  });
  const sentence = describeWorkflowRunSettings({
    applied: readAppliedWorkflowSettings((outcome as { applied?: Record<string, unknown> }).applied),
    defaultConcurrency: undefined,
    describeLimit: () => "limit",
    describeModel: () => "model",
  });
  assert.ok(sentence.includes("subagents run on zai-org/main/sub"), sentence);
});

test("B2 窗里选的模型已被删：整次失败，什么都不启动", () => {
  const outcome = apply(
    { script: "export default {}", subagent_model: "old" },
    { subagent_model: "zai-org/gone/model" },
  );
  assert.equal(outcome.result, false);
  if (!outcome.result) {
    assert.equal(outcome.errorCode, 400);
    assert.ok(outcome.message.startsWith("workflow_subagent_model_unresolved"), outcome.message);
    assert.ok(outcome.message.includes("Nothing was started"), outcome.message);
  }
});

test("B3 窗里改 max_concurrency=3：入参 3，文案 at most 3 subagents run at once", () => {
  const outcome = apply({ script: "export default {}", max_concurrency: 5 }, { max_concurrency: 3 });
  assert.deepEqual(outcome, {
    result: true,
    input: { script: "export default {}", max_concurrency: 3 },
    applied: { max_concurrency: 3 },
  });
  const sentence = describeWorkflowRunSettings({
    applied: { max_concurrency: 3 },
    defaultConcurrency: 4,
    describeLimit: () => "limit",
    describeModel: () => "model",
  });
  assert.ok(sentence.includes("at most 3 subagents run at once"), sentence);
  assert.ok(sentence.includes("the default is 4"), sentence);
});

test("B4 窗里把 max_concurrency 设为 null：键删除，文案 back to the default", () => {
  const outcome = apply({ script: "export default {}", max_concurrency: 5 }, { max_concurrency: null });
  assert.deepEqual(outcome, {
    result: true,
    input: { script: "export default {}" },
    applied: { max_concurrency: null },
  });
  const sentence = describeWorkflowRunSettings({
    applied: { max_concurrency: null },
    defaultConcurrency: undefined,
    describeLimit: () => "limit",
    describeModel: () => "model",
  });
  assert.ok(sentence.includes("back to the default"), sentence);
});

test("B5 调整后的入参不合法：workflow_settings_adjustment_invalid 整次失败", () => {
  // schema 要求 script 至少在场；这里用 mock schema 制造失败形状。
  const outcome = applyWorkflowSettingsAdjustments(
    { script: "export default {}" },
    { max_concurrency: 3 },
    context(),
    {
      errorCode: 400,
      schema: {
        safeParse: (value: unknown) => ({
          success: "script" in (value as Record<string, unknown>) ? false : true,
        }) as { success: boolean },
      },
    },
  );
  assert.equal(outcome.result, false);
  if (!outcome.result) {
    assert.ok(outcome.message.startsWith("workflow_settings_adjustment_invalid"), outcome.message);
  }
});

test("B6 伪造的 adjustable_settings 无效：回填无条件覆盖模型给的值", () => {
  const resolution = withWorkflowAdjustableSettings(
    {
      result: true,
      input: { script: "export default {}", adjustable_settings: { forged: true } },
    },
    context({ defaultConcurrency: 4 }),
  );
  assert.deepEqual(resolution, {
    result: true,
    input: {
      script: "export default {}",
      adjustable_settings: { subagent_model: true, concurrency_ceiling: 4 },
    },
  });
});

test("B7 未改动（值与入参原值相同）：applied 为空，文案不说话", () => {
  const outcome = apply(
    { script: "export default {}", subagent_model: "zai-org/main/sub" },
    { subagent_model: "zai-org/main/sub" },
  );
  assert.deepEqual(outcome, {
    result: true,
    input: { script: "export default {}", subagent_model: "zai-org/main/sub" },
  });
  const sentence = describeWorkflowRunSettings({
    applied: readAppliedWorkflowSettings(undefined),
    defaultConcurrency: undefined,
    describeLimit: () => "limit",
    describeModel: () => "model",
  });
  assert.equal(sentence.includes("adjusted the settings"), false);
  assert.equal(sentence, "limitmodel");
});

test("宿主无目录时窗里改模型：失败而不是静默放行", () => {
  const outcome = apply(
    { script: "export default {}" },
    { subagent_model: "zai-org/main/sub" },
    { catalog: undefined },
  );
  assert.equal(outcome.result, false);
  if (!outcome.result) {
    assert.ok(outcome.message.includes("cannot choose a subagent model"), outcome.message);
  }
});

test("AmendWorkflow 的回填块只给会开窗的形状（有 script）", () => {
  const withScript = withWorkflowAdjustableSettings(
    { result: true, input: { script: "x", run_id: "r" } },
    context({ defaultConcurrency: 4 }),
    (resolved) => resolved.script !== undefined,
  );
  assert.deepEqual((withScript as { input: Record<string, unknown> }).input.adjustable_settings, {
    subagent_model: true,
    concurrency_ceiling: 4,
  });
  const withoutScript = withWorkflowAdjustableSettings(
    { result: true, input: { run_id: "r" } },
    context({ defaultConcurrency: 4 }),
    (resolved) => resolved.script !== undefined,
  );
  assert.equal(
    "adjustable_settings" in (withoutScript as { input: Record<string, unknown> }).input,
    false,
  );
  void AmendWorkflowInputSchema;
  void parseWorkflowSettingsAdjustment;
});
