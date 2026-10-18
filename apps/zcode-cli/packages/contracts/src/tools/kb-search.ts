// ============================================================
// KbSearch Tool - 知识卡语料的主动检索（140 §P1-5）
// ============================================================

import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const KB_SEARCH_TOOL_NAME = "KbSearch";

export const KbSearchInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(2_000)
      .describe("Terms describing what you need from the workspace knowledge base."),
    topK: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Maximum anchors to return (default 8)."),
    family: z
      .string()
      .regex(/^[a-z0-9_-]{1,40}$/u)
      .optional()
      .describe(
        "Optional knowledge family prefix, e.g. qimen / liuren / ziwei. Matches card filenames kb-<family>-*.md.",
      ),
  })
  .strict();

export type KbSearchInput = z.infer<typeof KbSearchInputSchema>;
export const KbSearchInputJsonSchema = toToolJsonSchema(KbSearchInputSchema);

export const KbSearchAnchorSchema = z
  .object({
    /** 源文件#标题；直接可作为 Read 的目标。 */
    source: z.string(),
    title: z.string().optional(),
    summary: z.string().optional(),
    /** 知识卡文件路径（description 的指针副本，不是知识正文）。 */
    cardPath: z.string(),
  })
  .strict();

export const KbSearchOutputSchema = z
  .object({
    anchors: z.array(KbSearchAnchorSchema),
    /** 本次参与排序的语料条数（family 过滤后）。 */
    total: z.number().int().nonnegative(),
    family: z.string().optional(),
    /** 语料超过生成器护栏等显式告警；正常省略。 */
    warning: z.string().optional(),
  })
  .strict();

export type KbSearchAnchor = z.infer<typeof KbSearchAnchorSchema>;
export type KbSearchOutput = z.infer<typeof KbSearchOutputSchema>;
export const KbSearchOutputJsonSchema = toToolJsonSchema(KbSearchOutputSchema);
