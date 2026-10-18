# 140 · 奇门技能充分利用：检索 / 路由 / 长会话 / 执行

## 背景与决策

奇门的**盘面显示**已在 [138](./138-qimen-pan-fence.md) 闭环：`排盘.py --json` → `qimen` 围栏 → 原生九宫盘，桌面、Web、分享页与 E2E 全部接线。但技能内容的调用链仍只有三条通道：

1. 一次全量加载 `SKILL.md`（奇门 19,453 字，无分节、无 references 索引）；
2. 每轮 5 条知识卡锚点（`.zcode/kb-cards` 共 24,778 张）；
3. 模型自行 Grep / 逐文件 Read（`qimen-duanpan/references` 58 个文件、16.4 MB）。

用户的要求是「ZCode 能充分利用 `F:\智能体` 里的奇门技能」。据此判断：瓶颈不在渲染，而在**知识能否被找到、能否被准确路由、能否在长会话里保持**。

**决策**：把改造拆成四层（检索 / 路由 / 长会话 / 执行），按 P0 → P3 排期。本 spec 只定义问题、契约、状态所有者与验收；实现按档独立提交。

## 实现状态（2026-10-18）

| 项                   | 状态                     | 落点 / 备注                                                                                                                                                     |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 语料上限        | ZCode 读侧已实现         | `memory/recall/kb-corpus.ts`；生成器写 `.corpus.json` 待工作区侧落地。未写时读侧仍不截断（回退全量扫描）                                                        |
| P0-2 描述截断        | 已实现                   | `context/sections/skills.ts` 上限 400                                                                                                                           |
| P1-3 manifest 索引   | ZCode 读侧已实现         | 索引由 `.corpus.json` 版本锚定；清单读取改 16 路有界并发（旧实现 EMFILE，24,778 张只看到 8,189）。无自述文件时不启用                                            |
| P1-4 向量盘档        | 已实现 int8 + 家族分片   | `memory/recall/vector-store.ts` v2；离线预计算未做；v1 单文件盘档不再读取，可直接删除                                                                           |
| P1-5 `kb_search`     | 已实现                   | `KbSearch` 工具 + `kbSearchControlPort`；合同见 `apps/zcode-cli/docs/design/v2/tool/19-kb-search.md`                                                            |
| P1-6 references 索引 | 已实现                   | adapter 枚举 + Skill handler 注入（80 项 / 8 KiB）                                                                                                              |
| P2-7 Skill digest    | 已实现                   | 每次压缩边界注入一条；不做「每会话一次」——每轮压缩都会重新丢正文                                                                                                |
| P2-8 盘面状态        | 已确认不可复用，本批不做 | 查 `SessionStorePort`：只有 messages/parts/todos/target/permission/revert 等业务表，没有通用 KV 或会话 artifact 槽；新增即 schema/migration + 第二状态所有者    |
| P3-9 排盘 MCP        | 已实现（工作区侧）       | `zcode.json` 声明 `qimen-paipan` stdio server；`qimen_paipan` 固定 cwd/参数序/`-X utf8`/JSON 校验，支持经度换真太阳时。项目 MCP 默认不受信任，需 `/mcp connect` |
| P3-10 案例回写 hook  | 已实现（工作区侧）       | `Stop` hook 只认模型主动输出的 `case-record` 围栏；`盲测复盘库.py add --json` 非交互登记 + 同日同问题去重；失败不阻断。项目 hooks 需工作区信任                  |

**非目标**：

- 不重写奇门知识内容（工作区 `F:\智能体` 的职责）。
- 不做紫微、八字等其他体系的围栏（可复用本模式，另立 spec）。
- 不引入云端检索或向量服务；embedding 端点仍是可选增强，缺失时退回词法档并显式声明一次。
- 不做隐式技能自动调用（`allowImplicitInvocation` 仍无消费方）：路由准确性靠清单不丢触发词，自动路由另立 spec。

## 现状证据（2026-10-18 快照）

