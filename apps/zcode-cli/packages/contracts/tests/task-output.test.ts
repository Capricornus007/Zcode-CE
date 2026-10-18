import { describe, expect, it } from "vitest";
import {
  TASK_OUTPUT_PROVIDER_DESCRIPTION,
  TaskOutputInputJsonSchema,
  TaskOutputInputSchema,
} from "../src/tools/task-output.js";

describe("TaskOutput contracts", () => {
  it("exposes the canonical provider description", () => {
    expect(TASK_OUTPUT_PROVIDER_DESCRIPTION).toBe(
      [
        "Wait for a background task and retrieve its output (background shell, agent, or remote session).",
        "",
        "PREFERRED way to wait on any long-running background task: call with block=true instead of sleeping in a loop (e.g. \"sleep 300 && tail the log\"). The wait is event-driven — it returns as soon as the task completes or the timeout elapses, and a <task-notification> with the output file path is also delivered on exit. timeout is capped at 600000 ms (10 minutes); for longer tasks, call again to keep waiting.",
        "",
        "Reading results:",
        "- For bash tasks: the output file path contains stdout/stderr — prefer the Read tool on that path.",
        "- For local_agent tasks: use the Agent tool result directly. Do NOT Read the .output file — it is a symlink to the full subagent conversation transcript (JSONL) and will overflow your context window.",
        "- For remote_agent tasks: prefer Read on the output file path — it contains the streamed remote session output (same as bash).",
        "",
        "Also supports block=false for a non-blocking status check. Task IDs can be found using the /tasks command. Works with all task types: background shells, async agents, and remote sessions.",
      ].join("\n"),
    );
  });

  it("exposes the canonical provider input schema", () => {
    expect(TaskOutputInputJsonSchema).toEqual({
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The task ID to get output from",
        },
        block: {
          type: "boolean",
          default: true,
          description: "Whether to wait for completion",
        },
        timeout: {
          type: "number",
          default: 30_000,
          minimum: 0,
          maximum: 600_000,
          description: "Max wait time in ms",
        },
      },
      required: ["task_id", "block", "timeout"],
      additionalProperties: false,
      $schema: "https://json-schema.org/draft/2020-12/schema",
    });
  });

  it("applies defaults and accepts only the supported semantic boolean strings", () => {
    expect(TaskOutputInputSchema.parse({ task_id: "agent_1" })).toEqual({
      task_id: "agent_1",
      block: true,
      timeout: 30_000,
    });
    expect(
      TaskOutputInputSchema.parse({
        task_id: "agent_1",
        block: "false",
        timeout: 0,
      }),
    ).toEqual({
      task_id: "agent_1",
      block: false,
      timeout: 0,
    });
    expect(TaskOutputInputSchema.parse({ task_id: "agent_1", block: "true" }).block).toBe(true);
    expect(
      TaskOutputInputSchema.safeParse({
        task_id: "agent_1",
        block: "1",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields and out-of-range timeout values", () => {
    expect(
      TaskOutputInputSchema.safeParse({
        task_id: "agent_1",
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      TaskOutputInputSchema.safeParse({
        task_id: "agent_1",
        timeout: 600_001,
      }).success,
    ).toBe(false);
  });
});
