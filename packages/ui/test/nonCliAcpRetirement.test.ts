import assert from "node:assert/strict";
import test from "node:test";
import {
  appSettingsSchema,
  appSettingsPatchSchema,
} from "../../shared/src/validationAppSettings.js";
import { zcodeTaskMetaSchema } from "../../shared/src/validation.js";
import { readAskUserQuestionAnswers } from "../src/lib/askUserQuestion.js";
import {
  getAgentPrimaryText,
  getAgentKindLabel,
} from "../src/ToolCallBlocks/renderers/agentHelpers.js";
import { getToolCallErrorText } from "../src/lib/toolError.js";
import { resolveToolCallIdentity } from "../src/lib/toolIdentity.js";
import { extractStructuredDiff } from "../src/lib/toolDiffPreview.js";

/**
 * 三方 CLI Agent（Claude/Codex/Gemini/Opencode ACP）退役契约的**社区版语义钉**。
 *
 * 退役的权威形态 = 读取时收敛而非拒收：运行时可用 provider 只剩 glm
 * （ZCODE_ENABLED_AGENT_PROVIDERS），但历史 session/settings 里残留的三方身份在解析时
 * 统一归一为 glm —— 拒收会让退役前的旧会话文件直接不可读。官方 3.15.1 的
 * legacyZCodeProviderSchema（shared/zcode-agent-policy.ts）与官方自测
 * （shared/test/zcodeTaskMetaSchema.test.ts 以 provider:"codex" 输入为正向用例）同钉此语义；
 * 兼容解析通道（Claude 文本 output、raw.nickname、legacy raw 状态覆盖）为官方实现保留，
 * 仅影响退役前旧快照的渲染，运行时已无法再产生新的三方数据。
 */

const meta = {
  taskId: "session-example",
  traceId: "trace-example",
  title: "Example",
  workspacePath: "/example/workspace",
  createdAt: 1,
  updatedAt: 2,
  mode: "build",
  provider: "glm",
};

test("已退役三方 provider 的历史值在读取时归一为 glm（旧会话文件保持可读）", () => {
  assert.equal(zcodeTaskMetaSchema.parse(meta).provider, "glm");
  for (const provider of ["claude", "codex", "gemini", "opencode"]) {
    const parsed = zcodeTaskMetaSchema.safeParse({ ...meta, provider });
    assert.equal(parsed.success, true, provider);
    assert.equal(parsed.success ? parsed.data.provider : undefined, "glm", provider);
  }
});

test("已退役的三方 CLI provider 设置项读取时归一为 ZCode Agent，不丢当前用户偏好", () => {
  const settings = {
    enabledBuiltinAgentCliProviders: ["claude", "codex"],
    localePreference: "en-US",
  };
  for (const schema of [appSettingsSchema, appSettingsPatchSchema]) {
    const parsed = schema.parse(settings);
    assert.equal(parsed.localePreference, "en-US");
    assert.deepEqual(parsed.enabledBuiltinAgentCliProviders, ["glm"]);
  }
});

test("结构化问题结果可读；Claude ACP 文本形态按旧快照兼容解析", () => {
  const input = { question: "Choose", options: [{ label: "One" }, { label: "Two" }] };
  assert.deepEqual(
    readAskUserQuestionAnswers({ input, output: { type: "answered", selected: "One" } }),
    { Choose: "One" },
  );
  assert.deepEqual(
    readAskUserQuestionAnswers({ input, output: { type: "answered_custom", text: "Custom" } }),
    { Choose: "Custom" },
  );
  assert.deepEqual(readAskUserQuestionAnswers({ output: { answers: { Choose: "Two" } } }), {
    Choose: "Two",
  });
  for (const output of ['"Choose"="One"', { content: [{ text: '"Choose"="One"' }] }]) {
    assert.deepEqual(readAskUserQuestionAnswers({ input, output }), { Choose: "One" });
    assert.deepEqual(readAskUserQuestionAnswers({ input, raw: { output } }), { Choose: "One" });
    assert.deepEqual(readAskUserQuestionAnswers({ input, raw: { rawOutput: output } }), {
      Choose: "One",
    });
  }
});

test("Agent 工具行展示 raw.nickname 优先（官方渲染契约），identity 家族判定保持", () => {
  const tool = {
    id: "tool-example",
    kind: "Agent",
    title: "Agent",
    status: "completed" as const,
    input: { subagent_type: "researcher", description: "Inspect sources" },
    raw: { nickname: "retired nickname" },
  };
  assert.equal(getAgentPrimaryText(tool, "Agent"), "retired nickname");
  assert.equal(getAgentKindLabel(tool, "Agent"), "retired nickname");
  assert.equal(resolveToolCallIdentity({ toolName: "Task" }).family, "agent");
  assert.equal(resolveToolCallIdentity({ kind: "spawn_agent" }).family, "agent");
});

test("工具错误文本保留 legacy raw 覆盖通道（官方契约）", () => {
  assert.equal(
    getToolCallErrorText({ status: "failed", error: "Permission denied" }),
    "Permission denied",
  );
  assert.equal(
    getToolCallErrorText({
      status: "failed",
      output: "<tool_use_error>Invalid input</tool_use_error>",
    }),
    "Invalid input",
  );
  assert.equal(
    getToolCallErrorText({
      status: "completed",
      raw: { status: "failed", rawOutput: "legacy error" },
    }),
    "legacy error",
  );
});

test("generic structured diffs still accept current tool content", () => {
  const diff = { type: "diff", path: "/example/file.ts", oldText: "before", newText: "after" };
  assert.deepEqual(extractStructuredDiff({ content: [diff] }), {
    path: diff.path,
    oldText: diff.oldText,
    newText: diff.newText,
  });
});
