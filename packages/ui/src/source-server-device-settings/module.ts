/**
 * source-server-device-settings 模块清单（architecture-governance managed 模块）。
 * 层：{ app: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const sourceServerDeviceSettingsModule = {
  id: "source-server-device-settings",
  requires: [
    "conversation-workspace-target",
    "remote-connection-flow",
    "remote-connection-tags",
    "services",
    "shared",
    "ui",
  ],
  provides: ["source-server-device-settings"],
  publicEntrypoints: ["contract.ts"],
} as const;
