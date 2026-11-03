import { describe, expect, it } from "vitest";
import { desktopE2EConfigExample } from "./contract.example.js";
import { desktopE2EConfigModule } from "./module.js";

describe("desktop-e2e-config contract", () => {
  it("defaults to an isolated single-worker configuration", () => {
    expect(desktopE2EConfigExample.create("0-0")).toEqual({
      specs: ["test/e2e/**/*.test.ts"],
      maxInstances: 1,
      reuseBuild: false,
    });
    expect(desktopE2EConfigModule.provides).toContain("desktop-e2e-runner-config");
  });
});
