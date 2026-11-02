import { describe, expect, it } from "vitest";
import { memoryRecallRankerExample } from "./contract.example.js";
import { cliMemoryRecallModule } from "./module.js";

describe("cli-memory-recall contract", () => {
  it("returns bounded typed candidates", async () => {
    await expect(memoryRecallRankerExample.rank({ text: "example", limit: 1 })).resolves.toEqual([
      { id: "memory/example", score: 1, source: "memory" },
    ]);
    expect(cliMemoryRecallModule.provides).toContain("memory-recall-ranking");
  });
});
