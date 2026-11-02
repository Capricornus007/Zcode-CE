export interface ContextRemainingSnapshot {
  readonly contextWindow: number;
  readonly usedTokens: number;
  readonly remainingTokens: number;
  readonly remainingPercent: number;
}

/** Read-only tool boundary; callers supply the current runtime usage facts. */
export interface ContextRemainingReader {
  read(): ContextRemainingSnapshot;
}
