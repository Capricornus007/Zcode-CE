# 163 · F6/F7 工作流面板 UI:运行前调参 / 运行中并发 / 保存复跑 / 子代理模型

> 状态:**A-prime 已落地(工作流时间线整套上游件对齐)**。此前「CE 自研/9 处连锁/有意裁剪 station-observation」的判别经核实全部是版本错配误读(spine 与 timeline 系文件均为 fork 点快照、CE 零提交, 详见 §4), 已按整套上游 3.15.1 件落地。

## 0. 读了什么 / 结论一致性

| 材料                       | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT-MATRIX F6/F7 行       | **证实缺口存在**。CE 有旧版 workflow 支持(`app-shell/WorkflowRunSidePane.tsx` 等),缺 run-settings/并发就地调整与 per-subagent override。                                                                                                                                                                                                                                                                                                                  |
| 上游 UI 增量(上游独有清单) | `components/workflow-timeline/` 17 文件:`WorkflowAskSettingsLines/Parts`、`workflowAskSettings`、`WorkflowRunSaveControls`、`workflowRunSave`、`WorkflowSaveFields/Popover`、`useWorkflowSettingsModelChoices`(F6 调参+保存);`app-shell/` 6 文件:`WorkflowRunFillFrames`/`WorkflowRunHoleParts`/`WorkflowRunPaneSaveSlots`/`WorkflowRunPhasePills` 等;`store/workflowRunSavedStore.ts`、`hooks/useWorkflowRunSave.ts`、`v4/savedWorkflowHubContext.tsx`。 |
| CE ↔ 上游文件级 diff       | WorkflowRunSidePane +70 行 / SpineParts +279 / PhaseList +427 —— **注意**:这些差异含双向漂移,不全是 3.15.1 增量。实现时用 `git diff 29628c9a..aac47556 -- <path>` 精确取 3.14.3→3.15.1 的真增量,避免把 fork 后 CE 自研误当上游件。                                                                                                                                                                                                                        |
| 上游协议                   | `packages/shared/src/zcode-protocol-v4/workflow-run-settings-command.ts`、`workflow-runs-concurrency.ts` —— task-1 范围。                                                                                                                                                                                                                                                                                                                                 |

## 1. 产品规则

1. **调参在创建前、并发调整在运行中,两者共用同一面板的不同区段**;UI 不维持第二份设置副本,面板是协议状态的投影。
2. **保存复跑不是导出**:保存的运行配置可从 `store/workflowRunSavedStore` 恢复出新运行;UI 只负责触发与命名。
3. **per-subagent 模型选择粒度到子代理**:`useWorkflowSettingsModelChoices` 提供候选项;选择结果下行为协议 meta(具体协议由 task-1 定义)。
4. **并发变更要有可见反馈**:运行中改 concurrency 是异步确认,UI 需呈现 pending/失败,不允许静默丢弃(禁止静默降级)。

## 2. 状态所有者

| 状态                | 唯一所有者                              | 读取方                   |
| ------------------- | --------------------------------------- | ------------------------ |
| 运行设置(调参/并发) | 服务端 workflow run 记录(经协议)        | WorkflowRunSidePane 投影 |
| 保存的运行配置      | `store/workflowRunSavedStore.ts`(UI 侧) | 保存面板、复跑入口       |
| 子代理模型选择草稿  | 面板局部(未提交前)                      | 提交后落协议 meta        |

## 3. 接口(待 task-1 补类型后的占位)

- 协议:run-settings command、runs-concurrency 调整、per-subagent model meta(zcode-protocol-v4)。
- UI 导入面:`components/workflow-timeline/*`(17)、`app-shell/WorkflowRun*Pills|Parts|Slots`(6)、`hooks/useWorkflowRunSave`、`store/workflowRunSavedStore`。

## 4. station-observation 裁剪判别(A-prime 已执行)

