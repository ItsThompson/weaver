import { PENDING_APPROVAL_THRESHOLD_MS } from "@weaver/shared/types";
import {
  mockFetch,
  TEST_SESSION,
  makeEvent,
  configWith,
  setupWebhookTests,
} from "./webhook-helpers";

vi.mock("../../config", () => ({ readConfig: vi.fn() }));
vi.mock("../../log-parser", () => ({
  parseLogFile: vi.fn(),
  deriveActivity: vi.fn(),
}));
vi.mock("../../../utils/logger", () => ({ log: vi.fn() }));

import * as webhook from "../index";
import { readConfig } from "../../config";
import { parseLogFile, deriveActivity } from "../../log-parser";
import { log } from "../../../utils/logger";

setupWebhookTests(webhook, readConfig, parseLogFile, deriveActivity);

describe("buildSimpleWebhookPayload", () => {
  it("formats agentSpawn", () => {
    expect(
      webhook.buildSimpleWebhookPayload(
        "agentSpawn",
        "starting",
        "my-project",
        [],
      ).text,
    ).toBe("🟢 my-project started");
  });

  it("formats stop", () => {
    expect(
      webhook.buildSimpleWebhookPayload("stop", "idle", "my-project", []).text,
    ).toBe("⚫ my-project idle");
  });

  it("formats userPromptSubmit with prompt", () => {
    const events = [makeEvent("userPromptSubmit", { prompt: "fix the bug" })];
    expect(
      webhook.buildSimpleWebhookPayload(
        "userPromptSubmit",
        "processing",
        "my-project",
        events,
      ).text,
    ).toBe("💬 my-project ── fix the bug");
  });

  it("formats preToolUse with tool name and input summary", () => {
    const events = [
      makeEvent("userPromptSubmit", { prompt: "test" }),
      makeEvent("preToolUse", {
        tool_name: "fs_write",
        tool_input: { path: "/src/upload.ts" },
      }),
    ];
    expect(
      webhook.buildSimpleWebhookPayload(
        "preToolUse",
        "running_tool",
        "my-project",
        events,
      ).text,
    ).toBe("🔧 my-project ── fs_write ── /src/upload.ts");
  });

  it("formats postToolUse", () => {
    const events = [
      makeEvent("userPromptSubmit", { prompt: "test" }),
      makeEvent("postToolUse", {
        tool_name: "execute_bash",
        tool_input: { command: "npm test" },
      }),
    ];
    expect(
      webhook.buildSimpleWebhookPayload(
        "postToolUse",
        "processing",
        "my-project",
        events,
      ).text,
    ).toBe("✅ my-project ── execute_bash ── npm test");
  });

  it("formats pending_approval with prompt", () => {
    const events = [
      makeEvent("userPromptSubmit", { prompt: "add error handling" }),
      makeEvent("preToolUse", {
        tool_name: "fs_write",
        tool_input: { path: "/src/upload.ts" },
      }),
    ];
    const { text } = webhook.buildSimpleWebhookPayload(
      "preToolUse",
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
        webhook.buildSimpleWebhookPayload("stop", "idle", "my-project", []),
      ),
    ).toEqual(["text"]);
  });
});

describe("dispatchWebhook", () => {
  it("sends POST with correct headers and body", async () => {
    const payload = { text: "test" };
    await webhook.dispatchWebhook("https://hooks.example.com", payload);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.example.com",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  });

  it("logs and swallows fetch errors", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    await webhook.dispatchWebhook("https://hooks.example.com", {
      text: "test",
    });
    expect(vi.mocked(log)).toHaveBeenCalledWith(
      expect.objectContaining({ event: "webhook_error" }),
    );
  });
});

describe("handleWebhookEvent (simple)", () => {
  it("skips dispatch when webhook_url is empty", async () => {
    mockFetch.mockClear();
    vi.mocked(readConfig).mockResolvedValue(configWith(""));
    await webhook.handleWebhookEvent(
      "sess-1",
      "agentSpawn",
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
    vi.mocked(parseLogFile).mockResolvedValue([makeEvent("agentSpawn")]);
    await webhook.handleWebhookEvent(
      "sess-1",
      "agentSpawn",
      "my-project",
      TEST_SESSION,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("dispatches simple format by default", async () => {
    vi.mocked(parseLogFile).mockResolvedValue([makeEvent("agentSpawn")]);
    await webhook.handleWebhookEvent(
      "sess-1",
      "agentSpawn",
      "my-project",
      TEST_SESSION,
    );
    const body = JSON.parse((mockFetch.mock.calls[0] as any)[1].body);
    expect(body).toEqual({ text: "🟢 my-project started" });
  });

  it("fires pending_approval after threshold", async () => {
    vi.mocked(parseLogFile).mockResolvedValue([
      makeEvent("userPromptSubmit", { prompt: "do it" }),
      makeEvent("preToolUse", {
        tool_name: "fs_write",
        tool_input: { path: "/a" },
      }),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      "preToolUse",
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
      makeEvent("preToolUse", { tool_name: "fs_write", tool_input: {} }),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      "preToolUse",
      "my-project",
      TEST_SESSION,
    );
    vi.mocked(parseLogFile).mockResolvedValue([
      makeEvent("postToolUse", { tool_name: "fs_write", tool_input: {} }),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      "postToolUse",
      "my-project",
      TEST_SESSION,
    );
    await vi.advanceTimersByTimeAsync(PENDING_APPROVAL_THRESHOLD_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("cancels pending timer on stop", async () => {
    vi.mocked(parseLogFile).mockResolvedValue([
      makeEvent("preToolUse", { tool_name: "fs_write", tool_input: {} }),
    ]);
    await webhook.handleWebhookEvent(
      "sess-1",
      "preToolUse",
      "my-project",
      TEST_SESSION,
    );
    vi.mocked(parseLogFile).mockResolvedValue([makeEvent("stop")]);
    await webhook.handleWebhookEvent(
      "sess-1",
      "stop",
      "my-project",
      TEST_SESSION,
    );
    await vi.advanceTimersByTimeAsync(PENDING_APPROVAL_THRESHOLD_MS);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
