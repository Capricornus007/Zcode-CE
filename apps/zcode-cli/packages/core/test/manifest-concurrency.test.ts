import assert from "node:assert/strict";
import test from "node:test";

import type { FileSystemPort } from "@zcode/contracts";
import { scanMemoryManifest } from "../src/memory/recall/manifest.js";

/**
 * 140 §P1-3 实测回归：24,778 张卡下旧实现用无界 Promise.allSettled 同时开
 * 五万级文件句柄，只有 8,189 条成功、其余 EMFILE 静默丢弃。清单读取必须有界并发。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/manifest-concurrency.test.ts
 */

const ROOT = "W:/proj/memory";
const FILE_COUNT = 120;

function makeFs(): { fs: FileSystemPort; maxInFlight: () => number } {
  let inFlight = 0;
  let maxInFlight = 0;
  const names = Array.from({ length: FILE_COUNT }, (_, index) => `card-${index}.md`);
  const content = "---\ndescription: 测试卡摘要\n---\n正文";

  const enter = () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
  };
  const leave = () => {
    inFlight -= 1;
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

  const fs = {
    async listDirectory({ path }: { path: string }) {
      return {
        path,
        durationMs: 0,
        numEntries: names.length,
        entries: names.map((name) => ({ kind: "file" as const, name, path: `${path}/${name}` })),
      };
    },
    async stat({ path }: { path: string }) {
      await tick();
      return { path, kind: "file" as const, sizeBytes: content.length, mtimeMs: 1 };
    },
    async readTextFileRange({ path }: { path: string }) {
      enter();
      try {
        await tick();
        return {
          path,
          content,
          encoding: "utf8" as const,
          bytesRead: content.length,
          sizeBytes: content.length,
          truncated: false,
          startLine: 1,
          lineCount: 1,
          totalLines: 1,
        };
      } finally {
        leave();
      }
    },
  } as unknown as FileSystemPort;
  return { fs, maxInFlight: () => maxInFlight };
}

test("清单读取有界并发：全部卡可见且并发不越界", async () => {
  const { fs, maxInFlight } = makeFs();
  const entries = await scanMemoryManifest({ fileSystem: fs, rootDir: ROOT, fileLimit: 1_000 });
  assert.equal(entries.length, FILE_COUNT, "有界并发不能丢掉任何卡");
  assert.ok(maxInFlight() <= 16, `并发应 ≤16，实际 ${maxInFlight()}`);
  assert.ok(maxInFlight() > 1, "应实际并发读取，而不是串行");
});

test("默认 200 条上限仍生效（memory 档保持原语义）", async () => {
  const { fs } = makeFs();
  const entries = await scanMemoryManifest({ fileSystem: fs, rootDir: ROOT });
  assert.equal(entries.length, 120, "120 < 200，全部返回");
});
