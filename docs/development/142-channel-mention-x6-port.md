# 142 — channel-mention 移植（X6 上半）

## 目的

群聊 @提及识别不准（X6）的修复落在协议层：上游新增 packages/shared/src/channel-mention.ts，把「频道 @ 提及」与「反向回复」做成三端（App / CLI / Host services）共用的严格 zod schema 与解析函数。

## 范围

- 新增 packages/shared/src/channel-mention.ts：
  - channelMentionSchema（type=channelMention，refId/name/channel=feishu|lark/targetId 形如 ou_ 前缀的 open_id/idType/entityType），channelContentPartsSchema（≤200 段），channelReplyPartsSchema（text/mention/mentionName ≤50 段）。
  - channelReplyRequestSchema / channelReplyResultSchema（sent/failed/unknown/invalidated 或 needs_clarification：歧义/未找到/不可用/选择过期，候选 ≤10）。
  - channelContentText 与 resolveChannelReplyParts：只从 Host 已验证的会话输入解析 ref；模型不得直接提供平台 ID；mentionName 必须由 Host 解析；正文 1–2000 字；同名冲突抛错。
  - channelReplyHostRequestSchema：在请求上加 trace / workspacePath / workspaceIdentity / remoteSessionId（身份 key 统一 workspaceIdentity?.trim() || workspacePath）。
- packages/shared/src/zcode-protocol/index.ts 增量：re-export channelReplyRequestSchema / channelReplyResultSchema（Bot 反向回复的名字解析与 App、CLI 使用同一严格 schema）。

## 不在本任务

services 侧 bots 实现（channelReply / topicResourceRelay）与 bootstrap/core 侧 reply-to-channel 工具属 F8 消费侧（见 144），本轮只给契约。

## 验收

- 文件与上游逐字节相同（上游该文件无注释 markdown 强调）。
- 新增 CE 测试：resolveChannelReplyParts 的正例（文本+提及解析、候选解析）与反例（未知 ref、mentionName 未解析、超长、冲突 ref）。
- packages/shared typecheck 通过。
