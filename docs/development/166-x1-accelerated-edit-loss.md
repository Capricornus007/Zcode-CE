# 166 · X1 加速回合中编辑的消息可能丢失(UI 侧判别)

> 状态：**判别 spec(尚未定位根因;先判别再决定是否需要实现)**。矩阵将 X1 主责归我,但线索可能横跨 UI/运行时,判别后若落在运行时则移交 cli-runtime-port(其任务含「X1 运行时侧」)。

## 0. 读了什么 / 结论一致性

| 材料                                                 | 结论                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| PORT-MATRIX X1 行                                    | 线索 `messageEdit/accelerat`(16 vs 6)不可直接对应到源码符号:实测 `messageEdit                                                                                                                                                      | editMessage | editedMessage` 在上游 ui(含 v4)与 CE 均 **0 命中**。矩阵「16 vs 6」的计数口径未给出文件清单 ⇒ **该探针结论不可复用,需重新定位**。 |
| 上游 v4 `ConversationTurnGroup.tsx` accelerat 上下文 | 唯一可用的线索:`getHighspeedTurnByCommandId(sourceCommandId)` 与 accelerated output 渲染。X1 的「编辑」更可能是 **composer 草稿/用户输入气泡(`ConversationUserInputBubble`/`composerDraftRevision`)** 在加速回合提交路径上的丢失。 |
| CE 独有 v4 文件                                      | CE 缺 `v4/ConversationUserInputBubble.tsx`、`conversationTurnRenderUnitTypes.ts`、`composer/onlineModelFallback.ts`(上游独有)—— 用户输入渲染与 F2 高速回合相关件在 CE 有缺口,X1 可能与此耦合。                                     |

## 1. 判别实验设计(先判别,不实现)

1. **复现优先**:在 CE 构造「加速/高频回合」场景(快速连续提交两条带编辑的消息),观察用户输入/编辑内容是否在渲染中丢失。CE 无 HighSpeed,X1 的触发条件是否依赖加速卡?若 CE 无该路径,X1 在 CE 可能**不可复现** ⇒ 记录为「不适用」而非「已修」。
2. **路径排查**:沿「composer draft → 提交命令 → turn 投影 → 渲染单元」查渲染单元替换逻辑(`conversationTurnRenderUnits`),确认编辑后的消息是否被旧快照覆盖。
3. **区分 UI 与运行时**:若丢失发生在 CommandInbox/transport 提交前 → 运行时(cli-runtime-port);若发生在渲染投影 → UI(本成员)。

## 2. 交付口径

- 判别结论 + 证据(复现日志/代码路径);若属 CE 不适用,如实写「CE 无该路径」并登记到矩阵回传;若属 UI,转实现 spec 增补。

## 3. 依赖

- 若与 F2 的 highspeed 路径耦合,需 task-1 类型 + F2 UI 落地后才能判别。

## 3. 判别结论(已提交,2026-10-13)

**归属判定:矩阵把 X1 主责归 ui-features-port 是错位的——X1 的 3.15.1 修复 UI 侧零增量。**
证据(`git diff 29628c9a aac47556`):

- 修复主体在 `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/fork-edit-retry.ts`(+150 行):
  `editUserQuery` 在加速回合的处理改为——① 编辑重发按**新的主动发送**处理,只认**本次重新 prepare 的卡**
  (`payload.highspeedMeta.taskId === record.app.sessionId`、未过期、Selection 真指向加速 Provider),
  避免拿旧凭据或跨会话卡加速;② `preemptActiveTurnAndWait` 把 runtime-owned active turn 纳入
  preempt barrier(旧实现只看 `record.activeAbortController`,遭遇 turn_not_steelter 拒绝);
  ③ 纯引用编辑放行(`conversationQuotes`);④ 引入 `isHighspeedProviderId`。
- 新增测试 `apps/zcode-cli/packages/core/tests/v4-native-fork-edit-retry.test.ts`(+1493 行)与
  e2e `conversation-session-model-switch-edit-fork.test.ts`(模型切换 + 编辑 fork 场景)。
- upstream-only-ui 354 个文件中**无任何 edit 相关 UI 件**;`editRerun` origin 在 CE 仅存在于
  `packages/shared/src/zcode-protocol-v4/rows.ts`(纯类型)。

**X1 与 F2(HighSpeed)强耦合**:`highspeedMeta.taskId` 校验依赖 task-1 落地的 highspeed metadata 类型。
按 Lead 裁定,X1 主体移交 cli-runtime-port(task-4,其描述含「X1 运行时侧」),已建任务板子任务附本结论;
bootstrap 处理器文件的写范围归属由 Lead 裁决(task-1 bootstrap 范围 vs task-4 core 范围)。
