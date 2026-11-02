export const cliModelRequestStabilityModule = {
  id: "cli-model-request-stability",
  requires: ["zcode-cli"],
  provides: ["model-request-stability", "adaptive-reasoning-policy", "surrogate-sanitization"],
  publicEntrypoints: ["contract.ts"],
} as const;
