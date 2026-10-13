# 171 · F6/F7 core 侧：确认窗调参链路 + per-subagent 模型运行时对齐

> 状态：**已实现（core 侧链路，2026-10-13）**。覆盖公告「工作流支持创建前调参、运行中改并发和保存复跑」的 core 侧调参链。「per-subagent 模型」的运行时本身是空操作（F7 结论：CE 已对齐），公告对应的真实缺口是确认窗调参链（属 F6）。
> 上游来源：`aac47556`（Apache-2.0）。

## 0. 读了什么 / 结论一致性

| 材料                                                                  | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT-MATRIX F7 行「23 处（缺 per-subagent override）」                | **推翻（就运行时而言）**：CE 的 per-subagent 模型 override 运行时**已完整存在**。逐符号比对上游/CE core src：`runtime/methods/subagent.ts`（`overrideSelection`/`modelOverride`/`inheritedModel`/`createSubagentOverrideModelFactory`）、`runtime/methods/turn.ts`/`turn-tools.ts`/`turn-loop-state.ts`/`tools.ts`/`streaming-tool-coordinator.ts`（`subagentModelOverride` 透传）、`subagent/runner.ts`（`modelOverride.background === "deny"`、`hasForegroundModelOverride`）、`tool/executor/{call-runner,batch-runner,types}.ts`、`runtime/methods/dynamic-workflow-run-settings.ts`（`subagentModel` 归一化/`amend`/`fromTo` diff）——上游 28 处引用与 CE 28 处 **1:1 对齐**。唯一差：上游把 amend 的 turn 处理拆到 `dynamic-workflow-run-settings-turn.ts`（CE 保留在合并文件内，非能力差）。**结论：F7 的"运行时移植"本身是空操作；真正的缺口是「经确认窗调整 subagent_model/max_concurrency」的工具+执行器链路（属 F6），CE 完全没有。** |
| 上游 `tool/handlers/workflow-settings-adjustment.ts`（200 行，CE 无） | 确认窗调参的三件事：`resolveInput` 回填 `adjustable_settings` 块、批准后把应答改动落入入参（`applyInputAdjustments`）、结果文案说明用户改过设置。依赖 contracts 的 `parseWorkflowSettingsAdjustment`/`WorkflowAdjustableSettings`/`WorkflowSettingsAdjustment`（上游 `contracts/src/tools/workflow-settings.ts`，CE 无）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 上游执行器链路（CE 全缺）                                             | `tool/executor/permission-input-adjustments.ts`（把 broker 返回的 `inputAdjustments` 交给工具自己的 `applyInputAdjustments`）、`permission-response.ts`（`applied` 透传）、`call-runner.ts:355/471`、`permission-flow.ts:322/330`。`ToolEntry` 接口加 `resolveInput` + `applyInputAdjustments`（上游 `tool/types.ts:350-363`）。**这是所有工具的确认窗改动落回入参的通用机制，不只服务工作流。**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| CE 现有 dangerousCommandPolicy 测试                                   | `test/dangerousCommandPolicy.test.ts` 断言危险命令永不生成 `:*` 前缀规则——调参链路落进入参后必须仍过工具运行时 schema（上游注释同款约束），不得为调整另开路径。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 1. 产品规则

1. **调参在创建前（CreateWorkflow/AmendWorkflow 确认窗）、并发调整在运行中**；两者共用同一套三态语义：字符串 → 经目录解析成规范形；`null` → 删键（会话模型/默认并发）；数 → 向下取整到至少 1、无上限。
2. **窗里选的模型此刻解不出来（被删/被停用/宿主无目录）：整次调用失败，什么都不启动**（上游 `adjustedModelFailure` 语义，错误码 `workflow_subagent_model_unresolved`）——禁止"先启动再失败"。
3. **落定后的入参必须仍过工具运行时 schema**：handler 只认一种形状，不为调整另开一条路；不合法 → `workflow_settings_adjustment_invalid` 整次失败。
4. **伪造的 `adjustable_settings` 无效**：`resolveInput` 无条件覆盖模型给的值（withWorkflowAdjustableSettings 先剥离再回填）。
5. **只有真正生效的改动进 `applied**`（与入参原值相同的改动不算生效），结果文案只说改了的那一半——否则模型会以为自己传的值在生效，甚至去"纠正"一个正按用户意思在跑的 run（上游注释原意）。
6. **回填块的端口条件**：`dynamicWorkflowRunPort` 在场才写 `concurrency_ceiling`；`modelCatalogPort` 在场才允许 `subagent_model`（宿主解不了模型名时窗里只让调上界，不得把接线缺口记到用户头上）。
7. **per-subagent override 的既有运行时不变**（规则来自上游与 CE 已对齐的现有实现）：override 优先于会话模型；`background: "deny"` 的 override 拒绝后台子代理。

## 2. 状态所有者

| 状态                       | 唯一所有者                                                                | 读取方                                                                  |
| -------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 待批准的调用入参（含调整） | tool executor（`permission-input-adjustments.ts` 产出的 `input`）         | handler 执行                                                            |
| 已生效的调整（`applied`）  | `ToolInputAdjustmentResult.applied`                                       | handler 结果文案、permission response                                   |
| subagent_model 规范形      | 模型目录端口（`modelCatalogPort.listModels()` + `resolveModelReference`） | 确认窗选择项、归一化                                                    |
| 运行中并发                 | workflow run 记录（bootstrap/协议，task-1）                               | 本 spec 的 amend 接入点在 `dynamic-workflow-run-settings.ts`（CE 已有） |

