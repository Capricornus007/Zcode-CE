export interface CuaBenchTaskResult {
  readonly id: string;
  readonly name: string;
  readonly pass: boolean;
  readonly ms: number;
  readonly detail: string;
}

export interface CuaBenchReport {
  readonly platform: "windows";
  readonly tasks: readonly CuaBenchTaskResult[];
}

/** Machine bench runner; it reports observed runtime facts and never fabricates skipped passes. */
export interface CuaBenchRunner {
  run(): Promise<CuaBenchReport>;
}
