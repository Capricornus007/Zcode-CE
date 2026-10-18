import { describe, expect, it } from "vitest";

import { parseLiurenPanDocument, liurenPanDocumentSchema } from "../src/liuren-pan.js";

/**
 * ```liuren 围栏原生渲染契约（spec: docs/development/138-qimen-pan-fence.md 六壬节）。
 * fixture 取自 大六壬/工具/排盘.py --json 实排（2026-10-18 未时，乙丑日·贼克法），节选。
 */

const realLiurenFixture = {
  protocolVersion: 1,
  title: "乙丑日 未时",
  meta: {
    date: "2026年10月18日",
    siganzhi: { year: "丙午", month: "戊戌", day: "乙丑", hour: "癸未" },
    yuejiang: "辰",
    zhanshi: "未",
    method: "贼克法",
    kongwang: ["戌", "亥"],
  },
  sike: [
    { jiang: "蛇", shang: "丑", dun: "乙", xia: "乙", xiaLabel: "干" },
    { jiang: "阴", shang: "戌", xia: "丑", xiaLabel: "支" },
    { jiang: "阴", shang: "戌", xia: "丑", xiaLabel: "支" },
    { jiang: "虎", shang: "未", dun: "辛", xia: "戌", xiaLabel: "支" },
  ],
  sanchuan: [
    { position: "初传", jiang: "蛇", zhi: "丑", dun: "乙", liuqin: "财", wangshuai: "相" },
    { position: "中传", jiang: "阴", zhi: "戌", liuqin: "财", kongwang: true },
    { position: "末传", jiang: "虎", zhi: "未", dun: "辛", liuqin: "财", wangshuai: "相" },
  ],
  shensha: { 禄: "卯", 天乙贵人: "子,申" },
};

describe("liuren pan fence contract", () => {
  it("parses a real 大六壬 排盘.py --json payload", () => {
    const doc = liurenPanDocumentSchema.parse(realLiurenFixture);
    expect(doc.title).toBe("乙丑日 未时");
    expect(doc.sike).toHaveLength(4);
    expect(doc.sanchuan[0]?.position).toBe("初传");
    expect(doc.sanchuan[1]?.kongwang).toBe(true);
    expect(doc.shensha?.["天乙贵人"]).toBe("子,申");
  });

  it("rejects missing protocolVersion / empty sike / >3 chuan", () => {
    const { protocolVersion: _drop, ...noVersion } = realLiurenFixture;
    expect(liurenPanDocumentSchema.safeParse(noVersion).success).toBe(false);
    expect(
      liurenPanDocumentSchema.safeParse({ protocolVersion: 1, sike: [], sanchuan: [] }).success,
    ).toBe(false);
    expect(
      liurenPanDocumentSchema.safeParse({
        protocolVersion: 1,
        sike: realLiurenFixture.sike,
        sanchuan: [...realLiurenFixture.sanchuan, realLiurenFixture.sanchuan[0]],
      }).success,
    ).toBe(false);
  });

  it("parseLiurenPanDocument returns null on garbage (回退代码块)", () => {
    expect(parseLiurenPanDocument("not json")).toBeNull();
    expect(parseLiurenPanDocument('{"a": 1}')).toBeNull();
    expect(parseLiurenPanDocument(JSON.stringify(realLiurenFixture))?.sanchuan).toHaveLength(3);
  });
});
