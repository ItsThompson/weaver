import {
  isWebhookEnabled,
  setWebhookEnabled,
  clearAll,
} from "./session-tracker";

describe("session-tracker", () => {
  beforeEach(() => clearAll());

  it("returns false for unknown session", () => {
    expect(isWebhookEnabled("unknown")).toBe(false);
  });

  it("returns true after enabling a session", () => {
    setWebhookEnabled("sess-1", true);
    expect(isWebhookEnabled("sess-1")).toBe(true);
  });

  it("returns false after disabling a session", () => {
    setWebhookEnabled("sess-1", true);
    setWebhookEnabled("sess-1", false);
    expect(isWebhookEnabled("sess-1")).toBe(false);
  });

  it("tracks multiple sessions independently", () => {
    setWebhookEnabled("sess-1", true);
    setWebhookEnabled("sess-2", true);
    setWebhookEnabled("sess-1", false);
    expect(isWebhookEnabled("sess-1")).toBe(false);
    expect(isWebhookEnabled("sess-2")).toBe(true);
  });

  it("clearAll removes all sessions", () => {
    setWebhookEnabled("sess-1", true);
    setWebhookEnabled("sess-2", true);
    clearAll();
    expect(isWebhookEnabled("sess-1")).toBe(false);
    expect(isWebhookEnabled("sess-2")).toBe(false);
  });
});
