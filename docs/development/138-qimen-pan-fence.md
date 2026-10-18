# 138 · ```qimen 围栏原生盘面渲染

## 背景与决策

用户的奇门遁甲技能（`F:\智能体\.agents\skills\qimen-duanpan`，载荷 `排盘.py`）此前只能在
回复里以文本表格呈现九宫盘。候选路线：A) Gen UI `::visualize` HTML（零产品改动）；
B) mermaid 式围栏 → 原生组件；C) v4 协议新 row kind。**决策：只做 B**——原生组件无文件
落盘依赖、跨 workspace/手机远控/会话分享可用、主题自动联动，且围栏机制可被其他命理体系
（紫微/八字/六壬）复用。

## 契约

数据生产方：`排盘.py --json`（stdout 单行 JSON）。消费方：renderer 围栏渲染。

- 契约定义：`packages/shared/src/qimen-pan.ts`（zod）。设计取向「**宽容显示、严格围栏**」：
  硬约束只有 `protocolVersion: 1` 与每宫 `gong`（洛书 1-9）；其余字段全部 optional，
  渲染器只画在场字段（拆补/置闰、转盘/飞盘体系差异大）。
- 解析入口 `parseQimenPanDocument(code)`：非 JSON / 缺协议字段 / 宫越界一律返回 null，
  **调用方回退普通代码块，绝不上抛**。
- 布局常量 `QIMEN_PAN_LAYOUT = [[4,9,2],[3,5,7],[8,1,6]]`（巽离坤/震中兑/艮坎乾）。

## 渲染

- `packages/ui/src/components/ai-elements/qimen-pan-block.tsx`：九宫格组件。每宫
  神（右上）/星+天盘地盘干（主体）/门+暗引含干（下）/格局（吉=success、凶=destructive、
  其余 subtle）/四害（destructive 红标 + 边框变红）/空亡·马星角标；缺宫画虚线壳。
- 接线：`code-block.tsx` 拦 `language === "qimen"`，与 `renderMermaid` **同一门控语义**
  （`message.tsx` 传 `renderQimenPan={!renderStreaming}`——流式期间按代码块展示，
  完成后渲染，规避 Streamdown 流式拆块导致的半 JSON）。
- 色彩全部走主题语义 token（success/destructive/warning/foreground），深浅色自动适配；
  字号全部 `text-ui-*`（DESIGN.md 强制）。

## 跨仓配套（F:\智能体）

- `奇门遁甲/排盘.py`：`build_pan_payload(result)`（口径与 `format_paipan` 逐宫详情一致，
  含 辅禽/芮禽 合显、格局、四害、空亡、马星、先天源宫、立太极取数、中宫寄坤）+ `--json` 参数。
- `.agents/skills/qimen-duanpan/SKILL.md`：调度约定（--json → ```qimen 围栏原样输出 →
  围栏后文本详断）。

## 验证

- `packages/shared/test/qimenPan.test.ts`：真实排盘 fixture 解析 / 最小宫宽容 / 缺协议字段
  拒绝 / 垃圾输入 null / 布局常量。
- `packages/ui/test/qimenPanBlock.test.ts`：洛书布局与元信息条 / 四害红标与吉凶着色 /
  缺宫虚线壳。
- 端到端：`python -X utf8 排盘.py 2026 10 18 15 --json` 实排输出通过 shared schema
  （fixture 即来自该实排）。
