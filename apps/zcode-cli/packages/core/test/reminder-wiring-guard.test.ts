import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * 遗忘对抗层接线护栏（回归事故钉子）。
 *
 * 事故：3.15.1 升级（git checkout official 整取 turn-loop.ts / source.ts）把
 * 五层 CE 遗忘对抗——kb 知识卡召回 / 口径裁决护栏 / 预测到期 / 任务再锚定 /
 * 用户指令热更新——的接线与 source 注册全部冲掉，实现文件与测试幸存但
 * turn-loop 零引用（死层），用户侧表现为「断卦技能忘这忘那」。
 *
 * 本护栏断言接线必须在场：任何未来整文件覆盖/重构删除这些调用点的改动
 * 会在测试阶段变红，而不是在用户的长会话里静默腐烂。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/reminder-wiring-guard.test.ts
 */

const coreSrc = join(fileURLToPath(new URL(".", import.meta.url)), "..", "src");

function readSrc(relative: string): string {
  return readFileSync(join(coreSrc, ...relative.split("/")), "utf8");
}

test("turn-loop 必须接线六层遗忘对抗", () => {
  const turnLoop = readSrc("runtime/methods/turn-loop.ts");
  for (const [name, marker] of [
    ["kb 知识卡召回", "buildKbRecallReminderBody({"],
    ["口径裁决护栏", "buildCaliberGuardReminderBody({"],
    ["预测到期注入", "buildFollowupDueReminderBody({"],
    ["任务再锚定", "buildTaskReanchorReminderBody(state.turnRequestState.entries)"],
    ["用户指令热更新", "buildUserInstructionsUpdateBody({"],
    // 记忆召回（CE 融合排序档）在 1b16b518 五层重植时被漏掉、2026-10-18 补植——
    // 官方 semantic-recall 分支关在 default-index 时这是唯一动态记忆召回链，必须钉住。
    ["记忆召回（CE 融合档）", "buildMemoryRecallReminderBody({"],
    ["记忆召回每轮一次性门", "memoryRecallAttempted"],
    ["kb 每轮一次性门", "kbRecallAttempted"],
  ] as const) {
    assert.ok(turnLoop.includes(marker), `turn-loop.ts 缺少 ${name} 的接线（${marker}）`);
  }
});

test("system-reminder source 注册必须完整", () => {
  const source = readSrc("system-reminder/source.ts");
  for (const sourceName of [
    "memory_recall",
    "kb_recall",
    "caliber_guard",
    "followup_due",
    "task_reanchor",
    "user_instructions_update",
  ] as const) {
    assert.ok(
      source.includes(`"${sourceName}"`),
      `source.ts 缺少 ${sourceName} 的注册（PER_REQUEST 集合与 descriptor 都要在场）`,
    );
    assert.ok(
      source.includes(`${sourceName}: descriptor(`),
      `source.ts 缺少 ${sourceName} 的 descriptor`,
    );
  }
});

test("reminder 实现文件本身在场（防止实现也被清掉后护栏空转）", () => {
  for (const file of [
    "runtime/methods/memory-recall-reminder.ts",
    "runtime/methods/kb-recall-reminder.ts",
    "runtime/methods/caliber-guard-reminder.ts",
    "runtime/methods/followup-due-reminder.ts",
    "runtime/methods/task-reanchor-reminder.ts",
    "runtime/methods/user-instructions-update-reminder.ts",
  ] as const) {
    const source = readSrc(file);
    assert.ok(source.includes("export async function") || source.includes("export function"),
      `${file} 缺少导出实现`);
  }
});
