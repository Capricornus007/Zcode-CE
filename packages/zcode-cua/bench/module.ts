export const zcodeCuaBenchModule = {
  id: "zcode-cua-bench",
  requires: ["zcode-cua"],
  provides: ["cua-machine-bench"],
  publicEntrypoints: ["contract.ts", "cua-bench.mjs"],
} as const;
