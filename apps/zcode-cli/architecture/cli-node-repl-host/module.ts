/**
 * cli-node-repl-host 模块清单（architecture-governance managed 模块）。
 * 层：{ adapters: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const cliNodeReplHostModule = {
  id: "cli-node-repl-host",
  requires: ["node-repl-call-ledger","zcode-cli","zcode-cua"],
  provides: ["cli-node-repl-host"],
  publicEntrypoints: ["contract.ts"],
} as const;
