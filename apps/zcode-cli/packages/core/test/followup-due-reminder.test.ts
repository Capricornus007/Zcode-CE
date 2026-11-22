import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFollowupDueReminderBody,
  resetFollowupAttemptedForTesting,
} from "../src/runtime/methods/followup-due-reminder.js";
import type { FileSystemPort } from "@zcode/contracts";

/**
 * P5 预测回填闭环·读侧测试：到期过滤、坏条目诊断、每 runtime 一次、
 * 未登记静默、非法 JSON 提示修复。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/followup-due-reminder.test.ts
 */

// mock 键必须与被测模块同构地拼路径：源码用 node:path 的 join（分隔符随平台），
// 这里若硬编码 Windows 反斜杠键，在 Linux 上 join 产出的是 `/`，查找必 ENOENT。
// 键统一由 join(wd, ".zcode", "followups.json") 生成，断言本身与平台无关。
const WD = "W:\\proj";
const FOLLOWUPS_KEY = join(WD, ".zcode", "followups.json");

function fsWith(files: Record<string, string>): FileSystemPort {
  return {
    async readTextFile({ path }) {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return { path, content, encoding: "utf8", bytesRead: content.length, sizeBytes: content.length, truncated: false };
    },
  } as unknown as FileSystemPort;
}

const ENTRY = (over: Record<string, unknown>) =>
  JSON.stringify({ id: "f1", prediction: "2026年11月事业有变动", dueDate: "2026-10-06", verifyHint: "向用户核对", ...over });

test("到期过滤：已过期与 7 天内到期入选，远期不入选，按到期日排序", async () => {
  resetFollowupAttemptedForTesting();
  const body = await buildFollowupDueReminderBody({
    runtime: {},
    fileSystem: fsWith({
      [FOLLOWUPS_KEY]: `[${ENTRY({ id: "far", dueDate: "2099-01-01" })},${ENTRY({ id: "soon", dueDate: "2026-10-08" })},${ENTRY({ id: "expired", dueDate: "2026-09-01" })}]`,
    }),
    workingDirectory: WD,
  });
  assert.ok(body?.includes("expired"), "过期项应入选");
  assert.ok(body?.includes("soon"), "临期项应入选");
  assert.ok(!body?.includes("far"), "远期项不应入选");
  assert.ok(body!.indexOf("expired") < body!.indexOf("soon"), "按到期日升序");
  assert.ok(body?.includes("向用户核对"), "验证提示应带出");
});

test("坏条目：缺必需字段的跳过并计数提示；整个文件非法 JSON 提示修复", async () => {
  resetFollowupAttemptedForTesting();
  const body = await buildFollowupDueReminderBody({
    runtime: {},
    fileSystem: fsWith({
      [FOLLOWUPS_KEY]: `[${ENTRY({ id: "ok" })},{"prediction":"缺id和日期"},null]`,
    }),
    workingDirectory: WD,
  });
  assert.ok(body?.includes("2 条登记格式无效"), `应计数 2 条坏条目，实际: ${body}`);

  resetFollowupAttemptedForTesting();
  const broken = await buildFollowupDueReminderBody({
    runtime: {},
    fileSystem: fsWith({ [FOLLOWUPS_KEY]: "{not json" }),
    workingDirectory: WD,
  });
  assert.ok(broken?.includes("不是合法的登记数组"), "非法 JSON 应提示修复而非静默");
});

test("一次性：同 runtime 第二次调用返回 null；未登记静默返回 null", async () => {
  resetFollowupAttemptedForTesting();
  const files = { [FOLLOWUPS_KEY]: `[${ENTRY({})}]` };
  const runtime = {};
  const first = await buildFollowupDueReminderBody({ runtime, fileSystem: fsWith(files), workingDirectory: WD });
  assert.ok(first !== null);
  const second = await buildFollowupDueReminderBody({ runtime, fileSystem: fsWith(files), workingDirectory: WD });
  assert.equal(second, null, "同 runtime 只注入一次");

  resetFollowupAttemptedForTesting();
  const none = await buildFollowupDueReminderBody({
    runtime: {},
    fileSystem: fsWith({}),
    workingDirectory: WD,
  });
  assert.equal(none, null, "未登记是常态，静默");
});
