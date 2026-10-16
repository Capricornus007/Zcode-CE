import { afterEach, describe, expect, it } from "vitest";
import { resolveRemoteCdnBaseUrls } from "../src/main/remoteCdn.js";

/**
 * 官方 3.15.1 的 remoteCdn 契约的**社区版改编**。
 *
 * 官方原版钉的是 z.ai 内部发布设施的行为：「国内/海外双 CDN 按语言+时区失效转移」
 * （cdn.codegeex.cn）与「test 产品环境固定内网 SSH remote assets 根」（intranet.example.invalid）。
 * 社区版不接入这两套内部设施（用户裁决见 test/remoteCdnBaseUrl.test.ts 契约注释）：
 * 未设旋钮时固定回落官方默认单根，自定义旋钮按字面值使用且必须 http(s)。
 * 这里保留与社区版语义一致的部分，并补钉官方构建期注入根的拼接行为。
 */

const DEFINE_KEY = "__ZCODE_CDN_BASE_URL__";
const ROOTS_KEY = "__ZCODE_REMOTE_CDN_RELEASE_ROOTS__";

function withGlobals(values: Record<string, unknown>, body: () => void): void {
  const previous: Record<string, { had: boolean; value: unknown }> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = {
      had: key in globalThis,
      value: (globalThis as Record<string, unknown>)[key],
    };
    (globalThis as Record<string, unknown>)[key] = value;
  }
  try {
    body();
  } finally {
    for (const [key, state] of Object.entries(previous)) {
      if (!state.had) delete (globalThis as Record<string, unknown>)[key];
      else (globalThis as Record<string, unknown>)[key] = state.value;
    }
  }
}

afterEach(() => {
  delete process.env.ZCODE_CDN_BASE_URL;
});

describe("remoteCdn（社区版）", () => {
  it("官方构建期注入根：保留「根 + 版本前缀」的官方拼接语义", () => {
    withGlobals(
      { [ROOTS_KEY]: ["https://cdn-a.example/releases/", "https://cdn-b.example/releases"] },
      () => {
        expect(resolveRemoteCdnBaseUrls({ version: "0.0.0-test" })).toEqual([
          "https://cdn-a.example/releases/0.0.0-test",
          "https://cdn-b.example/releases/0.0.0-test",
        ]);
      },
    );
  });

  it("显式覆盖 CDN 基址时按字面值使用（发布根），尾部斜杠归一化", () => {
    expect(
      resolveRemoteCdnBaseUrls({
        env: "test",
        overrideBaseUrl: "https://cdn.example.com/releases///",
        version: "0.0.0-test",
      }),
    ).toEqual(["https://cdn.example.com/releases"]);
  });

  it("运行期 env 与构建期 define 旋钮同样按字面值使用且优先于官方注入根", () => {
    withGlobals(
      {
        [DEFINE_KEY]: "https://define.example/root",
        [ROOTS_KEY]: ["https://cdn-a.example/releases"],
      },
      () => {
        expect(resolveRemoteCdnBaseUrls({ version: "0.0.0-test" })).toEqual([
          "https://define.example/root",
        ]);
      },
    );
    withGlobals({ [ROOTS_KEY]: ["https://cdn-a.example/releases"] }, () => {
      process.env.ZCODE_CDN_BASE_URL = "https://env.example/root";
      expect(resolveRemoteCdnBaseUrls({ version: "0.0.0-test" })).toEqual([
        "https://env.example/root",
      ]);
    });
  });

  it("非 http(s) 的旋钮取值直接失败（可行动报错）", () => {
    withGlobals({ [DEFINE_KEY]: "ftp://cdn.example" }, () => {
      expect(() => resolveRemoteCdnBaseUrls({ version: "0.0.0-test" })).toThrow(/http or https/u);
    });
  });
});
