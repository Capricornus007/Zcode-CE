# 174 · F5 UI 插件（MCP App）运行时消费侧移植

> 状态：**已实现（消费侧核心链路，2026-10-13）**。覆盖公告「新增支持 UI 插件（MCP App）」中归 cli-runtime-port 的消费侧；契约定义侧（shared/mcp-apps、bootstrap/src/zcode-protocol/mcp-ui/）由 core-services-port 完成（task-1 已完成）。落地清单见文末「实现记录」。
> 上游来源：`aac47556`（Apache-2.0）。矩阵称 F5 为「本版最大单项（~109 文件）」，本 spec 只覆盖归我的运行时消费子集。

## 0. 读了什么 / 结论一致性

| 材料 | 结论 |
| --- | --- |
| PORT-MATRIX F5 行「CE 0 命中」 | **证实**：CE 无 `core/src/mcp/app-tools.ts`、无 contracts mcp.port 的消费侧新增（visibility/ui/resource/elicitation 全无）、无 ZCodeApp 的 mcp-app 方法、无 v4 elicitation 接线。 |
| Lead 写范围扩展通知（task-4 rev 2） | 消费侧归我：contracts mcp.port.ts（+174）、bootstrap/src/app（ZCodeApp 12 个新方法）、bootstrap/src/zcode-protocol-v4（接线）、tui 消费者 + 原 core（F3、mcp/app-tools.ts、X10）。注意：writeScopes 未列 `tui`（描述提到），**需与 Lead 确认 tui 是否归我**——实测 tui 侧与 mcp-app 相关的上游落点仅 `tui/tests/tui-approval-panel.test.ts`（1 处 `mcp__`），消费面很薄。 |
| 上游 consumer 文件清单（grep 定位） | core：`mcp/app-tools.ts`（157 行，上游独有）、`mcp/index.ts`（diff）、`tool/executor/result-display.ts`（McpToolUiDescriptor 消费 2 处）、`tool/executor/appAuthorization.test.ts`；bootstrap：`app/types.ts`（12 方法签名）+`app/session-facade.ts`（10 处实现）+`zcode-protocol-v4/mcp-elicitation.ts`；contracts：`mcp.port.ts`（+174）。 |
| CE contracts/mcp.port.ts 自研内容 | CE 有 `disabledTools`/`mcpDisabledTools` 重导出块（task 后自研，测试见 `packages/adapters/test/mcpDisabledToolsConfig.test.ts`、`core/test/mcpDisabledToolsSingleSource.test.ts`）。**diff 显示上游 3.15.1 无此块——移植时必须保留 CE 该块**（AGENTS.md：保留与任务无关的本地改动），即 mcp.port.ts 是**三向合并**不是搬运。 |

## 1. 产品规则（消费侧视角）

1. **App-Provided Tools 是页面提供的工具**：模型侧名字 `app__<server>__<tool>`；条目只描述「模型怎么看见、审批怎么走、结果怎么进模型」，调用本身交给宿主注入的执行器（页面执行后回传）。
2. **页面是不可信沙箱代码**：`sideEffectScope: "network"`；非只读一律 needsApproval；`destructiveHint` → riskLevel high，只读 → low，其余 medium。
3. **"始终允许"只在本会话生效，不写持久规则**：模型侧名字跨会话会被别的页面复用（`askOptions: { allowAlways: "session" }`）。
4. **两段超时**：认领期限（CLAIM）+ 执行期限（CALL），条目级超时为两者之和 + 5s 余量，且 `allowCallOverride: false`（页面声明的超时不可被调用方覆盖）。
5. **可见性（visibility）是唯一的开放判定**：descriptor.visibility → ui.visibility → 缺省视为 `["model","app"]`；不含 "model" 的工具不进 provider contracts；不含 "app" 的工具拒绝 `mcp/uiCallTool`。
6. **页面写操作固定连接**（`appConnection: {identity, generation}`）：禁止恢复或重新授权后自动重放；断线时不签发新页面凭证（`onAppConnectionInvalidated`）。
7. **资源订阅按 (serverName, uri) 计数**：0→1 才真订阅、1→0 才退订； subscriberKey 以会话为前缀（`sessionId|scopeId|generation`），会话关闭时按前缀批量退订；server 未声明 `capabilities.resources.subscribe` 时抛 `McpResourceSubscribeUnsupportedError`（协议 -32001）。
8. **elicitation 必须可归属**：server 发起 elicitation 时若找不到在执行的工具调用归属会话，端口拒绝（`McpElicitationTrace`）。
9. **工具级 `_meta.timeoutMs` 有区间**：低于 `MCP_TOOL_META_TIMEOUT_MIN_MS`(1s) 视为非法丢弃，高于上限（30min）截到上限。
10. **工具列表变更检测**：McpPort 可选 `toolListRevision()`——runtime 回合开始前比较累计值，变了才重新 listTools 并重注册；未实现表示端口不主动变化（避免每回合全量重拉）。

