import assert from "node:assert/strict";
import { join } from "node:path";
import test, { beforeEach } from "node:test";

import type { FileSystemPort } from "@zcode/contracts";
import {
  kbCardsRootDir,
  kbIndexPath,
  loadKbCorpus,
  readKbCorpusDescriptor,
  resetKbCorpusCacheForTesting,
} from "../src/memory/recall/kb-corpus.js";

/**
 * 140 §P0-1 / §P1-3：语料自述 + 落盘索引 + 超护栏告警 + 永不静默截断。
 *
 * 运行：cd apps/zcode-cli/packages/core && node --import tsx --test test/kb-corpus.test.ts
 */

const WORKSPACE = join(process.cwd(), ".tmp-kb-corpus-fixture");
const ROOT = kbCardsRootDir(WORKSPACE);
const DESCRIPTOR_PATH = join(ROOT, ".corpus.json");
const INDEX_PATH = kbIndexPath(ROOT);

beforeEach(() => {
  resetKbCorpusCacheForTesting();
});

interface FakeOptions {
  cards?: Record<string, string>;
  descriptor?: unknown;
  index?: unknown;
  descriptorRaw?: string;
}

function makeFs(options: FakeOptions = {}) {
  const cards = options.cards ?? {};
  const written = new Map<string, string>();
  const descriptorContent =
    options.descriptorRaw ??
    (options.descriptor === undefined ? undefined : JSON.stringify(options.descriptor));
  const indexContent = options.index === undefined ? undefined : JSON.stringify(options.index);

  const fs = {
    written,
    async listDirectory({ path }: { path: string }) {
      if (path !== ROOT) throw new Error(`ENOENT: ${path}`);
      const names = Object.keys(cards);
      return {
        path,
        durationMs: 0,
        numEntries: names.length,
        entries: names.map((name) => ({ kind: "file" as const, name, path: join(ROOT, name) })),
      };
    },
    async stat({ path }: { path: string }) {
      if (path === DESCRIPTOR_PATH && descriptorContent !== undefined) {
        return { path, kind: "file" as const, sizeBytes: descriptorContent.length, mtimeMs: 10 };
      }
      const name = path.slice(ROOT.length + 1);
      const content = cards[name];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return { path, kind: "file" as const, sizeBytes: content.length, mtimeMs: 1 };
    },
    async readTextFile({ path }: { path: string }) {
      if (path === DESCRIPTOR_PATH && descriptorContent !== undefined) {
        return textResult(path, descriptorContent);
      }
      if (path === INDEX_PATH) {
        const writtenIndex = written.get(path);
        if (writtenIndex !== undefined) return textResult(path, writtenIndex);
        if (indexContent !== undefined) return textResult(path, indexContent);
      }
      const name = path.slice(ROOT.length + 1);
      const content = cards[name];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return textResult(path, content);
    },
    async readTextFileRange({ path }: { path: string }) {
      const name = path.slice(ROOT.length + 1);
      const content = cards[name];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return {
        ...textResult(path, content),
        startLine: 1,
        lineCount: 1,
        totalLines: 1,
      };
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      written.set(path, content);
      return { path, bytesWritten: content.length };
    },
  };
  return fs as unknown as FileSystemPort & { written: Map<string, string> };
}

function textResult(path: string, content: string) {
  return {
    path,
    content,
    encoding: "utf8" as const,
    bytesRead: content.length,
    sizeBytes: content.length,
    truncated: false,
  };
}

function card(description: string): string {
  return `---\ndescription: ${description}\n---\n正文\n`;
}

function writeIndexFile(written: Map<string, string>): Record<string, unknown> {
  const raw = written.get(INDEX_PATH);
  assert.ok(raw, "索引应已落盘");
  return JSON.parse(raw) as Record<string, unknown>;
}

test("无自述文件：不写索引，全量扫描且不按 24,000 截断", async () => {
  const cards: Record<string, string> = {};
  for (let i = 0; i < 250; i += 1) {
    cards[`kb-test-${String(i).padStart(3, "0")}.md`] = card(`源文件.md#第${i}节 —— 摘要${i}`);
  }
  const fs = makeFs({ cards });
  const load = await loadKbCorpus({ fileSystem: fs, rootDir: ROOT });
  assert.equal(load.cardCount, 250);
  assert.equal(load.fromIndex, false);
  assert.equal(load.descriptor, null);
  assert.equal(load.warning, undefined, "未超过护栏不应告警");
  assert.equal(fs.written.size, 0, "没有版本锚点时不落索引");
});

