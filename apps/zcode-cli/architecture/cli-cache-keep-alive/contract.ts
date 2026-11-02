export interface CacheKeepAliveState {
  readonly eligible: boolean;
  readonly idleForMs: number;
  readonly contextTokens: number;
}

export interface CacheKeepAliveDecision {
  readonly action: "skip" | "refresh";
  readonly reason: string;
}

/** Decides whether the existing runtime may issue one bounded prefix refresh. */
export interface CacheKeepAlivePolicy {
  decide(state: CacheKeepAliveState): CacheKeepAliveDecision;
}
