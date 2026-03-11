import { jest } from "@jest/globals";
import type { HookEvent, Session, WeaverConfig } from "@weaver/shared/types";
import { DEFAULT_CONFIG } from "@weaver/shared/types";

export const mockReadConfig =
  jest.fn<() => Promise<{ config: WeaverConfig; warnings: string[] }>>();
export const mockParseLogFile = jest.fn<() => Promise<HookEvent[]>>();
export const mockDeriveActivity = jest.fn<(name: string) => string>();
export const mockLog = jest.fn();
export const mockFetch = jest.fn<() => Promise<Response>>();

jest.unstable_mockModule("../../config.js", () => ({
  readConfig: mockReadConfig,
}));
jest.unstable_mockModule("../../log-parser.js", () => ({
  parseLogFile: mockParseLogFile,
  deriveActivity: mockDeriveActivity,
}));
jest.unstable_mockModule("../../../utils/logger.js", () => ({ log: mockLog }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
globalThis.fetch = mockFetch as any;

export const webhook = await import("../index.js");

export const TEST_SESSION: Session = {
  id: "sess-1",
  pid: 111,
  customName: "my-project",
  cwd: "/Users/me/project",
  agentName: null,
  startTime: "2026-01-01T00:00:00Z",
  lastEventTime: "2026-01-01T00:01:00Z",
};

export function makeEvent(
  name: string,
  extra: Record<string, unknown> = {},
): HookEvent {
  return {
    timestamp: "2026-01-01T00:00:00Z",
    event: { hook_event_name: name, cwd: "/tmp", ...extra },
  };
}

export function configWith(
  url: string,
  format: "simple" | "advanced" = "simple",
) {
  return {
    config: { ...DEFAULT_CONFIG, webhook_url: url, webhook_format: format },
    warnings: [],
  };
}

export function setupMocks() {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockResolvedValue(new Response("ok"));
    mockReadConfig.mockResolvedValue(configWith("https://hooks.example.com"));
    mockParseLogFile.mockResolvedValue([]);
    mockDeriveActivity.mockImplementation((name: string) => {
      if (name === "agentSpawn") {
        return "starting";
      }
      if (name === "stop") {
        return "idle";
      }
      if (name === "preToolUse") {
        return "running_tool";
      }
      return "processing";
    });
    webhook.stopWebhookTimers();
    webhook.setWebhookEnabled("sess-1", true);
  });

  afterEach(() => {
    jest.useRealTimers();
    webhook.stopWebhookTimers();
  });
}
