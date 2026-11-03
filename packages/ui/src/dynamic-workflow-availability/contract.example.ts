import type { DynamicWorkflowAvailabilityOwner } from "./contract.js";

export const dynamicWorkflowAvailabilityExample: Pick<
  DynamicWorkflowAvailabilityOwner,
  "snapshot"
> = {
  snapshot: () => ({ status: "loading", enabled: false, config: null }),
};
