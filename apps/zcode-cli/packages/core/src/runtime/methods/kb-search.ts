import type { FileSystemPort, KbSearchInput, KbSearchOutput } from "@zcode/contracts";
import { kbCardsRootDir, loadKbCorpus } from "../../memory/recall/kb-corpus.js";
import { diversifyKbAnchors } from "./kb-recall-reminder.js";
import { rankRecallCorpus } from "./memory-recall-reminder.js";

/**
 * KbSearch 的执行实现（140 §P1-5）：与每轮 kb_recall 注入共用同一份语料索引、
 * 同一套融合排序与同一个向量缓存，只是把「固定 top-5 提醒」变成「模型可主动查询」。
 *
 * 只返回锚点（源文件#标题 + 摘要 + 卡路径），正文由模型按需 Read——
 * 与工作区铁律 5.8「只存指针不存知识第二副本」一致。
 */

const DEFAULT_TOP_K = 8;
const MAX_TOP_K = 20;
/** 多样化候选池放大倍数：先多取，再按源文件去重，避免同一文件占满。 */
const DIVERSIFY_FACTOR = 3;
/** 与 kb_recall 同源词法门槛：锚点 description 含路径词元更长，覆盖率天然稀释。 */
const KB_LEXICAL_MIN_SCORE = 0.02;

export interface KbSearchRuntimeInput {
  runtime: object;
  fileSystem: FileSystemPort;
  workingDirectory: string;
  request: KbSearchInput;
}

export async function searchKbCorpus(input: KbSearchRuntimeInput): Promise<KbSearchOutput> {
  const { request } = input;
  const rootDir = kbCardsRootDir(input.workingDirectory);
  const corpus = await loadKbCorpus({ fileSystem: input.fileSystem, rootDir });
  const base = {
    total: 0,
    ...(request.family ? { family: request.family } : {}),
    ...(corpus.warning ? { warning: corpus.warning } : {}),
  };
  if (corpus.entries.length === 0) return { anchors: [], ...base };

  const entries = request.family
    ? corpus.entries.filter((entry) => entry.filename.startsWith(`kb-${request.family}-`))
    : corpus.entries;
  if (entries.length === 0) return { anchors: [], ...base };

  const topK = Math.min(request.topK ?? DEFAULT_TOP_K, MAX_TOP_K);
  const ranked = await rankRecallCorpus({
    runtime: input.runtime,
    fileSystem: input.fileSystem,
    rootDir,
    query: request.query,
    topK: Math.min(entries.length, topK * DIVERSIFY_FACTOR),
    minScore: KB_LEXICAL_MIN_SCORE,
    manifest: entries,
  });

  const anchors = ranked === null ? [] : diversifyKbAnchors(ranked, topK).map(toAnchor);
  return {
    anchors,
    total: entries.length,
    ...(request.family ? { family: request.family } : {}),
    ...(corpus.warning ? { warning: corpus.warning } : {}),
  };
}

function toAnchor(entry: {
  description?: string;
  filename: string;
  filePath?: string;
}): KbSearchOutput["anchors"][number] {
  const description = entry.description;
  if (!description) {
    return { source: entry.filename, cardPath: entry.filePath ?? entry.filename };
  }
  const separator = description.indexOf(" —— ");
  const source = separator > 0 ? description.slice(0, separator) : description;
  const summary = separator > 0 ? description.slice(separator + 4) : undefined;
  const hashIndex = source.indexOf("#");
  const title = hashIndex > 0 ? source.slice(hashIndex + 1) : undefined;
  return {
    source,
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {}),
    cardPath: entry.filePath ?? entry.filename,
  };
}
