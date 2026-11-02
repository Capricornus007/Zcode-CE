export interface DesktopE2ERunnerConfig {
  readonly specs: readonly string[];
  readonly maxInstances: number;
  readonly reuseBuild: boolean;
}

/** Produces process-isolated runner settings from explicit environment facts. */
export interface DesktopE2EConfigFactory {
  create(workerId: string): DesktopE2ERunnerConfig;
}
