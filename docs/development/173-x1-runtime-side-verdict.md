# 173 · X1「加速回合中编辑的消息可能丢失」运行时侧判别

> 状态：**已实现（X1 运行时侧迁移，2026-10-13）**。判别结论已被 166 §3 的移交推翻并落地：X1 的主体修复不在 UI 侧，而是 v4 命令处理器 + core admission 的编辑重发链。本 spec 的旧结论「core 侧无上游 delta」作废（见 §0 更新）。主责仍在 cli-runtime-port（我）。

## 0. 读了什么 / 结论一致性

| 材料                         | 结论                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ui-features 166 spec         | 166 已判别：上游 `messageEdit                                                                                                                                                                                                                                                                            | editMessage | editedMessage` 在 UI 侧 **0 命中**，矩阵「16 vs 6」口径不可复用；X1 的"编辑"更可能是 composer 草稿/用户输入气泡在**加速（HighSpeed）回合提交路径**上的丢失；并设计了两分法：「丢失发生在 CommandInbox/transport 提交前 → 运行时（cli-runtime-port）；渲染投影 → UI」。**一致**：我的复核支持该两分法，且补运行时侧证据。 |
| CE core 输入提交路径 vs 上游 | `runtime/command-queue.ts`：两树逐字节一致。**`prompt-admission.ts` 的 `requireQueue` 分支正是 X1 修复的一半**（临时 provider 只能在独立 turn 的提升边界安装；编辑重发不能依据 busy 快照决定直接启动），已于 2026-10-13 移植（消费方：v4 editUserQuery 的编辑重发链）。旧判「与编辑/消息丢失无关」作废。 |
| 上游 3.15.1 中的 X1 修复点   | **未在 core 定位到 X1 专属修复**（上游为单 squash 提交 `aac47556`，无法按 commit 拆分）。core 内与"提交中编辑"相关的机制（`command-queue.ts`、`prompt-admission.ts`、`enqueueDeferredInput`、`InputDelivery: auto/start_turn/steer_active_turn`）两树对齐。                                              |
| CE 的 HighSpeed 路径         | CE 无 F2 HighSpeed 能力（矩阵 F2 行：CE 仅 2 处 selection 残留）。**X1 若与 HighSpeed 加速路径耦合，在 CE 可能不可复现**（166 spec 已提出该假设，我这里给运行时侧的佐证：`requireQueue` 的调用方在 CE 不存在）。                                                                                         |

## 1. 判别结论（运行时侧）

1. **上游 3.15.1 的 core 运行时对 X1 没有可移植的修复**：输入投递/排队核心件两树一致；唯一的 prompt-admission 差异是 F2 的耦合件。
2. **若 166 的两分法实验把丢失定位到"提交前"**（composer draft → 提交命令 → CommandInbox），则进一步追查点为：`bootstrap` 的 `app/input-facade.ts` 与 `v4-bridge`（core-services 范围）、core 的 `command-queue.ts` 入队顺序与草稿替换逻辑（两树一致 ⇒ 若 CE 复现丢失，**根因是 CE 自有改动或共享代码的历史缺陷**，不是 3.15.1 回填——须另立 bug 修复，不经本移植任务）。
3. **CE 无 HighSpeed**：若 X1 的复现依赖加速卡路径，X1 在 CE 记为「不适用（无该路径）」，与 166 的口径一致。

## 2. 交付口径

- 本 spec **无代码改动**。回传：矩阵 X1「运行时侧」在 cli-runtime 范围内为**空集**（无上游 delta），待 166 的 UI 判别结论；若判别指向运行时，按 §1.2 另立子任务（非本移植任务范围）。
- 与 166 的协同：166 的实验结论出来后，若落在运行时，由我在收到结论后细化本 spec 的 §1.2 排查路径为可执行步骤。

## 3. 验证

只读复核命令：`diff -u`（command-queue.ts / prompt-admission.ts，上游 worktree `.reverse/91-upstream-checkout/zai-org-ZCode-3151` vs CE）、`grep -rn 'steer_active_turn|InputDelivery'`（core src 定位投递语义）。注：`accelerat` 在上游 core src 仅命中 generated bash-command-registry.ts 的单行（该文件为单行 JSON，子串匹配无意义），不作为证据。

## 实现记录（2026-10-13，cli-runtime-port，task-8）

X1 主体按 166 §3 移交结论移植；上游 ref `aac47556`（Apache-2.0），工作树 `.reverse/91-upstream-checkout/zai-org-ZCode-3151`。

**搬运（Apache-2.0，文件内带 Modified by ZCode 标记）**：

