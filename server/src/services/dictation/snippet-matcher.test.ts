import { describe, it, expect } from "vitest";
import type { Snippet } from "@weaver/shared/types";
import { matchSnippet } from "./snippet-matcher.js";

const snippet = (trigger: string, id = "1"): Snippet => ({
  id,
  trigger,
  expansion: `expansion for ${trigger}`,
});

describe("matchSnippet", () => {
  it("returns snippet on exact case-insensitive match", () => {
    const s = snippet("insert intro");
    expect(matchSnippet("Insert Intro", [s])).toBe(s);
  });

  it("ignores non-alpha characters when matching", () => {
    const s = snippet("insert intro");
    expect(matchSnippet("insert, intro!", [s])).toBe(s);
  });

  it("returns null when no snippet matches", () => {
    expect(matchSnippet("hello world", [snippet("insert intro")])).toBeNull();
  });

  it("returns null when transcript is a superset (substring does not match)", () => {
    expect(
      matchSnippet("please insert intro now", [snippet("insert intro")]),
    ).toBeNull();
  });

  it("returns null when multiple snippets match", () => {
    const s1 = snippet("insert intro", "1");
    const s2 = snippet("Insert Intro", "2");
    expect(matchSnippet("insert intro", [s1, s2])).toBeNull();
  });

  it("returns null for empty transcript", () => {
    expect(matchSnippet("", [snippet("insert intro")])).toBeNull();
  });

  it("returns null for empty snippets array", () => {
    expect(matchSnippet("insert intro", [])).toBeNull();
  });
});
