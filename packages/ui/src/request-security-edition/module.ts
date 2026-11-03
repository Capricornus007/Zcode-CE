/**
 * ui-request-security-edition 模块清单（architecture-governance managed 模块）。
 * 层：{ app: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const uiRequestSecurityEditionModule = {
  id: "ui-request-security-edition",
  requires: ["services", "shared", "ui"],
  provides: ["ui-request-security-edition"],
  publicEntrypoints: ["contract.ts"],
} as const;