## 2. 状态所有者

| 状态 | 唯一所有者 | 读取方 |
| --- | --- | --- |
| App 工具登记（本会话的 app__ 条目） | ZCodeApp.`replaceMcpAppProvidedTools`（整体替换语义；与非 App 工具重名的定义跳过） | 工具注册表 → provider contracts |
| 连接代际（identity+generation） | McpPort 的 appConnection 通道（`appConnectionSnapshot`） | session-facade、协议处理器 |
| 资源订阅登记表 | adapter/连接层（按 (server,uri) 计数） | session-facade 的订阅入口 |
| 可见性判定 | contracts 的 `resolveMcpToolVisibility`（唯一实现） | provider contracts、mcp-ui 处理器 |
| 页面调用结果 | 宿主执行器（bootstrap 实例信箱，协议侧定义） | core app-tools 的 handler |

## 3. 接口（消费侧，按文件）

| 文件 | 改动 |
| --- | --- |
| `contracts/src/interfaces/mcp.port.ts` | **三向合并**：加 visibility/ui 字段 + `resolveMcpToolVisibility`；加 `McpReadResource*`/`McpListResources*`/`McpResourceSubscriptionRequest`/`McpResourceSubscribeUnsupportedError`/`McpServerNotification`/`McpNotificationPort`/`McpToolCallProgress`/`McpCallToolOptions.{appConnection,onProgress}`/`MCP_TOOL_META_TIMEOUT_{MIN,MAX}_MS`/`McpElicitation*`/`McpElicitationPort`；McpPort 加 `toolListRevision?/readResource?/listResources?/listResourceTemplates?/subscribeResource?/unsubscribeResource?/unsubscribeResourcesBySubscriber?/onAppConnectionInvalidated?/appConnectionSnapshot?`。**保留** CE 的 disabledTools/mcpDisabledTools 块不动。 |
| `core/src/mcp/app-tools.ts` | **逐字节搬运**（157 行，Apache-2.0 + `Modified by ZCode:`）。依赖 `@zcode/shared/mcp-apps` 的两个超时常量（task-1 定义侧）+ `./image-normalization.js` + `./index.js`（CE 已有）。 |
| `core/src/mcp/index.ts` | 按 upstream diff 导出 app-tools 相关入口（实现时以 diff 为准）。 |
| `core/src/tool/executor/result-display.ts` | 按 upstream diff 消费 `McpToolUiDescriptor`（2 处，工具结果展示）。 |
| `bootstrap/src/app/types.ts` | ZCodeApp 加 12 方法：`readMcpResource`/`onMcpAppConnectionInvalidated`/`getMcpAppConnectionSnapshot`/`callMcpToolForUi`/`getMcpToolVisibility`/`replaceMcpAppProvidedTools`/`listMcpResourcesForUi`/`listMcpResourceTemplatesForUi`/`subscribeMcpResourceForUi`/`unsubscribeMcpResourceForUi`/`unsubscribeMcpResourcesForUi`/`readMcpResourceForUi`。 |
| `bootstrap/src/app/session-facade.ts` | 12 方法的实现（上游 10 处接线，按 upstream diff 落；其余实现文件实现时按 diff 定位）。 |
| `bootstrap/src/zcode-protocol-v4/mcp-elicitation.ts` | **搬运** elicitation 接线。 |
| tui | 待与 Lead 确认范围（上游落点仅 approval-panel 测试 + 通用工具展示）。 |

## 4. 范围外依赖

