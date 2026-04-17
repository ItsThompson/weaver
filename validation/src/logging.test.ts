import "./__test-helpers__/mock-fs";

import { appendFileSync, mkdirSync } from "node:fs";
import { Harness } from "@weaver/shared/types";
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
  it("creates directory and appends canonical WeaverEvent JSON line", () => {
    writeValidationEvent(
      "/logs/sess.jsonl",
      "sess-1",
      "stop",
      [result],
      ["/a.ts"],
      [],
    );
    expect(mkdirSync).toHaveBeenCalledWith("/logs", { recursive: true });
    const written = vi.mocked(appendFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.eventName).toBe("validation");
    expect(parsed.sessionId).toBe("sess-1");
    expect(parsed.harness).toBe("kiro-cli");
  });

  it("includes validation fields in canonical format", () => {
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
    expect(parsed.validationTrigger).toBe("postToolUse");
    expect(parsed.validationResults).toEqual([result]);
    expect(parsed.validationChangedFiles).toEqual([]);
    expect(parsed.validationAgentTestedDirs).toEqual(["src"]);
  });

  it("uses provided harness value", () => {
    writeValidationEvent(
      "/logs/sess.jsonl",
      "sess-1",
      "stop",
      [result],
      [],
      [],
      Harness.CLAUDE_CODE,
    );
    const written = vi.mocked(appendFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(parsed.harness).toBe("claude-code");
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
