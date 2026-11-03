/**
 * cli-turn-interrupt-reminders 模块清单（architecture-governance managed 模块）。
 * 层：{ app: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const cliTurnInterruptRemindersModule = {
  id: "cli-turn-interrupt-reminders",
  requires: ["zcode-cli"],
  provides: ["cli-turn-interrupt-reminders"],
  publicEntrypoints: ["contract.ts"],
} as const;
