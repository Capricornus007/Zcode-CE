import { z } from "zod";

/**
 * ```qimen 围栏块的原生渲染契约（spec: docs/development/136-qimen-pan-fence.md）。
 *
 * 数据生产方是命理技能载荷（排盘.py --json），消费方是桌面 renderer 的
 * QimenPanBlock 组件。设计取向是「宽容显示、严格围栏」：
 * - 字段几乎全部 optional——排盘体系（拆补/置闰、转盘/飞盘）差异大，渲染器
 *   只画在场字段，缺字段留白，不因体系差异拒渲染；
 * - 唯一硬约束是 protocolVersion 与每宫 gong（洛书宫号 1-9），它们决定布局；
 * - 围栏解析失败（非 JSON / 缺协议字段）时渲染器回退普通代码块，绝不出错。
 */

export const QIMEN_PAN_PROTOCOL_VERSION = 1;

export const QIMEN_PAN_LAYOUT: readonly (readonly number[])[] = [
  [4, 9, 2],
  [3, 5, 7],
  [8, 1, 6],
];

const ganzhiSchema = z.object({
  year: z.string().optional(),
  month: z.string().optional(),
  day: z.string().optional(),
  hour: z.string().optional(),
});

/** 八十一格等格局判别结果（名称 + 吉凶档位，吉凶由消费方决定着色）。 */
export const qimenPanGejuSchema = z.object({
  name: z.string(),
  /** 吉 / 凶 / 中平 或更细档位；仅作为着色提示，渲染器按前缀归类。 */
  luck: z.string().optional(),
});

/** 单宫数据：洛书宫号必填，其余按体系与工具版本可选。 */
export const qimenPanPalaceSchema = z.object({
  /** 洛书宫号 1-9（坎1坤2震3巽4中5乾6兑7艮8离9），布局定位的唯一依据。 */
  gong: z.number().int().min(1).max(9),
  /** 宫名（坎/坤/震/巽/中/乾/兑/艮/离）。缺省时按宫号由渲染器补显。 */
  name: z.string().optional(),
  /** 八神（值符/腾蛇/太阴/六合/白虎/玄武/九地/九天）。 */
  shen: z.string().optional(),
  /** 九星显示名（含 辅禽/芮禽 合显口径）。 */
  star: z.string().optional(),
  /** 天盘干。 */
  tianGan: z.string().optional(),
  /** 地盘干。 */
  diGan: z.string().optional(),
  /** 八门。 */
  door: z.string().optional(),
  /** 暗干（⑧时干加值使门飞宫）。 */
  angan: z.string().optional(),
  /** 引干（②阴盘）。 */
  yingan: z.array(z.string()).optional(),
  /** 含干（门本宫地盘干）。 */
  hanGan: z.string().optional(),
  /** 格局（天盘干+地盘干查八十一格）。 */
  geju: qimenPanGejuSchema.optional(),
  /** 四害（门迫/击刑/入墓/空亡），渲染器红色高亮。 */
  sihai: z.array(z.string()).optional(),
  /** 时旬空亡落宫标记。 */
  kongwang: z.boolean().optional(),
  /** 马星落宫标记（日马/时马）。 */
  maxing: z.string().optional(),
  /** 先天卦源宫（13.4 伏吟深挖）。 */
  xianqian: z.string().optional(),
  /** 立太极取数（洛书/先天/河图/天干数）。 */
  qushu: z.string().optional(),
  /** 中宫寄宫说明（如「寄坤」）。 */
  note: z.string().optional(),
});

export const qimenPanDocumentSchema = z.object({
  protocolVersion: z.literal(QIMEN_PAN_PROTOCOL_VERSION),
  /** 盘面标题（如「阳遁三局·拆补·上元」），缺省时渲染器由 meta 拼。 */
  title: z.string().optional(),
  meta: z
    .object({
      date: z.string().optional(),
      jieqi: z.string().optional(),
      yinyang: z.string().optional(),
      ju: z.number().int().optional(),
      yuan: z.string().optional(),
      mode: z.string().optional(),
      ganzhi: ganzhiSchema.optional(),
      zhifuStar: z.string().optional(),
      zhishiDoor: z.string().optional(),
      kongwangTime: z.array(z.string()).optional(),
      kongwangDay: z.array(z.string()).optional(),
      maxingDay: z.string().optional(),
      maxingHour: z.string().optional(),
    })
    .optional(),
  palaces: z.array(qimenPanPalaceSchema).min(1).max(9),
});

export type QimenPanDocument = z.infer<typeof qimenPanDocumentSchema>;
export type QimenPanPalace = z.infer<typeof qimenPanPalaceSchema>;
export type QimenPanGeju = z.infer<typeof qimenPanGejuSchema>;

/** 宫号 → 后天宫名（消费方补显用；与排盘.py GONG_NAME 对齐）。 */
export const QIMEN_GONG_NAMES: Readonly<Record<number, string>> = {
  1: "坎",
  2: "坤",
  3: "震",
  4: "巽",
  5: "中",
  6: "乾",
  7: "兑",
  8: "艮",
  9: "离",
};

/**
 * 解析 ```qimen 围栏内容为盘面文档；任何失败（非 JSON / 缺协议字段 / 宫越界）
 * 返回 null，由调用方回退普通代码块。绝不上抛。
 */
export function parseQimenPanDocument(code: string): QimenPanDocument | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(code);
  } catch {
    return null;
  }
  const result = qimenPanDocumentSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
