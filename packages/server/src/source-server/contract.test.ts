import { describe, expect, it } from "vitest";
import { sourceServerProbeExample } from "./contract.example.js";
import { sourceServerTransportModule } from "./module.js";

describe("source-server-transport contract", () => {
  it("keeps an uninstalled probe distinct from daemon readiness", () => {
    expect(sourceServerProbeExample.result).toEqual({
      platform: "linux",
      arch: "x64",
      installed: false,
    });
    expect(sourceServerTransportModule.provides).toContain("source-server-transport");
  });
});
