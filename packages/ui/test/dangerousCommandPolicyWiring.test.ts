import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 工具策略（危险命令）链路护栏（143）。
 *
 * 设置页能保存 `dangerousCommandPolicy`，但 3.15.1 覆盖后没有任何生产代码把它送进
 * runtime / executor：`ToolExecutorDeps.dangerousCommandPolicy` 是死字段，设置页
 * 实际不生效。这里钉死「settings → services → 协议 → bootstrap → runtimeConfig →
 * executor」每一段，防止整文件覆盖再次静默断链。
 */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("危险命令策略链路", () => {
  it("services：从 App 设置读取并放进 session 偏好", () => {
    expect(source("packages/services/src/node.ts")).toContain(
      "dangerousCommandPolicy: settings.dangerousCommandPolicy",
    );
  });

  it("协议：session 偏好 schema 接受策略", () => {
    const protocol = source("packages/shared/src/zcode-protocol/index.ts");
    expect(protocol).toContain("dangerousCommandPolicy: dangerousCommandPolicySchema.optional()");
  });

  it("bootstrap：偏好写入 runtimeConfig 并随 session record 继承", () => {
    const operations = source(
      "apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts",
    );
    expect(operations).toContain(
      "dangerousCommandPolicy: runtimePreferences.dangerousCommandPolicy",
    );
    expect(operations).toContain(
      "{ dangerousCommandPolicy: startupPreferences.dangerousCommandPolicy }",
    );
    expect(
      source("apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts"),
    ).toContain("dangerousCommandPolicy?: DangerousCommandPolicy;");
  });

  it("runtimeConfig 与 executor：装配点真正把策略传给 Bash 权限判定", () => {
    expect(source("apps/zcode-cli/packages/contracts/src/config/index.ts")).toContain(
      "dangerousCommandPolicy?: DangerousCommandPolicy;",
    );
    expect(source("apps/zcode-cli/packages/adapters/src/config/config-merger.ts")).toContain(
      "result.dangerousCommandPolicy",
    );
    expect(source("apps/zcode-cli/packages/core/src/runtime/helpers/runtime-tools.ts")).toContain(
      "dangerousCommandPolicy: runtime.config.dangerousCommandPolicy",
    );
  });
});
