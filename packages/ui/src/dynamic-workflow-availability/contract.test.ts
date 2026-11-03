import { describe, expect, it } from "vitest";
import { dynamicWorkflowAvailabilityExample } from "./contract.example.js";
import { dynamicWorkflowAvailabilityModule } from "./module.js";

describe("dynamic-workflow-availability contract", () => {
  it("fails closed while the Host snapshot is unknown", () => {
    expect(dynamicWorkflowAvailabilityExample.snapshot()).toEqual({
      status: "loading",
      enabled: false,
      config: null,
    });
    expect(dynamicWorkflowAvailabilityModule.provides).toContain("dynamic-workflow-availability");
  });
});