| 项              | 值                                                                         | 来源 / 口径                                                                                                           |
| --------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 技能数          | 60                                                                         | `.agents/skills/*/SKILL.md`，单层扫描                                                                                 |
| 技能清单体积    | ≈15.6 K 字符（预算 20 K）                                                  | 名称 + 描述（截 250）+ 路径，估算                                                                                     |
| 奇门描述        | 349 字，被截到 250                                                         | 尾部丢失「盲测复盘库 / 231 案例 / 十一体系诊断路由 / 杨公风水 1080 局」                                               |
| 奇门 SKILL.md   | 19,453 字 / 41,783 字节                                                    | 一次 Skill 调用全量注入                                                                                               |
| 奇门 references | 58 个文件 / 16.4 MB                                                        | SKILL.md 内只索引 7 个；单文件最大 2.76 MB                                                                            |
| 知识卡语料      | 24,778 张                                                                  | `.zcode/kb-cards/*.md`；qimen 2,790 张                                                                                |
| KB 读侧上限     | 24,000 条，mtime 降序后 slice                                              | [kb-recall-reminder.ts](../../apps/zcode-cli/packages/core/src/runtime/methods/kb-recall-reminder.ts) `KB_FILE_LIMIT` |
| 被丢弃的卡      | 778 张，全部是 bazi（占 bazi 37%）                                         | 按 [manifest.ts](../../apps/zcode-cli/packages/core/src/memory/recall/manifest.ts) 的排序 + slice 逻辑模拟            |
| manifest 扫描   | 旧实现 ≥6.4 s，且 24,778 张只成功 8,189 条（无界并发 EMFILE 后静默丢弃）   | 24,778 文件各读前 4 KB；`Promise.allSettled` 同时开约 5 万句柄，rejected 分支被过滤                                   |
| 向量盘档        | 242 MB，22,525 条，读 0.97 s + parse 0.49 s，RSS 818 MB                    | `.zcode/.vector-cache.embedding-3.*.json`，Node 实测                                                                  |
| 向量覆盖率      | qimen 96%（2,672/2,790）、liuren 75%（1,581/2,115）、bazi 45%（945/2,087） | 盘档键前缀统计；2.5 s 预算 × 64 条/批，暖满需 ~387 批                                                                 |
| 路由机制        | 无隐式路由                                                                 | `allowImplicitInvocation` 只写不读（全仓无消费方）                                                                    |
| 长会话          | Skill 正文随历史摘要化消失                                                 | [loaded-skills.ts](../../apps/zcode-cli/packages/core/src/agent/loaded-skills.ts) 注释即判据                          |

> 表中卡数、上限、字节数都是快照。实现时凡会随语料增长而漂移的值一律运行时读取（语料自述文件或实时统计），不复制进常量；时间数据来自本机 SSD，绝对值仅作量级参考。

## 设计原则

1. **语料目录是唯一权威**：`.zcode/kb-cards/`、`.agents/skills/` 是事实；索引、向量、摘要都是派生缓存，可删除、可重建，损坏即重建。
2. **读侧禁止静默截断**：超出容量必须告警并保留 top-K，不允许整表失效或无声丢卡。
3. **召回只给锚点**：正文不进第二副本（工作区铁律 5.8）；模型用 Read 精读源文件。
4. **Skill 正文是指令，不是工具输出**：压缩策略按指令处理，不按可清缓存处理。
5. **跨仓常量不复制**：生成器护栏与语料条数由语料自述文件提供，读侧不再硬编码同值。

## 改造项

### P0-1 语料上限：自述文件 + 显式告警

**问题**：读侧 `KB_FILE_LIMIT = 24000`，语料已 24,778 张；`scanMemoryManifest` 按 mtime 降序 slice，最旧的 778 张（全为 bazi）永久不参与任何召回。语料继续增长会依次吃掉 gaodao / graphify / liuheng，逼近 liuren 与 qimen。

**契约**：工作区生成器在卡片目录写 `.corpus.json`：

```json
{
  "version": 1,
  "cardCount": 24778,
  "totalGuard": 27000,
  "generatedAt": "2026-10-18T13:44:00+08:00",
  "generator": "gen_kb_cards.py"
}
```

