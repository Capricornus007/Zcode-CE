import type { ModelRequestStabilityPolicy } from "./contract.js";

export const modelRequestStabilityExample: ModelRequestStabilityPolicy = {
  evaluate: () => ({ requestDigest: "sha256:example", prefixStable: true }),
  sanitizeText: (text) => text,
};
