export const streamSpeedPillModule = {
  id: "stream-speed-pill",
  requires: ["shared", "ui"],
  provides: ["stream-speed-projection"],
  publicEntrypoints: ["contract.ts", "../v4/composer/StreamSpeedPill.tsx"],
} as const;
