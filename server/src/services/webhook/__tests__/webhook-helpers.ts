import type { HookEvent, Session } from "@weaver/shared/types";
import { DEFAULT_CONFIG } from "@weaver/shared/types";
import type * as WebhookModule from "../index";

vi.mock("../../config", () => ({ readConfig: vi.fn() }));
vi.mock("../../log-parser", () => ({
  parseLogFile: vi.fn(),
  deriveActivity: vi.fn(),
}));
vi.mock("../../../utils/logger", () => ({ log: vi.fn() }));

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

export const mockFetch = vi.fn<() => Promise<Response>>();
globalThis.fetch = mockFetch as any;

export function setupWebhookTests(
  webhook: typeof WebhookModule,
  readConfig: () => unknown,
  parseLogFile: () => unknown,
  deriveActivity: (name: string) => string,
  format: "simple" | "advanced" = "simple",
) {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(new Response("ok"));
    vi.mocked(readConfig).mockResolvedValue(
      configWith("https://hooks.example.com", format),
    );
    vi.mocked(parseLogFile).mockResolvedValue([]);
    vi.mocked(deriveActivity).mockImplementation((name: string) => {
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
    vi.useRealTimers();
    webhook.stopWebhookTimers();
  });
}
