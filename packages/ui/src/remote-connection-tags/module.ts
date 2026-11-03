/**
 * remote-connection-tags 模块清单（architecture-governance managed 模块）。
 * 层：{ app: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const remoteConnectionTagsModule = {
  id: "remote-connection-tags",
  requires: ["shared", "ui"],
  provides: ["remote-connection-tags"],
  publicEntrypoints: ["contract.ts"],
} as const;
