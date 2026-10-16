# 3.15.1 升级剩余测试工单清单（交接文档 · 2026-10-17）

升级主线（desktop + ui + server）已全绿：ui vitest 61 文件 1489 用例全过、ui node:test 358/0、
desktop 双轨全绿、双端 tsc 归零。本文档登记全仓 `run-tests.mjs` 剩余失败（约 20 处，分布在
services/bootstrap/dynamic-workflow/scripts 四个包）的精确定性与修法，全部为 CE 先行规格测试
（TDD 写了期望、实现未落地）或 Windows 原生层竞态。

## 1. packages/services · onboardingRecord 域（~6 败）

文件：`test/onboardingRecordDeviceMid.test.ts`、`test/onboardingDismissRpc.test.ts`、
`test/onboardingRecordService.test.ts`（收集失败）。

- 契约冲突：CE 测试钉「服务内 `resolveDeviceMid` 解析宿主身份，空值跳过写入」（C48）；
  官方实现 `onboardingRecordService.ts` 无该选项——`appendRecord(deviceMid, entry)` 直接落
  调用方传参（真实 UI 调用方 `OccupationOnboarding` 传 `platform.getDeviceId()`，等价宿主解析）。
- 修法（同 `onboardingAppendRecordDeviceMid.test.ts` 已提交适配，commit 88a8e211 批次）：
  断言改为「appendRecord 入参原样落盘」；skip-on-empty 边界改为断言入参原样存储；
  `onboardingDismissRpc` 与「症状 8225921」用例需传非空 deviceMid 后断言决策可读回。
- 注意：官方 impl 对新文件用 `createFile(deviceMid)` 存调用方原值；已有文件 mismatch 时
  沿用旧值并 warn——这两条官方语义保留。

## 2. packages/services · modelProviderCodingPlan（2 败）

测试 "Z.ai Start Plan 状态卡片隐藏续期时间…" 与 "Start Plan 刷新失败保留套餐…"：
`CodingPlanStatusPanel` 的 unavailable+retry 卡标题当前渲染 provider 名大写（"START"），
期望 `settings.modelProvider.planCard.startPlan`。修法：把 `resolveCodingPlanStatusCardTitle`
的结果接进 Detail/Panel 的 unavailable 卡分支（StatusCards.tsx 内 planTitle 已算好，
unavailable 分支漏用）。可先修 `resolveCodingPlanStatusCardTitle` 的单元断言（其余 202 已过）。

## 3. packages/services · cuaProductHelperSpawnEnv（4 败）

测试钉 `buildCuaProductHelperAgentEnv`（src/node.js 内 broker env 组装器，约 742 行 CE 块，
见 commit d20deeb1 的 node.ts:1119-1299 + 555-610 常量/WeakMap），官方对齐时被回退。
修法：从 `git show d20deeb1:packages/services/src/node.ts` 回植该块 + 依赖导入
（cua-permission-broker/cuaProductHelperSpawnEnv.js 的 mint/resolve/canRun 已在树）。
已提交的测试适配（141a2801）移除了 stale import，回植后需恢复 import 并跑通 10 用例。

## 4. packages/services · devChainAgentPayloads（1 败）

"seed 后 cache 缺少 documents@0.1.7"：真实 seed（`seedFromAssetRoot` 子进程）的顶层白名单
裁剪了 staged 的 plugin payloads。属 dev 链（desktop/scripts/dev-agent-payloads.mjs →
seed 白名单）回归，需对 seed 白名单补 plugin cjs 条目。非机械修，需读 seed 实现定裁剪点。

## 5. apps/zcode-cli · bootstrap（4 败）+ dynamic-workflow（1 败）

bootstrap 测试为 node:test 轨道（run-tests.mjs 注册项），失败清单见
`$TEMP/repo_final.txt` 全量日志（或重跑 run-tests.mjs 捕获）。dynamic-workflow 1 败同。
逐个用 node --import tsx --test 跑单文件定位，同款节奏。

## 6. scripts · conversation-session admission（2 败）

`scripts/test/conversation-session-formal-admission-review.test.mjs`：
- "uses the TypeScript AST…"：admission 对 template-expression import 的识别
  （LEGACY_PREPARE_CALL 码）未命中——`scripts/lib/conversation-session-formal-admission.mjs`
  的 AST 扫描对模板字符串 import 形态漏识别。
- "only allows explicit common requests…"：canonical common.json 白名单校验失败。
两处均在 scripts/lib 的 admission 实现内，非测试适配问题，需读实现定位扫描逻辑缺口。

## 收尾

全包清零后跑：`node scripts/run-tests.mjs`（0 包失败）+ `pnpm build:zcode` 冒烟
（CLI/agent/server/doctor 启动探活，流程见此前会话记录）。许可清单
（third-party/inventory.json）在新增依赖时需同步再生成。
