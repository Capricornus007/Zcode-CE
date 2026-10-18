import { describe, expect, it } from "vitest";

import { CompactTrigger } from "@zcode/contracts";
import {
  resolveCompactPreserveRecentTokenBudget,
  selectCompactEntries,
} from "../src/runtime/helpers/compact-selection.js";
import type { RuntimeMessageEntry } from "../src/agent/message-history.js";

/**
 * 148⑥（吸收 pi 0.86 per-model compaction budget）：近端保留预算进
 * AutoCompactPolicyConfig——byModel[modelId] > 全局 > 默认 20K，缺省行为不变。
 */

function userEntry(text: string): RuntimeMessageEntry {
  return {
    kind: "message",
    message: { role: "user", content: text },
    metadata: { source: "real_user" },
  } as unknown as RuntimeMessageEntry;
}

function assistantEntry(text: string): RuntimeMessageEntry {
  return {
    kind: "message",
    message: { role: "assistant", content: text },
    metadata: { source: "shared_context" },
  } as unknown as RuntimeMessageEntry;
}

describe("148⑥ compact preserve-recent token budget config", () => {
  it("global override shrinks preserved rounds to the floor of 1", () => {
    // 预算 0 ⇒ 除保底的最新 1 轮外不再保留任何轮（「超预算即停」的分母防御路径）。
    // 注意预算语义：最新轮永远保底保留，其后每加一轮都要求累计估算 ≤ 预算；
    // 所以用 0 断言地板，而不是 1（末组本身可能 ≤1 token 再放进一轮，非确定性）。
    const bigRound = (i: number): RuntimeMessageEntry[] => [
      userEntry(`u${i} ${"x".repeat(2000)}`),
      assistantEntry(`a${i}`),
    ];
    const entries = Array.from({ length: 6 }, (_, i) => bigRound(i)).flat();
    const tight = selectCompactEntries({
      entries,
      trigger: CompactTrigger.Auto,
      preserveRecentTokenBudget: 0,
    });
    expect(tight.groupsPreserved).toBe(1);

    // 缺省（不传）保持 20K 行为：预算内的轮次仍保留多轮（6 轮 ~4.7K token < 20K）
    const loose = selectCompactEntries({ entries, trigger: CompactTrigger.Auto });
    expect(loose.groupsPreserved).toBeGreaterThan(1);
  });

  it("resolver order: byModel > global > default, invalid values fall back", () => {
    expect(resolveCompactPreserveRecentTokenBudget({})).toBe(20_000);
    expect(
      resolveCompactPreserveRecentTokenBudget({ config: { preserveRecentTokenBudget: 5_000 } }),
    ).toBe(5_000);

    const config = {
      preserveRecentTokenBudget: 5_000,
      preserveRecentTokenBudgetByModel: { "glm-5.2": 40_000 },
    };
    expect(resolveCompactPreserveRecentTokenBudget({ config, modelId: "glm-5.2" })).toBe(40_000);
    expect(resolveCompactPreserveRecentTokenBudget({ config, modelId: "other-model" })).toBe(5_000);
    expect(
      resolveCompactPreserveRecentTokenBudget({
        config: { preserveRecentTokenBudget: -3 },
        modelId: "glm-5.2",
      }),
    ).toBe(20_000);
  });
});
