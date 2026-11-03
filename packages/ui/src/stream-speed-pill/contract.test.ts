import { describe, expect, it } from "vitest";
import { streamSpeedProjectionExample } from "./contract.example.js";
import { streamSpeedPillModule } from "./module.js";

describe("stream-speed-pill contract", () => {
  it("distinguishes unavailable speed from a fabricated zero", () => {
    expect(
      streamSpeedProjectionExample.project({ usage: null, streamingChars: 0, active: false }),
    ).toEqual({
      tokensPerSecond: null,
      live: false,
      source: "unavailable",
    });
    expect(streamSpeedPillModule.requires).toContain("shared");
  });
});
