import {
  PENDING_APPROVAL_THRESHOLD_MS,
  WeaverEventName,
} from "@weaver/shared/types";
import {
  mockFetch,
  TEST_SESSION,
  makeEvent,
  setupWebhookTests,
} from "./webhook-helpers";

import * as webhook from "../index";
import { readConfig } from "../../config";
import { parseLogFile } from "../../log-parser";

setupWebhookTests(webhook, readConfig, parseLogFile, "advanced");

describe("buildWebhookPayload (advanced)", () => {
  it("returns null fields for agentSpawn", () => {
    const payload = webhook.buildWebhookPayload(
      "sess-1",
      WeaverEventName.AGENT_SPAWN,
      "starting",
      "my-project",
      TEST_SESSION,
      [],
    );
    expect(payload.prompt).toBeNull();
    expect(payload.tool_name).toBeNull();
    expect(payload.session_name).toBe("my-project");
    expect(payload.session_pid).toBe(111);
  });

  it("extracts prompt for userPromptSubmit", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "fix the bug" }),
    ];
    const payload = webhook.buildWebhookPayload(
      "sess-1",
      WeaverEventName.USER_PROMPT_SUBMIT,
      "processing",
      "my-project",
      TEST_SESSION,
      events,
    );
    expect(payload.prompt).toBe("fix the bug");
    expect(payload.tool_name).toBeNull();
  });

  it("extracts tool context for preToolUse", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "add tests" }),
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_write",
        toolInput: { path: "/src/a.ts" },
      }),
    ];
    const payload = webhook.buildWebhookPayload(
      "sess-1",
      WeaverEventName.PRE_TOOL_USE,
      "running_tool",
      "my-project",
      TEST_SESSION,
      events,
    );
    expect(payload.prompt).toBe("add tests");
    expect(payload.tool_name).toBe("fs_write");
    expect(payload.tool_input).toBe(JSON.stringify({ path: "/src/a.ts" }));
  });

  it("stringifies tool_response for postToolUse", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "read file" }),
      makeEvent(WeaverEventName.POST_TOOL_USE, {
        toolName: "fs_read",
        toolInput: { path: "/a" },
        toolResponse: { success: true, result: ["ok"] },
      }),
    ];
    const payload = webhook.buildWebhookPayload(
      "sess-1",
      WeaverEventName.POST_TOOL_USE,
      "processing",
      "my-project",
      TEST_SESSION,
      events,
    );
    expect(payload.tool_response).toBe(
      JSON.stringify({ success: true, result: ["ok"] }),
    );
  });

  it("produces a flat payload with no nested objects", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "test" }),
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_write",
        toolInput: { path: "/a" },
      }),
    ];
    const payload = webhook.buildWebhookPayload(
      "sess-1",
      WeaverEventName.PRE_TOOL_USE,
      "running_tool",
      "my-project",
      TEST_SESSION,
      events,
    );
    for (const value of Object.values(payload)) {
      expect(value === null || typeof value !== "object").toBe(true);
    }
  });
});

describe("handleWebhookEvent (advanced)", () => {
  it("dispatches advanced format when configured", async () => {
    vi.mocked(parseLogFile).mockResolvedValue([
      makeEvent(WeaverEventName.AGENT_SPAWN),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      WeaverEventName.AGENT_SPAWN,
      "my-project",
      TEST_SESSION,
    );
    const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
    expect(body.event).toBe("agentSpawn");
    expect(body.source).toBe("weaver");
  });

  it("fires pending_approval with advanced payload after threshold", async () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "do it" }),
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_write",
        toolInput: { path: "/a" },
      }),
    ];
    vi.mocked(parseLogFile).mockResolvedValue(events);

    await webhook.handleWebhookEvent(
      "sess-1",
      WeaverEventName.PRE_TOOL_USE,
      "my-project",
      TEST_SESSION,
    );
    await vi.advanceTimersByTimeAsync(PENDING_APPROVAL_THRESHOLD_MS);

    const pendingBody = JSON.parse((mockFetch.mock.calls[1] as any)[1].body);
    expect(pendingBody.activity).toBe("pending_approval");
    expect(pendingBody.event).toBe("preToolUse");
    expect(pendingBody.source).toBe("weaver");
  });
});
