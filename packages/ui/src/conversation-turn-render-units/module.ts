/**
 * conversation-turn-render-units 模块清单（architecture-governance managed 模块）。
 * 层：{ app: . }。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const conversationTurnRenderUnitsModule = {
  id: "conversation-turn-render-units",
  requires: ["plugin-ui", "shared", "ui"],
  provides: ["conversation-turn-render-units"],
  publicEntrypoints: ["contract.ts"],
} as const;
