// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QimenPanBlock } from "@/components/ai-elements/qimen-pan-block.js";
import type { QimenPanDocument } from "@zcode/shared";

afterEach(cleanup);

/** 与 排盘.py --json 实排对齐的节选盘（阳遁三局示例）。 */
function buildDocument(): QimenPanDocument {
  return {
    protocolVersion: 1,
    title: "阳遁3局·拆补·上元",
    meta: {
      date: "2026年10月18日 15时",
      jieqi: "寒露",
      ganzhi: { year: "丙午", month: "戊戌", day: "乙丑", hour: "甲申" },
      zhifuStar: "天辅",
      zhishiDoor: "杜门",
      kongwangTime: ["午(离)"],
      maxingDay: "亥",
    },
    palaces: [
      { gong: 4, name: "巽", star: "辅禽", door: "杜门", shen: "值符", tianGan: "庚", diGan: "庚" },
      {
        gong: 9,
        name: "离",
        star: "天英",
        door: "景门",
        shen: "九天",
        tianGan: "丁",
        diGan: "丁",
        geju: { name: "文书即至", luck: "吉" },
        sihai: ["空亡"],
        kongwang: true,
        maxing: "时马",
      },
    ],
  };
}

describe("QimenPanBlock", () => {
  it("renders 9 palace cells in 洛书 layout with meta strip", () => {
    const { container, getByText } = render(createElement(QimenPanBlock, { document: buildDocument() }));
    expect(container.querySelectorAll("[data-qimen-palace]")).toHaveLength(2);
    // 洛书宫序按 layout 顺序出现：巽4 是第一个格。
    expect(container.querySelector("[data-qimen-palace='4']")?.textContent).toContain("值符");
    expect(getByText("阳遁3局·拆补·上元")).toBeTruthy();
    expect(getByText(/寒露/)).toBeTruthy();
    expect(getByText(/值符 天辅/)).toBeTruthy();
  });

  it("marks 四害 palaces with destructive border and label", () => {
    const { container } = render(createElement(QimenPanBlock, { document: buildDocument() }));
    const palace9 = container.querySelector("[data-qimen-palace='9']")!;
    expect(palace9.className).toContain("border-destructive");
    expect(palace9.textContent).toContain("空亡");
    expect(palace9.textContent).toContain("时马");
    // 吉局着 success 色
    expect(palace9.querySelector(".text-success")).toBeTruthy();
    // 无四害宫不标红
    const palace4 = container.querySelector("[data-qimen-palace='4']")!;
    expect(palace4.className).not.toContain("border-destructive");
  });

  it("renders empty shells for missing palaces (体系差异宽容显示)", () => {
    const { container } = render(createElement(QimenPanBlock, { document: buildDocument() }));
    // 9 宫布局中 7 个缺宫 → 虚线壳
    const shells = container.querySelectorAll("[aria-hidden='true']");
    expect(shells).toHaveLength(7);
  });
});
