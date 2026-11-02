import { describe, expect, it } from "vitest";
import { contextRemainingReaderExample } from "./contract.example.js";
import { cliContextRemainingToolModule } from "./module.js";

describe("cli-context-remaining-tool contract", () => {
  it("projects a non-mutating bounded usage snapshot", () => {
    expect(contextRemainingReaderExample.read()).toEqual({
      contextWindow: 128_000,
      usedTokens: 32_000,
      remainingTokens: 96_000,
      remainingPercent: 75,
    });
    expect(cliContextRemainingToolModule.provides).toContain("context-remaining-tool");
  });
});
