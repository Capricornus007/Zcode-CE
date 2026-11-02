import { describe, expect, it } from "vitest";
import { cuaBenchReportExample } from "./contract.example.js";
import { zcodeCuaBenchModule } from "./module.js";

describe("zcode-cua-bench contract", () => {
  it("reports per-task evidence and elapsed time", () => {
    expect(cuaBenchReportExample.tasks[0]).toMatchObject({ id: "T1", pass: true, detail: "notepad observed" });
    expect(zcodeCuaBenchModule.provides).toContain("cua-machine-bench");
  });
});