**判别结论(用户已批准 A-prime)**:「CE 裁剪 station-observation」与此前的「9 处连锁/破坏 CE 自研」经核实均为**版本错配误读**——spine 三件套(workflowRunSpine/WorkflowRunPhaseList/WorkflowRunSpineParts)与 timeline-model/roster-model/timeline-geometry/timeline-bands/workflowRunCardJoin/WorkflowRoll/workflowToolNames/workflowRunSettings/WorkflowRunSettingsFields/WorkflowRunSettingsPopover 等**全部是 fork 点快照、CE 零提交**(872ad96..HEAD 无提交; 唯二的 fork 后提交 9487ed83/2907feba 均为「搬上游 v3.14.3」性质, 是同一条搬运线的旧版本而非自研)。正确处置是整套采用上游 3.15.1 版本, 不保留 CE 版本。

**已落地(task-22)**:

- (1) timeline-model.ts 采用上游 3.15.1 版(355 行 holes/station/fill/unlisted);
- (2) station-observation.ts + timeline-holes.ts 逐字节搬运;
- (3) 12 个 workflow-timeline 渲染件 + 4 个 app-shell 渲染件(FillFrames/HoleParts/PaneSaveSlots/PhasePills) + createWorkflowHoleInput.ts 补件;
- (4) spine 三件套整套采用; 消费方 reconcile: workflowRunSettingsCeiling → workflowRunDefaultConcurrency、clamp 2 参 → 1 参等 API 演进, ConversationRowView 2 处调用同步;
- (5) shared 的 unlistedByPhase/holes 接线经类型门禁确认就位(zcode-protocol-v4/workflow-runs-started.ts/eviction.ts 消费链)。

F6 矩阵从「部分跟进」变「已跟进」。

## 5. 搬运清单(待 3.14.3→3.15.1 精确增量确认后登记)

`components/workflow-timeline/`、`app-shell/WorkflowRun*`、`store/workflowRunSavedStore.ts`、`hooks/useWorkflowRunSave.ts`、`v4/savedWorkflowHubContext.tsx` 等(上游路径同名,Apache-2.0)。

## 4. station-observation 裁剪冲突(Lead 指定的判别材料)

**事实**:CE HEAD 的 timeline-model.ts 删除了对 station-observation.ts 的 import(observePhase/phaseEntryFor/siteIdsOf/stationUnlisted/StationUnlisted)与 TimelineStation.unlisted 字段——这是 fork 时的**有意裁剪**(表外条目观察)。而 F6 的 hole/fills/holeParents/tailStub 字段由上游版 timeline-model 的 holeTable/holeParentsOf 构建,后者的完整实现伴随 station-observation 的回归(我采用上游版时实测恢复了它,已回滚保护)。

**选项 A —— 恢复 station-observation(采用上游版 timeline-model + 保留 station-observation.ts)**:

- 影响:CE 能力面扩展(表外条目观察回到产品);timeline-model 采用上游版,连带 WorkflowRunSpineParts/timeline-geometry/timeline-bands/workflowRunSpine 等渲染层文件需要上游版对齐(实测:上游版 workflowRunSpine 会使 CE 既有 WorkflowRunPhaseList 的 spineSections 导出消失,需三方定制);
- 代价:M(渲染层对齐工作量大);收益:与上游一致,后续 F6 增量可直接搬。
- 这是产品取舍,不是搬运问题——需判别轮决定 CE 是否要该能力。

**选项 B —— 保持 CE 裁剪,在 CE 版 model 上自研构建 hole/fills/holeParents**:

- 影响:不引入 station-observation;需把上游 holeTable/holeParentsOf 的构建逻辑手工移植到 CE 版 model(剔除 unlisted 部分);
- 代价:M-H(深度定制,永久偏离上游该文件);收益:能力面不变。

**当前处置**:两者都不做,F6 UI 保持回退(协议层已就绪),留 F6 判别轮决定。IZCodeAgentService 2 方法(findSavedWorkflowForRun/saveSavedWorkflowFromRun)已建子任务 task-12 派 core-services;workflowActorModelLabels 导出已由本成员补齐(subagent-model-label.ts 采用上游版,纯函数 +24 行)。
