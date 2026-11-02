import type { CacheKeepAlivePolicy } from "./contract.js";

export const cacheKeepAlivePolicyExample: CacheKeepAlivePolicy = {
  decide: (state) => ({ action: state.eligible ? "refresh" : "skip", reason: state.eligible ? "eligible-idle-runtime" : "ineligible-runtime" }),
};
