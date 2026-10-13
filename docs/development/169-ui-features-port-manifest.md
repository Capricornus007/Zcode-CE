# 169 · ui-features-port 移植搬运清单(3.15.1-ce.1)

> 状态：**已实现部分的登记**(X8/F11/X9)。F2/F4/F6/F7/F8/F9 UI 待 task-1 类型落地后另行登记。
> 汇总用途：release-integrator 将本文清单抄录进 `third-party/copied-components.json` 与 `docs/development/official-diff.md`。
> 上游来源：`zai-org/ZCode` tag `aac47556`(v3.15.1),Apache-2.0。共享只读 worktree `.reverse/91-upstream-checkout/zai-org-ZCode-3151`。

## 1. 原样采用上游 3.15.1 版本的文件(逐字节,无本地修改)

| CE 路径                                                                                     | 上游路径 | 说明                                                                |
| ------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| packages/ui/src/lib/codingPlanQuotaResetUi.ts                                               | 同名     | X8:completed 携带余下机会 + hasUsable/resolveActionCompletedAt 新增 |
| packages/ui/src/hooks/useCodingPlanQuotaResetUi.ts                                          | 同名     | X8:opportunityVisible / reset() 放行改用统一判定                    |
| packages/ui/src/components/coding-plan-quota-reset/CodingPlanQuotaResetDialog.tsx           | 同名     | X8:删除本地对账状态机, 只读 config                                  |
| packages/ui/src/components/coding-plan-quota-reset/buildCodingPlanQuotaResetDialogConfig.ts | 同名     | X8:删除 quotaFull 门控参数                                          |
| packages/ui/src/chat-input-toolbar/codingPlanResetOpportunityBadge.ts                       | 同名     | X8:徽标不再因满额隐藏                                               |
| packages/ui/src/chat-input-toolbar/CodingPlanContextUsage.tsx                               | 同名     | X8 消费方(去门控 + completedAt 解析);文件另含上游其他增量, 原样采用 |
| packages/ui/src/settings/usage-stats/CodingPlanUsagePanel.tsx                               | 同名     | X8 消费方;原样采用上游版(含 dialog 接线)                            |

## 2. 片段搬运(CE 文件上应用上游逻辑,本地修改已在代码内标注)

| CE 路径                                                         | 修改内容                                                                                                 | 代码内标注                                        |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| packages/ui/src/settings/model-provider-section/StatusCards.tsx | X8:去 quotaFull 门控、buildConfig 去参数、completedAt 解析、徽标/入口可见性                              | `Bugfix(X8):` 注释                                |
| packages/ui/src/v4/ConversationTimeline.tsx                     | X9:ResizeObserver 视口观测 + 同步批量测高提交(flushSync + virtualizer.resizeItem + commitMeasuredLayout) | `// X9:` 注释(含来源)                             |
| packages/ui/src/WorkspaceSidebarFooter.tsx                      | F11:账户菜单头部(套餐 badge + 用户 ID + copyUserId)+ i18n 4 键                                           | `// F11` 注释(含"自上游 3.15.1 搬运, Apache-2.0") |
| packages/ui/src/i18n/locales/zh-CN.ts, en-US.ts                 | F11:sidebar.profile.{accountId,copyUserId,userIdCopied,userIdCopyFailed} 4 条键                          | 注释标注                                          |

**有意不搬**(同批上游内容):F1 rewards/邀请好友(`useOpenRewards`/`RewardsProvider`/`Gift` 菜单项,分类 C)、上游 `banner` prop 替换(CE 保留自研 `RemoteControlEntryButton`,自托管 Web 控制的有意偏离)、v4 遥测 7 文件、ConversationTimeline 的 F5/F2/F8 集成 hunk(等 task-1)。

## 2bis. X1 移交(不做 UI 实现)

X1「加速回合中编辑的消息可能丢失」判别完成后主体移交 cli-runtime-port(任务板 **task-8**,Lead 裁定:fork-edit-retry.ts 在 `bootstrap/src/zcode-protocol-v4/commands/handlers/`,与 task-1 的 `bootstrap/src/zcode-protocol/` 路径互斥)。UI 侧零增量,本成员不做实现;判别结论与机制见 `166-x1-accelerated-edit-loss.md` §3。

## 3. 测试(CE 自研,非搬运)

- packages/ui/test/codingPlanQuotaResetX8.test.ts(X8 回归, 6 断言)
- packages/ui/test/workspaceSidebarFooterAccountMenu.test.ts(F11 接线, 5 断言)

## 3bis. 本轮新增搬运(2026-10-13 第二批)

**F2 HighSpeed 卡片库(第一切片,完整的 25 文件 + 2 依赖件):**

