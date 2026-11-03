/**
 * cli-input-prediction 对外契约：调用方要想正确使用就必须知道的部分。
 * 契约面直接重列实现文件的公开导出，避免与实现漂移；其余实现细节对外不可见。
 */
export * from "../../packages/bootstrap/src/zcode-protocol/input-prediction-handler.js";
export * from "../../packages/core/src/runtime/methods/input-prediction-sidecar.js";
