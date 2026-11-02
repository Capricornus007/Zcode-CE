import type { DynamicWorkflowClientConfig } from "@zcode/shared";
import type { ICodingPlanSubscriptionService } from "@zcode/services";

export interface DynamicWorkflowAvailabilitySnapshot {
  readonly status: "loading" | "ready";
  readonly enabled: boolean;
  readonly config: DynamicWorkflowClientConfig | null;
}

/** App-session projection; one service instance shares one in-flight read. */
export interface DynamicWorkflowAvailabilityOwner {
  snapshot(): DynamicWorkflowAvailabilitySnapshot;
  ensureLoaded(service: ICodingPlanSubscriptionService): Promise<void>;
  refresh(service: ICodingPlanSubscriptionService): Promise<void>;
}
