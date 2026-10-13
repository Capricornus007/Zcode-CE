import type { ModelToolSideEffectScope } from "@zcode/contracts";
import type { PermissionToolCapability } from "../../permission/service.js";
import type { ToolEntry, ToolRuntimePermissionCapabilityContext } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";

export function resolveRuntimePermissionCapability(
  entry: ToolEntry,
  input: unknown,
  context: ToolRuntimePermissionCapabilityContext,
): PermissionToolCapability {
  const runtimeCapability = entry.resolvePermissionCapability?.(input, context);
  return {
    ...entry.metadata,
    ...runtimeCapability,
    // capability group is provenance, not a runtime/model-controlled override.
    permissionCapabilityGroup: entry.permissionCapabilityGroup,
    permission: {
      ...entry.permission,
      ...runtimeCapability?.permission,
    },
  };
}

/**
 * 一次调用**解析后**的副作用旗标，挂在 `ToolCallStarted` 上：与权限判定同一次解析，所以 Bash 的只读命令判定等运行时结论一并生效。
 * 订阅者（dynamic-workflow 的 driver）据它在 handler 动手之前判断这一笔是否会改写工作区。
 */
export function resolveToolCallCapabilityFlags(
  deps: ToolExecutorDeps,
  entry: ToolEntry,
  input: unknown,
): { readOnly?: boolean; sideEffectScope?: ModelToolSideEffectScope } {
  const capability = resolveRuntimePermissionCapability(
    entry,
    input,
    resolveRuntimePermissionContext(deps),
  );
  return { readOnly: capability.readOnly, sideEffectScope: capability.sideEffectScope };
}

export function resolveRuntimePermissionContext(
  deps: ToolExecutorDeps,
): ToolRuntimePermissionCapabilityContext {
  return {
    runtimeScope: deps.runtimeScope,
    workingDirectory: deps.getWorkingDirectory(),
    workspaceRoot: deps.getWorkspaceRoot(),
    // Modified by ZCode:F3 guarded 语义的注入点——模式与 shell 文法随上下文下发，
    // resolvePermissionCapability 的签名只收 (input, context)。getMode 缺席（TUI 之外的
    // 注入点未提供）时 context.mode 为 undefined，guarded 分支自然不触发，等于退到旧行为。
    mode: deps.getMode?.(),
    // 与 bash.ts 的 GUARDED_DEFAULT_DIALECT 配合：selection 缺席按 posix，不静默退回 YOLO。
    bashShellSelection: deps.getBashShellSelection?.() ?? deps.bashShellSelection,
    // 危险命令策略随上下文下发，而不是让 handler 自己去读 deps：
    // resolvePermissionRulePolicy 的签名只收 (input, context)，这是它唯一的注入点。
    // 缺席即严格（resolveDangerousCommandPolicy(undefined)）—— TUI / headless /
    // workflow_child 不设该字段，因此也落在产品默认的严格态。
    dangerousCommandPolicy: deps.dangerousCommandPolicy,
  };
}
