/**
 * cli-mcp-node-fallback 模块清单（architecture-governance managed 模块）。
 * 层：{ adapters: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const cliMcpNodeFallbackModule = {
  id: "cli-mcp-node-fallback",
  requires: ["zcode-cli"],
  provides: ["cli-mcp-node-fallback"],
  publicEntrypoints: ["contract.ts"],
} as const;