test("自述 + 索引：第二次装载命中索引，语料版本变化后重建", async () => {
  const cards = {
    "kb-test-a.md": card("a.md#A —— 甲"),
    "kb-test-b.md": card("b.md#B —— 乙"),
  };
  const fs = makeFs({
    cards,
    descriptor: { version: 1, cardCount: 2, generatedAt: "2026-10-18T13:44:00+08:00" },
  });

  const first = await loadKbCorpus({ fileSystem: fs, rootDir: ROOT });
  assert.equal(first.fromIndex, false);
  assert.equal(first.cardCount, 2);
  const index = writeIndexFile(fs.written);
  assert.equal(index.cardCount, 2);

  const second = await loadKbCorpus({ fileSystem: fs, rootDir: ROOT });
  assert.equal(second.fromIndex, true, "同一语料版本应命中索引");

  const movedDescriptor = makeFs({
    cards,
    descriptor: { version: 1, cardCount: 2, generatedAt: "2026-10-19T00:00:00+08:00" },
    index: writeIndexFile(fs.written),
  });
  const third = await loadKbCorpus({ fileSystem: movedDescriptor, rootDir: ROOT });
  assert.equal(third.fromIndex, false, "语料版本变化必须重建索引");
});

test("语料超过护栏：返回显式告警且条目一张不少", async () => {
  const cards = {
    "kb-test-a.md": card("a.md#A —— 甲"),
    "kb-test-b.md": card("b.md#B —— 乙"),
    "kb-test-c.md": card("c.md#C —— 丙"),
  };
  const fs = makeFs({
    cards,
    descriptor: { version: 1, cardCount: 3, totalGuard: 2, generatedAt: "v1" },
  });
  const load = await loadKbCorpus({ fileSystem: fs, rootDir: ROOT });
  assert.equal(load.cardCount, 3);
  assert.ok(load.warning?.includes("超过生成器护栏"), `应有告警，实际: ${load.warning}`);
});

test("护栏取自自述文件：可低于默认 27,000，超过即告警", async () => {
  // 27,001 张卡的全量扫描代价过高；这里用同一判据分支的显式护栏（cardCount > 2）
  // 验证「超过护栏必有告警，且告警不改变返回条目」。
  const fs = makeFs({
    cards: {
      "kb-test-a.md": card("a.md#A —— 甲"),
      "kb-test-b.md": card("b.md#B —— 乙"),
      "kb-test-c.md": card("c.md#C —— 丙"),
    },
    descriptor: { version: 1, cardCount: 3, totalGuard: 2, generatedAt: "v1" },
  });
  const load = await loadKbCorpus({ fileSystem: fs, rootDir: ROOT });
  assert.equal(load.cardCount, 3, "告警不改变返回条目");
  assert.ok(load.warning?.includes("超过生成器护栏"));
});

test("索引条目越界/损坏：整份索引作废并重建，不把外部路径喂给召回", async () => {
  const cards = { "kb-test-a.md": card("a.md#A —— 甲") };
  const poisoned = {
    version: 1,
    root: ROOT,
    corpusVersion: "1:2026-10-18T13:44:00+08:00:10",
    cardCount: 2,
    generatedAt: "x",
    entries: [
      { filename: "kb-test-a.md", filePath: join(ROOT, "kb-test-a.md"), mtimeMs: 1 },
      {
        filename: "kb-evil.md",
        filePath: join(WORKSPACE, "..", "..", "etc", "passwd"),
        mtimeMs: 1,
      },
    ],
  };
  const fs = makeFs({
    cards,
    descriptor: { version: 1, cardCount: 1, generatedAt: "2026-10-18T13:44:00+08:00" },
    index: poisoned,
  });
  const load = await loadKbCorpus({ fileSystem: fs, rootDir: ROOT });
  assert.equal(load.fromIndex, false, "越界条目必须让索引整体失效");
  assert.equal(load.cardCount, 1);
});

test("自述文件损坏：按无自述处理，读取返回 null", async () => {
  const fs = makeFs({
    cards: { "kb-test-a.md": card("a.md#A —— 甲") },
    descriptorRaw: "{not-json",
  });
  const descriptor = await readKbCorpusDescriptor(fs, ROOT);
  assert.equal(descriptor, null);
});
