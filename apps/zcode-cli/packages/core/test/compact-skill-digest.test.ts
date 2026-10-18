import assert from "node:assert/strict";
import test from "node:test";

import { buildSkillDigestReminderEntries } from "../src/runtime/helpers/compact-post-reminders.js";

/**
 * 140 §P2-7：压缩后重注入技能 digest（标题 + 硬约束 + 命令），防长会话忘 SOP。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/compact-skill-digest.test.ts
 */

const SKILL_BODY = [
  '<skill_content name="qimen-duanpan">',
  "# Skill: qimen-duanpan",
  "# 奇门遁甲·十一体系占卜断盘技能",
  "## 标准断盘SOP（每次必走10步）",
  "### 第1步：定问题",
  "铁律：排盘必须用专用工具，禁止手算。",
  "正文细节：这是一段不该出现在 digest 里的说明文字。",
  "```bash",
  "cd F:/智能体/奇门遁甲 && python -X utf8 排盘.py 2026 10 18 13 --json",
  "```",
  "</skill_content>",
].join("\n");

function entriesWithSkill(
  input: {
    name?: string;
    isError?: boolean;
    content?: string;
  } = {},
): never[] {
  return [
    {
      kind: "message",
      message: {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call_1", name: "Skill", input: { skill: input.name ?? "qimen-duanpan" } },
        ],
      },
    },
    {
      kind: "message",
      message: {
        role: "tool",
        toolCallId: "call_1",
        isError: input.isError === true,
        content: input.content ?? SKILL_BODY,
      },
    },
  ] as never[];
}

test("压缩后注入技能 digest：保留标题、铁律与命令，不含全文", () => {
  const entries = buildSkillDigestReminderEntries(entriesWithSkill());
  assert.equal(entries.length, 1);
  const content = String((entries[0] as { content: unknown }).content);
  assert.match(content, /qimen-duanpan/);
  assert.match(content, /标准断盘SOP/);
  assert.match(content, /铁律：排盘必须用专用工具/);
  assert.match(content, /python -X utf8 排盘\.py/);
  assert.ok(!content.includes("正文细节"), "普通正文不应进入 digest");
});

test("技能加载失败（isError）不生成 digest", () => {
  assert.deepEqual(buildSkillDigestReminderEntries(entriesWithSkill({ isError: true })), []);
});

test("没有 Skill 调用时不注入", () => {
  assert.deepEqual(
    buildSkillDigestReminderEntries([
      { kind: "message", message: { role: "user", content: "你好" } },
    ] as never[]),
    [],
  );
});

test("完全不含硬约束的文件不编造 digest", () => {
  assert.deepEqual(
    buildSkillDigestReminderEntries(
      entriesWithSkill({ content: '<skill_content name="x">普通说明文字</skill_content>' }),
    ),
    [],
  );
});
