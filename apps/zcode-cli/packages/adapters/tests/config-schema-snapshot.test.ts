import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZCodeConfigFileSchema } from "../src/config/schema.js";

// 对应 spec：docs/development/148-pi-absorption-batch2.md ⑧「config JSON Schema 生成与分发」。
// 本用例是棘轮护栏：仓库内产物必须等于当前 ZCodeConfigFileSchema 的生成结果；
// config 结构变化后若不重生成产物，这里变红，防止 schema 与随仓分发的 JSON Schema 漂移。
// UPDATE_CONFIG_SCHEMA 是 spec 148 ⑧ 定义的重生成开关（置 1 时本用例改为写入产物，非常规运行时变量）。

const SCHEMA_ID = "https://zcode.ai/schema/config-v2.json"; // 与 config.test.ts 既有 $schema 约定保持同一 URL
const SCHEMA_TITLE = "ZCode CE config (v2)";
const FALLBACK_DIALECT = "https://json-schema.org/draft/2020-12/schema"; // 生成器未写 $schema 时的兜底方言
// tests → adapters → packages → zcode-cli → apps → 仓库根；不依赖 process.cwd，测试可从任意目录启动
const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));
const ARTIFACT_PATH = join(REPO_ROOT, "docs", "schema", "zcode-config-v2.schema.json");
const REGEN_COMMAND =
  "UPDATE_CONFIG_SCHEMA=1 pnpm --dir apps/zcode-cli --filter @zcode/adapters test -- config-schema-snapshot";

function renderConfigSchemaJson(): string {
  // adapters 的 config schema 基于 zod4；zod-to-json-schema@3.25.2 按 zod3 的 def.typeName 分发解析器，
  // 对 zod4 classic schema 会产出空 body（实测 _def.typeName === undefined），因此用 zod 原生转换器。
  // target "draft-7" 即 JSON Schema draft-07，语义对应 contracts/src/tools/json-schema.ts 的 jsonSchema7；
  // io: "input" 对应其 effectStrategy: "input"（按输入形态描述，不把 transform 后的输出形态写进 schema）。
  const generated = z.toJSONSchema(ZCodeConfigFileSchema, {
    target: "draft-7",
    io: "input",
  }) as Record<string, unknown>;
  const { $schema, ...body } = generated;
  const header: Record<string, unknown> = {
    // 生成器（draft-7 target）已写 $schema 则原样保留，否则补 2020-12 方言
    $schema: typeof $schema === "string" ? $schema : FALLBACK_DIALECT,
    $id: SCHEMA_ID,
    title: SCHEMA_TITLE,
  };
  // JSON.stringify 按键插入顺序输出；header 固定在首位，保证产物字节顺序稳定可 diff
  return JSON.stringify({ ...header, ...body }, null, 2) + "\n";
}

function readArtifact(): string {
  try {
    return readFileSync(ARTIFACT_PATH, "utf8");
  } catch {
    throw new Error(`快照产物缺失：${ARTIFACT_PATH}\n重生成命令：${REGEN_COMMAND}`);
  }
}

describe("config JSON Schema snapshot (spec 148 ⑧)", () => {
  if (process.env.UPDATE_CONFIG_SCHEMA === "1") {
    it("rewrites docs/schema/zcode-config-v2.schema.json from the current schema", () => {
      const rendered = renderConfigSchemaJson();
      mkdirSync(join(REPO_ROOT, "docs", "schema"), { recursive: true });
      // 产物编码固定 UTF-8 + LF：内容仅含 \n，由 writeFileSync 以 utf8 落盘
      writeFileSync(ARTIFACT_PATH, rendered, "utf8");
      expect(readArtifact()).toBe(rendered);
    });
    return;
  }

  it("keeps docs/schema/zcode-config-v2.schema.json byte-identical to the generated schema", () => {
    const expected = renderConfigSchemaJson();
    expect(
      readArtifact(),
      `config schema 产物与当前生成结果漂移。\n重生成命令：${REGEN_COMMAND}（产物须为 UTF-8 + LF）`,
    ).toBe(expected);
  });
});