读侧规则：

- 有自述文件：上限取 `cardCount`（即不截断）；`cardCount > totalGuard` 时注入一行告警并 `logger.warn`，结果照常返回。
- 无自述文件：回退实时计数；计数超过 27,000 时同样告警，不再静默 slice。
- 自述文件损坏或版本不符：按无文件处理，不阻断召回。

**状态所有者**：语料与自述文件由工作区生成器持有；上限判定归 ZCode 读侧。

**验收**：

- 24,778 卡时召回覆盖 100%（当前 24,000/24,778）。
- 构造 30,000 卡 fixture：出现一条显式告警，且锚点仍返回。
- 删除 `.corpus.json`：除告警外行为与改造前一致。

### P0-2 描述截断：250 → 400

**问题**：`MAX_DESCRIPTION_CHARS = 250`，奇门描述 349 字，被截掉的尾部恰是与其他体系区分的触发词。

**方案 A（决策）**：上限提到 400。60 技能快照下描述总量 11,969 → 13,776 字符（+1,807），清单约 15.6 K → 17.4 K，仍在 20 K 预算内，且不进入短描述降级档。

**方案 B（预算告急时的备选）**：frontmatter 增 `triggers`（≤80 字），listing 行追加 `[触发: ...]`；需同步加入 `SAFE_FRONTMATTER_KEYS`，并更新 skill-creator 的字段说明。

**验收**：

- 奇门 349 字完整出现在清单中。
- 60 技能清单 ≤20 K 字符，未触发三级降级。
- `qizheng-siyu`（550 字）仍会截断；实现前确认其触发词是否落在前 400 内，否则改走方案 B。

### P1-3 manifest 索引：从每次扫盘到增量

**问题**：每一次 60 s TTL 到期都要扫 24,778 个文件；更严重的是旧实现用无界
`Promise.allSettled(paths.map(...))` 同时发起 stat + 读，实测 24,778 张只成功 8,189 条，
其余 EMFILE 拒绝后被静默过滤——语料覆盖缺口被伪装成「没有这张卡」。

**契约**：派生索引 `<工作区>/.zcode/.kb-index.json`：

```json
{
  "version": 1,
  "root": "<绝对路径>",
  "generatedAt": "...",
  "entries": [
    {
      "filename": "kb-qimen-...md",
      "mtimeMs": 1790000000000,
      "size": 512,
      "description": "...",
      "family": "qimen"
    }
  ]
}
```

- 加载：索引的 `root` 与 `corpusVersion`（`.corpus.json` 的 cardCount + contentHash + mtime）都匹配才使用；进程内再叠 60 s 缓存。
- 过期：语料版本变化 → 全量重建（生成器已保证 `.corpus.json` 与卡片内容同批更新）。
- 索引版本或结构不符、单条越界/损坏 → 全量重建，不阻断召回。
- 清单读取固定 16 路有界并发，杜绝 EMFILE 静默丢卡。

**目标与实测**：索引 17 MB；进程内缓存命中 6 ms、冷读索引 452 ms（≤1 s）；全量重建约 31 s（仅语料变更后一次）；24,778 卡覆盖 100%。

**状态所有者**：索引是纯派生缓存；删除索引等价于重建。

**验收**：

- 删除索引后功能不变，下一次召回自动重建。
- 修改任意一张卡 → 下一轮召回携带新描述。
- 24,778 卡下增量耗时 P95 <100 ms。

### P1-4 向量盘档：量化 + 分片 + 可选离线预计算

**问题**：242 MB 单体 JSON，只覆盖 22,525/24,778 条；加载 1.45 s、RSS 818 MB；每次落盘重写整个文件；2.5 s 预算下暖满需几十到上百轮。覆盖率按家族不均（bazi 仅 45%）。

**方案**：

