/**
 * cli-workflow-model-failure-policy 模块清单（architecture-governance managed 模块）。
 * 层：{ adapters: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const cliWorkflowModelFailurePolicyModule = {
  id: "cli-workflow-model-failure-policy",
  requires: ["zcode-cli"],
  provides: ["cli-workflow-model-failure-policy"],
  publicEntrypoints: ["contract.ts"],
} as const;
