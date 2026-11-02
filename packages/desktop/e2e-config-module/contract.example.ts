import type { DesktopE2EConfigFactory } from "./contract.js";

export const desktopE2EConfigExample: DesktopE2EConfigFactory = {
  create: () => ({ specs: ["test/e2e/**/*.test.ts"], maxInstances: 1, reuseBuild: false }),
};
