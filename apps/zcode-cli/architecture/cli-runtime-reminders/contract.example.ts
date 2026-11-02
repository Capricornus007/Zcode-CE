import type { RuntimeReminderProjector } from "./contract.js";

export const runtimeReminderProjectorExample: RuntimeReminderProjector = {
  project: async () => [{ kind: "task-reanchor", body: "Keep the accepted task in focus.", dedupeKey: "task:1" }],
};
