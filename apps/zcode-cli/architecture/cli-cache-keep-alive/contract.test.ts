import { describe, expect, it } from "vitest";
import { cacheKeepAlivePolicyExample } from "./contract.example.js";
import { cliCacheKeepAliveModule } from "./module.js";

describe("cli-cache-keep-alive contract", () => {
  it("never refreshes an ineligible runtime", () => {
    expect(cacheKeepAlivePolicyExample.decide({ eligible: false, idleForMs: 60_000, contextTokens: 1_000 })).toEqual({
      action: "skip",
      reason: "ineligible-runtime",
    });
    expect(cliCacheKeepAliveModule.provides).toContain("cache-keep-alive-policy");
  });
});