| CE 路径                                              | 说明                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| packages/ui/src/highspeed/(17)                       | 卡片 UI、激活动效、turn store、分享、到期时钟(原样上游)                                        |
| packages/ui/src/v4/highspeed/(2)                     | HighSpeedDiffusionCanvas + highSpeedDiffusion                                                  |
| packages/ui/src/assets/highspeed/(6)                 | lightning.svg、share-card、share-dialog-noise、zai-logo                                        |
| packages/ui/src/components/ui/floating-particles.tsx | highspeed 动效依赖(上游独有, 原样)                                                             |
| packages/ui/src/global-notice/globalNoticeStore.ts   | highspeedShare 依赖(上游独有, 原样)                                                            |
| packages/ui/src/v4/WorkflowNotificationToolRow.tsx   | 采用上游 3.15.1 版(hole 判别分流, 修 wave 1 引入的 12 处 TS 错误)                              |
| packages/ui/src/v4/WorkflowNotificationHoleRow.tsx   | 新组件 158 行(hole 变体专用行, 原样上游; 去掉 1 处注释 markdown 强调以过 copyFormatGuard 棘轮) |
| packages/ui/src/i18n/locales/{zh-CN,en-US}.ts        | +2 键 chat.toolCall.workflow.hole.{draftPath,waited}                                           |

**F8 bots 群/话题(判别后回退, 保留基础设施):**

判别结论(回答 Lead 的 (a)/(b) 之问):**(a) inert**——BotsDialog.tsx 主组件不引用 BoundGroupsCard/PrivateDeliveryRetry,Root.tsx 不引用 useBotBroadcastEffects,4 hooks 仅被这两个 inert 组件引用,运行期零调用 IBotsService 方法。已回退 6 文件(4 hooks + 2 组件, 依赖延期的 IBotsService 6 方法 = task-10 重立的 F8 服务波次), 保持零半集成。**保留:**

| CE 路径                                                                                        | 说明                                                                                       |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| packages/ui/src/BotsDialog/{BoundGroupsCard,PrivateDeliveryRetry}.tsx                          | 群绑定卡、私聊重投                                                                         |
| packages/ui/src/hooks/useBot{BoundGroups,GroupMemberNames,GroupTask,PrivateDeliveryRetry}.ts   | 4 hooks                                                                                    |
| packages/ui/src/root/{botsTaskBroadcast,botsTaskStreamBroadcast,useBotBroadcastEffects}.ts     | 群任务广播                                                                                 |
| packages/ui/src/lib/{zcodeTaskUsageFallback,taskListMetaSync}.ts、store/taskQueryCacheStore.ts | 3 lib/store 依赖(CE==基线, 采用上游版; taskListMetaSync/taskQueryCacheStore 含上游 Bugfix) |

**已解决:** task-9(core-services 已提交 b449f800, F2 展示链 2 处 TS 解除);F6 的 workflowActorModelLabels 导出已由本成员补齐(subagent-model-label.ts 采用上游版, 纯函数 +24 行, CE==基线)。

**已解锁重搬(task-12 完成, 1f7d2b73):** F6 save 链 3 文件——store/workflowRunSavedStore.ts、hooks/useWorkflowRunSave.ts、v4/savedWorkflowHubContext.tsx(上游版 + 棘轮清理)。当前 inert(渲染宿主属 F6 判别轮),类型干净、服务方法就位。

**F2 第二切片已完成(hunk 级提取):** ConversationTurnGroup 18 纯 highspeed hunk + 9 通用 hunk + 3 混合 hunk 行级分离(排除 topic/F6 fills);连带采用 6 个无自研上游文件(renderUnits/types/context/FileSummaryPanel/useAssistantPreviewCardsForRow/assistantDirectiveParser)+ ConversationRowView 的 TextActions compact prop;renderUnitTypes 内联 F5 占位类型、conversationRowContext 删 F6 域字段(均 Modified 标记 + 挂账)。

**F4 切片 1+2(gen-ui 契约 + tweak UI 子集):** packages/ui/src/gen-ui/ 的 contract + domain(sourceFiles/references)+ index(Modified, 仅 re-export 契约与 domain)。消费方:ConversationFileSummaryPanel 的 collectGenUiSourcePaths/matchesGenUiSourcePath(抑制重复 HTML 预览卡);tweak UI(app/tweaks.ts + TweakPanel.tsx, 仅依赖 shared 契约, task-13 的 IGenUiService 就位后可消费)。**回退挂账:** adapters(3)/host.ts/module.ts/components(3)/hooks/useGenUi.ts(81行)——依赖 @/plugin-ui/hostPrimitives(F5 域, 72 文件)与 services 的 genUiService(Singleton 缺, IGenUiService 未定义)。

**F9 UI staging 已搬入:** packages/ui/src/browser-use/ 5 文件(EmbeddedBrowserPermissionPrompts/browserPermissionCapabilities/BrowserPermissionIcon/BrowserSitePermissionsPage/BrowserSiteSettingsEntry)+ store/embeddedBrowserPermissionStore.ts + hooks/useBrowserSitePermissions.ts(102 行, 依赖全就绪)。**唯一缺口:** shared/test-ids.ts 的 5 个 TID_BROWSER_PERMISSION 常量(task-14 已派 desktop-host; CE 的 test-ids 有自研需三方合并, 不能整文件采用)。集成入口等 desktop-host 的 F9 UI bridge。当前接线状态:inert(消费方 0)。

