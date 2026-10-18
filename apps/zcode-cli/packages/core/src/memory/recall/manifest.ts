import { basename, relative, sep } from "node:path";
import type { FileSystemPort } from "@zcode/contracts";
import { parse as parseYaml } from "yaml";

import {
  MEMORY_RECALL_TYPES,
  type MemoryManifestEntry,
  type MemoryRecallState,
  type MemoryRecallType,
} from "./types.js";

const MANIFEST_FILE_LIMIT = 200;
const MANIFEST_PREVIEW_LINE_LIMIT = 30;
/**
 * 清单读取并发上限（140 §P1-3 实测）。
 *
 * 旧实现 `Promise.allSettled(paths.map(...))` 会对全部文件同时发起 stat + 读 30 行：
 * F:\智能体 的 24,778 张卡实测只成功 8,189 条，其余被 EMFILE 等 IO 错误拒绝后静默丢弃
 * （allSettled 的 rejected 分支被过滤）。并发泡既掩盖了语料覆盖缺口，也让失败看起来
 * 像「没有这张卡」。16 路足以打满本地磁盘，又不会触碰句柄上限。
 */
const MANIFEST_READ_CONCURRENCY = 16;

export async function scanMemoryManifest(input: {
  fileSystem: FileSystemPort;
  rootDir: string;
  signal?: AbortSignal;
  /**
   * CE 线增量：清单条数上限（覆盖默认 200）。kb 卡语料天然多于 memory 档
   * （skills references 目录逐文件一卡），kb-recall 传放宽值避免垫底金标卡被截断。
   */
  fileLimit?: number;
}): Promise<MemoryManifestEntry[]> {
  try {
    const paths = await collectMemoryPaths(input.fileSystem, input.rootDir, input.signal);
    const settled = await readManifestEntriesBounded(paths, input);
    return settled
      .filter(
        (result): result is PromiseFulfilledResult<MemoryManifestEntry> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, input.fileLimit ?? MANIFEST_FILE_LIMIT);
  } catch {
    return [];
  }
}

/** 有界并发读取清单条目：结果顺序与 paths 一致。 */
async function readManifestEntriesBounded(
  paths: readonly string[],
  input: { fileSystem: FileSystemPort; rootDir: string; signal?: AbortSignal },
): Promise<Array<PromiseSettledResult<MemoryManifestEntry>>> {
  const settled: Array<PromiseSettledResult<MemoryManifestEntry>> = new Array(paths.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < paths.length) {
      const index = cursor;
      cursor += 1;
      if (input.signal?.aborted) {
        settled[index] = { status: "rejected", reason: new Error("aborted") };
        continue;
      }
      try {
        settled[index] = {
          status: "fulfilled",
          value: await readManifestEntry(
            input.fileSystem,
            input.rootDir,
            paths[index]!,
            input.signal,
          ),
        };
      } catch (error) {
        settled[index] = { status: "rejected", reason: error };
      }
    }
  };
  const workers = Math.min(MANIFEST_READ_CONCURRENCY, paths.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return settled;
}

export async function getMemoryRecallManifest(input: {
  fileSystem: FileSystemPort;
  rootDir: string;
  signal?: AbortSignal;
  state: MemoryRecallState;
}): Promise<MemoryManifestEntry[]> {
  if (input.state.manifest && input.state.manifest.length > 0) {
    return input.state.manifest;
  }

  const manifest = await scanMemoryManifest(input);
  if (input.signal?.aborted) return [];
  if (manifest.length > 0) {
    input.state.manifest = manifest;
    input.state.selectorMessages = [createManifestMessage(manifest)];
  }
  return manifest;
}

export function formatMemoryManifest(manifest: readonly MemoryManifestEntry[]): string {
  return manifest
    .map((entry) => {
      const type = entry.type ? `[${entry.type}] ` : "";
      const timestamp = new Date(entry.mtimeMs).toISOString();
      const base = `- ${type}${entry.filename} (${timestamp})`;
      return entry.description ? `${base}: ${entry.description}` : base;
    })
    .join("\n");
}

function createManifestMessage(manifest: readonly MemoryManifestEntry[]) {
  return {
    role: "user" as const,
    content: `Available memories:\n${formatMemoryManifest(manifest)}`,
    cacheControl: { type: "ephemeral" as const },
  };
}

async function collectMemoryPaths(
  fileSystem: FileSystemPort,
  directory: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const listed = await fileSystem.listDirectory({ path: directory }, { signal });
  const paths: string[] = [];

  for (const entry of listed.entries) {
    if (entry.kind === "directory") {
      paths.push(...(await collectMemoryPaths(fileSystem, entry.path, signal)));
      continue;
    }
    if (entry.kind === "file") {
      if (isMemoryCandidate(entry.path)) paths.push(entry.path);
      continue;
    }
    if (entry.kind !== "symlink" || !isMemoryCandidate(entry.path)) continue;

    try {
      const target = await fileSystem.stat({ path: entry.path }, { signal });
      if (target.kind === "file") paths.push(entry.path);
    } catch {
      // 单个失效的文件 symlink 与单个无法读取的事实文件一样，不影响其他 manifest 项。
    }
  }

  return paths;
}

function isMemoryCandidate(filePath: string): boolean {
  return filePath.endsWith(".md") && basename(filePath) !== "MEMORY.md";
}

async function readManifestEntry(
  fileSystem: FileSystemPort,
  rootDir: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<MemoryManifestEntry> {
  const [stat, preview] = await Promise.all([
    fileSystem.stat({ path: filePath }, { signal }),
    fileSystem.readTextFileRange(
      { path: filePath, offsetLine: 0, limitLines: MANIFEST_PREVIEW_LINE_LIMIT },
      { signal },
    ),
  ]);
  const frontmatter = parseMemoryFrontmatter(preview.content);
  return {
    ...(frontmatter.description ? { description: frontmatter.description } : {}),
    filePath,
    filename: relative(rootDir, filePath).split(sep).join("/"),
    mtimeMs: stat.mtimeMs ?? 0,
    ...(frontmatter.type ? { type: frontmatter.type } : {}),
  };
}

function parseMemoryFrontmatter(content: string): {
  description?: string;
  type?: MemoryRecallType;
} {
  const normalized = content.replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") return {};

  const end = lines.indexOf("---", 1);
  if (end < 0) return {};
  let parsed: unknown;
  try {
    parsed = parseYaml(lines.slice(1, end).join("\n"));
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};

  const description = typeof parsed.description === "string" ? parsed.description : undefined;
  const metadata = isRecord(parsed.metadata) ? parsed.metadata : undefined;
  const typeCandidate = metadata?.type ?? parsed.type;
  const type = isMemoryRecallType(typeCandidate) ? typeCandidate : undefined;
  return {
    ...(description ? { description } : {}),
    ...(type ? { type } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMemoryRecallType(value: unknown): value is MemoryRecallType {
  return typeof value === "string" && (MEMORY_RECALL_TYPES as readonly string[]).includes(value);
}
