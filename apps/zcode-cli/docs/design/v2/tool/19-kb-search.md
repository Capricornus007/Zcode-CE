# 19 · KbSearch：知识卡语料的主动检索（140 §P1-5）

## 能力

`KbSearch` 让模型按需检索工作区知识卡语料 `<cwd>/.zcode/kb-cards/*.md`，返回**锚点**而不是正文：

- 每张卡的 `description` 形如 `<源文件>#<标题> —— <摘要>`；
- 结果给出 `source`（源文件#标题）、可选 `title` / `summary`、`cardPath`（卡文件，便于 grep）；
- 模型随后用 `Read` 读源文件正文。

它与每轮注入的 `kb_recall` system-reminder 互补：提醒是默认 top-5 线索，本工具是模型主动查询（可 `family` 限定家族）。

## 输入

```ts
{
  query: string;               // 1–2000 字符，必填
  topK?: number;               // 1–20，默认 8
  family?: string;             // ^[a-z0-9_-]{1,40}$；按 kb-<family>-*.md 过滤
}
```

## 输出

```ts
{
  anchors: Array<{ source: string; title?: string; summary?: string; cardPath: string }>;
  total: number;               // 过滤后参与排序的语料条数
  family?: string;
  warning?: string;            // 语料超过生成器护栏等显式告警
}
```

无卡目录、无 family、无相关命中时返回空 `anchors` 与 `total: 0`，**不编造来源**。

## 权限与副作用

| 项 | 值 |
| --- | --- |
| permission | `kbSearch`（by toolName，alwaysAllow） |
| readOnly / destructive | `true` / `false` |
| sideEffectScope | `none` |
| needsApproval | `false` |
| 并发 | `concurrentSafe: true` |

只读卡目录与派生缓存（`.kb-index.json` / 向量档）；不写语料，不发起网络请求（embedding 端点仅用于向量召回，属既有可选增强）。

## 执行链与状态所有者

```
ToolExecutor.context.kbSearchControlPort
        │  (runtime/helpers/runtime-tools.ts 装配)
        ▼
runtime/methods/kb-search.ts  searchKbCorpus
        │  ├─ memory/recall/kb-corpus.ts   （语料自述 + 落盘索引，140 §P0-1/§P1-3）
        │  └─ rankRecallCorpus            （词法 + embedding 融合，与 kb_recall 同源）
        ▼
锚点 ──> 模型 Read 源文件
```

- 索引/向量是派生缓存，可删除重建；语料目录是唯一权威。
- handler 不直接触碰文件系统或 embedding 端点：端口缺席时抛 `ConfigurationError`（诚实失败）。

## 失败路径

| 场景 | 行为 |
| --- | --- |
| 无文件系统 / 端口未装配 | `ConfigurationError`（不可恢复） |
| 无 `.zcode/kb-cards` | 空结果 |
| 语料超过护栏 | 正常返回 + `warning`（不截断） |
| embedding 失败/预算耗尽 | 退回词法档（既有语义） |
| 索引损坏/越界 | 整份作废重建 |
| 输入 schema 不符 | executor 统一校验失败，不执行 |

## 结果预算与超时

- `maxOutputBytes` / `resultBudget`: 8 KiB（truncate head）。
- timeout: 5 s，不允许调用覆盖。
- 取消：支持；`cleanup: "none"`。

## 事件 / UI

- trace 必填，`recordInput/Output: "summary"`，不向 adapter 传播。
- 结果走通用 tool result 投影；不新增 session event、不新增 UI 类型。

## 测试

- `core/tests/kb-search-tool.test.ts`：端口缺席、正常锚点、family 过滤、空语料、告警透传、schema 校验。
- `core/test/kb-search.test.ts`：`searchKbCorpus` 与 `loadKbCorpus` 的索引/告警/过滤。
- 既有 `kb-recall-reminder.test.ts` / `kb-corpus.test.ts` 保持通过。

## 迁移

新工具，无历史数据迁移。模型可见面默认注册；无文件系统的 runtime 通过 `includeKbSearch: false` 不注册。
