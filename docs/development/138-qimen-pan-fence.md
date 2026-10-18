# 138 · `qimen / `liuren 围栏原生盘面渲染

## 背景与决策

用户的奇门遁甲技能（`F:\智能体\.agents\skills\qimen-duanpan`，载荷 `排盘.py`）此前只能在
回复里以文本表格呈现九宫盘。候选路线：A) Gen UI `::visualize` HTML（零产品改动）；
B) mermaid 式围栏 → 原生组件；C) v4 协议新 row kind。**决策：只做 B**——原生组件无文件
落盘依赖、跨 workspace/手机远控/会话分享可用、主题自动联动，且围栏机制可被其他命理体系
（紫微/八字/六壬）复用。**奇门的回复内可视化只保留原生围栏一条路**：PNG 排盘图流程
（`排盘图.py`，PIL 依赖）已退役删除；「案例教学卡」的归档图是另一用途，不在本决策范围。

## 契约

数据生产方：`排盘.py --json [测项]`（stdout 单行 JSON）。消费方：renderer 围栏渲染。

- 契约定义：`packages/shared/src/qimen-pan.ts`（zod）。设计取向「**宽容显示、严格围栏**」：
  硬约束只有 `protocolVersion: 1` 与每宫 `gong`（洛书 1-9）；其余字段全部 optional，
  渲染器只画在场字段（拆补/置闰、转盘/飞盘体系差异大）。
- 增量字段（2026-10 第二批）：每宫 `duxiang`（读象）/`zhifu`/`zhishi`（值符值使落宫徽标，
  星名合显口径在生产方处理）；文档级 `yongshen`（测项用神定位：主用神宫 + 日干宫 +
  时干宫 + 用神清单，带测项参数时才有）。
- 解析入口 `parseQimenPanDocument(code)`：非 JSON / 缺协议字段 / 宫越界一律返回 null，
  **调用方回退普通代码块，绝不上抛**。
- 布局常量 `QIMEN_PAN_LAYOUT = [[4,9,2],[3,5,7],[8,1,6]]`（巽离坤/震中兑/艮坎乾）。

## 渲染

- `packages/ui/src/components/ai-elements/qimen-pan-block.tsx`：九宫格组件。每宫
  神（右上）/星+天盘地盘干（主体）/门+暗引含干（下）/格局（吉=success、凶=destructive、
  其余 subtle）/四害（destructive 红标 + 边框变红）/空亡·马星角标；值符/值使/用神/日干/
  时干徽标（首行右侧）；**用神宫 ring-warning 高亮——ring 不占 border 色，与四害红边并存**
  （tailwind-merge 下 border 类会互斥，ring 是独立通道）；缺宫画虚线壳。
- **宫位点击展开**：有详情字段（读象/先天源/取数）的宫可点击切换展开区，盘面保持紧凑。
- 接线：`code-block.tsx` 拦 `language === "qimen"`，与 `renderMermaid` 同一门控来源
  （`message.tsx` 传 `renderQimenPan={!renderStreaming}`）。**流式期间不渲染半截盘面**，
  显示 shimmer 占位（`chat.qimenPan.rendering` i18n 键），完成后渲染原生盘面；
  解析失败回退普通代码块。
- 色彩全部走主题语义 token（success/destructive/warning/foreground），深浅色自动适配；
  字号全部 `text-ui-*`（DESIGN.md 强制）。

## 六壬围栏（```liuren，2026-10 第三批）

- 契约：`packages/shared/src/liuren-pan.ts`。领域结构：**三传**（初/中/末：天将/支/遁干/
  六亲/综合旺衰，初传金色强调）+ **四课**（干阳/干阴/支阳/支阴四列：天将乘上神、遁干注下、
  下神为日干/日支或上一位上神）。空亡支红边+「空」角标；神煞 chips 渲染截断 16 项+汇总
  （实排可达 90+ 项，载荷全量保留供模型读取）。
- 组件 `liuren-pan-block.tsx`；`code-block.tsx` 的围栏解析泛化为 qimen/liuren 双语言，
  占位/门控/回退语义完全一致（`renderQimenPan` 同时管两类，prop 名保留避免调用面churn）。
