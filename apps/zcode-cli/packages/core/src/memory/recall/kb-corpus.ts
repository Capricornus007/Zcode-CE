import { dirname, isAbsolute, join, relative } from "node:path";
import type { FileSystemPort } from "@zcode/contracts";
import { scanMemoryManifest } from "./manifest.js";
import type { MemoryManifestEntry } from "./types.js";

/**
 * 知识卡语料装载（140 §P0-1 / §P1-3）。
 *
 * 语料目录是唯一权威：`.zcode/kb-cards/*.md` 由工作区生成器产出。本模块只负责：
 * - 读生成器写的 `.corpus.json` 自述文件，拿到 cardCount / totalGuard；
 * - 用自述版本号命中 `.zcode/.kb-index.json` 派生索引，避免每 60s 重扫两万文件；
 * - 索引缺失/失效/损坏时回退全量扫描，并在语料超过护栏时给出显式告警；
 * - 永不静默截断：读侧上限就是 cardCount（140 §P0-1）。
 *
 * 索引是纯派生缓存，删除或损坏都等价于重建；语料移动（root 变化）同样重建。
 */

export const KB_CARDS_RELATIVE_DIR = join(".zcode", "kb-cards");
export const KB_DESCRIPTOR_FILE = ".corpus.json";
export const KB_INDEX_FILE = ".kb-index.json";
/** 生成器当前总量护栏的快照值；只用于「没有自述文件」时的告警判据。 */
export const KB_DEFAULT_TOTAL_GUARD = 27_000;

const KB_INDEX_VERSION = 1;
const MAX_INDEX_DESCRIPTION_CHARS = 4_000;
/**
 * 进程内清单缓存（140 §P1-3）：索引文件约 6 MB，逐轮 parse 实测 ~0.6 s；
 * 60 s 内复用同一语料版本，语料版本变化（生成器重跑）立即失效。
 */
const CORPUS_CACHE_TTL_MS = 60_000;

interface CorpusCacheSlot {
  version: string | undefined;
  at: number;
  load: KbCorpusLoad;
}

const corpusCache = new Map<string, CorpusCacheSlot>();

/** 测试隔离：清空进程内语料缓存（不删索引文件）。 */
export function resetKbCorpusCacheForTesting(): void {
  corpusCache.clear();
}

export interface KbCorpusDescriptor {
  version?: number;
  cardCount?: number;
  totalGuard?: number;
  generatedAt?: string;
  generator?: string;
}

export interface KbCorpusLoad {
  entries: MemoryManifestEntry[];
  cardCount: number;
  descriptor: KbCorpusDescriptor | null;
  /** 本次是否命中落盘索引（false 表示回退全量扫描）。 */
  fromIndex: boolean;
  /** 语料超过护栏时的显式告警文本；正常为 undefined。 */
  warning?: string;
}

interface KbManifestIndexFile {
  version: number;
  root: string;
  corpusVersion: string;
  cardCount: number;
  generatedAt: string;
  entries: Array<{
    filename: string;
    filePath: string;
    mtimeMs: number;
    description?: string;
  }>;
}

export function kbCardsRootDir(workingDirectory: string): string {
  return join(workingDirectory, KB_CARDS_RELATIVE_DIR);
}

export function kbIndexPath(rootDir: string): string {
  return join(dirname(rootDir), KB_INDEX_FILE);
}