- `bootstrap/src/zcode-protocol-v4/commands/handlers/fork-edit-retry.ts`：整文件替换（389 行）。① 编辑重发只认本次重新 prepare 的卡（`highspeedMeta.taskId === record.app.sessionId`、未过期、Selection 真指向加速 Provider），避免旧凭据/跨会话卡；② `preemptActiveTurnAndWait` 纳入 runtime-owned active turn（`getActiveTurnInfo`/`getActiveForegroundExecutionId`）；③ conversationQuotes 纯引用编辑放行；④ admission 竞态（`V4PromptRejectedError("activePrompt")`）时原子入队（`requireQueue`），堵住「旧消息已截断而新消息随异常丢失」的另一条路径。
- `bootstrap/src/zcode-protocol-v4/commands/handlers/canonical-intent-replay.ts`（新，131 行）：edit/retry 的 canonical intent 重发原语。
- `core/src/runtime/methods/prompt-admission.ts`：`requireQueue` 早返分支（上游同文件同形）。

**CE 偏离（登记为本地修改）**：

- 上游 `commands/input-admission.ts` 未整体移植：CE 的等价件（`hasPromptInput`/`V4InputAdmissionRejectedError`/`resolveSubmittedExecutionState`/`applyHeldQueueDisposition`）已在 `handlers/session-flow.ts`；`resolveSessionFallbackModelSelection` 在 canonical-intent-replay 内以 session-flow 解析器实现（见该模块头注释）。
- 上游 `handlers/highspeed-metrics.ts`（46 行，highspeed 指标）未移植：本链不消费。

**跟随扩展（实现搬运所必需的契约/类型，均小改）**：

- contracts：`HighspeedMessageMetadata` 接口 + `TurnInputIntentMetadata.conversationQuotes`/`highspeed` 字段；core `PromptAdmissionOptions.requireQueue`；bootstrap `SendInputOptions.requireQueue`。
- v4：`V4QueuedTurnExecution` + 宿主 `retain/read/delete/clearQueuedTurnExecutions` 内存凭据暂存口（可选方法；宿主实现仍缺，`canRetainQueuedHighspeed=false` 时退回会话常驻 Selection——与上游降级路径等价）；`prompt-turn` 的 `requireQueue` 参数；`input-intent` 三处 `conversationQuotes` 透传；`ConversationEditTarget.intent.conversationQuotes`。
- `ProductProjection` 的 conversationQuotes 投影透传（上游在 event-normalizer/projection-rows/transcript-hydration 等 8 处消费）未移植：X1 运行时链不依赖，引用快照在投影层的完整透传属 F2 UI 范围。

**验证**：`npx tsc --noEmit` 六包全绿；core 89（含新增 `test/x1-require-queue-admission.test.ts` 3）+ cli 8 + adapters 21 + tui 12 + bootstrap 51 = 181 测试全绿。未覆盖：fork-edit-retry 的端到端 handler 路径（上游 1493 行 native harness 未移植，其 mock 基建 CE 无对应件）；`retainQueuedTurnExecutions` 宿主实现缺失（降级路径已由类型保证）。

## 收口更新（2026-10-13 晚，技术清除三件）

三处未闭合项均已收口：

- **宿主暂存口实现**：`ConversationV4Gateway` 实现了 `retain/read/delete/clearQueuedTurnExecutions`（内存 Map，key=sessionId+sourceCommandId），两个消费点同步接线——`queue.ts` 的 sendQueuedNow 提升路径（同卡刷新优先、过期/凭据缺失退回会话模型并 warn、启动成功后销毁暂存副本）与 `session-flow.applyHeldQueueDisposition` 的 clearQueueAndSend 清理。类型保证的降级描述作废，现在是实现保证。
- **编辑重发关键路径测试**：未整搬上游 1493 行 harness；自建 `bootstrap/test/x1-fork-edit-retry.test.ts`（5 例，经 NATIVE_HANDLERS 注册表入口 + 最小 host/record 桩）覆盖 X1 四个判定点：跨会话卡不应用、过期卡退回会话模型、同会话有效卡写快照换 Selection 带执行材料、admission 竞态原子入队（requireQueue 重试 + warn 审计），外加纯引用编辑放行。
- **create-workflow.ts 拆分**：433 → `create-workflow.ts`（180，entry/schema/确认窗/权限声明）+ `create-workflow-handler.ts`（296，handler 与私有助手）。NOTE 常量与 `describeWorkflowConcurrencyLimit`/`resolveTraceContext` 在 handler 文件定义、entry 重导出，amend-workflow 的既有导入路径不变。

验证：六包 tsc --noEmit 全绿；core 89 + cli 8 + adapters 21 + tui 12 + bootstrap 56 = 186 测试全绿。
