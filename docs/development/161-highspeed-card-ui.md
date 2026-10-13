# 161 · F2 HighSpeed 卡片 UI(GLM 加速体验,客户端面)

> 状态：**部分实现：卡片库 25 文件已搬(等 task-9 的 CodingPlanRegularTps 解除 2 处 TS 阻塞);ConversationTurnGroup 集成(交织增量)为第二切片**。覆盖公告「订阅随机 GLM HighSpeed 体验」的 **UI 侧**;抽奖权重属服务端,不搬(矩阵已排除)。

## 0. 读了什么 / 结论一致性

| 材料                                        | 结论                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT-MATRIX F2 行                           | **部分推翻**。矩阵写「CE 现状 2 处(仅 selection 残留)」:实测 CE 全仓 `glm-selection` / `official-glm-selection-v3` **0 命中**(packages+apps 范围)。上游选型号逻辑 e2e 线索(`conversation-session-highspeed-card*.test.ts` 3 个 + helpers/highspeed-card.ts)在 CE 无对应物。                                             |
| 上游 `packages/ui/src/highspeed/`(17 文件)  | **证实**为 3.15.1 新增(872ad960 / 29628c9a 均为 0,aac47556 为 17)。含:`HighspeedActivationVisual.tsx`(激活动效)、`HighSpeedDiffusionCanvas`(v4/highspeed/ 扩散 Canvas)、`highspeedTurnStore/Hydration`(回合状态)、`highspeedShare`(分享卡,配 assets/highspeed 6 个素材)、`useHighspeedComposerEntrance`(输入框入场态)。 |
| 上游 v4 集成点(`ConversationTurnGroup.tsx`) | **新增事实**:`isHighspeed` 判定 = `getHighspeedTurnByCommandId(sourceCommandId)                                                                                                                                                                                                                                         |     | row.highspeed`;紫色流光 `showHighspeedAnimatedGradient` 同时服从卡片有效期(`highspeedExpiresAt > nowMs`)。上游注释明确修了「历史标识只依赖 Renderer 内存」与「卡过期后 metadata 仍保留」两个 bug。 |
| 上游 e2e(`helpers/highspeed-card.ts`)       | 验收口径参考:命中后 diffusion Canvas 必须挂载;切走再切回入场态从 `activation` 变 `restore`(不重播扩散);`modelIndicatorVisible` 立即呈现。                                                                                                                                                                               |

## 1. 产品规则

1. **HighSpeed 是「加速卡」语义**:命中 → 本轮消息带标识 + 激活动效;过期后不得把 accelerated output 染成紫色(上游两条 bugfix 的口径)。
2. **CE 只搬客户端面**:卡片 UI、激活动效、回合标识、到期时钟、分享卡 UI。抽奖/发卡/权重 = 服务端,不搬。
3. **与 v4 绑定**:highspeed UI 的渲染宿主是 v4 会话(CE 已有 v4/,199 文件);`v4/highspeed/` 2 文件随 highspeed/ 一起搬。
4. **默认不引入外部账号依赖**:CE 无订阅体系;若协议字段缺失,UI 层按「无卡」渲染,不报错(静默降级被禁止:UI 需如实呈现「未启用」)。

## 2. 状态所有者

| 状态                       | 唯一所有者                                            | 读取方                                        |
| -------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| highspeed 回合标识(命令级) | v4 session 记录(transcript 持久化 highspeed metadata) | ConversationTurnGroup 渲染;恢复链路 hydration |
| 卡有效期(expiresAt)        | 服务端卡片数据(经协议下行)                            | 到期时钟、流光门控                            |
| 入场态(activation/restore) | 组件局部(一次挂载内)                                  | useHighspeedComposerEntrance                  |

## 3. 接口

- 协议层(待 task-1):turn/user row 上的 `highspeed` metadata 类型(`{expiresAt}`)与 `getHighspeedTurnByCommandId` 所需索引。
- UI 导出:`highspeed/` 17 文件 + `v4/highspeed/` 2 文件 + `assets/highspeed/` 6 素材。

## 4. 验收

