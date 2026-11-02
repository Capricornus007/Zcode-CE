export const cliContextRemainingToolModule = {
  id: "cli-context-remaining-tool",
  requires: ["zcode-cli"],
  provides: ["context-remaining-tool"],
  publicEntrypoints: [
    "contract.ts",
    "../../packages/contracts/src/tools/get-context-remaining.ts",
    "../../packages/core/src/tool/handlers/get-context-remaining.ts",
  ],
} as const;
