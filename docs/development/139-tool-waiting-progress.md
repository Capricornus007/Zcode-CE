# 139 · 工具长等待的可见进度（TaskOutput 心跳）

## 问题

用户反馈「任务正在执行，UI 没有进度」。排查确认：CLI 侧 `TaskOutput` 阻塞等待已有心跳
（`apps/zcode-cli/packages/core/src/tool/handlers/task-output.ts:39`，每 15s 发一次
`ToolCallProgress`，携带实时 `elapsedMs`），但**心跳在链路上被逐层丢弃**：

1. **契约 schema 缺字段**：`packages/shared/src/zcode-protocol-v4/toolDisplay.ts` 的
   `toolProgressSchema` 没有 `elapsedMs`——zod 直接剥掉；
2. **投影层整条丢弃**：`product-projection.ts` 的 `onToolCallProgress` 只在
   `fraction/total/message` 至少一个在场时产出 delta，纯 `elapsedMs` 心跳返回 `[]`；
3. **UI 不消费**：`ToolCallProgressIndicator` 只渲染 `fraction`（进度条）与 `message`，
   且 `TaskOutputToolCallBlock` 根本没挂这个指示器。

结果：长等待期间 UI 只有一个 indeterminate 转圈 +「正在获取任务输出」，
没有「已等待多久」——看起来像卡死。

## 修复

| 层   | 文件                                                    | 改动                                                                                                           |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 契约 | `shared/src/zcode-protocol-v4/toolDisplay.ts`           | `toolProgressSchema` 增 `elapsedMs`（nonnegative finite，optional）                                            |
| 投影 | `bootstrap/src/zcode-protocol-v4/product-projection.ts` | `onToolCallProgress` 透传 `elapsedMs`；判定条件纳入 elapsedMs（无其他字段时也产出 delta）                      |
| UI   | `ui/src/ToolCallBlocks/ToolCallProgressIndicator.tsx`   | 渲染「已等待 N」（`chat.toolCall.progress.waited`，<60s 显示 `Ns`，否则 `Mm SSs`）；`data-elapsed-ms` 观测属性 |
| 接线 | `ui/src/ToolCallBlocks/renderers/task-output.tsx`       | 运行中且有心跳时，摘要行 status 位显示进度指示器（优先于静态「正在获取任务输出」）                             |

设计取舍：**没有可量化总量时，等待时长本身就是进度信号**。不伪造百分比（自回归任务
无总量），也不新造工具状态；复用既有 `ToolProgress` 通道（MCP 进度已在用）。

## 验证

- `apps/zcode-cli/packages/bootstrap/tests/product-projection-bash-progress.test.ts`：
  新增 2 条——纯 elapsedMs 心跳投影为 `row.progress.elapsedMs`（此前整条丢弃）、
  无可用字段仍不产 delta；delta 通过 `conversationDeltaSchema`。
- `packages/ui/test/toolCallProgressIndicator.test.ts`：elapsedMs-only 渲染「已等待 15s」、
  分钟级格式、fraction+message+elapsed 共存、非法 progress 被丢弃。
- 全仓 typecheck / lint / fmt / architecture check。

## 边界

- 只在工具处于 `in_progress` 时显示；终态由投影清除 progress（既有语义）。
- Bash 的 outputPreview 分支不变（字节进度与 MCP 百分比仍各走各的）。
- 心跳间隔 15s 属运行时行为，UI 只反映最近一次心跳值；不做本地推断（避免与实际阻塞
  状态不一致）。

## 后续

Bash 心跳的 UI 消费与「本轮已运行」时长见 [141-waiting-progress-ux.md](./141-waiting-progress-ux.md)。
