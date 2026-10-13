# 141 — 工作流协议 v3.15.1 漂移整体搬运（F6 / F7 / X2 + holes 原子单元）

## 目的

上游 v3.15.1 对 zcode-protocol-v4 工作流面做了一次**语义重构**。CE HEAD（003870d）的对应文件处于 v3.14.3（29628c9）状态，本轮把漂移**整体**搬到 3.15.1 形态。

## 为什么是原子整体搬运

- 16 个 shared v4 文件相对 29628c9 的差异**全部只是注释去 markdown 强调**（已用与 copyFormatGuard 相同口径的变换逐一核实：29628c9 原文去强调后与 CE 逐字节相同），无 CE 语义分叉；唯一例外 zcode-protocol-v4/index.ts 仅多 3 行 fce07b1 留下的本地注释。
- workflow-runs-reducer 一次 import 多个新文件（workflow-runs-actor-session、workflow-runs-holes…），row-meta 与 reducer 与 F6/F7/X2 的字段强耦合，拆开会留破中间态（PROTOCOL-V4-LANDING 先例）。
- Lead 裁定：holes（留白）**不在公告 11 项内**，但随 F6/F7 原子单元一并搬运，须在 upstream-sync 台账与 release-notes 里如实登记为「随 F6/F7 原子单元一并搬运」，不得写成公告功能。

## 范围

| 项            | 内容                                                                                                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F6 并发重构   | workflow-runs-concurrency.ts：run-started 载荷记 concurrencyCeiling（默认并发 D）；「两条界」——ceiling（共享桶水位，可自动增长到 2D）与 limit（run 自己的界，amendWorkflowRunSettings 改它）；ceiling 计算优先 run.concurrencyCeiling，旧 CLI 不发时退回 Math.max 推导 |
| F6 创建前调参 | command.ts 拆出 create-session-config.ts（createSessionRequestedConfigSchema：请求覆盖字段，不复用 snapshot 的 partial——后者会把「没传 mode」误变成「切回 build」）                                                                                                    |
| F6 拒绝词表   | workflow-command-rejections.ts：startSavedWorkflow / resumeWorkflowRun 的 fault 前缀与 reason 枚举                                                                                                                                                                     |
| F7 子代理模型 | WorkflowRunActor 新增 model 字段（persona 点名模型时宿主解析的规范串 providerId/modelId[$level]，缺席 = 跑在 run 的子代理模型上）；amendWorkflowRunSettings 的 subagentModel 三态（省略 = 沿用，null = 回会话模型，值 = 设定）                                         |
| X2            | workflow-runs-actor-session.ts：actor sessionId 跟随「转录此刻在哪」——缓存命中结算的 sourceSessionId / 派发后回本 run 会话；修复恢复/修订后转录面板指向不存在会话只剩 error+retry                                                                                      |
| holes         | workflow-runs-holes.ts（新）+ row-meta 的 hole kind / fill / phaseStreams 等：上游工作流留白（脚本留白与补全行）。非公告功能，随原子单元搬运                                                                                                                           |
| 其它漂移      | workflow-runs.ts / reducer / entries / started / eviction / phases / delta / caps / actor-status / tables / unlisted / legacy / row-meta / coalesce / transport 等：全部取上游 3.15.1 形态                                                                             |

## 状态所有者

- 归约 pure function（无时钟、无 I/O）：reducer 系列文件。
- CLI（bootstrap app，cli-runtime-port）铸 run-started 载荷时拼入 concurrencyCeiling（进程事实 D，与 resumedFrom 同一先例）。
- UI 消费 ceiling/limit 两界（ui-features-port）。

## 验收

- 搬运后 shared v4 文件逐字节等于上游 3.15.1（除注释去强调 + v4 index 保留的 3 行本地注释）。
- packages/shared typecheck 通过；新增 golden 浴试（CE 风格 node:test）覆盖：ceiling/limit 两界语义、actor sessionId 迁移、actor.model。
- 报告列出搬运清单与 holes 登记。
