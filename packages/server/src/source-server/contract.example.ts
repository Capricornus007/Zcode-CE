import type { SourceServerProbeResult, TransportContext } from "./contract.js";

export const sourceServerProbeExample: {
  result: SourceServerProbeResult;
  context: TransportContext;
} = {
  result: { platform: "linux", arch: "x64", installed: false },
  context: {},
};
