import { describe, expect, it } from "vitest";

import { resolveKeepAliveCacheHitRatio } from "../src/runtime/methods/cache-keep-alive.js";

/** 148⑤：保活命中率观测的分母/分子防御与钳制。 */
describe("resolveKeepAliveCacheHitRatio", () => {
  it("computes ratio and clamps to 1", () => {
    expect(resolveKeepAliveCacheHitRatio(100_000, 95_000)).toBeCloseTo(0.95);
    expect(resolveKeepAliveCacheHitRatio(1_000, 5_000)).toBe(1);
  });

  it("returns null when evidence is missing", () => {
    expect(resolveKeepAliveCacheHitRatio(undefined, 100)).toBeNull();
    expect(resolveKeepAliveCacheHitRatio(0, 100)).toBeNull();
    expect(resolveKeepAliveCacheHitRatio(1_000, null)).toBeNull();
    expect(resolveKeepAliveCacheHitRatio(1_000, undefined)).toBeNull();
  });
});
