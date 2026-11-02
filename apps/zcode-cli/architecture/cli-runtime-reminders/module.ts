export const cliRuntimeRemindersModule = {
  id: "cli-runtime-reminders",
  requires: ["zcode-cli", "cli-memory-recall"],
  provides: ["runtime-reminder-projection"],
  publicEntrypoints: ["contract.ts"],
} as const;