- 生产方：`大六壬/工具/排盘.py` `build_liuren_payload(r)` + `--json`（stdout 重定向抑制
  paipan 的内嵌打印；位置参数剔除 `--json` 标志防其被误当本命）。技能侧
  `liuren-duanpan` SKILL.md + `references/14-原生盘面输出约定.md`（kb 召回源）+
  AGENTS.md 六壬行。占时口径=地支索引 1-12 不是小时数（R1 错因防线，约定内重申）。
- E2E 回归护栏：`conversation-session-qimen-pan-fence.test.ts` —— 合成 SSE fixture
  （fixtures/upstream/cases 双 JSON，case 名由 spec 文件名推导）脚本化 assistant 回复
  携带 ```qimen 围栏，断言真实会话时间线出现 `data-qimen-pan` 与宫格 DOM、原始 JSON
  不再以代码正文出现。防「升级整版覆盖 renderer 冲掉接线」类事故（速度药丸教训）在
  最终消费点的回归。

## 跨仓配套（F:\智能体）

- `奇门遁甲/排盘.py`：`build_pan_payload(result)`（口径与 `format_paipan` 逐宫详情一致，
  含 辅禽/芮禽 合显、格局、四害、空亡、马星、先天源宫、立太极取数、中宫寄坤、读象、
  值符值使徽标）+ `build_yongshen_payload(result, category)`（与 format_yongshen_locator
  同源）+ `--json [测项]` 参数。
- `.agents/skills/qimen-duanpan/SKILL.md`：调度约定（--json → ```qimen 围栏原样输出 →
  围栏后文本详断；未指定时间用会话当前时间；默认拆补；多盘对照连排多围栏）。
- `.agents/skills/qimen-jiaoxue/SKILL.md`：视觉教学由 PNG（已退役）切到原生围栏。
- `.agents/skills/mingli-hecan/SKILL.md`：奇门回退命令补 `--json`+围栏约定。
- `liuren-duanpan` 用大六壬独立排盘工具，盘结构不同，不适用本契约（未来可做 `liuren` 围栏）。

### 会话层接线（新会话与长会话，2026-10 第三批）

- **新会话可见性**：F:\智能体 `AGENTS.md` 两处登记——排盘工具表奇门行改 `--json`+围栏、
  「奇门遁甲断卦（自动执行）」流程第 2/3 步改为 `--json` + 围栏输出（AGENTS.md 每会话必载，
  技能未触发时约定仍在场）。
- **长会话召回**：约定落为 `qimen-duanpan/references/14-原生盘面输出约定.md`，经
  `gen_kb_cards.py` 切成 4 张知识卡（排盘与输出/围栏输出三铁律/盘面自动渲染项/断盘边界）
  进 `.zcode/kb-cards/`——kb_recall 语义召回层在上下文压缩后仍可召回约定。
- **分享页**：`ConversationShareReadonlyTimeline` 复用同一 `MessageResponse`，qimen 围栏
  在公开分享页同样原生渲染（围栏内容属受保护代码区间，`normalizeConversationShareMarkdown`
  不改写）。

## 验证

- `packages/shared/test/qimenPan.test.ts`：真实排盘 fixture 解析 / 最小宫宽容 / 缺协议字段
  拒绝 / 垃圾输入 null / 布局常量 / yongshen 与 duxiang 增量字段 / 越界拒绝。
- `packages/ui/test/qimenPanBlock.test.ts`：洛书布局与测项条 / 四害红边+用神 ring 并存 /
  值符徽标与日干标注 / 点击展开读象并可收起 / 缺宫虚线壳。
- 端到端：`python -X utf8 排盘.py 2026 10 18 13 --json 财运` 实排（阴遁6局）通过 shared
  schema；fixture 即来自实排。
- 移动端：宫格 `min-h-24 md:min-h-28`，窄屏（手机远控）压缩高度，md 起恢复桌面尺寸。

## 后续

知识调用层（检索 / 路由 / 长会话 / 执行）的改造见 [140-qimen-skill-leverage.md](./140-qimen-skill-leverage.md)；本文的围栏契约不变。
