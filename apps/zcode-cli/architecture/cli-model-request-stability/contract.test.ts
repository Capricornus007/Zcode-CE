import { describe, expect, it } from "vitest";
import { modelRequestStabilityExample } from "./contract.example.js";
import { cliModelRequestStabilityModule } from "./module.js";

describe("cli-model-request-stability contract", () => {
  it("reports cache-prefix stability without mutating input", () => {
    const messages = Object.freeze([{ role: "user", content: "hello" }]);
    expect(modelRequestStabilityExample.evaluate({ messages, adaptiveReasoningEnabled: false })).toMatchObject({
      prefixStable: true,
      requestDigest: "sha256:example",
    });
    expect(modelRequestStabilityExample.sanitizeText("hello")).toBe("hello");
    expect(cliModelRequestStabilityModule.provides).toContain("model-request-stability");
  });
});