- 回合带 HighSpeed 标识并完成;切草稿再切回不重播扩散(对齐上游 HS-E2E-01 断言口径,可用单元测试模拟 store 状态机)。
- 卡过期后流光不渲染(`expiresAt <= now` 分支有测试)。
- typecheck + ui 包测试通过。

## 5. 依赖与搬运清单

- 依赖 task-1:highspeed metadata 的 shared 类型。
- 搬运清单(交 release-integrator):`packages/ui/src/highspeed/`(17)、`packages/ui/src/v4/highspeed/`(2)、`packages/ui/src/assets/highspeed/`(6),Apache-2.0。

## 4. 第二切片(ConversationTurnGroup 集成)判别:挂账

**判别数据(29628c9a..aac47556, 34 hunk)**:仅 highspeed 的 hunk **18 个**(主导)、混合 hunk 仅 3 个、仅 pluginUi **0** 个、仅 topic 1 个、无功能符号 12 个(compactForRemoteControl 透传与 sourceCommandIds 传递, 良性——前者是 CE 的 AssistantPreviewCards 已有能力的字符串透传)。三个混合 hunk 为同行级混合可分行剥离(如 AssistantHistoryStatus props 同时含 highspeed 与 useBotTopicInterruption——后者属 F8 topic, 未搬, 提取时排除)。对外 props 只新增可选 `nowMs?: number`(Timeline 共享 UI 时钟), 不破坏 CE 既有消费方。**结论:技术上可提取(18 纯 hunk + 3 混合 hunk 行级分离), 不涉及恢复 CE 裁剪能力。**

**事实**:

- 卡片库(25 文件 + 2 依赖件)已搬入且类型干净(task-9 完成后 IUsageStatsService.getCodingPlanRegularTps 就位);引用方检查:0(卡片库当前 inert, 无渲染入口)。
- 集成点 ConversationTurnGroup.tsx:CE 1466 行 vs 上游 1766 行,3.14.3→3.15.1 的 +316 行增量里 highspeed 集成(HighspeedOutputFooter 组件、turn store 订阅、props 扩展)与 F5 plugin-ui / F8 topic 集成**在同一批 hunk 里交织**(render context 的类型扩展是联合的),无法只剥离 highspeed;
- F2 的服务端(抽卡/发放/权重)按矩阵不搬,UI 集成的用户面价值依赖协议下行的 highspeed metadata(类型已就绪)。

**处置(已执行)**:hunk 级提取已完成——18 纯 highspeed hunk + 9 通用 hunk(import/compactForRemoteControl) + 3 混合 hunk 行级分离(排除 topic 的 useBotTopicInterruption/BotGroupDeliveryAction 与 F6 的 fillGraphByRunId)。落地:HighspeedOutputFooter/ShareDialog 渲染、紫色流光(showHighspeedAnimatedGradient + nowMs)、AssistantHistoryStatus 节省时长(savedDurationLabel)、ConversationTurnFlow 高速 props。排除的 topic 行属 F8(未搬服务),F6 fills 留判别轮。

**连带采用的上游版文件**(CE 均无自研):conversationTurnRenderUnits + 新 conversationTurnRenderUnitTypes(类型重构)、conversationRowContext(Modified: 删 F6 域 workflowFillGraphByRunId 字段)、ConversationFileSummaryPanel、useAssistantPreviewCardsForRow、assistantDirectiveParser(isParameterPrefix 增量)、ConversationRowView 的 ConversationAssistantTextActions(compactForRemoteControl prop + resolveTooltip 行为)。理由:① 交织增量整文件采用会带入未搬的 plugin-ui/F8 依赖,精准提取则 render context 联合类型无法干净剥离;② F6 的先例(深度交织文件采用上游版破坏 CE 既有消费方)证明此类集成的破坏性风险;③ 卡片库已就位且类型门禁通过,服务波次/判别轮决定集成方式时可直接复用。

服务端不搬 ⇒ 卡片库即使集成也无真实抽卡数据,展示态需要 fixture 支持——这些与 X1 的 fork-edit-retry(已移交 task-8)同属 F2 端到端链路的挂账项。
