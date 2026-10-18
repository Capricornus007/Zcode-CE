# 148 · pi 开源更新吸收第二批：thinking 卫生核对、compaction 剥离 reasoning、per-model 压缩预算、配置 JSON Schema

> 来源：2026-10 对 pi（earendil-works/pi，MIT）1.0 → 1.3.0 更新的吸收评估；用户裁定「全部优化」。
> 第一批已吸收项：跨 provider 消息清洗（`cross-provider-message-hygiene.ts`，吸收 pi transform-messages.ts）、
> 按预算保留近端轮次（`compact-selection.ts`，吸收 pi keepRecentTokens=20K）、compact 截断保护
> （`formatCompactSummaryOrThrow`，吸收 pi compaction.ts:618-638）。本 spec 只记录本批增量的现状裁决与实现。

## 逐项裁决（2026-10-18 实测）

| # | pi 特性 | 现状（实测证据） | 裁决 |
|---|---------|------------------|------|
| 1 | 切模型丢弃旧模型 thinking（1.3.0 #10995） | `cross-provider-message-hygiene.ts` 已实现：仅 provider+model 与目标一致时保留 reasoning 块；`model.ts:59` 已接线；`core/test/cross-provider-hygiene.test.ts` 10 条 | **已完成**，无动作 |
| 2 | compaction / 摘要省略 thinking（1.2.0） | `buildCompactSummaryRequestMessages`（`compact-active-helpers.ts:97`）直接复用 `buildProviderRequestMessages`，历史 reasoning 块**原样进入摘要请求** | **本批实现**（见下） |
| 3 | 会话中途改思考档不丢 prompt cache（1.3.0 #10853） | `reasoningLevel` 是请求级 option（`turn-model-step`/`model.ts:210`），从不序列化进 messages/system/tools；cache 断点全部基于内容（tools / system / meta-user 稳定块 / 滚动尾，见 `provider-request-messages.ts:81-119`） | **无此问题，N/A**。pi 的问题形态是把档位写进了前缀；ZCode 的档位换挡不重写前缀，自适应降档同理 |
| 4 | 首 prompt 不等没有 direct 工具的 MCP server（1.0 #10212） | `listTools`（`adapters/src/mcp/index.ts:502`）只刷新**已连接** server（`:506` 状态门），不会为拉工具清单触发连接；连接由显式 `connectServer` 驱动 | **已惰性，N/A** |
| 5 | cost-aware cache warming + 诊断（0.86 #9668） | `cache-keep-alive.ts` 已吸收核心：12min 阈值落在实测 TTL 窗（bench/cache-ttl-probe.mjs v2）、成本论证、turn 双保险、静默降级；诊断日志已有 contextTokens + cacheReadTokens | **本批补命中率观测**（cacheHitRatio）；per-model 阈值**有意不做**：无任何模型实测出 TTL 偏离 12min 窗，加了就是无证据配置面 |
| 6 | per-model compaction 预算（0.86 reserveTokens/keepRecentTokens） | keepRecentTokens 对应物是模块常量 `COMPACT_PRESERVE_RECENT_TOKEN_BUDGET = 20_000`（`compact-selection.ts:24`），不可配 | **本批实现**：进 `AutoCompactPolicyConfig`（全局 + per-model 覆盖） |
| 7 | /bug 报告自动附加崩溃记录（0.86） | 崩溃诊断已是结构化单行（`process-errors.ts:110`）→ Host 进程管理器解析消费（`zcodeAgentProcessManager.ts:1067` 段）；CE 反馈仅 like/dislike（`assistant-feedback-persistence.ts`），**没有报告上传通道** | **有意不做**：诊断已到达唯一 sink（Host 日志），再在 CLI 侧落盘会造出第二所有者；将来若做报告/上传通道，在此 spec 基础上把 ring 缓冲接进该通道 |
| 8 | settings JSON Schema 供编辑器校验（1.2.0） | config 接受 `$schema` 字段（`adapters/src/config/schema.ts:349`，测试用 `https://zcode.ai/schema/config-v2.json`），但仓库**没有任何生成的 JSON Schema 文件** | **本批实现**：从 `ZCodeConfigFileSchema` 生成并随仓分发 |

