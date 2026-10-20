#!/usr/bin/env node
/**
 * 文案格式护栏的基线（再）生成器：把 .copy-format-baseline.json 收紧/重置为当前树的实际值。
 *
 * 什么时候用：
 *   - 大版本上游合并后，源码面整体换血（如 official 3.15.1 对齐），旧基线全面失真 ——
 *     重置基线到新树，之后棘轮继续单向推进；
 *   - 清理了一批注释强调后，把已达 0 的文件从基线里钉死。
 *
 * 计数逻辑**单源**复用 packages/ui/test/copyFormatGuard.test.ts 导出的
 * scannedSourceFiles / countCommentPairs —— 生成器与测试永远算同一套账，
 * 不存在"生成器口径"和"测试口径"两份实现（多副本必然漂移）。
 *
 * 用法：
 *   node --import tsx scripts/gen-copy-baseline.mjs --write   # 写回基线
 *   node --import tsx scripts/gen-copy-baseline.mjs           # 只打印 diff，不写
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = resolve(repoRoot, ".copy-format-baseline.json");

const { scannedSourceFiles, countCommentPairs } = await import(
  pathToFileURL(resolve(repoRoot, "packages/ui/test/copyFormatGuard.test.ts")).href
);

const files = {};
for (const file of scannedSourceFiles()) {
  const source = readFileSync(resolve(repoRoot, file), "utf8");
  if (!source.includes("**")) continue;
  const pairs = countCommentPairs(file, source);
  if (pairs > 0) files[file] = pairs;
}

const write = process.argv.includes("--write");
const previous = (() => {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    return { files: {} };
  }
})();

const allKeys = [...new Set([...Object.keys(previous.files ?? {}), ...Object.keys(files)])].sort();
let changed = 0;
for (const key of allKeys) {
  const before = previous.files?.[key];
  const after = files[key];
  if (before !== after) {
    changed += 1;
    console.log(`${key}: ${before ?? " absent "} -> ${after ?? 0}`);
  }
}
console.log(
  `\n${Object.keys(files).length} files carry comment emphasis; ${changed} entries changed.`,
);

if (write) {
  const total = Object.values(files).reduce((sum, n) => sum + n, 0);
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ total, files }, null, 2)}\n`);
  console.log(`baseline written: ${BASELINE_PATH} (total=${total})`);
} else {
  console.log("dry run — pass --write to update the baseline");
}
