# 144 — F8 / X7 bots 服务侧分析（分析交付，非实现）

## 目的

飞书群 + 独立话题协作（F8）与「飞书授权过期后群任务失去响应」（X7）在 CE 的落地形态需要服务侧（packages/services/src/bots/、zcode-agent/）增量分析，为后续实现轮提供范围与取舍。

## 形态边界（AGENTS.md 上游形态说明）

CE 与上游的**有意偏离在形态**：CE 是自托管 Web 控制（桌面 spawn 服务端进程，浏览器经 ?token 连接），不把 IM 机器人当工作台；Bot Channel 与官方同步、默认关闭、用户同意后可用。F8 移植只搬**群/话题协议与渠道能力增量**，不搬云 relay / 配对服务。

## 上游 3.15.1 bots 域增量（探针）

- shared：channel-mention.ts（142 已搬）、bots.ts 的 zcodeAutomationBotDeliveryTarget 等键、topic resource 协议（zcodeTopicResourceRead/Cancel + TOPIC_RESOURCE_RELAY_*）。
- services：botsService.ts（群/话题路由）、channelReply.ts（反向回复投递）、zcode-agent/topicResourceRelayChannel.ts（话题资源中继）。
- bootstrap：topic-resource-port.ts（端口契约）；core：reply-to-channel 工具 + permission/service 适配。

## X7（飞书授权过期后群任务失去响应）

- 分类 B：闭源包无新增串可定位（UP 0 命中），可能是逻辑修复。CE 侧需在实现轮检查 feishuChannelRuntime 的 token 过期路径是否停摆任务路由。
- 本轮产出：上述定位线索 + 证据，不在 CE 引入未定位的改动。

## 交付物

本文档即分析交付：上游文件清单、CE 现状对比、形态取舍。实现由后续轮次（或子任务）承接；本轮只搬与 X6/F5 契约占 shared 的部分。