## 本批实现

### ② compaction 摘要请求剥离 reasoning 块

- 位置：`buildCompactSummaryRequestMessages`（`core/src/runtime/methods/compact-active-helpers.ts`）。
- 语义：投影出 provider messages 后，对 `role === "assistant"` 且 content 为块数组者过滤掉 `type === "reasoning"` 块。与 pi 1.2.0 一致：重放 thinking 往往不在真实上下文里（摘要请求的旧签名对摘要模型无效），只会撑大摘要请求。
- 不变式：live 请求、跨模型卫生（①）、post-compact 保留轮、`estimateRuntimeEntryTokens`（预算估算按 live 口径）都不变；只动摘要请求这一处投影。

### ⑥ 保留预算进 AutoCompactPolicyConfig

- `core/src/compact/policy.ts` 的 `AutoCompactPolicyConfig` 新增：
  - `preserveRecentTokenBudget?: number`——覆盖默认 20K；
  - `preserveRecentTokenBudgetByModel?: Record<string, number>`——按摘要模型 modelId 覆盖。
- 解析顺序：`byModel[modelId]` > 全局 > 常量 20K；缺省行为完全不变。
- 接线：`selectCompactEntries` 及两个 prompt-too-long 包装函数增加预算入参；`compact-active.ts` 调用点从 `config.compact` + 当前模型解析后传入。

### ⑤ keep-alive 命中率观测

- `sendCacheKeepAliveRequestImpl` 的 info 日志补 `cacheHitRatio`（cacheReadTokens / contextTokens）；该值长期偏低 = 实测 TTL 假设被打破的第一信号，是将来 per-model 阈值的前置证据。

### ⑧ config JSON Schema 生成与分发

- 以 zod4 原生转换器 `z.toJSONSchema(ZCodeConfigFileSchema, { target: "draft-7", io: "input" })` 生成，产物 `docs/schema/zcode-config-v2.schema.json`，`$id` 对齐既有测试约定的 URL。不用 `zod-to-json-schema`：其 3.25.2 按 zod3 的 `def.typeName` 分发解析器，对 zod4 classic schema（`_def.typeName === undefined`）产出空 body，实测该库无法序列化本 schema。
- 棘轮护栏：单测对比「产物文件 = 当前 schema 生成结果」，漂移即红；`UPDATE_CONFIG_SCHEMA=1` 重写。config 结构变化必须重生成，否则测试拦截。
- 编辑器用法写入产物头注释与 CLI 配置文档：用户可把 `$schema` 指向本地文件路径或 file URL。

## 边界

- ② 只影响摘要请求的发送内容，不写历史、不改 V4 投影；摘要失败重试链不受影响。
- ⑥ 模型键是 modelId（不含 providerId）：同名模型跨 provider 共享预算；如出现实际冲突再引入复合键。
- ⑧ schema 是快照产物；不支持 zod 无法表达的字段级 JSON Schema 语义（与 `contracts/src/tools/json-schema.ts` 同一限制）。
- ⑦ 的「不做」带重启条件：出现报告/上传通道时重开。

## 验证

- `core/test/compact-pi-absorptions.*` 新增②用例（摘要请求无 reasoning 块、prompt 与工具块保留）；
- `core/test/compact-policy.*` / selection 用例新增⑥（缺省 20K 不变、全局覆盖、per-model 覆盖优先）；
- `core/test/cache-keep-alive.*` 断言⑤新字段；
- `adapters/tests/config*schema*` 棘轮用例⑧；
- `pnpm --dir apps/zcode-cli typecheck`、受影响包测试；根 `pnpm typecheck`。
