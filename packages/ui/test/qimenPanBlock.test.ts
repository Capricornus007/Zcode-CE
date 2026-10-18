// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QimenPanBlock } from "@/components/ai-elements/qimen-pan-block.js";
import type { QimenPanDocument } from "@zcode/shared";

afterEach(cleanup);

/** 与 排盘.py --json 实排对齐的节选盘（阴遁六局示例，含用神定位与徽标字段）。 */
function buildDocument(): QimenPanDocument {
  return {
    protocolVersion: 1,
    title: "阴遁6局·拆补·上元",
    meta: {
      date: "2026年10月18日 13时",
      jieqi: "寒露",
      ganzhi: { year: "丙午", month: "戊戌", day: "乙丑", hour: "癸未" },
      zhifuStar: "天禽",
      zhishiDoor: "死门",
      kongwangTime: ["申(坤)"],
      maxingDay: "亥",
    },
    palaces: [
      {
        gong: 1,
        name: "坎",
        star: "芮禽",
        door: "休门",
        shen: "值符",
        tianGan: "壬",
        diGan: "癸",
        zhifu: true,
        duxiang: "缓慢旧事/稳固/隐藏深",
        qushu: "洛书1/先天6",
      },
      {
        gong: 9,
        name: "离",
        star: "天任",
        door: "景门",
        shen: "白虎",
        tianGan: "丙",
        diGan: "丁",
        geju: { name: "月奇朱雀", luck: "吉" },
        sihai: ["空亡"],
        kongwang: true,
        maxing: "时马",
      },
    ],
    yongshen: {
      category: "财运",
      gong: 9,
      dayGanGong: 1,
      items: [{ name: "生门", label: "财", gong: 9 }],
    },
  };
}

describe("QimenPanBlock", () => {
  it("renders palaces in 洛书 layout with meta strip and 测项", () => {
    const { container, getByText } = render(
      createElement(QimenPanBlock, { document: buildDocument() }),
    );
    expect(container.querySelectorAll("[data-qimen-palace]")).toHaveLength(2);
    expect(container.querySelector("[data-qimen-palace='1']")?.textContent).toContain("值符");
    expect(getByText("阴遁6局·拆补·上元")).toBeTruthy();
    expect(getByText(/测项 财运/)).toBeTruthy();
  });

  it("marks 四害 palaces red, badges 值符/用神/日干", () => {
    const { container } = render(createElement(QimenPanBlock, { document: buildDocument() }));
    const palace9 = container.querySelector("[data-qimen-palace='9']")!;
    expect(palace9.className).toContain("border-destructive");
    expect(palace9.textContent).toContain("空亡");
    expect(palace9.textContent).toContain("用神:财·财运");
    expect(palace9.className).toContain("ring-warning");
    expect(palace9.querySelector(".text-success")).toBeTruthy();
    // 值符徽标（载荷显式）+ 日干宫标注
    const palace1 = container.querySelector("[data-qimen-palace='1']")!;
    expect(palace1.textContent).toContain("值符");
    expect(palace1.textContent).toContain("日干");
    // 无四害宫不标红
    expect(palace1.className).not.toContain("border-destructive");
  });

  it("expands palace on click to show 读象 details, collapses on second click", () => {
    const { container } = render(createElement(QimenPanBlock, { document: buildDocument() }));
    const palace1 = container.querySelector("[data-qimen-palace='1']")!;
    expect(container.querySelector("[data-qimen-palace-detail]")).toBeNull();
    fireEvent.click(palace1);
    const detail = container.querySelector("[data-qimen-palace-detail]")!;
    expect(detail.textContent).toContain("缓慢旧事");
    expect(detail.textContent).toContain("洛书1/先天6");
    fireEvent.click(palace1);
    expect(container.querySelector("[data-qimen-palace-detail]")).toBeNull();
  });

  it("renders empty shells for missing palaces (体系差异宽容显示)", () => {
    const { container } = render(createElement(QimenPanBlock, { document: buildDocument() }));
    // 9 宫布局中 7 个缺宫 → 虚线壳
    const shells = container.querySelectorAll("[aria-hidden='true']");
    expect(shells).toHaveLength(7);
  });
});