- 契约定义侧（task-1，core-services-port）：`shared/mcp-apps`（`MCP_APPS_APP_TOOL_{CLAIM,CALL}_TIMEOUT_MS`、`McpAppsToolVisibility`、`McpToolUiDescriptor`、wire schema）、`bootstrap/src/zcode-protocol/mcp-ui/`（appToolsProtocol/appTools/sessionAccess + CONTRACT.md）、`packages/client/globals.d.ts`。
- 桌面 plugin-sandbox host 侧（desktop-host-port）。
- 174 的实现顺序：**task-1 的 shared/mcp-apps 必须先落地**（core/app-tools.ts 与 contracts 都 import 它），否则 typecheck 不闭合——与 Lead 通知一致。

## 5. 验收场景

| # | 场景 | 期望 |
| --- | --- | --- |
| C1 | 页面注册一个只读 app 工具 | 模型可见 `app__<server>__<tool>`；工具元数据 needsApproval=false、readOnly=true、riskLevel=low |
| C2 | 注册非只读工具 | needsApproval=true；"始终允许"选项只出现会话级（allowAlways="session"），不落持久规则 |
| C3 | 调用 app 工具 | handler 走注入执行器；结果经 `normalizeMcpToolResultForModel`；超时按条目级常量且不可被调用覆盖 |
| C4 | 与已有非 App 工具重名的定义 | 跳过（不覆盖） |
| C5 | 工具声明 visibility 不含 "app" | `mcp/uiCallTool` 拒绝 |
| C6 | 页面写操作时断线重连 | 不自动重放；`onAppConnectionInvalidated` 通知订阅者 |
| C7 | 订阅资源（server 支持/不支持 subscribe） | 支持：0→1 真订阅；不支持：抛 `McpResourceSubscribeUnsupportedError`（-32001） |
| C8 | 会话关闭 | 按前缀批量退订（`unsubscribeMcpResourcesForUi`），返回真正退订数 |
| C9 | server 发起 elicitation 无可归属会话 | 端口拒绝 |
| C10 | `_meta.timeoutMs`=500ms / 40min | 500ms 视为非法丢弃；40min 截到 30min |
| C11 | disabledTools 回归 | CE 既有 `mcpDisabledToolsSingleSource` 测试全绿（三向合并未破坏自研块） |

## 6. 测试（CE 口径）

- `test/mcpAppProvidedTools.test.ts`（node:test + assert/strict）：C1-C4、C10 的纯条目断言（`createMcpAppProvidedToolEntry` 产出的 metadata/permission/timeout/cancellation 不依赖页面）。
- 上游 `core/tool/executor/appAuthorization.test.ts` 的行为按 CE 口径选移植（实现时评估依赖）。
- 回归：`packages/adapters/test/mcpDisabledToolsConfig.test.ts`、`core/test/mcpDisabledToolsSingleSource.test.ts`、`core/test/mcpToolEnablement.test.ts` 全绿。

## 7. 验证

`pnpm --dir apps/zcode-cli typecheck`（**含 contracts 与 bootstrap——typecheck 责任在我这侧闭合**，Lead 通知原话）、`pnpm --dir apps/zcode-cli lint`；`cd apps/zcode-cli/packages/core && node --import tsx --test test/mcpAppProvidedTools.test.ts` + 上述回归测试。门禁真实结果回传。

## 8. 搬运清单（Apache-2.0）

| CE 文件 | 上游路径 | 备注 |
| --- | --- | --- |
| `core/src/mcp/app-tools.ts` | 同名 | 逐字节 + 标记 |
| `bootstrap/src/zcode-protocol-v4/mcp-elicitation.ts` | 同名 | 逐字节 + 标记 |
| `contracts/src/interfaces/mcp.port.ts` | 同名 | **不登记为搬运**：三向合并（上游新增 + CE 自研 disabledTools 块保留），按本地修改登记 |
| `bootstrap/src/app/{types,session-facade}.ts`、`core/src/mcp/index.ts`、`core/src/tool/executor/result-display.ts` | — | CE 已有文件的修改，按修改登记 |

实现时若发现上游 diff 里有未在本清单的消费侧文件，补登记到本节并同步 release-integrator。


## 实现记录（2026-10-13，cli-runtime-port）

本节为现状陈述（keep-latest），供 release-integrator 登记与后续成员接手。

