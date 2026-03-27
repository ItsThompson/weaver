import "../__test-helpers__/mock-fs";

import { appendFileSync, mkdirSync } from "node:fs";
import { writeValidationEvent } from "./logging";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch = vi.fn().mockResolvedValue(new Response());
  globalThis.fetch = mockFetch as typeof globalThis.fetch;
});

const result = {
  name: "lint",
  passed: true,
  output: "",
  duration_ms: 10,
  timed_out: false,
};

describe("writeValidationEvent", () => {
  it("creates directory and appends JSON line", () => {
    writeValidationEvent(
      "/logs/sess.jsonl",
      "sess-1",
      "stop",
      [result],
      ["/a.ts"],
      [],
    );
    expect(mkdirSync).toHaveBeenCalledWith("/logs", { recursive: true });
    expect(appendFileSync).toHaveBeenCalledWith(
      "/logs/sess.jsonl",
      expect.stringContaining('"hook_event_name":"validation"'),
    );
  });

  it("includes trigger, results, changed_files, and agent_tested_dirs", () => {
    writeValidationEvent(
      "/logs/sess.jsonl",
      "sess-1",
      "postToolUse",
      [result],
      [],
      ["src"],
    );
    const written = vi.mocked(appendFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.event.trigger).toBe("postToolUse");
    expect(parsed.event.changed_files).toEqual([]);
    expect(parsed.event.agent_tested_dirs).toEqual(["src"]);
  });

  it("fires server notification", () => {
    writeValidationEvent(
      "/logs/sess.jsonl",
      "sess-1",
      "stop",
      [result],
      [],
      [],
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8143/api/notify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "sess-1", eventName: "validation" }),
      }),
    );
  });

  it("does not throw when appendFileSync fails", () => {
    vi.mocked(appendFileSync).mockImplementation(() => {
      throw new Error("disk full");
    });
    expect(() =>
      writeValidationEvent(
        "/logs/sess.jsonl",
        "sess-1",
        "stop",
        [result],
        [],
        [],
      ),
    ).not.toThrow();
  });
});