/** 读 `.corpus.json`；缺失/非法/版本不符一律按无自述处理，不抛错。 */
export async function readKbCorpusDescriptor(
  fileSystem: FileSystemPort,
  rootDir: string,
): Promise<KbCorpusDescriptor | null> {
  try {
    const read = await fileSystem.readTextFile({
      path: join(rootDir, KB_DESCRIPTOR_FILE),
      maxBytes: 64 * 1024,
    });
    const parsed = JSON.parse(read.content) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return {
      ...(typeof record.version === "number" ? { version: record.version } : {}),
      ...(isPositiveInteger(record.cardCount) ? { cardCount: record.cardCount } : {}),
      ...(isPositiveInteger(record.totalGuard) ? { totalGuard: record.totalGuard } : {}),
      ...(typeof record.generatedAt === "string" ? { generatedAt: record.generatedAt } : {}),
      ...(typeof record.generator === "string" ? { generator: record.generator } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * 装载 kb 语料。目录不存在时回退 `scanMemoryManifest` 的空结果（调用方按无卡处理）。
 * 只有自述文件在场时才写/读索引：没有版本锚点的索引无法判断新鲜度，宁可重扫。
 */
export async function loadKbCorpus(input: {
  fileSystem: FileSystemPort;
  rootDir: string;
  signal?: AbortSignal;
}): Promise<KbCorpusLoad> {
  const { fileSystem, rootDir, signal } = input;
  const descriptor = await readKbCorpusDescriptor(fileSystem, rootDir);
  const corpusVersion = await resolveCorpusVersion(fileSystem, rootDir, descriptor, signal);
  const indexPath = kbIndexPath(rootDir);
  const now = Date.now();
  const cached = corpusCache.get(rootDir);
  if (cached && cached.version === corpusVersion && now - cached.at < CORPUS_CACHE_TTL_MS) {
    return { ...cached.load, fromIndex: true };
  }

  if (corpusVersion !== undefined) {
    const indexed = await readIndex(fileSystem, indexPath, rootDir, corpusVersion, signal);
    if (indexed) {
      const load = withGuardWarning({
        entries: indexed.entries,
        cardCount: indexed.cardCount,
        descriptor,
        fromIndex: true,
      });
      corpusCache.set(rootDir, { version: corpusVersion, at: now, load });
      return load;
    }
  }

  const entries = await scanMemoryManifest({
    fileSystem,
    rootDir,
    // 读侧不设条数上限：上限只由护栏告警表达（140 §P0-1）。
    fileLimit: Number.MAX_SAFE_INTEGER,
    ...(signal ? { signal } : {}),
  });

  if (corpusVersion !== undefined && entries.length > 0) {
    await writeIndex(fileSystem, indexPath, rootDir, corpusVersion, entries).catch(() => {
      // 索引是加速器：写失败只意味着下一轮重扫，不阻断召回。
    });
  }

  const load = withGuardWarning({
    entries,
    cardCount: entries.length,
    descriptor,
    fromIndex: false,
  });
  corpusCache.set(rootDir, { version: corpusVersion, at: now, load });
  return load;
}

async function resolveCorpusVersion(
  fileSystem: FileSystemPort,
  rootDir: string,
  descriptor: KbCorpusDescriptor | null,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (!descriptor) return undefined;
  let mtimeMs = 0;
  try {
    const stat = await fileSystem.stat({ path: join(rootDir, KB_DESCRIPTOR_FILE) }, { signal });
    mtimeMs = stat.mtimeMs ?? 0;
  } catch {
    // 自述文件可读但 stat 失败：仍可用 generatedAt 做版本锚点。
  }
  return `${descriptor.cardCount ?? 0}:${descriptor.generatedAt ?? ""}:${mtimeMs}`;
}

function withGuardWarning(input: {
  entries: MemoryManifestEntry[];
  cardCount: number;
  descriptor: KbCorpusDescriptor | null;
  fromIndex: boolean;
}): KbCorpusLoad {
  const guard = input.descriptor?.totalGuard ?? KB_DEFAULT_TOTAL_GUARD;
  const base: KbCorpusLoad = {
    entries: input.entries,
    cardCount: input.cardCount,
    descriptor: input.descriptor,
    fromIndex: input.fromIndex,
  };
  if (input.cardCount > guard) {
    base.warning = `[kb-recall] 知识卡语料 ${input.cardCount} 张，超过生成器护栏 ${guard} 张；请重跑知识卡生成器，读侧本轮不截断。`;
  }
  return base;
}

async function readIndex(
  fileSystem: FileSystemPort,
  indexPath: string,
  rootDir: string,
  corpusVersion: string,
  signal?: AbortSignal,
): Promise<{ entries: MemoryManifestEntry[]; cardCount: number } | null> {
  try {
    const read = await fileSystem.readTextFile({ path: indexPath }, { signal });
    const parsed = JSON.parse(read.content) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<KbManifestIndexFile>;
    if (record.version !== KB_INDEX_VERSION) return null;
    if (record.root !== rootDir) return null;
    if (record.corpusVersion !== corpusVersion) return null;
    if (!Array.isArray(record.entries)) return null;
    if (record.cardCount !== record.entries.length) return null;

    const entries = record.entries.flatMap((entry) => {
      const normalized = normalizeIndexEntry(entry, rootDir);
      return normalized ? [normalized] : [];
    });
    // 任一条目损坏即整份索引作废：部分可用会让语料覆盖悄悄变小。
    if (entries.length !== record.entries.length) return null;
    return { entries, cardCount: entries.length };
  } catch {
    return null;
  }
}

function normalizeIndexEntry(
  entry: KbManifestIndexFile["entries"][number],
  rootDir: string,
): MemoryManifestEntry | null {
  if (typeof entry !== "object" || entry === null) return null;
  const { filePath, filename, mtimeMs, description } = entry;
  if (typeof filePath !== "string" || typeof filename !== "string") return null;
  if (!Number.isFinite(mtimeMs)) return null;
  if (!isPathInside(rootDir, filePath)) return null;
  if (filename.length === 0 || filename.startsWith("/") || filename.includes("\\")) return null;
  if (description !== undefined && typeof description !== "string") return null;
  if (description !== undefined && description.length > MAX_INDEX_DESCRIPTION_CHARS) return null;
  return {
    filePath,
    filename,
    mtimeMs,
    ...(description ? { description: description.slice(0, MAX_INDEX_DESCRIPTION_CHARS) } : {}),
  };
}

function isPathInside(rootDir: string, filePath: string): boolean {
  if (!isAbsolute(filePath)) return false;
  const rel = relative(rootDir, filePath);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

async function writeIndex(
  fileSystem: FileSystemPort,
  indexPath: string,
  rootDir: string,
  corpusVersion: string,
  entries: MemoryManifestEntry[],
): Promise<void> {
  const file: KbManifestIndexFile = {
    version: KB_INDEX_VERSION,
    root: rootDir,
    corpusVersion,
    cardCount: entries.length,
    generatedAt: new Date().toISOString(),
    entries: entries.map((entry) => ({
      filename: entry.filename,
      filePath: entry.filePath,
      mtimeMs: entry.mtimeMs,
      ...(entry.description ? { description: entry.description } : {}),
    })),
  };
  await fileSystem.writeTextFile({
    path: indexPath,
    content: JSON.stringify(file),
    atomic: true,
    createParents: true,
  });
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
