/**
 * packaging-staging 模块清单（architecture-governance managed 模块）。
 * 层：{ app: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const packagingStagingModule = {
  id: "packaging-staging",
  requires: ["zcode-server-cli"],
  provides: ["packaging-staging"],
  publicEntrypoints: ["contract.ts"],
} as const;
