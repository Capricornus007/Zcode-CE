/**
 * cli-workflow-model-failure-policy 标准调用示例：只引用契约面，展示公开入口的取用方式。
 */
import * as surface from "./contract.js";

/** 契约面本身：调用方从这里按具名导出取用，不绕过 contract.ts 直接 import 实现。 */
export const cliWorkflowModelFailurePolicySurface = surface;
