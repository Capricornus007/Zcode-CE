export const cliMemoryRecallModule = {
  id: "cli-memory-recall",
  requires: ["zcode-cli"],
  provides: ["memory-recall-ranking", "memory-recall-reminder"],
  publicEntrypoints: ["contract.ts"],
} as const;
