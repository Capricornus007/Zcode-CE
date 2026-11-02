export type RuntimeReminderKind =
  | "caliber-guard"
  | "followup-due"
  | "task-reanchor"
  | "user-instructions-update";

export interface RuntimeReminderCandidate {
  readonly kind: RuntimeReminderKind;
  readonly body: string;
  readonly dedupeKey: string;
}

/** Computes reminder candidates from current runtime and persisted source facts. */
export interface RuntimeReminderProjector {
  project(): Promise<readonly RuntimeReminderCandidate[]>;
}
