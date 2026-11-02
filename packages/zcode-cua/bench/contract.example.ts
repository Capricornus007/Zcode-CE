import type { CuaBenchReport } from "./contract.js";

export const cuaBenchReportExample: CuaBenchReport = {
  platform: "windows",
  tasks: [{ id: "T1", name: "application enumeration", pass: true, ms: 10, detail: "notepad observed" }],
};
