export interface MemoryRecallQuery {
  readonly text: string;
  readonly limit: number;
}

export interface MemoryRecallCandidate {
  readonly id: string;
  readonly score: number;
  readonly source: "memory" | "knowledge";
}

/** Ranking boundary; persistence and embedding IO remain implementation adapters. */
export interface MemoryRecallRanker {
  rank(query: MemoryRecallQuery): Promise<readonly MemoryRecallCandidate[]>;
}
