export interface ModelRequestStabilityInput {
  readonly previousDigest?: string;
  readonly messages: readonly unknown[];
  readonly adaptiveReasoningEnabled: boolean;
}

export interface ModelRequestStabilityDecision {
  readonly requestDigest: string;
  readonly prefixStable: boolean;
  readonly reasoningLevelOverride?: string;
}

export interface ModelRequestStabilityPolicy {
  evaluate(input: ModelRequestStabilityInput): ModelRequestStabilityDecision;
  sanitizeText(text: string): string;
}
