import type { ContextRemainingReader } from "./contract.js";

export const contextRemainingReaderExample: ContextRemainingReader = {
  read: () => ({ contextWindow: 128_000, usedTokens: 32_000, remainingTokens: 96_000, remainingPercent: 75 }),
};
