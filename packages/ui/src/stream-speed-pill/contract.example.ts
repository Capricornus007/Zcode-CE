import type { StreamSpeedProjection } from "./contract.js";

export const streamSpeedProjectionExample: StreamSpeedProjection = {
  project: () => ({ tokensPerSecond: null, live: false, source: "unavailable" }),
};
