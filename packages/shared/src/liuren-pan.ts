import { z } from "zod";

/**
 * ```liuren 围栏的原生渲染契约（spec: docs/development/138-qimen-pan-fence.md 六壬节）。
 *
 * 数据生产方是命理技能载荷（大六壬/工具/排盘.py --json），消费方是桌面 renderer 的
 * LiurenPanBlock 组件。与 qimen 契约同一设计取向「宽容显示、严格围栏」：硬约束只有
 * protocolVersion、sike（4 列）与 sanchuan（3 传）；解析失败回退代码块，绝不上抛。
 *
 * 领域结构（大六壬）：四课=天将/上神/遁干/下神 四列；三传=初传/中传/末传
 * （天将/支/遁干/六亲/旺衰）；天将乘支；空亡两支。
 */

export const LIUREN_PAN_PROTOCOL_VERSION = 1;

/** 四课单列：天将乘上神，遁干注于上神下，下神为日干/日支或上一位上神。 */
export const liurenPanKeColumnSchema = z.object({
  /** 天将简称（贵/蛇/朱/合/勾/龙/空/虎/常/玄/阴/后）。 */
  jiang: z.string().optional(),
  /** 上神（地支）。 */
  shang: z.string(),
  /** 上神遁干。 */
  dun: z.string().optional(),
  /** 下神（日干 或 上一位上神）。 */
  xia: z.string(),
  /** 下神属性标注（干/支），渲染器以小字显示。 */
  xiaLabel: z.string().optional(),
});

/** 三传单传。 */
export const liurenPanChuanSchema = z.object({
  /** 传位（初传/中传/末传）。 */
  position: z.string(),
  jiang: z.string().optional(),
  zhi: z.string(),
  dun: z.string().optional(),
  /** 六亲（以日干五行为主）。 */
  liuqin: z.string().optional(),
  /** 综合旺衰档位描述。 */
  wangshuai: z.string().optional(),
  /** 空亡标记。 */
  kongwang: z.boolean().optional(),
});

export const liurenPanDocumentSchema = z.object({
  protocolVersion: z.literal(LIUREN_PAN_PROTOCOL_VERSION),
  /** 盘面标题（如「乙丑日 未时」），缺省时渲染器由 meta 拼。 */
  title: z.string().optional(),
  meta: z
    .object({
      date: z.string().optional(),
      siganzhi: z
        .object({
          year: z.string().optional(),
          month: z.string().optional(),
          day: z.string().optional(),
          hour: z.string().optional(),
        })
        .optional(),
      yuejiang: z.string().optional(),
      zhanshi: z.string().optional(),
      /** 取三传方法（贼克/遥克/昴星/别贯/八专/伏吟/返吟）。 */
      method: z.string().optional(),
      /** 课体标签（涉害/曲直/元胎/……）。 */
      keti: z.array(z.string()).optional(),
      /** 旬空两支。 */
      kongwang: z.array(z.string()).optional(),
      benming: z.string().optional(),
      xingnian: z.string().optional(),
    })
    .optional(),
  sike: z.array(liurenPanKeColumnSchema).min(1).max(4),
  sanchuan: z.array(liurenPanChuanSchema).min(1).max(3),
  /** 神煞（名→描述），渲染器以 chips 展示。 */
  shensha: z.record(z.string(), z.string()).optional(),
});

export type LiurenPanDocument = z.infer<typeof liurenPanDocumentSchema>;
export type LiurenPanKeColumn = z.infer<typeof liurenPanKeColumnSchema>;
export type LiurenPanChuan = z.infer<typeof liurenPanChuanSchema>;

/**
 * 解析 ```liuren 围栏内容为盘面文档；任何失败（非 JSON / 缺协议字段 / 列数越界）
 * 返回 null，由调用方回退普通代码块。绝不上抛。
 */
export function parseLiurenPanDocument(code: string): LiurenPanDocument | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(code);
  } catch {
    return null;
  }
  const result = liurenPanDocumentSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