## 3. 接口（core 内）

| 文件                                                                      | 改动                                                                                                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool/handlers/workflow-settings-adjustment.ts`                           | **逐字节搬运**上游 200 行（Apache-2.0 + `Modified by ZCode:`）。                                                                             |
| `tool/executor/permission-input-adjustments.ts`、`permission-response.ts` | 新建（搬运），`call-runner.ts`/`permission-flow.ts` 按 upstream 接入 `inputAdjustments`。                                                    |
| `tool/types.ts`                                                           | `ToolEntry` 加 `resolveInput?` 与 `applyInputAdjustments?`（可选项——未实现的工具保持原行为）；加 `ToolInputAdjustmentResult`。               |
| CreateWorkflow/AmendWorkflow handler                                      | 接入 `withWorkflowAdjustableSettings`/`applyWorkflowSettingsAdjustments`/`describeWorkflowRunSettings`（具体接入点实现时按上游 diff 确认）。 |

## 4. 范围外依赖（需子任务）

| 依赖                                                                                              | 落点                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkflowSettingsAdjustmentSchema`/`parseWorkflowSettingsAdjustment`/`WorkflowAdjustableSettings` | `apps/zcode-cli/packages/contracts/src/tools/workflow-settings.ts`（**contracts 无主**，建议归 core-services-port）——与 170 的 contracts 依赖合并成一个子任务。 |
| run-settings 命令协议 / runs-concurrency                                                          | `packages/shared/src/zcode-protocol-v4/`（task-1 范围，矩阵已列）                                                                                               |
| 确认窗 UI                                                                                         | ui-features-port（163 spec）                                                                                                                                    |

## 5. 验收场景

| #   | 场景                                                | 期望                                                                                                              |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| B1  | CreateWorkflow 确认窗改 subagent_model 为合法规范串 | 入参落规范形；`applied.subagent_model` = 规范形；结果文案含 "subagents run on <model>"                            |
| B2  | 窗里选的模型已被删                                  | 整次 `workflow_subagent_model_unresolved` 失败，不启动                                                            |
| B3  | 窗里改 max_concurrency=3                            | 入参 3；文案 "at most 3 subagents run at once"                                                                    |
| B4  | 窗里把 max_concurrency 设为 null                    | 键删除（回默认）；文案 "back to the default"                                                                      |
| B5  | 调整后的入参不合法（schema 不过）                   | `workflow_settings_adjustment_invalid` 整次失败                                                                   |
| B6  | 伪造 adjustable_settings（模型自己传）              | 剥离后回填真值，伪造无效                                                                                          |
| B7  | 未改动（值与入参原值相同）                          | `applied` 为空，文案不说话                                                                                        |
| B8  | per-subagent override 运行时回归                    | CE 既有行为不变（本项若无既有测试，用上游 e2e `built-in-subagent-model-overrides` 的 case 子集写 node:test 断言） |

## 6. 测试（CE 口径）

`test/workflow-settings-adjustment.test.ts`（node:test + assert/strict，直接断言 `applyWorkflowSettingsAdjustments`/`withWorkflowAdjustableSettings` 的 B1-B7，mock `modelCatalogPort`/schema）；B8 视依赖落地另补。

## 7. 验证

`pnpm --dir apps/zcode-cli typecheck`、`pnpm --dir apps/zcode-cli lint`；`cd apps/zcode-cli/packages/core && node --import tsx --test test/workflow-settings-adjustment.test.ts`。

## 8. 搬运清单（Apache-2.0）

| CE 文件                                         | 上游路径           |
| ----------------------------------------------- | ------------------ |
| `tool/handlers/workflow-settings-adjustment.ts` | 同名（逐字节搬运） |
| `tool/executor/permission-input-adjustments.ts` | 同名（逐字节搬运） |

**偏离记录（按本地修改登记）**：

- `tool/executor/permission-response.ts` / `permission-request.ts` **未整体搬运**。上游用它们把 CE 既有 `permission-flow.ts`（CE 440 行）拆成三模块；CE 采用外科式合并——`permission-response.ts` 的 guarded user-once 应答形状校验（`validatePermissionResponse`）并入 `permission-flow.ts`，`permission-request.ts` 的请求管线 CE 已有等价内联实现（`racePermissionResponders` + `emitPermissionRequested`）。功能面等价，避免一次结构调整裹挟 CE 本地的 prePlanMode / memory-file / dangerousCommandPolicy 行为。
- CE 缺上游的 `workflow-script-models.ts`（脚本点名模型的展示，F6 另一特性），`describeWorkflowRunSettings` 的 `describeScriptModels` 参数因此未接线；调参链不受影响。
- CE 的并发语义与上游有分歧：CE 的 `clampWorkflowMaxConcurrency` 按天花板钳制（既有行为，保留），本链的 `normalizeWorkflowMaxConcurrency`（上游 F6 语义：无上限、向下取整）**只服务确认窗调整路径**。两路并存，见 `create-workflow-source.ts` 的内联注释。
- `DynamicWorkflowRunPort.defaultConcurrency` 为新增可选方法（上游 F6 把默认并发从天花板改为起点）；CE 既有 `concurrencyCeiling` 保留不动。

注：`call-runner.ts`/`permission-flow.ts`/`tool/types.ts`/`create-workflow.ts`/`amend-workflow.ts`/`create-workflow-source.ts` 为 CE 已有文件的**修改**（非搬运），按修改登记；未经确认不得把 CE 已有文件登记为"搬运"。
