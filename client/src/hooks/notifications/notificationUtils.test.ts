import { WeaverEventName } from "@weaver/shared/types";
import { deriveActivity, resolveNotification } from "./notificationUtils";

describe("deriveActivity", () => {
  it.each([
    [WeaverEventName.AGENT_SPAWN, "starting"],
    [WeaverEventName.STOP, "idle"],
    [WeaverEventName.PRE_TOOL_USE, "running_tool"],
    [WeaverEventName.USER_PROMPT_SUBMIT, "processing"],
    [WeaverEventName.POST_TOOL_USE, "processing"],
  ])("maps %s to %s", (eventName, expected) => {
    expect(deriveActivity(eventName)).toBe(expected);
  });
});

describe("resolveNotification", () => {
  let lastActivity: Map<string, string>;

  beforeEach(() => {
    lastActivity = new Map();
  });

  it.each([
    [WeaverEventName.AGENT_SPAWN, "My Session → Starting"],
    [WeaverEventName.STOP, "My Session → Idle"],
    [WeaverEventName.USER_PROMPT_SUBMIT, "My Session → Processing"],
    [WeaverEventName.PRE_TOOL_USE, "My Session → Running tool"],
    [WeaverEventName.POST_TOOL_USE, "My Session → Processing"],
  ])("notifies on first %s event", (eventName, expected) => {
    expect(
      resolveNotification("s1", eventName, "My Session", lastActivity),
    ).toBe(expected);
  });

  it.each([
    [
      "processing → running_tool",
      WeaverEventName.USER_PROMPT_SUBMIT,
      WeaverEventName.PRE_TOOL_USE,
    ],
    [
      "running_tool → processing",
      WeaverEventName.PRE_TOOL_USE,
      WeaverEventName.POST_TOOL_USE,
    ],
  ])("silences %s", (_label, setup, event) => {
    resolveNotification("s1", setup, "X", lastActivity);
    expect(resolveNotification("s1", event, "X", lastActivity)).toBeNull();
  });

  it("deduplicates same state", () => {
    resolveNotification("s1", WeaverEventName.STOP, "X", lastActivity);
    expect(
      resolveNotification("s1", WeaverEventName.STOP, "X", lastActivity),
    ).toBeNull();
  });

  it("tracks sessions independently", () => {
    resolveNotification("s1", WeaverEventName.STOP, "A", lastActivity);
    expect(
      resolveNotification("s2", WeaverEventName.STOP, "B", lastActivity),
    ).toBe("B → Idle");
  });

  it("falls back to truncated session ID when no name", () => {
    expect(
      resolveNotification(
        "abcdefgh-1234",
        WeaverEventName.AGENT_SPAWN,
        undefined,
        lastActivity,
      ),
    ).toBe("abcdefgh → Starting");
  });

  it("returns validation message for validation event", () => {
    expect(
      resolveNotification(
        "s1",
        WeaverEventName.VALIDATION,
        "My Session",
        lastActivity,
      ),
    ).toBe("My Session → Validation complete");
  });

  it("always shows validation even when activity is unchanged", () => {
    resolveNotification(
      "s1",
      WeaverEventName.USER_PROMPT_SUBMIT,
      "X",
      lastActivity,
    );
    // validation bypasses dedup — would normally be silenced as processing → processing
    expect(
      resolveNotification("s1", WeaverEventName.VALIDATION, "X", lastActivity),
    ).toBe("X → Validation complete");
  });

  it("simulates full session lifecycle", () => {
    const events: WeaverEventName[] = [
      WeaverEventName.AGENT_SPAWN,
      WeaverEventName.USER_PROMPT_SUBMIT,
      WeaverEventName.PRE_TOOL_USE,
      WeaverEventName.POST_TOOL_USE,
      WeaverEventName.PRE_TOOL_USE,
      WeaverEventName.POST_TOOL_USE,
      WeaverEventName.STOP,
      WeaverEventName.USER_PROMPT_SUBMIT,
      WeaverEventName.PRE_TOOL_USE,
      WeaverEventName.POST_TOOL_USE,
      WeaverEventName.STOP,
    ];
    const notifications = events
      .map((event) => resolveNotification("s1", event, "Test", lastActivity))
      .filter(Boolean);

    expect(notifications).toEqual([
      "Test → Starting",
      "Test → Processing",
      "Test → Idle",
      "Test → Processing",
      "Test → Idle",
    ]);
  });
});