- **量化**：float32 → int8（per-vector scale），242 MB → ≈55 MB；解码后按 top-10 重排一致率验收。
- **分片**：按技能家族切 17 个文件，只重写脏分片，单文件 ≤64 MB。
- **离线预计算**：工作区侧或一次性 `kb-index build --vectors` 产出全量向量；运行时只算 query 向量，缺失条目仍按预算续补。
- **目录**：`<工作区>/.zcode/kb-vectors/<model>/<family>.bin` + `index.json`（键 → 偏移量）。

**目标**：RSS ≤150 MB；覆盖率 100%；单轮召回 ≤300 ms。

**退化语义**：无端点或请求失败时退回词法档，且每会话显式提示一次「语义档不可用」，不静默降级。

**验收**：

- 断网 / 无 embedding 端点：词法档可用，提示出现一次。
- 24,778 卡全量：覆盖率 100%，top-10 与 float32 基线一致率 ≥95%。
- 删除向量目录：按预算续暖，不阻塞 turn。

### P1-5 `kb_search` 工具：从「只能看 5 条」到「可主动检索」

**问题**：召回是每轮固定注入 top-5，模型无法按需查询；奇门 2,790 张卡在跨体系查询里很容易一个都进不了注入位。

**契约**：

| 项   | 值                                                                                |
| ---- | --------------------------------------------------------------------------------- |
| 名称 | `kb_search`                                                                       |
| 入参 | `{ query: string; topK?: number (1–20，默认 8); family?: string }`                |
| 出参 | `{ anchors: [{ source, title, summary, cardPath }], corpus: { total, family? } }` |
| 只读 | `readOnly: true`、`destructive: false`、`sideEffectScope: "none"`                 |
| 上限 | `maxOutputBytes: 8192`、`timeout: 5 s`、`needsApproval: false`                    |
| 语义 | 复用 `rankRecallCorpus` + `diversifyKbAnchors`；只返回锚点，不返回正文            |

**与注入的关系**：每轮注入是默认提醒，工具是主动查询，两者共用 manifest 索引与向量缓存；工具未启用时注入行为不变。

**验收**：

- 查询「奇门 应期」→ 命中 `qimen-duanpan/references/04-应期与运筹.md` 锚点。
- 查询「飞宫小奇门」→ 命中 qimen 家族相关卡。
- 无相关：返回空 `anchors`，不编造来源。
- 24,778 卡下 P95 <500 ms。

### P1-6 Skill 加载附 references 索引

**问题**：奇门 references 58 个文件、16.4 MB，SKILL.md 只索引 7 个；其余 51 个只能靠知识卡或 `ls` 撞见。模型不知道有哪些、多大，容易整读 2.76 MB 的 OCR 书。

**契约**：`loadSkill` 成功后枚举 `<skill.directory>/references/**/*.md`（深度 ≤3），在正文后追加：

```
[references]
- 04-应期与运筹.md — 12 KB — # 应期与运筹
...
```

- 上限 80 项、8 KB；超出时追加「另有 N 个未列出，用 Glob 查」。
- 无目录、读取失败或未启用 references 的技能：省略该段，不影响正文。
- 每次加载现算，不落盘。

**验收**：

- 奇门加载后列出 58 项，2.76 MB 文件带大小标注。
- 加载体积增幅 ≤10%。
- 无 references 的技能输出与改造前一致。

### P2-7 Skill 正文钉住（压缩后重注入 digest）

**问题**：`Skill` 结果不在 microcompact 的可清工具里，但 auto / manual compaction 会把历史摘要化；技能正文随历史消失。现有五层遗忘对抗（指令热更新、kb 召回、口径、到期、再锚定）没有「技能正文保持」这一层。

**契约**：

- `recordSkillDigest(sessionId, skillName, digest)`：digest = 标题清单 + 含「铁律 / 必须 / 禁止 / 命令」的行 + 代码块命令。
- 上限：4 K 字 / 技能，最多 2 个技能；超出不注入。
- 触发：compaction boundary（压缩成功后）注入一次 `system-reminder skill_digest`；每次压缩各自注入一条，同一压缩边界不重复。
- 不改变压缩体积语义：不在压缩前保留原文，只追加 digest。

