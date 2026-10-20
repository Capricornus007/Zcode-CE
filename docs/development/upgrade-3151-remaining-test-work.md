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
  官方契约是 `shouldOnboard(deviceMid)` / `dismissOnboarding(deviceMid)` 均由调用侧传入
  设备身份（真实 UI 调用方传 `platform.getDeviceId()`）。适配 `onboardingRecordDeviceMid.test.ts`
  （5 败）：全部调用点补 DEVICE_MID 传参；`resolveDeviceMid` 选项从 mock 中移除（官方无此
  选项）；两个 skip-on-empty 边界测试改为断言入参原样落盘；`onboardingDismissRpc.test.ts`
  （1 败）与 `onboardingRecordService.test.ts`（收集失败，导入崩溃）同款处理。
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
修法（已探明坐标）：

- 源：`git show d20deeb1:packages/services/src/node.ts` 的 553-1299 行（常量
  CUA_PRODUCT_HELPER_AGENT_ENV_RETRY_MS=30s / CUA_HELPER_HEALTH_TIMEOUT_MS=30s、
  WeakMaps、trackCuaProductHelperStartup、has/clear helper、buildCuaProductHelperAgentEnv
  主函数 1119-1299）+ cuaHelperStartErrorDetail（1301-1313）。
- 依赖导入：`./cua-permission-broker/index.js` 的 BROKER_UNAVAILABLE_ENV /
  clearCuaProductHelperAgentEnvUnavailable / hasCuaProductHelperAgentEnvUnavailable /
  CuaHelperHost / CuaHelperTransportHandle；`./cua-permission-broker/cuaProductHelperSpawnEnv.js`
  的 resolveCuaProductHelperSpawnEnv / mintCuaProductHelperEnv（该文件已在树）。
- 回植位置：当前 node.ts 的 `return (` 前（与 webRemoteTaskIndexElement 同层做法）。
- 回植后恢复测试 import（`from "../src/node.js"`）并跑通 10 用例。
  已提交的测试适配（141a2801）移除了 stale import，其余 6 个纯函数用例已过。

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

## 7. 终验快照（2026-10-17 · 443+ 提交 · 工作树干净）

- ui vitest 61 重点文件 1489 全过；ui node:test 358/0；desktop 双轨全绿；双端 tsc 归零。
- services vitest 直跑仅剩 processTreeTerminator.windows / zcodeStdioTransport.processTree
  两个 Windows 原生进程树文件偶发（同一 §-竞态根因，fork-isolated 单文件验证全绿）。
- 其余集中域：start-plan requestAuth 转发套件（约 20 败，官方新特性域——
  requestAuth.headers 白名单合并 / pending 幂等 / 能力判据计数，需按官方
  resolveCodingPlanStatusPanelViewState 同源节奏接渲染层应答链）、
  默认启用集合 ×1（官方发行版对比契约）、bootstrap/dynamic-workflow 已绿
  （makeSubmitPort 委托补齐后 51/51 + 13/13）。
- build:zcode 冒烟：上一次全绿记录在案；全部工单清零后终跑一次即可。
