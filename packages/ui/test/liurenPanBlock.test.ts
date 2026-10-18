// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LiurenPanBlock } from "@/components/ai-elements/liuren-pan-block.js";
import type { LiurenPanDocument } from "@zcode/shared";

afterEach(cleanup);

/** 与 大六壬/工具/排盘.py --json 实排对齐的节选盘（乙丑日未时·贼克法）。 */
function buildDocument(): LiurenPanDocument {
  return {
    protocolVersion: 1,
    title: "乙丑日 未时",
    meta: {
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
    shensha: Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`神煞${i}`, "子"]),
    ),
  };
}

describe("LiurenPanBlock", () => {
  it("renders 三传 + 四课 with meta strip", () => {
    const { container, getByText } = render(createElement(LiurenPanBlock, { document: buildDocument() }));
    expect(container.querySelectorAll("[data-liuren-chuan]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-liuren-ke]")).toHaveLength(4);
    expect(getByText("乙丑日 未时")).toBeTruthy();
    expect(getByText(/取三传：贼克法/)).toBeTruthy();
    expect(getByText(/月将 辰/)).toBeTruthy();
    // 初传支与天将徽标
    const chu = container.querySelector("[data-liuren-chuan='初传']")!;
    expect(chu.textContent).toContain("丑");
    expect(chu.textContent).toContain("蛇");
    expect(chu.textContent).toContain("财");
  });

  it("marks 空亡 zhi red in chuan/ke and meta", () => {
    const { container } = render(createElement(LiurenPanBlock, { document: buildDocument() }));
    const zhong = container.querySelector("[data-liuren-chuan='中传']")!;
    expect(zhong.className).toContain("border-destructive");
    expect(zhong.textContent).toContain("空");
    // 二课上神戌临空亡 → 红边
    const ke2 = container.querySelector("[data-liuren-ke='2']")!;
    expect(ke2.className).toContain("border-destructive");
    // 初传丑不空 → 不标红
    const chu = container.querySelector("[data-liuren-chuan='初传']")!;
    expect(chu.className).not.toContain("border-destructive");
  });

  it("caps 神煞 chips at the render limit with a count summary", () => {
    const { container } = render(createElement(LiurenPanBlock, { document: buildDocument() }));
    const chips = container.querySelectorAll("[data-liuren-shensha] > span");
    expect(chips).toHaveLength(17); // 16 可见 + 1 汇总
    expect(chips[chips.length - 1]?.textContent).toContain("…等 20 项");
  });
});
