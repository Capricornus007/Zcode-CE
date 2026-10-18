# 145 · 输出速度对齐 DSH decode 口径

## 问题

ZCode 的 `tok/s` 与 DeepSeek Harness 不是同一算法：

- DSH：`decodeTokens / decodeMs`，`decodeMs` = 每个完成步 `firstTokenTime → completedTime`，`decodeTokens` = provider 返回的该步 outputTokens，整会话累计；只统计同时有首 token 与 outputTokens 的步。
- ZCode：UI 用 `streamingChars × 字符→token EWMA / 到达间隔` 做实时估算，步骤完成后再用 `outputTokens 增量 / 最后 delta tick − 首个 delta tick` 入 180s 滑动窗口，并对样本做 `<50 token`、`<300ms`、`>400 tok/s` 过滤。

两者分母边界、聚合范围和数据源都不同；客户端到达批次/重连重放还会让 ZCode 的样本需要防冲刷，进一步偏离。

## 决策

把解码速度改成**服务端权威事实**，UI 只在旧 CLI 缺少事实时回落本地估算：

1. core 的 `ModelComplete` payload 增加 `firstTokenAt`（本步首个非空 text/reasoning delta 的 epoch ms）；
2. V4 投影在 `usage` 上累计 `decode: { tokens, ms }`：只统计 `firstTokenAt` 与 `usage.outputTokens` 都存在的步；纯 tool-call 步、被取消的步不进入；
3. UI 的 `StreamSpeedPill` 优先消费 `usage.decode`，公式即 `tokens / (ms / 1000)`；没有该字段时保留现有实时估算/窗口逻辑；
4. 显示格式不变：`>=10` 取整，`<10` 保留一位小数。

这样 tok/s 与 DSH 的 `sessionStats.decodeTokens / decodeMs` 逐项一致。缓存命中口径本轮不改（DSH 用会话累计比例，ZCode 仍用 provider `hitRate`，属于另一个指标）。

## 契约

| 层                   | 改动                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| contracts            | `ModelCompletePayload.firstTokenAt?: number`                                                                                                      |
| core                 | `turn-model-step` 用既有的 `firstModelTokenAt(state.events, networkEventStartIndex)` 填 `firstTokenAt`；该函数在 usage 观测里原本就用于 TTFT 落库 |
| shared               | `sessionUsageStateSchema` 新增可选 `decode: { tokens, ms }`（旧 CLI/旧快照缺省）                                                                  |
| bootstrap projection | `onModelComplete` 累计 `decode`；`seedUsage` 保留/沿用 seed 的 decode，避免键级整体替换把它冲掉                                                   |
| UI                   | `StreamSpeedPill` 优先 `decode`；无 decode 时回落到 v3 估算                                                                                       |

## 边界

- 只有 `main_turn` 计入会话 `usage`；subagent/compact/title 步骤不进入速度。
- 没有首 token 的纯工具步不计入分子和分母；已有 decode 不会被后续无首 token 的步清空。
- 取消/失败的步没有 `ModelComplete`，与 DSH 一样不进入。
- 冷恢复/重连后 decode 事实从下一次主模型完成步重新累计；不伪造历史。
- `decode` 是 additive optional 字段，旧客户端忽略，新客户端对旧 CLI 回落。

## 验证

- `packages/ui/test/streamSpeedPill.test.ts`：DSH 除法、零值/缺失/NaN 防御（8/8）。
- `packages/ui/test/streamSpeedPillRender.test.tsx`：`usage.decode` 在场时显示权威值、不显示实时估算点；低速保留一位小数；旧 CLI 回落 `--`（3/3）。
- `apps/zcode-cli/packages/bootstrap/tests/product-projection.test.ts`：主模型步累计 `{tokens,ms}`；无首 token 的工具步不改写；seed 带 decode 时沿用（233/233）。
- `packages/shared/test/zcodeProtocol.test.ts` 75/75；`pnpm typecheck`、`@zcode/core`、`@zcode/bootstrap` typecheck 通过。
- 未执行：桌面/手机真机 E2E（tok/s 数值与 DSH 并排比对）。
