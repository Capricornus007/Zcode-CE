# 164 · F8 bots 群/话题 UI 增量(CE 形态有意偏离上游)

> 状态:**第一切片回退,保留基础设施**。判别:已搬的 4 hooks + 2 组件经实证为 inert(零入口,见下),但因依赖延期的 IBotsService 6 方法(task-10 重立为 F8 服务波次)产生 14 处 TS 错误,已**回退 6 文件**保持零半集成。保留 root 3 文件(botsTaskBroadcast/botsTaskStreamBroadcast/useBotBroadcastEffects,类型干净的广播基础设施)+ lib 3 文件(zcodeTaskUsageFallback/taskListMetaSync/taskQueryCacheStore,均为通用基础设施)。v4 群/话题 8 文件未动。覆盖公告「飞书群 + 独立话题协作」的 **UI 侧**;CE 形态按 AGENTS.md 上游形态说明:自托管 Web 控制,只增 IM 机器人 UI 能力。

## 0. 读了什么 / 结论一致性

| 材料                                      | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT-MATRIX F8 行                         | **证实基础存在**。CE 有 `BotsDialog.tsx` + `BotsDialog/` + `botsUi.ts` + 4 子组件 + spec 135。                                                                                                                                                                                                                                                                                                                                                                               |
| 上游 UI 增量(上游独有清单)                | `BotsDialog/` +2(`BoundGroupsCard.tsx` 108 行、`PrivateDeliveryRetry.tsx` 31 行);`hooks/` +4(`useBotBoundGroups`/`useBotGroupMemberNames`/`useBotGroupTask`/`useBotPrivateDeliveryRetry`);`root/` +2(`botsTaskBroadcast.ts`/`botsTaskStreamBroadcast.ts`);`v4/` +8(`BotGroupDeliveryAction`/`botGroupDeliveryContext`/`BotGroupMemberNamesContext`/`BotGroupSourceLabel`/`BotTopicPreparation`/`ChannelMentionContent`/`topicInputMessages`/`topicPreparationRenderUnits`)。 |
| docs/development/135-bot-management-ui.md | **一致**。CE 的 BotsDialog 已从宿主层挂载;新增群/话题 UI 沿用同一挂载点与服务访问(`useServices()`),不引第二条服务路径。                                                                                                                                                                                                                                                                                                                                                      |

## 1. 产品规则

1. **只增 IM 机器人 UI 能力**:群绑定、群成员名、话题准备、@提及内容渲染、私聊重投。
2. **不搬上游 `WebRemoteControlDialog` 系**(上游独有 8 个 WebRemoteControl\* 文件):CE 用自研 RemoteControlPanel/RemoteControlEntryButton,这是有意偏离(与 135 §1.4 同一判据)。
3. **群任务广播是单向展示**:`root/botsTaskBroadcast` 只在 IM 渠道侧呈现任务状态,不在 CE 内引入任何入站服务(入站面 `/bot/**` 默认不注册,135/133 已定)。
4. **默认关闭、同意后可用**:群功能随 bot 启停,不单独开默认入口。

## 2. 状态所有者

| 状态         | 唯一所有者                              | 读取方           |
| ------------ | --------------------------------------- | ---------------- |
| 群绑定关系   | bots 配置(`BotsRepo`,task-1 服务侧)     | BoundGroupsCard  |
| 群成员名     | `BotGroupMemberNamesContext`(UI 会话级) | 话题行、提及渲染 |
| 话题准备状态 | `BotTopicPreparation` 投影              | v4 话题行        |

## 3. 接口

- 新 hooks 统一经 `useServices()` 访问 botsService(135 §4.1 已打通)。
- @提及解析依赖 `packages/shared/src/channel-mention.ts`(X6,task-1)。

## 4. 验收

- 绑定群后,BotsDialog 展示群卡片;话题行渲染群来源标签;@提及命中 channel-mention 规则。
- 默认不渲染任何群入口(未启用 bot 时)。

## 5. 搬运清单

`BotsDialog/{BoundGroupsCard,PrivateDeliveryRetry}.tsx`、`hooks/useBot{BoundGroups,GroupMemberNames,GroupTask,PrivateDeliveryRetry}.ts`、`root/{botsTaskBroadcast,botsTaskStreamBroadcast}.ts`、`v4/` 8 个群/话题文件(Apache-2.0)。
