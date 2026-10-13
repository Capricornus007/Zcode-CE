import assert from "node:assert/strict";
import test from "node:test";
import { buildCodingPlanQuotaResetDialogConfig } from "../src/components/coding-plan-quota-reset/buildCodingPlanQuotaResetDialogConfig.js";
import {
  hasUsableCodingPlanQuotaResetOpportunity,
  resolveCodingPlanQuotaResetActionCompletedAt,
  startCodingPlanQuotaResetManualUse,
  type CodingPlanQuotaResetUiEntry,
} from "../src/lib/codingPlanQuotaResetUi.js";

/**
 * X8(额度已满看不到重置机会入口)回归测试。
 *
 * 背景：弹框与徽标曾用「额度剩余 100% 则重置无收益」门控(quotaFull)隐藏整行。
 * 但核销会把剩余额度改写成 100%，同类型仍有余下机会时 entry 回到 available，
 * 门控把余下的卡一起藏掉 —— 用户以为机会丢失。上游 3.15.1 修复：
 * ① 去掉 quotaFull 参数与门控；② completed如实携带余下机会(不再清零)；
 * ③ 「是否仍可核销」统一由 hasUsableCodingPlanQuotaResetOpportunity 判定。
 *
 * 本组钉住三件事：
 * 1. 满额(opportunityVisible 仍为 true)时入口不隐藏 —— 反 X8 回归;
 * 2. completed 携带余下机会时,「可用」判定与再次核销放行都成立;
 * 3. 标题旁动作的 completedAt 在仍有机会时为 null(展示可点击「重置」而非「已重置」)。
 *
 * 运行：cd packages/ui && node --import tsx --test test/codingPlanQuotaResetX8.test.ts
 */

function makeEntry(
  overrides: Partial<CodingPlanQuotaResetUiEntry> = {},
): CodingPlanQuotaResetUiEntry {
  return {
    status: "available",
    opportunityCount: 1,
    opportunityExpiresAt: Date.now() + 60_000,
    startedAt: null,
    completedAt: null,
    idempotencyKey: "idem-1",
    quotaOverridePending: false,
    ...overrides,
  } as CodingPlanQuotaResetUiEntry;
}

const usageItems = [
  { color: "red", id: "fiveHour", label: "五小时", percentage: 100, resetTime: "—", value: "100%" },
];

function makeResetUi(entry: CodingPlanQuotaResetUiEntry | null, opportunityVisible: boolean) {
  return {
    entry,
    opportunityVisible,
    processing: false,
    reset: async () => {},
    week: {
      entry: null,
      opportunityVisible: false,
      processing: false,
      reset: async () => {},
    },
  };
}

test("X8-a: 满额且仍有可用机会时,五小时重置行不被隐藏(反 quotaFull 门控回归)", () => {
  // 旧实现因 quotaFull(剩余 100%)在此返回不含该行;修复后仅看 opportunityVisible。
  const config = buildCodingPlanQuotaResetDialogConfig({
    fiveHourEnabled: true,
    resetUi: makeResetUi(makeEntry(), true),
    usageItems,
    weekEnabled: false,
  });
  const fiveHour = config.resetItems.find((item) => item.resetType === "FIVE_HOUR");
  assert.ok(fiveHour, "满额 + opportunityVisible 时五小时重置行必须出现在弹框配置中");
  assert.equal(fiveHour.count, 1);
});

test("X8-b: opportunityVisible=false 且非 completed/processing 时行才隐藏", () => {
  const config = buildCodingPlanQuotaResetDialogConfig({
    fiveHourEnabled: true,
    resetUi: makeResetUi(makeEntry(), false),
    usageItems,
    weekEnabled: false,
  });
  const fiveHour = config.resetItems.find((item) => item.resetType === "FIVE_HOUR");
  assert.equal(fiveHour, undefined, "无可用机会且非过渡态时应隐藏");
});

test("X8-c: completed 携带余下机会时行仍可见(多张机会核销一张后的正态)", () => {
  const completedWithRemaining = makeEntry({
    status: "completed",
    opportunityCount: 2,
    opportunityExpiresAt: Date.now() + 120_000,
    completedAt: Date.now() - 1_000,
  });
  const config = buildCodingPlanQuotaResetDialogConfig({
    fiveHourEnabled: true,
    resetUi: makeResetUi(completedWithRemaining, true),
    usageItems,
    weekEnabled: false,
  });
  const fiveHour = config.resetItems.find((item) => item.resetType === "FIVE_HOUR");
  assert.ok(fiveHour, "completed 携带余下机会时行必须保留");
  assert.equal(fiveHour.count, 2, "余下张数如实携带");
});

test("X8-d: hasUsableCodingPlanQuotaResetOpportunity 的四条边界", () => {
  const now = Date.now();
  assert.equal(hasUsableCodingPlanQuotaResetOpportunity(makeEntry(), now), true);
  assert.equal(
    hasUsableCodingPlanQuotaResetOpportunity(makeEntry({ status: "processing" }), now),
    false,
    "processing 中不可再次核销",
  );
  assert.equal(
    hasUsableCodingPlanQuotaResetOpportunity(makeEntry({ opportunityCount: 0 }), now),
    false,
  );
  assert.equal(
    hasUsableCodingPlanQuotaResetOpportunity(makeEntry({ opportunityExpiresAt: now - 1 }), now),
    false,
    "已过期机会不可核销",
  );
  assert.equal(
    hasUsableCodingPlanQuotaResetOpportunity(
      makeEntry({ status: "completed", opportunityCount: 1 }),
      now,
    ),
    true,
    "completed 携带的余下机会同样可核销",
  );
  assert.equal(hasUsableCodingPlanQuotaResetOpportunity(null, now), false);
});

test("X8-e: startCodingPlanQuotaResetManualUse 对 completed 携带机会放行(不再只认 available)", () => {
  const now = Date.now();
  const completedWithRemaining = makeEntry({
    status: "completed",
    opportunityCount: 1,
    completedAt: now - 2_000,
  });
  const processing = startCodingPlanQuotaResetManualUse(completedWithRemaining, "idem-new", now);
  assert.ok(processing, "completed 携带余下机会时应放行进入 processing");
  assert.equal(processing?.status, "processing");
});

test("X8-f: resolveCodingPlanQuotaResetActionCompletedAt 仍有机会时返回 null", () => {
  const now = Date.now();
  // 仍可核销 → 标题旁展示可点击「重置」而非「已重置」
  assert.equal(
    resolveCodingPlanQuotaResetActionCompletedAt({
      entry: makeEntry(),
      opportunityVisible: true,
    }),
    null,
  );
  // 无机会的 completed → 展示「已重置」
  assert.equal(
    resolveCodingPlanQuotaResetActionCompletedAt({
      entry: makeEntry({ status: "completed", opportunityCount: 0, completedAt: now }),
      opportunityVisible: false,
    }),
    now,
  );
});
