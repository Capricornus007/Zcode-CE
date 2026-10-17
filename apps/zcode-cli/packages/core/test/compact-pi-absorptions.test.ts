import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompactFileListAnnex,
  buildCompactPrompt,
  buildCompactSummaryMessage,
  collectFilePathsFromCompactToolCalls,
  extractCompactFileListPaths,
  isPreviousCompactSummaryMessage,
  mergeCompactFileLists,
} from "../src/compact/prompt.js";
import { selectCompactEntries } from "../src/runtime/helpers/compact-selection.js";
import { CompactTrigger } from "@zcode/contracts";
import type { RuntimeMessageEntry } from "../src/agent/message-history.js";

/**
 * P0-2 压缩四细节（吸收 earendil-works/pi compaction）：
 * ① 上次摘要作为 <previous-summary> 权威基底做增量更新；
 * ② Read/Edit/Write 文件清单随摘要累积并跨压缩继承；
 * ③ 摘要 length 截断拒绝落盘（断言在 compact-active-helpers，见 runtime 集成）；
 * ④ 近端保留按 token 预算（keepRecentTokens），不再固定 1 轮。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/compact-pi-absorptions.test.ts
 */

function userEntry(text: string): RuntimeMessageEntry {
  return {
    kind: "message",
    message: { role: "user", content: text },
    metadata: { source: "real_user" },
  } as unknown as RuntimeMessageEntry;
}

function assistantEntry(text: string, toolCalls?: { name: string; input: unknown }[]) {
  return {
    kind: "message",
    message: { role: "assistant", content: text, toolCalls },
    metadata: { source: "shared_context" },
  } as unknown as RuntimeMessageEntry;
}

test("增量摘要：上次摘要消息可被识别，提示词注入 <previous-summary> 基底", () => {
  const summaryMessage = buildCompactSummaryMessage("旧摘要内容", { suppressFollowup: true });
  assert.equal(isPreviousCompactSummaryMessage(summaryMessage), true);
  assert.equal(isPreviousCompactSummaryMessage("普通用户消息"), false);

  const promptWith = buildCompactPrompt(undefined, { previousSummary: "旧摘要内容" });
  assert.ok(promptWith.includes("<previous-summary>"), "必须注入上一次摘要");
  assert.ok(promptWith.includes("authoritative baseline"), "必须声明权威基底语义");
  assert.ok(promptWith.includes("旧摘要内容"));
  // 无上次摘要时不得出现空块
  const promptWithout = buildCompactPrompt(undefined);
  assert.ok(!promptWithout.includes("<previous-summary>"));
});

test("文件清单：从 Read/Edit/Write 工具调用收集，Read 入 read、Edit/Write 入 modified", () => {
  const paths = collectFilePathsFromCompactToolCalls([
    { role: "assistant", toolCalls: [{ name: "Read", input: { file_path: "/a/src.ts" } }] },
    {
      role: "assistant",
      toolCalls: [
        { name: "Edit", input: { file_path: "/a/src.ts" } },
        { name: "Write", input: { file_path: "/b/new.ts" } },
        { name: "Bash", input: { command: "rm /c/x" } },
        { name: "Read", input: {} },
      ],
    },
    { role: "user", content: "忽略非 assistant 消息" },
  ]);
  assert.deepEqual(paths.read, ["/a/src.ts"]);
  assert.deepEqual(paths.modified, ["/a/src.ts", "/b/new.ts"], "同文件去重、Bash 不入清单");
});

test("文件清单：附件跨压缩继承——旧摘要里的块被解析并与新收集合并去重", () => {
  const oldAnnex = buildCompactFileListAnnex({
    read: ["/old/read.ts"],
    modified: ["/old/modified.ts"],
  });
  const parsed = extractCompactFileListPaths(`旧的摘要正文\n${oldAnnex}`);
  assert.deepEqual(parsed.read, ["/old/read.ts"]);

  const merged = mergeCompactFileLists(parsed, { read: ["/old/read.ts", "/new.ts"], modified: [] });
  const annex = buildCompactFileListAnnex(merged);
  assert.ok(annex.includes("/old/read.ts"));
  assert.ok(annex.includes("/new.ts"));
  assert.ok(annex.includes("<modified-files>"));
  assert.equal(annex.split("/old/read.ts").length - 1, 1, "合并必须去重");

  const empty = buildCompactFileListAnnex({ read: [], modified: [] });
  assert.equal(empty, "", "无文件时不得产出空块");
});

test("保留预算：小轮次可保留多轮（不再固定 1 轮），但总结侧保底 ≥2 轮", () => {
  const tinyRound = (i: number): RuntimeMessageEntry[] => [
    userEntry(`u${i} ${"x".repeat(100)}`),
    assistantEntry(`a${i}`),
  ];
  // 6 个小轮次（每轮约几十 token ≪ 20K 预算）
  const entries = Array.from({ length: 6 }, (_, i) => tinyRound(i)).flat();
  const selection = selectCompactEntries({ entries, trigger: CompactTrigger.Auto });
  // 预算内应保留多轮（>1），且总结侧剩 ≥2 轮
  assert.ok(
    selection.groupsPreserved > 1,
    `小轮次应在预算内保留多轮，实际 ${selection.groupsPreserved}`,
  );
  assert.equal(
    selection.totalGroups - selection.groupsPreserved,
    selection.entriesForSummary.length > 0 ? selection.totalGroups - selection.groupsPreserved : 0,
  );
  assert.ok(
    selection.totalGroups - selection.groupsPreserved >= 2,
    "总结侧必须保有 ≥2 轮，否则压缩会 skip",
  );
});

test("保留预算：单轮超预算仍整轮保留（轮是不可拆的合法切分单位）", () => {
  const hugeRound: RuntimeMessageEntry[] = [
    userEntry("大轮"),
    assistantEntry(`${"x".repeat(120_000)}`), // ~30K tokens ≫ 20K 预算
  ];
  const entries = [
    ...Array.from({ length: 3 }, (_, i) => tinyRoundOf(i)).flat(),
    ...hugeRound,
  ];
  function tinyRoundOf(i: number): RuntimeMessageEntry[] {
    return [userEntry(`u${i}`), assistantEntry(`a${i}`)];
  }
  const selection = selectCompactEntries({ entries, trigger: CompactTrigger.Auto });
  assert.ok(
    selection.groupsPreserved >= 1,
    "最新轮即使超预算也必须保留（结构上不可拆）",
  );
  assert.ok(
    selection.totalGroups - selection.groupsPreserved >= 2,
    "总结侧仍须 ≥2 轮",
  );
});