**contracts（新增/扩展，均带 Modified by ZCode 标记或为 Apache-2.0 搬运）**：
- `interfaces/mcp.port.ts`：McpToolDescriptor.visibility/ui + resolveMcpToolVisibility；资源读取/订阅类型族（McpReadResource*/McpListResources*/McpResourceSubscriptionRequest/McpResourceSubscribeUnsupportedError）；McpServerNotification/McpNotificationPort；McpToolCallProgress、McpCallToolOptions.{appConnection,onProgress}、MCP_TOOL_META_TIMEOUT_{MIN,MAX}_MS；McpElicitation* 端口；McpPort 端口方法族（readResource/listResources/listResourceTemplates/subscribe*/unsubscribe*/appConnectionSnapshot/toolListRevision/onAppConnectionInvalidated）。
- `events/session.events.ts`：SessionEventType 的 PluginUiResourceUpdated/ResourceListChanged/InstanceClosed/AppToolCallRequested 四枚举 + 三个 payload + 载荷联合；BackgroundResultOriginMeta 的 hole 变体（F6 通知载体的 contracts 镜像）。
- `plugins/index.ts`：PluginManifest.ui、PluginUiSurfaceDefinition 族、PluginMetadata.uiSurfaces、PluginReferenceCatalogEntry.uiSurfaces。
- `interfaces/topic-resource.port.ts`（新文件）：话题附件读取/同渠道回复端口。
- `interfaces/permission.port.ts`：PermissionBrokerRequest.approvalMode、PermissionBrokerResult.inputAdjustments。

**core（新增/扩展）**：
- `mcp/app-tools.ts`（新文件）+ `mcp/index.ts` 导出：App-Provided Tools 的 ToolEntry 构造（createMcpAppProvidedToolEntry/McpAppProvidedToolDefinition/Executor）与 createMcpToolEntry/formatMcpToolResult 导出。
- `tool/types.ts`：ToolExecutionContext.inputAdjustments、ToolInputAdjustmentResult、ToolEntry.applyInputAdjustments；mcpPresentation.pluginId/ui。
- `runtime/methods/sample-model.ts`（新文件）+ proto 注册 + AgentRuntime.sampleModel 接口声明：MCP App sampling（不开 turn 的独立模型调用，model-status 的 persist:false 选项为此并入）。
- `tool/executor/impl.ts` + 接口：authorizeAppTool（授权到审批为止，不执行）。

**bootstrap（消费侧接线）**：
- `zcode-protocol-v4/mcp-elicitation.ts`（新文件，152 行，2026-10-13 补搬运）：MCP elicitation 与用户提问通道的映射纯函数（requestedSchema → 问题列表、答案 → ElicitResult.content）。**注意：上游的两个消费点（product-projection 的 elicitation 显示、zcode-protocol/interaction-broker 的权限选项）在 CE 尚未接线**——文件落地即为模块可用，显示侧属 ui-features、broker 侧属 core-services；在此之前该模块无 CE 消费点（上游 core 亦无消费）。
- `app/types.ts`：ZCodeApp 新增 13 个方法签名（readMcpResource*、list/subscribe/unsubscribe*、callMcpToolForUi、getMcpToolVisibility、replaceMcpAppProvidedTools、sampleModel、getMcpAppConnectionSnapshot、onMcpAppConnectionInvalidated）。
- `app/session-facade.ts`：上述 13 方法的实现（与上游 session-facade 同一逻辑：全部经 deps.mcpPort / runtime；callMcpToolForUi 含 generation 校验与 authorizeAppTool）。
- `zcode-protocol-v4`：conversation-topic-publisher（pluginUi 增量不进冷启动测量）、product-projection 两处穷尽 switch、projection-state 的 deltaBumpsRevision（live-only 不记账）。

**tui**：`apps/zcode-cli/packages/tui/src/app-workflow-mirror.ts` 步数读法收口到 shared 的 workflowRunStepCounts（F6 三处读面共用同一数法）。（注意：本仓库的 tui 包位于 apps/zcode-cli/packages/tui，工作树无 packages/tui 顶层路径；清单登记时勿用后者。）

**验证**：contracts/core/cli/adapters/tui/bootstrap 六包 tsc 全绿；core 86 + cli 8 + adapters 21 + tui 12 + bootstrap 51 = 178 测试全绿（含 F3 的 guarded-command 13 / guarded-mode 6、F6 的 workflow-settings-adjustment 9）。
