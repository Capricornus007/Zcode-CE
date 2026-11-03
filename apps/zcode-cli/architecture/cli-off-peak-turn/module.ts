/**
 * cli-off-peak-turn 模块清单（architecture-governance managed 模块）。
 * 层：{ app: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const cliOffPeakTurnModule = {
  id: "cli-off-peak-turn",
  requires: ["shared","zcode-cli"],
  provides: ["cli-off-peak-turn"],
  publicEntrypoints: ["contract.ts"],
} as const;
