# 142 · 自适应思考档回植（「自动」档消失）

## 症状

思考档选择器里没有「自动」；App 设置里 `adaptiveReasoningEnabled` 即使为 true，新建会话也不会开启自适应降档。

## 根因

2026-09-24 的链路（`a2b9ea30` + `fce8795a`）在 3.15.1 整版覆盖中被冲掉：

| 环节                                                                        | 丢失内容                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`                         | `withAutoThoughtLevelOption` 未调用；选项里没有 auto，选中 auto 也不写 App 设置 |
| `packages/services/src/node.ts`                                             | `resolveSessionRuntimePreferences` 不再返回 `adaptiveReasoningEnabled`          |
| `packages/shared/src/zcode-protocol/index.ts`                               | session 偏好响应 schema 不接受该字段（strict 会丢弃/报错）                      |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts` | 不读偏好、不写 `runtimeConfig.adaptiveReasoning`、record 不存字段               |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts`      | `ZCodeProtocolSessionRecord` 缺字段，子会话无法 inherit                         |

`thoughtLevelOptions.ts` 的 helper 与 core 路由都还在，但**没有任何调用方**——典型「实现幸存、接线死亡」。

## 修复

- UI：`thoughtOption` 用 `withAutoThoughtLevelOption` 插入「自动」；`currentValue` 在开关开启时显示 auto（该模型 ≥2 档才插入，避免受控 Select 出现列表外的值）。选项说明走 `chat.toolbar.thoughtLevel.auto.description` 本地化，不内嵌中文。
- 选中「自动」：`adaptiveReasoningEnabled=true` + 档位落顶档；选具体档位：关闭开关。Ctrl+T 循环也走同一 `selectThoughtLevel`，不会把 `auto` 字面量发给模型。
- services：`adaptiveReasoningEnabled: settings.adaptiveReasoningEnabled === true`。
- bootstrap：偏好默认 false、子会话 inherit、`runtimeConfig.adaptiveReasoning` 只在开启时写入、record 存字段。
- 协议：`zcodeSessionRuntimePreferencesResultSchema` 接受可选布尔。
- core 不变：会话配置优先，`ZCODE_ADAPTIVE_REASONING` 仅作 CLI/TUI 后备；工具续跑步降一档。

## 护栏

`packages/ui/test/adaptiveReasoningWiring.test.ts` 用源码断言钉死六个消费点（UI、AppSettings schema、services、协议、bootstrap、core）。这是跨文件接线，单测覆盖不到；任何整文件覆盖再次冲掉都会在测试阶段变红。

## 验证

- `pnpm typecheck`（含 shared/services/ui/desktop）与 `@zcode/bootstrap` typecheck 0 错。
- `packages/ui/test/thoughtLevelOptions.test.ts`：auto 插入/去重/单档不插/循环顺序/中英文案/自定义说明；`adaptiveReasoningWiring.test.ts` 4 条（合计 91 条通过）。
- core `adaptive-reasoning.test.ts` 9/9。
- `packages/shared/test/zcodeProtocol.test.ts` 75/75。
- 既有失败（与本次无关）：`protocol-unbound-resume.test.ts` 全量并行时 SQLite 场景 12 条失败，单条过滤运行通过。
