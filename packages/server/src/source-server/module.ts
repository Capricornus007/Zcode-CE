export const sourceServerTransportModule = {
  id: "source-server-transport",
  requires: ["server", "shared"],
  provides: ["source-server-transport"],
  publicEntrypoints: ["index.ts", "contract.ts", "transportAdapter.ts"],
} as const;
