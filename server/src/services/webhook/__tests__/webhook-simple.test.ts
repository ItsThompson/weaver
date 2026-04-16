import {
  PENDING_APPROVAL_THRESHOLD_MS,
  WeaverEventName,
} from "@weaver/shared/types";
import {
  mockFetch,
  TEST_SESSION,
  makeEvent,
  configWith,
  setupWebhookTests,
} from "./webhook-helpers";

import * as webhook from "../index";
import { readConfig } from "../../config";
import { parseLogFile } from "../../log-parser";
import { log } from "../../../utils/logger";

setupWebhookTests(webhook, readConfig, parseLogFile);

describe("buildSimpleWebhookPayload", () => {
  it("formats agentSpawn", () => {
    expect(
      webhook.buildSimpleWebhookPayload(
        WeaverEventName.AGENT_SPAWN,
        "starting",
        "my-project",
        [],
      ).text,
    ).toBe("🟢 my-project started");
  });

  it("formats stop", () => {
    expect(
      webhook.buildSimpleWebhookPayload(
        WeaverEventName.STOP,
        "idle",
        "my-project",
        [],
      ).text,
    ).toBe("⚫ my-project idle");
  });

  it("formats userPromptSubmit with prompt", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "fix the bug" }),
    ];
    expect(
      webhook.buildSimpleWebhookPayload(
        WeaverEventName.USER_PROMPT_SUBMIT,
        "processing",
        "my-project",
        events,
      ).text,
    ).toBe("💬 my-project ── fix the bug");
  });

  it("formats preToolUse with tool name and input summary", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "test" }),
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_write",
        toolInput: { path: "/src/upload.ts" },
      }),
    ];
    expect(
      webhook.buildSimpleWebhookPayload(
        WeaverEventName.PRE_TOOL_USE,
        "running_tool",
        "my-project",
        events,
      ).text,
    ).toBe("🔧 my-project ── fs_write ── /src/upload.ts");
  });

  it("formats postToolUse", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "test" }),
      makeEvent(WeaverEventName.POST_TOOL_USE, {
        toolName: "execute_bash",
        toolInput: { command: "npm test" },
      }),
    ];
    expect(
      webhook.buildSimpleWebhookPayload(
        WeaverEventName.POST_TOOL_USE,
        "processing",
        "my-project",
        events,
      ).text,
    ).toBe("✅ my-project ── execute_bash ── npm test");
  });

  it("formats pending_approval with prompt", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, {
        prompt: "add error handling",
      }),
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_write",
        toolInput: { path: "/src/upload.ts" },
      }),
    ];
    const { text } = webhook.buildSimpleWebhookPayload(
      WeaverEventName.PRE_TOOL_USE,
      "pending_approval",
      "my-project",
      events,
    );
    expect(text).toContain(
      "⏳ my-project ── fs_write ── /src/upload.ts waiting for approval",
    );
    expect(text).toContain("💬 add error handling");
  });

  it("returns only text field", () => {
    expect(
      Object.keys(
        webhook.buildSimpleWebhookPayload(
          WeaverEventName.STOP,
          "idle",
          "my-project",
          [],
        ),
      ),
    ).toEqual(["text"]);
  });
});

describe("dispatchWebhook", () => {
  it("sends POST with correct headers and body", async () => {
    const payload = { text: "test" };
    const result = await webhook.dispatchWebhook(
      "https://hooks.example.com",
      payload,
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.example.com",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("logs and swallows fetch errors", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    const result = await webhook.dispatchWebhook("https://hooks.example.com", {
      text: "test",
    });
    expect(vi.mocked(log)).toHaveBeenCalledWith(
      expect.objectContaining({ event: "webhook_error" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("network down");
  });
});

describe("handleWebhookEvent (simple)", () => {
  it("skips dispatch when webhook_url is empty", async () => {
    mockFetch.mockClear();
    vi.mocked(readConfig).mockResolvedValue(configWith(""));
    await webhook.handleWebhookEvent(
      "sess-1",
      WeaverEventName.AGENT_SPAWN,
      "my-project",
      TEST_SESSION,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips dispatch when eventName is undefined", async () => {
    await webhook.handleWebhookEvent(
      "sess-1",
      undefined,
      "my-project",
      TEST_SESSION,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips dispatch when session webhook is disabled", async () => {
    webhook.setWebhookEnabled("sess-1", false);
    vi.mocked(parseLogFile).mockResolvedValue([
      makeEvent(WeaverEventName.AGENT_SPAWN),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      WeaverEventName.AGENT_SPAWN,
      "my-project",
      TEST_SESSION,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("dispatches simple format by default", async () => {
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
    expect(body).toEqual({ text: "🟢 my-project started" });
  });

  it("fires pending_approval after threshold", async () => {
    vi.mocked(parseLogFile).mockResolvedValue([
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "do it" }),
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_write",
        toolInput: { path: "/a" },
      }),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      WeaverEventName.PRE_TOOL_USE,
      "my-project",
      TEST_SESSION,
    );
    await vi.advanceTimersByTimeAsync(PENDING_APPROVAL_THRESHOLD_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse((mockFetch.mock.calls[1] as any)[1].body);
    expect(body.text).toContain("⏳");
  });

  it("cancels pending timer on postToolUse", async () => {
    vi.mocked(parseLogFile).mockResolvedValue([
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_write",
        toolInput: {},
      }),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      WeaverEventName.PRE_TOOL_USE,
      "my-project",
      TEST_SESSION,
    );
    vi.mocked(parseLogFile).mockResolvedValue([
      makeEvent(WeaverEventName.POST_TOOL_USE, {
        toolName: "fs_write",
        toolInput: {},
      }),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      WeaverEventName.POST_TOOL_USE,
      "my-project",
      TEST_SESSION,
    );
    await vi.advanceTimersByTimeAsync(PENDING_APPROVAL_THRESHOLD_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("cancels pending timer on stop", async () => {
    vi.mocked(parseLogFile).mockResolvedValue([
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_write",
        toolInput: {},
      }),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      WeaverEventName.PRE_TOOL_USE,
      "my-project",
      TEST_SESSION,
    );
    vi.mocked(parseLogFile).mockResolvedValue([
      makeEvent(WeaverEventName.STOP),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      WeaverEventName.STOP,
      "my-project",
      TEST_SESSION,
    );
    await vi.advanceTimersByTimeAsync(PENDING_APPROVAL_THRESHOLD_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
