import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MessageResponse } from "@/components/ai-elements/message.js";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";

vi.mock("@/store/StoreProvider.js", () => ({
  useZCodeStore: (selector: (state: unknown) => unknown) =>
    selector({
      codePreviewSettings: {
        darkTheme: "github-dark",
        fontSizePx: 13,
        lightTheme: "github-light",
        wrapLongLines: true,
      },
      theme: "zai-light",
    }),
}));

/**
 * ```qimen 围栏 → 原生盘面的消息级接线（spec: docs/development/138-qimen-pan-fence.md）。
 * 锁住 message.tsx → CodeBlock → QimenPanBlock 全链：升级整版覆盖本文件时，
 * 若接线被冲掉此测试必红（与速度药丸同类事故的防回归护栏）。
 */

const validPanJson = JSON.stringify({
  protocolVersion: 1,
  title: "阴遁6局·拆补·上元",
  palaces: [
    { gong: 1, name: "坎", star: "天蓬", door: "休门", zhifu: true },
    { gong: 9, name: "离", geju: { name: "月奇朱雀", luck: "吉" } },
  ],
  yongshen: { category: "财运", gong: 9, items: [{ name: "生门", label: "财", gong: 9 }] },
});

function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    createElement(
      ZCodeIntlProvider,
      { initialLocale: "zh-CN" },
      createElement(
        TooltipProvider,
        null,
        createElement(MessageResponse, { onOpenFileLink: vi.fn() }, markdown),
      ),
    ),
  );
}

describe("MessageResponse qimen fence wiring", () => {
  it("valid fence renders the native pan with palace data and yongshen badge", () => {
    const html = renderMarkdown(`起局如下：\n\n\`\`\`qimen\n${validPanJson}\n\`\`\`\n\n详断在后。`);
    expect(html).toContain('data-qimen-pan=""');
    expect(html).toContain('data-qimen-palace="1"');
    expect(html).toContain('data-qimen-palace="9"');
    expect(html).toContain("阴遁6局·拆补·上元");
    expect(html).toContain("用神:财·财运");
    // 围栏不再以原始 JSON 代码块形式出现
    expect(html).not.toContain("language-qimen");
  });

  it("invalid fence JSON falls back to a plain code block (绝不出错)", () => {
    const html = renderMarkdown("```qimen\nnot-json {{\n```");
    expect(html).not.toContain('data-qimen-pan=""');
    expect(html).toContain('data-language="qimen"');
  });

  it("non-qimen fences stay ordinary code blocks", () => {
    const html = renderMarkdown("```ts\nconst a = 1;\n```");
    expect(html).not.toContain('data-qimen-pan=""');
  });

  it("liuren fence renders the native 六壬 pan (三传/四课/神煞)", () => {
    const liurenJson = JSON.stringify({
      protocolVersion: 1,
      title: "乙丑日 未时",
      meta: { method: "贼克法", kongwang: ["戌", "亥"] },
      sike: [{ jiang: "蛇", shang: "丑", xia: "乙", xiaLabel: "干" }],
      sanchuan: [
        { position: "初传", zhi: "丑", liuqin: "财" },
        { position: "中传", zhi: "戌", kongwang: true },
        { position: "末传", zhi: "未" },
      ],
    });
    const html = renderMarkdown(`\`\`\`liuren\n${liurenJson}\n\`\`\``);
    expect(html).toContain('data-liuren-pan=""');
    expect(html).toContain('data-liuren-chuan="初传"');
    expect(html).toContain('data-liuren-ke="1"');
    // 原始 JSON 不再以代码正文出现（外层容器保留 data-language 属正常）
    expect(html).not.toContain("protocolVersion");
  });
});