**状态所有者**：digest 由 runtime 会话状态持有，随会话持久化；技能目录仍是权威。

**验收**：

- 触发一次压缩后，询问「断盘标准 SOP 10 步」「排盘命令」仍能准确回答。
- digest 注入总量 ≤2 K tokens。
- 未加载过技能：不注入。

### P2-8 盘面状态（已确认存储不可复用，本批不做）

**目标**：多轮追问（「刚才那个盘第 3 宫的暗干」）不重排、不重读历史。

**契约**：runtime 持有 `lastPanBySession`（内存 + 会话持久化），`read-session-context` 暴露盘面摘要；磁盘格式与会话存储同源。

**前置**：先确认复用现有 artifact / session 存储，不新造第二份状态；否则本项不做。

**验收**：

- 第二轮追问可解析第 3 宫字段，不触发重新排盘。
- 分享页仍只读消息内围栏，不读会话状态。

### P3-9 排盘 MCP（工作区侧，不改核心）

**问题**：排盘靠模型手拼 `cd F:/智能体/奇门遁甲 && python -X utf8 排盘.py ...`，cwd、编码、引号、`--json` 是否成功都没有类型化校验。

**契约**：MCP server 暴露 `qimen_paipan({ year, month, day, hour, gender?, mode?, category?, longitude? })`；服务端固定 `奇门遁甲/` cwd、`python -X utf8`、参数顺序（gender → mode → `--json` → category，避免 `--json` 落在第 5 位被当成性别），解析 stdout 后校验 `protocolVersion: 1` 与 `palaces`。

**实现**：`F:\智能体\.agents\mcp\qimen-paipan\server.mjs` + `zcode.json` 的 `mcp.servers.qimen-paipan`；`longitude` 存在时按 `(经度-120)×4` 分钟调整 hour，并在第二段文本报告调整量。项目级 MCP 默认不受信任，需 `/mcp connect qimen-paipan`。

**错误**：MCP `isError: true` + stderr 尾部（≤2 KB）；不返回半截 JSON。

**验收（实测）**：

- 非法 month/hour → `isError` 文本，模型可重试。
- `2026-10-18 13 时` → 阴遁 6 局盘面 JSON，可直接放进 `qimen` 围栏。
- 全程无 shell 字符串拼接。

### P3-10 hooks 回写案例（工作区侧）

**问题**：盲测复盘库 `add / fill` 依赖 AGENTS.md 纪律，漏写无法发现；但把整段回复当 judgement 自动登记会污染准确率。

**契约**：`Stop` hook 只认最后一条 assistant 消息里的 `case-record` 围栏：

```json
{
  "question": "…",
  "system": "…",
  "paipan_mode": "拆补",
  "yongshen": "…",
  "judgement": "…",
  "yingqi": "…",
  "action": "…",
  "confidence": "中",
  "note": "…"
}
```

`question`/`judgement` 为空、围栏缺失、JSON 非法一律静默不登记；同日同问题去重；失败只写 stderr、不阻断回复。

**实现**：`F:\智能体\.agents\hooks\record-case.mjs` + `zcode.json` 的 `hooks.events.Stop`；登记入口为 `盲测复盘库.py add --json`（stdin JSON，非交互）。qimen-duanpan SKILL 第 10 步要求实战交付末尾输出该围栏，教学/理论/追问不输出。项目级 hooks 需工作区信任后才执行。

**验收（实测）**：临时 CSV 注入含围栏的 Stop payload → 登记 `C20261018-001`；重复投递被跳过；无围栏/缺字段不登记。

## 优先级与依赖

```
P0-1 语料上限 ─┬─> P1-3 manifest 索引 ──> P1-5 kb_search
P0-2 描述截断  │                         └> P1-4 向量量化/分片（依赖工作区生成器）
               └────────────────────────> P1-6 references 索引
P2-7 Skill digest（独立）
P2-8 盘面状态（已确认：存储不可复用，不做）
P3-9 MCP / P3-10 hooks（工作区侧，不动核心）
```

## 已知边界（2026-10-18）

