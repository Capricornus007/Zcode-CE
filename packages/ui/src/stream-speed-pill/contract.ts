import type { SessionUsageState } from "@zcode/shared/zcode-protocol-v4";

export interface StreamSpeedPillInput {
  readonly usage: SessionUsageState | null | undefined;
  readonly streamingChars: number;
  readonly active: boolean;
}

export interface StreamSpeedReading {
  readonly tokensPerSecond: number | null;
  readonly live: boolean;
  readonly source: "decode" | "estimated" | "unavailable";
}

export interface StreamSpeedProjection {
  project(input: StreamSpeedPillInput): StreamSpeedReading;
}
