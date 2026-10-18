import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 自适应思考链路护栏（141 后续）。
 *
 * 2026-09-24 已贯通的链路被 3.15.1 整版覆盖冲掉：UI「自动」档不插入、services 不读
 * App 设置、bootstrap 不写 runtimeConfig——用户侧表现为「之前做的自适应思考没有了」。
 * 这些是跨文件接线，单测覆盖不到；用源码护栏钉住每个消费点，未来任何整文件覆盖都会红。
 */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("自适应思考链路", () => {
  it("UI：思考档选择器插入自动档，并在选中时写 App 设置", () => {
    const toolbar = source("packages/ui/src/v4/composer/V4ComposerToolbar.tsx");
    expect(toolbar).toContain("withAutoThoughtLevelOption(");
    expect(toolbar).toContain("AUTO_THOUGHT_LEVEL_DESCRIPTION_ID");
    expect(toolbar).toContain("adaptiveReasoningEnabled: true");
    expect(toolbar).toContain("adaptiveReasoningEnabled: false");
  });

  it("App 设置：schema 接受 adaptiveReasoningEnabled，services 映射到 session 偏好", () => {
    expect(source("packages/shared/src/validationAppSettings.ts")).toContain(
      "adaptiveReasoningEnabled: z.boolean().optional()",
    );
    expect(source("packages/services/src/node.ts")).toContain(
      "adaptiveReasoningEnabled: settings.adaptiveReasoningEnabled === true",
    );
  });

  it("协议与 bootstrap：偏好字段透传并写入 runtimeConfig", () => {
    expect(source("packages/shared/src/zcode-protocol/index.ts")).toContain(
      "adaptiveReasoningEnabled: z.boolean().optional()",
    );
    const operations = source(
      "apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts",
    );
    expect(operations).toContain(
      "adaptiveReasoningEnabled: runtimePreferences.adaptiveReasoningEnabled === true",
    );
    expect(operations).toContain("adaptiveReasoning: { enabled: true }");
    expect(
      source("apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts"),
    ).toContain("adaptiveReasoningEnabled: boolean;");
  });

  it("core：会话配置优先，环境变量只作后备", () => {
    expect(source("apps/zcode-cli/packages/core/src/runtime/methods/model.ts")).toContain(
      "this.config.adaptiveReasoning?.enabled === true",
    );
    expect(source("apps/zcode-cli/packages/core/src/runtime/types.ts")).toContain(
      "adaptiveReasoning?: { enabled?: boolean };",
    );
  });
});
