import { ESTIMATED_TOKEN_CHAR_DIVISOR } from "@zcode/shared";
import type { ReadFileStateEntry, ReadFileStateMap } from "../deps.js";
import {
  systemReminderAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../agent/message-history.js";
import { modelMessageContentToText } from "../deps.js";

/** 单个技能 digest 上限（字符）；两个技能合计 ≤8 K。 */
const MAX_SKILL_DIGEST_CHARS = 4_000;
const MAX_SKILL_DIGESTS = 2;

/**
 * 压缩后重注入技能 digest（140 §P2-7）。
 *
 * 技能正文是**指令**，但压缩会把它和普通历史一起摘要化。这里从压缩前的
 * 有效历史里取最近加载过的技能，抽取「标题 + 铁律/禁止/命令行 + 代码块命令」
 * 作为 digest，随 post-compact reminders 注入一次；正文仍以重新调用 Skill 为准。
 */
export function buildSkillDigestReminderEntries(
  entries: readonly RuntimeMessageEntry[],
): RuntimeMessageEntry[] {
  const digests = collectSkillDigests(entries);
  if (digests.length === 0) return [];
  const lines = [
    "以下技能正文已在最近的压缩中被摘要化。先按 digest 遵守其硬约束；需要完整步骤时重新调用对应 Skill。",
    ...digests.map((digest) => `## ${digest.name}\n${digest.digest}`),
  ];
  return [systemReminderAttachmentEntry("skill_digest", lines.join("\n\n"))];
}

function collectSkillDigests(
  entries: readonly RuntimeMessageEntry[],
): Array<{ name: string; digest: string }> {
  const callNames = new Map<string, string>();
  const bodies = new Map<string, string>();
  for (const entry of entries) {
    if (!("message" in entry)) continue;
    const message = entry.message;
    if (message.role === "assistant") {
      for (const call of message.toolCalls ?? []) {
        if (call.name !== "Skill") continue;
        const name = skillNameFromInput(call.input);
        if (name) callNames.set(call.id, name);
      }
      continue;
    }
    if (message.role !== "tool" || message.isError === true) continue;
    const name = message.toolCallId ? callNames.get(message.toolCallId) : undefined;
    if (!name) continue;
    const text = modelMessageContentToText(message.content);
    if (text.includes("<skill_content")) bodies.set(name, text);
  }

  // 最近加载的技能优先（Map 后写入覆盖先写入）。
  const ordered = [...bodies.entries()].slice(-MAX_SKILL_DIGESTS);
  return ordered
    .map(([name, body]) => ({ name, digest: digestSkillBody(body) }))
    .filter((entry) => entry.digest.length > 0);
}

function skillNameFromInput(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const fields = input as { skill?: unknown; name?: unknown };
  if (typeof fields.skill === "string") return fields.skill;
  if (typeof fields.name === "string") return fields.name;
  return undefined;
}

/** 标题 + 硬约束行 + 代码块命令；去重后截到 4 K 字符。 */
function digestSkillBody(body: string): string {
  const seen = new Set<string>();
  const selected: string[] = [];
  const lines = body.split(/\r?\n/u);
  let inFence = false;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    const trimmed = line.trim();
    const keep =
      inFence ||
      /^#{1,3}\s+/u.test(trimmed) ||
      /(铁律|必须|禁止|不得|不要|命令|python\s|cd\s|Skill\()/u.test(trimmed);
    if (!keep || trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    selected.push(trimmed);
    if (selected.join("\n").length >= MAX_SKILL_DIGEST_CHARS) break;
  }
  return selected.join("\n").slice(0, MAX_SKILL_DIGEST_CHARS);
}

export function buildPostCompactReadStateReminderEntries(input: {
  maxFileApproxTokens?: number;
  maxFiles?: number;
  maxTotalApproxTokens?: number;
  preservedEntries?: readonly RuntimeMessageEntry[];
  readFileState?: ReadFileStateMap;
}): RuntimeMessageEntry[] {
  const readFileState = input.readFileState;
  if (!readFileState || readFileState.size === 0) {
    return [];
  }

  const maxFiles = input.maxFiles ?? 5;
  const maxFileApproxTokens = input.maxFileApproxTokens ?? 5_000;
  const maxTotalApproxTokens = input.maxTotalApproxTokens ?? 50_000;
  const selected: RuntimeMessageEntry[] = [];
  let totalApproxTokens = 0;
  const preservedReadFilePaths = collectPreservedReadFilePaths(input.preservedEntries ?? []);

  const candidates = Array.from(readFileState.values())
    .filter(isPostCompactReadReminderCandidate)
    .filter((entry) => !shouldSkipPostCompactReadStatePath(entry.path))
    .filter((entry) => !preservedReadFilePaths.has(normalizePostCompactReadStatePath(entry.path)))
    .sort((left, right) => right.readAt.getTime() - left.readAt.getTime());

  for (const entry of candidates) {
    if (selected.length >= maxFiles) break;

    const approxTokens = Math.ceil(entry.content.length / ESTIMATED_TOKEN_CHAR_DIVISOR);
    if (approxTokens > maxFileApproxTokens) {
      selected.push(buildPostCompactReadStateEntry(formatCompactFileReference(entry)));
      continue;
    }
    if (totalApproxTokens + approxTokens > maxTotalApproxTokens) {
      selected.push(buildPostCompactReadStateEntry(formatCompactFileReference(entry)));
      continue;
    }

    totalApproxTokens += approxTokens;
    selected.push(buildPostCompactReadStateEntry(formatReadStateProjection(entry)));
  }

  return selected;
}

function buildPostCompactReadStateEntry(content: string): RuntimeMessageEntry {
  return systemReminderAttachmentEntry("resume_referenced_session_context", content);
}

function formatCompactFileReference(entry: ReadFileStateEntry): string {
  return `Note: ${entry.path} was read before the last conversation was summarized, but the contents are too large to include. Use Read tool if you need to access it.`;
}

function formatReadStateProjection(entry: ReadFileStateEntry): string {
  const content = addReadLineNumbers(entry.content, readStateStartLine(entry.offset));
  return [
    `Called the Read tool with the following input: ${formatFileStateInput(entry)}`,
    "Result of calling the Read tool:",
    content,
  ].join("\n");
}

function isPostCompactReadReminderCandidate(entry: ReadFileStateEntry): boolean {
  return entry.sourceTool === undefined || entry.sourceTool === "Read";
}

function collectPreservedReadFilePaths(entries: readonly RuntimeMessageEntry[]): Set<string> {
  const paths = new Set<string>();
  for (const entry of entries) {
    if (!("message" in entry)) continue;
    if (entry.message.role !== "assistant" || !entry.message.toolCalls) continue;
    for (const toolCall of entry.message.toolCalls) {
      if (toolCall.name !== "Read") continue;
      const filePath = readToolCallFilePath(toolCall.input);
      if (filePath) paths.add(normalizePostCompactReadStatePath(filePath));
    }
  }
  return paths;
}

function readToolCallFilePath(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const filePath = (input as { file_path?: unknown }).file_path;
  return typeof filePath === "string" && filePath.length > 0 ? filePath : undefined;
}

function formatFileStateInput(entry: ReadFileStateEntry): string {
  return JSON.stringify({
    file_path: entry.path,
    ...(entry.offset === undefined ? {} : { offset: entry.offset }),
    ...(entry.limit === undefined ? {} : { limit: entry.limit }),
  });
}

function readStateStartLine(offset: number | undefined): number {
  if (offset === 0) return 0;
  if (offset !== undefined && offset > 1) return Math.trunc(offset);
  return 1;
}

function addReadLineNumbers(content: string, startLine: number): string {
  return content
    .split(/\r?\n/)
    .map((line, index) => `${index + startLine}\t${line}`)
    .join("\n");
}

function shouldSkipPostCompactReadStatePath(filePath: string): boolean {
  const normalized = normalizePostCompactReadStatePath(filePath);
  return (
    normalized.includes("/.codex/memories/") ||
    normalized.includes("/docs/superpowers/plans/") ||
    normalized.includes("/.git/")
  );
}

function normalizePostCompactReadStatePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
