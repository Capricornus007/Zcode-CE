import { describe, expect, it } from "vitest";
import { runtimeReminderProjectorExample } from "./contract.example.js";
import { cliRuntimeRemindersModule } from "./module.js";

describe("cli-runtime-reminders contract", () => {
  it("emits typed candidates with stable dedupe keys", async () => {
    await expect(runtimeReminderProjectorExample.project()).resolves.toEqual([
      { kind: "task-reanchor", body: "Keep the accepted task in focus.", dedupeKey: "task:1" },
    ]);
    expect(cliRuntimeRemindersModule.requires).toContain("cli-memory-recall");
  });
});
