import type { MemoryRecallRanker } from "./contract.js";

export const memoryRecallRankerExample: MemoryRecallRanker = {
  rank: async ({ limit }) => [{ id: "memory/example", score: 1, source: "memory" }].slice(0, limit),
};
