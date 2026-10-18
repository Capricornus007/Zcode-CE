import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FileSystemPort, KbSearchInput, KbSearchOutput } from "@zcode/contracts";
import { createSessionId, createTraceId } from "@zcode/contracts";
import { kbCardsRootDir, kbIndexPath } from "../src/memory/recall/kb-corpus.js";
import { searchKbCorpus } from "../src/runtime/methods/kb-search.js";
import { kbSearchToolEntry } from "../src/tool/handlers/kb-search.js";
import { registerBuiltInTools } from "../src/tool/handlers/index.js";
import { createToolRegistry } from "../src/tool/registry.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

const WORKSPACE = join(process.cwd(), ".tmp-kb-search-fixture");
const ROOT = kbCardsRootDir(WORKSPACE);
const INDEX_PATH = kbIndexPath(ROOT);

function makeFs(files: Record<string, string>, descriptor?: Record<string, unknown>) {
  const descriptorPath = join(ROOT, ".corpus.json");
  const descriptorContent = descriptor === undefined ? undefined : JSON.stringify(descriptor);
  const written = new Map<string, string>();
  return {
    async listDirectory({ path }: { path: string }) {
      if (path !== ROOT) throw new Error(`ENOENT: ${path}`);
      const names = Object.keys(files);
      return {
        path,
        durationMs: 0,
        numEntries: names.length,
        entries: names.map((name) => ({ kind: "file" as const, name, path: join(ROOT, name) })),
      };
    },
    async stat({ path }: { path: string }) {
      if (path === descriptorPath && descriptorContent !== undefined) {
        return { path, kind: "file" as const, sizeBytes: descriptorContent.length, mtimeMs: 5 };
      }
      const name = path.slice(ROOT.length + 1);
      const content = files[name];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return { path, kind: "file" as const, sizeBytes: content.length, mtimeMs: 1 };
    },
    async readTextFile({ path }: { path: string }) {
      if (path === descriptorPath && descriptorContent !== undefined) {
        return textResult(path, descriptorContent);
      }
      if (path === INDEX_PATH && written.has(path)) return textResult(path, written.get(path)!);
      const name = path.slice(ROOT.length + 1);
      const content = files[name];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return textResult(path, content);
    },
    async readTextFileRange({ path }: { path: string }) {
      const name = path.slice(ROOT.length + 1);
      const content = files[name];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return { ...textResult(path, content), startLine: 1, lineCount: 1, totalLines: 1 };
    },
    async writeTextFile({ path, content }: { path: string; content: string }) {
      written.set(path, content);
      return { path, bytesWritten: content.length };
    },
  } as unknown as FileSystemPort;
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

const card = (description: string) => `---\ndescription: ${description}\n---\n正文`;

const FILES = {
  "kb-qimen-01.md": card(
    ".agents/skills/qimen-duanpan/references/04-应期与运筹.md#应期四步法 —— 用神旺衰与冲动定应期",
  ),
  "kb-liuren-01.md": card(
    ".agents/skills/liuren-duanpan/references/14-原生盘面输出约定.md#三传 —— 初传中传末传的吉凶",
  ),
};

const request = (input: Partial<KbSearchInput> = {}): KbSearchInput => ({
  query: "应期",
  ...input,
});

describe("searchKbCorpus", () => {
  it("returns source anchors without card body", async () => {
    delete process.env.ZCODE_MEMORY_EMBEDDING_URL;
    const result = await searchKbCorpus({
      runtime: {},
      fileSystem: makeFs(FILES),
      workingDirectory: WORKSPACE,
      request: request(),
    });
    expect(result.total).toBe(2);
    expect(result.anchors[0]?.source).toContain("04-应期与运筹.md#应期四步法");
    expect(result.anchors[0]?.title).toBe("应期四步法");
    expect(result.anchors[0]?.summary).toContain("用神旺衰");
    expect(result.anchors[0]?.cardPath).toContain("kb-qimen-01.md");
  });

  it("filters by family prefix", async () => {
    const result = await searchKbCorpus({
      runtime: {},
      fileSystem: makeFs(FILES),
      workingDirectory: WORKSPACE,
      request: request({ family: "qimen" }),
    });
    expect(result.total).toBe(1);
    expect(result.family).toBe("qimen");
    expect(result.anchors.every((anchor) => anchor.source.includes("qimen"))).toBe(true);
  });

  it("returns empty anchors for a family with no cards", async () => {
    const result = await searchKbCorpus({
      runtime: {},
      fileSystem: makeFs(FILES),
      workingDirectory: WORKSPACE,
      request: request({ family: "ziwei" }),
    });
    expect(result).toEqual({ anchors: [], total: 0, family: "ziwei" });
  });

  it("propagates the corpus guard warning", async () => {
    const result = await searchKbCorpus({
      runtime: {},
      fileSystem: makeFs(FILES, { version: 1, cardCount: 2, totalGuard: 1, generatedAt: "v1" }),
      workingDirectory: WORKSPACE,
      request: request(),
    });
    expect(result.warning).toContain("超过生成器护栏");
  });
});

describe("KbSearch tool", () => {
  it("returns the port result as structured output", async () => {
    const output = await kbSearchToolEntry.handler(
      { query: "应期", topK: 2 },
      contextWithPort(async () => ({
        anchors: [{ source: "a.md#标题", cardPath: "/w/.zcode/kb-cards/kb-a-1.md" }],
        total: 1,
      })),
    );
    expect(output).toEqual({
      anchors: [{ source: "a.md#标题", cardPath: "/w/.zcode/kb-cards/kb-a-1.md" }],
      total: 1,
    });
  });

  it("fails honestly when the runtime has no kb search port", async () => {
    await expect(
      kbSearchToolEntry.handler({ query: "应期" }, contextWithPort(undefined)),
    ).rejects.toThrow(/KbSearch requires a workspace filesystem/);
  });

  it("is registered unless the runtime opts out", () => {
    const withTool = createToolRegistry();
    registerBuiltInTools(withTool, {});
    expect(withTool.has("KbSearch")).toBe(true);

    const withoutTool = createToolRegistry();
    registerBuiltInTools(withoutTool, { includeKbSearch: false });
    expect(withoutTool.has("KbSearch")).toBe(false);
  });
});

function contextWithPort(
  search: ((request: KbSearchInput) => Promise<KbSearchOutput>) | undefined,
): ToolExecutionContext {
  return {
    toolCallId: "tool-kb-search",
    traceId: createTraceId(),
    abortSignal: new AbortController().signal,
    workingDirectory: WORKSPACE,
    workspaceRoot: WORKSPACE,
    sessionId: createSessionId("kb-search-test"),
    ...(search ? { kbSearchControlPort: { search } } : {}),
  };
}
