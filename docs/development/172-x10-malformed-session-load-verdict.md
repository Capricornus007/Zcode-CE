# 172 · X10「个别异常消息导致会话加载卡住」core 侧复核结论

> 状态：**判别 spec（结论：矩阵"显著缺口"被推翻；core 侧不需要独立移植）**。矩阵明确要求复核"上游 49 处 vs CE 8 处是否真实反映能力缺口"。

## 0. 读了什么 / 复现的计数

| 口径 | 上游 | CE | 结论 |
| --- | --- | --- | --- |
| 矩阵原数 | 49 | 8 | 口径未给出，无法复现 |
| `malformed`（zcode-cli src，排除 tests/*.test.ts） | **13 行** | **14 行** | **持平，无缺口** |
| `malformed`（zcode-cli src 文件级） | 19 文件 | 14 文件 | 持平（差值为 contracts events、dynamic-workflow 注释） |
| `malformed`（含 tests） | 103 行 | 14 行 | 差值 ≈ 90 行**全部是测试文件** |
| `malformed`（全仓 apps+packages，含 tests） | 188/87 文件 | 25/14 文件 | 同上：差值是测试 |
| 根因 | 上游 core 244 / bootstrap 223 / adapters 146 / contracts 45 个测试文件 vs CE 10 / 7 / 2 / 0（且 CE core 无 vitest，测试入 `test/` 走 node:test，见 `scripts/run-tests.mjs`） | | CE fork 时整体未带上游测试 |

**结论：矩阵的"49 vs 8"不反映能力缺口——src 层 malformed 处理在 CE 与上游 3.15.1 持平；计数量级差几乎全部来自 CE fork 时系统性丢弃的上游测试文件。**（这也印证了 ui-features 166 spec 对 X1 计数"不可复用"的同类判断：矩阵的对照计数口径未存证，须逐条复核。）

## 1. 上游 3.15.1 中与"会话加载 + malformed"相关的真实改动（core 内）

1. **`agent/message-history.ts` + `agent/agent-listing-metadata.ts`（上游独有）**：`cloneRuntimeMessageMetadata` 从浅拷贝 ({...metadata}` 改为对 `agentListingDelta` 调 `parseAgentListingDelta` 校验——**持久化消息里的 listing delta 若形态损坏（类型错/长度不等/集合相交），恢复时丢弃该字段而不是原样传播**。这是会话历史重建路径（message-history / session-history-hydrator）上唯一"malformed 持久化元数据要自愈"的加固。形态约束：addedTypes/addedLines/removedTypes 均为字符串数组且 addedTypes.length === addedLines.length、集合内无重复、added 与 removed 无交集。
2. `session-history-hydrator.ts` 的其余改动（bot_topic_context 过滤、`input.history.addEntries` 重构）属 F8 的载体，非 X10。
3. `bootstrap/src/session-transcript.ts`（会话 transcript 加载入口）、`bootstrap/src/zcode-protocol-v4/transcript-hydration.ts` 中与 malformed 相关的守卫（`parseJsonObject` 的 try/catch、safeParse）**两树一致或为 F2 附属**，未见 X10 专属修复。
4. UI 侧 `packages/ui/src/lib/zcodeSessionRestore.ts`（上游独有）：`resumeSession` 失败时退回 legacy task 快照 + 模型不可用降级——属"会话恢复容错"，在 ui-features 范围。

**诚实边界**：上游 3.15.1 是单 squash 提交（`aac47556`），无法按 commit 拆出 X10 的唯一修复点；以上 1 是**形态最匹配**（会话加载路径上丢弃 malformed 持久化字段）的 core 侧改动，但不能断言它就是 X10 的全部修复。

## 2. 决策

- **X10 在 cli-runtime 范围内降级为"已对齐，不独立移植"**：
  - src 层 malformed 处理持平（§0），无能力缺口可补；
  - 唯一形态匹配的加固（parseAgentListingDelta 校验）与 F8 的 agent listing 载体**强耦合**——单独搬它没有消费方（CE 无 agent listing delta 概念）。若 CE 将来移植 F8 的 bot 话题/agent listing，该加固随 F8 一体带入（core-services 范围，矩阵 F8 主责已归 core-services）。
  - CE 的会话加载主路径（`session-transcript.ts`、`transcript-hydration.ts`、core 的 message-history/session-history-hydrator）与上游在 malformed 相关守卫上一致。
- **若需要主动加固**（可选、非本任务必需）：对 CE 会话历史重建中**有明确形态约束的已知持久化字段**补"校验失败即丢弃该字段"的同款 pattern。候选由实现时枚举（目前 CE 的 RuntimeMessageMetadata 已知字段中无等价的"可能 malformed 的结构化增量"），**无明确候选前不动**——避免为对齐而引入没有消费方的校验代码（AGENTS.md：不增加兜底分支）。

## 3. 回传口径给 Lead

矩阵 X10 行分类由 **A（移植）** 建议改为 **B/C（参考）**：core 侧无需移植；X10 的客户端修复主体在 UI（`zcodeSessionRestore.ts`，ui-features）。证据见 §0 计数与 §1 逐文件比对。

## 4. 验证

本 spec 无代码改动；复核使用的只读命令：`grep -rn -i malformed` 分口径计数（src/src+tests/全仓）、`diff -u` 逐文件比对 hydrator 链路、`git -C 上游 worktree log`（确认 squash 单提交）。
