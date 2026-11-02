export const dynamicWorkflowAvailabilityModule = {
  id: "dynamic-workflow-availability-store",
  requires: ["services", "shared", "ui"],
  provides: ["dynamic-workflow-availability"],
  publicEntrypoints: ["contract.ts", "../store/dynamicWorkflowAvailabilityStore.ts"],
} as const;
