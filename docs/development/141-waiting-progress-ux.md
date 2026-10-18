# 141 · 每个运行中工具的进度条 + 本轮已运行时长

## 问题

用户反馈「有时候感觉卡住了，没有进度」「每个正在执行的要有进度条」。139 只修了 `TaskOutput` 的阻塞心跳，其余运行中工具没有统一的时间信号：

1. **Bash 长命令**：执行适配器每 1s（2s 后）发 `ToolCallProgress.elapsedMs`，投影也把 `row.progress` 传进 UI 的 `raw.progress`；但 `ExecuteToolCallBlock` / `ExecuteGroupToolCallBlock` 不消费它。用户只看到「运行中 · 命令」和一个转圈，30s 的 `pnpm build` 与卡死无法区分。
2. **其他工具**：Read/Edit/Agent/未知工具等运行中没有进度条，也没有「已等待多久」；只有 MCP 服务端主动发 `notifications/progress` 时才有。
3. **模型思考/回合进行中**：`ConversationTurnGroup` 的 `ChatLoading` 只有扫光动画，没有时长。`turnHeader.startedAt` 是 projection 的权威事实，却只用于耗时统计，没有展示。

## 决策

- **每个运行中工具都有进度条**：`ToolCallBlock` 通过 `ToolRunningProgressProvider` 下发 `{ startedAt, progress }`，`ToolLayout` 在摘要行统一渲染：
  1. 服务端 `progress`（含 fraction/message/elapsedMs）优先；
  2. 没有服务端进度时，用工具行 `startedAt` 的本地计时显示「已等待 Ns」；
  3. 连 `startedAt` 都没有（旧快照）时，至少显示 indeterminate 进度条。
- 渲染器自己的状态位（`showStatusLabel`，如 MCP/TaskOutput/Bash）仍然优先，避免双进度条；MCP 的进度从 secondary 文本移到 statusLabel。
- **本轮时长**：`ChatLoading` 旁显示「本轮已运行 Ns」，起点取 `turnHeader.startedAt`。**可见性仍只由 `eligible`（running）决定**，计时器只更新文本，不参与投影或显隐判断——避免 139 之后「projection 更新重启计时」的问题。
- 不伪造百分比、不做服务端心跳改造：没有总量时，进度条保持 indeterminate，时长本身就是进度信号。

## 契约

| 层         | 改动                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI（通用） | `ToolRunningProgressContext` 由 `ToolCallBlock` 提供；`ToolLayout` 在 `isRunning && !showStatusLabel` 时渲染 `ToolCallProgressIndicator`，进度源按「服务端 progress → startedAt 计时 → 仅 indeterminate」降级 |
| UI（Bash） | `ExecuteToolCallBlock` / `ExecuteGroupToolCallBlock`：`isRunning` 且 `raw.progress` 在场时，`statusLabel` 渲染 `ToolCallProgressIndicator`，并 `showStatusLabel`；组摘要只报最新活动子命令                    |
| UI（MCP）  | 运行中进度改走 `statusLabel` + `showStatusLabel`，与通用规则互斥，避免双条                                                                                                                                    |
| UI（Turn） | `TurnChatLoadingSlot` 增加 `startedAt?: number`；running 时渲染 `chat.turn.runningFor`（「本轮已运行 {duration}」），ticker 1s                                                                                |
| 文案       | `chat.turn.runningFor` zh/en                                                                                                                                                                                  |
| 格式化     | 抽取 `formatElapsedDuration` 到 `lib/elapsedDuration.ts`，进度条与回合时长共用                                                                                                                                |

## 边界

- 终态不显示；通用进度条只在 `isRunning` 时出现。
- 本地计时只用于展示，不写回投影、不改变工具状态；`startedAt` 缺失时不伪造时长。
- 只有 `in_progress` 算「正在执行」；`pending` / 等待审批不画进度条（等待用户操作不是工作进度）。
- 请求重试（`ChatApiRetryStatus`）时仍显示本轮时长；attempt 计数语义不变。
- 手机 Web 与桌面共用同一组件，不新增布局分支；窄屏下时长为次要信息，允许换行前压缩。
- 不使用 `ToolHeaderRow` 的时间替代工具时间：工具行优先用自身 `startedAt`。

## 验证

- `packages/ui/test/executeToolCallBlock.test.tsx`：有 progress 显示「已等待 15s」；无 progress 显示 indeterminate 条且无时长。
- `packages/ui/test/executeGroupToolCallBlock.test.ts`：组摘要显示最新活动子命令的「已等待 42s」；全部完成时不显示。
- `packages/ui/test/v4ConversationTurnGroup.test.ts`：running 且 header.startedAt 在场时显示「本轮已运行 12s」；缺失 startedAt 时不显示。
- `packages/ui/test/toolCallBlocks.test.ts`：任意执行中工具（Read）都有进度条与「已等待 Ns」；`startedAt` 缺失时只有 indeterminate 条；`pending`（尚未执行）不画进度条。
- `pnpm --filter @zcode/ui test`（或受影响文件）、typecheck、lint、fmt。

## 验证结果（2026-10-18）

- 通过：新增 9 条 UI 用例（Execute 2、ExecuteGroup 2、TurnGroup 2、通用工具 3）；`pnpm typecheck` 全仓通过；受影响工具卡 49 条通过；改动文件 oxlint 0 error（`v4ConversationTurnGroup.test.ts:559` 的 spread 警告是既有代码）。
- 未执行：桌面/手机 E2E 与真机视觉验证；本次只改摘要行文本与既有进度组件接线，未改布局结构。
- 既有失败：`executeToolCallBlock.test.tsx` 的首条用例断言「输出结果」标签，但 `ExecuteOutput` 当前不渲染该标签（与本次改动无关，未修）。
