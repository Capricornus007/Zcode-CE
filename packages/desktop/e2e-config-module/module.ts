export const desktopE2EConfigModule = {
  id: "desktop-e2e-config",
  requires: ["desktop", "shared"],
  provides: ["desktop-e2e-runner-config"],
  publicEntrypoints: ["contract.ts", "../wdio.conf.ts"],
} as const;
