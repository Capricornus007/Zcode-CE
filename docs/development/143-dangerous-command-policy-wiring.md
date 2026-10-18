# 143 · 工具策略（危险命令）接线回植

## 症状

设置页「工具策略」可以禁用内置危险命令、追加自定义危险命令，但保存后对运行时没有任何影响：Bash 仍按默认严格清单审批。

## 根因

`AppSettings.dangerousCommandPolicy` 与 `ToolExecutorDeps.dangerousCommandPolicy` 两端都在，中间全断：

- `packages/services/src/node.ts` 的 `resolveSessionRuntimePreferences` 不读该设置；
- `zcodeSessionRuntimePreferencesResultSchema` 不接受该字段（strict）；
- bootstrap 不把它写入 `runtimeConfig`，session record 也不存（子会话无法继承）；
- `RuntimeConfig` / `AgentRuntimeConfig` 没有字段；
- `createRuntimeToolExecutor` 装配时没传 `dangerousCommandPolicy`——`ToolExecutionContext.dangerousCommandPolicy` 永远是 undefined，Bash 权限判定走严格默认。

结果：设置页是「写了没人读」的死链路。与 142 的自适应思考同一种事故形态（3.15.1 整文件覆盖只留下实现、冲掉接线）。

## 语义（沿用 shared/dangerousCommands.ts，不新增规则）

| 字段                           | 语义                                                     |
| ------------------------------ | -------------------------------------------------------- |
| `disabledEntries`              | 从默认危险清单移除的条目；对应命令不再因「危险」触发审批 |
| `customEntries`                | 追加的危险模式（`pattern` / `enabled`）                  |
| `allowPersistentAuthorization` | 是否允许「始终允许」类持久授权                           |

解析仍由 `resolveDangerousCommandPolicy` 在 Bash handler 内完成；`undefined` = 严格默认。

## 修复链路

| 层               | 改动                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| services         | `resolveSessionRuntimePreferences` 返回 `dangerousCommandPolicy: settings.dangerousCommandPolicy`                   |
| 协议             | `zcodeSessionRuntimePreferencesResultSchema` 增加 `dangerousCommandPolicy: dangerousCommandPolicySchema.optional()` |
| bootstrap        | 偏好默认缺省、子会话 inherit、只在有值时写入 `runtimeConfig.dangerousCommandPolicy`、record 存引用                  |
| contracts / core | `RuntimeConfig`、`RuntimeConfigPatch`、`AgentRuntimeConfig` 增加可选字段                                            |
| config-merger    | 后层字段覆盖前层，数组整体替换                                                                                      |
| runtime-tools    | `createToolExecutor({ dangerousCommandPolicy: runtime.config.dangerousCommandPolicy })`                             |

## 护栏

`packages/ui/test/dangerousCommandPolicyWiring.test.ts` 钉死六个消费点（services、协议、bootstrap、contracts、merger、runtime-tools），防止再次被整文件覆盖静默断链。

## 验证

- `pnpm typecheck`（shared/services/ui/desktop）与 `@zcode/bootstrap`、`@zcode/core`、`@zcode/adapters` typecheck 0 错。
- `dangerousCommandPolicyWiring.test.ts` 4 条；core 既有 `dangerousCommandPolicy.test.ts` / `dangerousCommandReversibility.test.ts` 仍覆盖解析与审批行为。
- `packages/ui/test/chatStatus.test.ts` 删除无引用的 `shouldShowChatThinkingShimmer` 及其用例（V4 已由 `shouldShowTurnChatLoading` 承担）。
- 未执行桌面 E2E：设置页保存 → 新会话 Bash 审批行为的真机验证。