- **生成器护栏按小节迭代计数，不是唯一卡计数**：`gen_kb_cards.py` 的 `total` 每处理一个
  小节就 +1，同一 `(源文件, 标题)` 重复时只覆盖同一张卡却仍占名额。当前 24,778 张唯一卡，
  护栏 27,000；去掉护栏后唯一卡可达 36,851。把护栏改成 `len(cards)` 可再放行约 2,222 张，
  是否扩容属工作区知识取舍，未在本批改动。
- **v1 向量盘档不再读取**：旧 `.zcode/.vector-cache.<model>.<hash>.json`（本机 242 MB）
  可直接删除；v2 按需重建，不会自动删除旧文件。
- **P2-8 未做**：现有 artifact / session 存储没有可复用的会话级状态槽，新造即第二状态所有者；需先定存储再接盘面状态。

## 风险与回滚

- **清单格式变更影响全部技能路由**：用真实会话 A/B 比较触发率；回滚只需改回常量。
- **int8 量化影响排序**：以 top-10 一致率 ≥95% 为门禁；不达标退回 float16 或维持现状。
- **`kb_search` 扩大工具面**：走既有 tool exposure 预算；只读、无副作用、默认不需要审批。
- **digest 占用上下文**：2 技能 × 4 K 字上限；超出不注入。
- **跨仓节奏**：P1-4 / P3 依赖 `F:\智能体` 生成器与工具，ZCode 侧先保证无这些增强时行为不变。

## 验收总表

| 场景                      | 期望                             |
| ------------------------- | -------------------------------- |
| 24,778 卡召回             | 覆盖率 100%，无丢弃              |
| 30,000 卡 fixture         | 显式告警，top-K 正常             |
| 奇门技能清单              | 349 字完整                       |
| 60 技能清单               | ≤20 K 字符，无降级               |
| 2.4 万卡连续两轮召回      | 第二轮 ≤100 ms（索引命中）       |
| 向量覆盖率                | qimen / liuren / bazi 均 100%    |
| `kb_search("奇门 应期")`  | 命中 04-应期锚点                 |
| 奇门加载                  | 列出 58 个 references            |
| 压缩后追问 SOP            | 能答出 10 步与排盘命令           |
| 第二轮追问盘面            | 不重排，读到第 3 宫字段          |
| 排盘 MCP 非法输入         | 结构化错误，无半截 JSON          |
| 排盘 MCP 正常输入         | 返回可直接进 `qimen` 围栏的 JSON |
| `case-record` 围栏        | Stop hook 登记一行 CSV           |
| 重复 `case-record`        | 同日同问题跳过                   |
| 无 `case-record` / 缺字段 | 不登记、不阻断                   |

## 与既有文档的关系

- [138](./138-qimen-pan-fence.md)：定义盘面围栏契约，保持不变；本 spec 只加知识调用层。
- 工作区 `F:\智能体\AGENTS.md` 铁律 0 / 5.8：检索只给锚点，不复制知识。
- [backlog.md](./backlog.md)：四层各登记一条，完成即删除。

## 复现命令

```bash
# 卡数与被丢弃的家族（Python 3.14）
python -X utf8 -c "import os,collections; p=r'F:\智能体\.zcode\kb-cards'; fs=[(f,os.stat(os.path.join(p,f)).st_mtime) for f in os.listdir(p) if f.endswith('.md')]; fs.sort(key=lambda x:-x[1]); d=fs[24000:]; print(len(fs), len(d), collections.Counter(f.split('-')[1] for f,_ in d))"

# 向量盘档规模与覆盖率（Node）
node --max-old-space-size=4096 -e "const fs=require('fs');const p='F:/智能体/.zcode/.vector-cache.embedding-3.8479905f.json';const s=fs.readFileSync(p,'utf8');const t=Date.now();const o=JSON.parse(s);console.log(Math.round(s.length/1048576)+'MB',Object.keys(o.vectors).length,'parse',Date.now()-t+'ms')"
```

向量档文件名含 root 哈希，复现时以实际 `ls .vector-cache.*` 为准。
