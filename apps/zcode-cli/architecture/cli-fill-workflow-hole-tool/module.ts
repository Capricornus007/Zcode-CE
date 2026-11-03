/**
 * cli-fill-workflow-hole-tool 模块清单（architecture-governance managed 模块）。
 * 层：{ app: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const cliFillWorkflowHoleToolModule = {
  id: "cli-fill-workflow-hole-tool",
  requires: ["zcode-cli"],
  provides: ["cli-fill-workflow-hole-tool"],
  publicEntrypoints: ["contract.ts"],
} as const;