**F5 plugin-ui 72 文件域已搬入(Lead 派单):** packages/ui/src/plugin-ui/ 全目录(Apache-2.0 逐字节, 含 contract/domain/adapters/app/components/sidePane);vitest test 8 文件按 CE 口径删除。**渲染层配套升级**(CE 均无自研, 采用上游版):workspaceSidePane(plugin-ui tab 联合 + activateSidePaneTab/isWorkspaceGlobalSidePaneTab export)、AnimatedSidePanePanel + SidePaneTabTrigger、browser-use 的 BrowserUseSidePaneContent/UnifiedBrowserView/HumanBrowserView/BrowserViewportToolbar、animatedSidePanePanelModel(三方合并 4 处签名扩展:MIN_PREVIEW export/shouldOffer+resolve+shouldRender 的 mobileOverlay)、sidePaneTabPresentation、mobileTextInput(useIsMobileTextInputViewport)、taskSidePaneMemory(claimPluginUiSidePaneAutoOpen)、fileSummaryTypes(pluginUi?: PluginUiToolBinding 字段)。

**已发现并回退的协议层演进(重要):** conversationProjectionStore 与 conversationRowSharing 的上游版采用后引入 windowed rows 协议形状(snapshot.rows.window), CE 的 fixture/协议层是旧形状 → v4ContentRejected 测试 2 处运行时失败(类型全绿但最终消费点失败)。已回退 store + 删 rowSharing 保 363/363 运行时绿;onLiveDeltas 缺口与 task-15 一起挂账(服务侧与 store 协议形状是配套的协议层工作, core-services 搬服务时需评估)。

**F4 渲染链已重搬(收尾三件之一):** gen-ui 的 adapters 3 + host + module + GenUiCard + GenUiMessageResponse + hooks/useGenGui(8 文件); gen-ui/index 恢复完整上游入口。**前置链全通:** plugin-ui(本成员 72 文件)、task-13(IGenUiService)、task-11(shared 契约)、task-16(TID)。

**onLiveDeltas 链(core-services 判别纠错后执行):** conversationProjectionStore 补 3 hunk(liveDeltaListeners + onLiveDeltas + applyFrame 发射点);**conversationRowSharing(row pool 内存优化)本版不纳入**(独立后续项)。此前"windowed rows 协议演进"的判别被 core-services 逐行对比推翻:实质缺的是 onLiveDeltas 监听方法, shared 零改动。

**Modified by ZCode 标记已补(14 文件):** StatusCards/ConversationTimeline/WorkspaceSidebarFooter/i18n×2/WorkflowNotificationToolRow/conversationRowContext/ConversationRowView/subagent-model-label/fileSummaryTypes/animatedSidePanePanelModel/SessionPane/SubagentSessionSidePane/conversationProjectionStore。纯原样搬运的上游文件不另标记(Apache-2.0 原样口径)。

**当前等待项(F6/F8 下轮):** task-15(services 侧 plugin-ui 4 接口 + IServiceAccessor 注册, 16 处 TS + 5 处级联)、task-16(shared TID_PLUGIN_UI_CARD/TID_PLUGIN_UI_OPEN_SIDE_PANE, 2 处 TS)、外加 2 处 onLiveDeltas(随 store 回退回来)。

**新增挂账:**F2 第二切片(ConversationTurnGroup 集成, +316 行交织增量, 详见 161 spec §4; 卡片库 inert 但类型门禁通过)。

**已知阻断(挂账):** task-10(→F8 服务波次, IBotsService 6 方法 + 状态机 500-1500 行)、task-11(→desktop-host-port, shared gen-ui 契约, F4 前置)、F6 与 CE 渲染层交织(station-observation 裁剪冲突 + spine 消费方冲突 + IZCodeAgentService 2 方法, 见 163 spec)、F2 第二切片(ConversationTurnGroup +316 行交织增量)。

**门禁最终态:** typecheck 全仓 0 错误; ui tests 363/363; lint 0 errors; fmt 我的范围 0 issues(仓库内余 28 个 issue 全是其他成员的 14x/15x/17x spec 与 desktop/services/shared 文件); architecture:check 0 violations。

## 4. 待登记(等 task-1 类型落地后实现时补)

- F4 gen-ui 18 文件 + stream-animate(条件:有 CE 消费方才搬,Lead 裁定方案 A)
- F2 highspeed 25 文件(依赖 v4 + highspeed metadata shared 类型)
- F6/F7 工作流面板 UI(workflow-timeline 17 + app-shell 6 + store/hooks)
- F8 bots 群/话题 UI(BotsDialog 2 + hooks 4 + root 2 + v4 8)
- F9 权限 UI(browser-use 5 + store 1)
