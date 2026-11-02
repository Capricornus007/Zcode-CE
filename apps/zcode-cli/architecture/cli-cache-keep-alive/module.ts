export const cliCacheKeepAliveModule = {
  id: "cli-cache-keep-alive",
  requires: ["zcode-cli"],
  provides: ["cache-keep-alive-policy"],
  publicEntrypoints: ["contract.ts"],
} as const;
