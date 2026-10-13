# 145 — F8 群/话题服务侧实现与 X7 结论（实现交付）

## 目的

task-17（F8 服务波次主体）的实现交付：把上游 v3.15.1（aac47556）bots 域的群会话与
独立话题协作搬到 CE，接通 IBotsService 的群/话题方法，并给出 X7（「飞书授权过期后
群任务失去响应」）的定位与处理结论。本文是 144（分析稿）之后的实现段，续编自
140-144 的 spec 节奏。

## 搬运清单（依赖闭包）

上游 `.reverse/91-upstream-checkout/zai-org-ZCode-3151`，Apache-2.0，逐字节搬运：

- bots/ 13 模块：groupSessions、groupAdminAttention、groupDeliveryThrottle、groupQueueCard、
  groupReply、groupResultDelivery、topicContinuation、topicHistory、topicHistoryAttachment、
  topicPreparationState、topicResource、channelMentionResolver、taskStreamHub。
- bots/providers/ 3 模块：feishuGroupMessages、groupInputReaction、groupMemberDirectory；
  providers/types.ts 整体替换（provider 契约面 +6 群/话题方法、send 返回 transient
  card、downloadAttachment signal）。
- bots/channelReply.ts（反向回复投递入口，原生缺失）。
- zcode-agent/ 3 模块：botTopicAdmission、groupRuntimeSnapshot、groupAttachmentUpload。
- 接出：bots.ts（IBotsService +10 方法）、messages.ts（群/话题文案整族）、
  botsService.ts（整文件搬运 + 本地回接，见下节）、session/zcodeTaskService.ts
  （IZCodeTaskService +7 Bot 群/话题方法）、zcode-agent/zcodeTaskServiceAdapter.ts
  （+7 实现与 botAgent 连接 scope）、feishuChannelRuntime.ts（X7 三触点）。

## 三个状态机（上游设计，现状搬运）

1. **群会话/输出状态（groupSessions + groupResultDelivery）**：群键 = botId+chatId
   （+threadId 话题独立键），输出结果落盘只经「请求前 unknown → 发送后 sent/failed」；
   未授权写 invalidated；活跃发送只投影 pending，崩溃恢复的 unknown 不能直接告警。
2. **投递/队列卡（groupDeliveryThrottle + groupQueueCard）**：同 chat 共享 250ms 发送
   额度；队列卡状态单调生命周期（waiting<working<终态），迟到 admission 不覆盖终态。
3. **话题准备（topicPreparationState + topicContinuation + botTopicAdmission）**：
   停止确认先于材料授权到达时，后到的消息继承 waitingStop；续接器先停止再等材料，
   run 的权威终态从 CLI admission 取；admission 按 (taskKey, remoteSessionId) 计版本，
   准备期被取消的输入直接拒绝提交。

## X7 结论（「飞书授权过期后群任务失去响应」）

上游 3.15.1 的修复路径已完整搬到 CE，三触点（feishuChannelRuntime.ts）：

```
WebSocket token 过期/鉴权失败 → 连接进入 reconnecting（或重连后再次建连）
  → onConnectionInvalidated(botId)
  → botsService 的 botHistoryEpoch +1
  → historyGeneration(botEpoch:groupEpoch:backgroundRevision) 变化
  → 话题输入命中 topicHistoryReady 生成号失配 → 补读原生历史，不卡旧缓存
```

即：授权过期不会让任务路由停摆——投递授权走的是独立的 authorizationId 判据
（groupResultDelivery.authorized），命令提交通道（submitBotGroupInput）与群会话状态
不依赖 token 的新鲜度；只有「话题历史读」这类需要当前凭据的操作会被 epoch 机制
强制重读。冷启动（Host 重启后 CLI 未加载原会话）由 submitBotGroupInput 的快照读
屏障兜底。144 中 X7 的「分类 B（可能是逻辑修复）」判断成立，本次随实现一并落地。

## 本地偏离登记（Apache-2.0 modifiedFiles）

- `#src/...` 路径别名按 CE tsconfig 布局重写为相对路径（纯路径重写）。
- messages.ts 回接 2 个 CE 本地键（taskFailedProviderRuntimeHeaders*，fix.2 文案）；
  上游没有 commandNotSupportedInCe（该键随 CE 的 5 个桩 case 一并移除，真实
  命令处理器已替代桩）。
- botsService.ts 整文件搬运后回接 5 处 CE 本地加固（fix.2 + 护栏基线）：
  附件 downloadUrl SSRF 守卫、localPath 越权守卫、webhook secret fail-closed +
  常量时间比较、回调日志正文脱敏、task_error 三出口统一走 formatBotTaskFailureMessage
  （③ 出口处理有源码级护栏 botTaskFailureMessage.test.ts）。
- zcodeTaskServiceAdapter 的 botAgent 连接 scope 与 3 个支撑模块导入为增量拼接。
- feishuProvider 的 splitFeishuText 改为导出（上游为导出，CE 原为内部函数）。

## 验证

- packages/services tsc --noEmit exit 0。
- node:test：302/302（284 既有 + 18 新增 botGroupTopic.test.ts，覆盖 13 模块的
  安全判据：群键隔离、250ms 额度、降级链、队列卡单调性、admin 去重、历史边界/缺口/
  越权 scope、附件上限、准备状态机、续接 cancel/failed、@ 候选来源限制、
  单任务实时源、投递重试与 invalidated）。
- copyFormatGuard：本轮新增/修改文件 0 违规（当前全仓 2 个违规文件为其他成员
  进行中的 create-workflow-handler.ts 与 browserDataManager.mjs，已通知对应人）。
- 根 typecheck：services 侧 0 错误。

## 后续

- 上游 vitest 无 bots 域单测；本任务的 18 例为 CE 自写契约断言。
- F8 的 UI 侧（zcodeSessionRestore 等，X10）由 ui-features-port 收尾；本任务完成后
  类型与服务面已就绪。
