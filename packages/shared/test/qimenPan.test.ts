import { describe, expect, it } from "vitest";

import {
  parseQimenPanDocument,
  qimenPanDocumentSchema,
  QIMEN_PAN_LAYOUT,
} from "../src/qimen-pan.js";

/**
 * ```qimen 围栏原生渲染契约（spec: docs/development/136-qimen-pan-fence.md）。
 * fixture 取自 排盘.py --json 实排（2026-10-18 15时，阴遁6局），节选两宫+全 meta。
 */

const realPanFixture = {
  protocolVersion: 1,
  title: "阴遁6局·拆补·上元",
  meta: {
    date: "2026年10月18日 15时",
    jieqi: "寒露",
    yinyang: "阴",
    ju: 6,
    yuan: "上元",
    mode: "拆补",
    ganzhi: { year: "丙午", month: "戊戌", day: "乙丑", hour: "甲申" },
    zhifuStar: "天辅",
    zhishiDoor: "杜门",
    kongwangTime: ["午(离)", "未(坤)"],
    kongwangDay: ["戌(乾)", "亥(乾)"],
    maxingDay: "亥",
    maxingHour: "寅",
  },
  palaces: [
    {
      gong: 1,
      name: "坎",
      star: "天蓬",
      tianGan: "癸",
      diGan: "癸",
      door: "休门",
      shen: "六合",
      angan: "丁",
      yingan: ["癸"],
      hanGan: "癸",
      geju: { name: "天网四张", luck: "凶" },
      xianqian: "坤",
      qushu: "洛书1/先天6/河图1,6/天干1010 [死(取小数)]",
    },
    {
      gong: 2,
      name: "坤",
      star: "天芮",
      tianGan: "壬",
      diGan: "壬",
      door: "死门",
      shen: "九地",
      geju: { name: "天狱自刑", luck: "凶" },
      sihai: ["空亡"],
      kongwang: true,
      note: "寄坤",
    },
  ],
};

describe("qimen pan fence contract", () => {
  it("parses a real 排盘.py --json payload", () => {
    const doc = qimenPanDocumentSchema.parse(realPanFixture);
    expect(doc.title).toBe("阴遁6局·拆补·上元");
    expect(doc.palaces).toHaveLength(2);
    expect(doc.palaces[0]?.star).toBe("天蓬");
    expect(doc.palaces[1]?.sihai).toEqual(["空亡"]);
  });

  it("accepts minimal palaces (体系差异宽容显示)", () => {
    const doc = qimenPanDocumentSchema.parse({
      protocolVersion: 1,
      palaces: [{ gong: 5 }],
    });
    expect(doc.palaces).toHaveLength(1);
  });

  it("parses yongshen locator and per-palace duxiang/zhifu fields (2026-10 增量)", () => {
    const doc = qimenPanDocumentSchema.parse({
      protocolVersion: 1,
      yongshen: {
        category: "财运",
        gong: 8,
        dayGanGong: 7,
        hourGanGong: 1,
        items: [
          { name: "生门", label: "财", gong: 8 },
          { name: "戊", label: "本钱", gong: 3 },
        ],
      },
      palaces: [
        { gong: 8, name: "艮", door: "生门", duxiang: "好事有折", zhifu: true },
        { gong: 1, star: "芮禽", zhifu: true, zhishi: true },
      ],
    });
    expect(doc.yongshen?.gong).toBe(8);
    expect(doc.yongshen?.items).toHaveLength(2);
    expect(doc.palaces[0]?.duxiang).toBe("好事有折");
    expect(doc.palaces[1]?.zhifu).toBe(true);
  });

  it("rejects out-of-range yongshen gong", () => {
    expect(
      qimenPanDocumentSchema.safeParse({
        protocolVersion: 1,
        yongshen: { gong: 12 },
        palaces: [{ gong: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects missing protocolVersion / bad gong / >9 palaces", () => {
    const { protocolVersion: _drop, ...noVersion } = realPanFixture;
    expect(qimenPanDocumentSchema.safeParse(noVersion).success).toBe(false);
    expect(
      qimenPanDocumentSchema.safeParse({
        protocolVersion: 1,
        palaces: [{ gong: 10 }],
      }).success,
      // @ts-expect-error narrowing for the assertion above
    ).toBe(false);
    expect(
      qimenPanDocumentSchema.safeParse({
        protocolVersion: 1,
        palaces: Array.from({ length: 10 }, (_, i) => ({ gong: (i % 9) + 1 })),
      }).success,
    ).toBe(false);
  });

  it("parseQimenPanDocument returns null on garbage (回退代码块)", () => {
    expect(parseQimenPanDocument("not json {")).toBeNull();
    expect(parseQimenPanDocument('{"hello": 1}')).toBeNull();
    expect(parseQimenPanDocument(JSON.stringify(realPanFixture))?.palaces).toHaveLength(2);
  });

  it("layout is the 洛书 3x3 arrangement", () => {
    expect(QIMEN_PAN_LAYOUT).toEqual([
      [4, 9, 2],
      [3, 5, 7],
      [8, 1, 6],
    ]);
  });
});
