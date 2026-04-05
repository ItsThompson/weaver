import { describe, it, expect } from "vitest";
import { chunkTranscript, hasPunctuation } from "./chunk-transcript";

describe("hasPunctuation", () => {
  it("returns true when text contains periods", () => {
    expect(hasPunctuation("Hello world.")).toBe(true);
  });

  it("returns true when text contains question marks", () => {
    expect(hasPunctuation("How are you?")).toBe(true);
  });

  it("returns true when text contains exclamation points", () => {
    expect(hasPunctuation("Wow!")).toBe(true);
  });

  it("returns false when text has no sentence-ending punctuation", () => {
    expect(hasPunctuation("hello world um so yeah")).toBe(false);
  });

  it("returns false for commas and other non-sentence punctuation", () => {
    expect(hasPunctuation("hello, world")).toBe(false);
  });
});

describe("chunkTranscript", () => {
  it("returns empty array for empty input", () => {
    expect(chunkTranscript("")).toEqual([]);
    expect(chunkTranscript("   ")).toEqual([]);
  });

  it("returns single chunk for short text", () => {
    expect(chunkTranscript("Hello world.")).toEqual(["Hello world."]);
  });

  it("groups short sentences together up to max length", () => {
    const input = "Short. Also short. Still short.";
    expect(chunkTranscript(input)).toEqual(["Short. Also short. Still short."]);
  });

  it("splits long text into multiple chunks at sentence boundaries", () => {
    const sentence =
      "This is a moderately long sentence that takes up some space in the chunk.";
    const input = Array(10).fill(sentence).join(" ");
    const result = chunkTranscript(input);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(300);
    });
  });

  it("splits on question marks and exclamation points", () => {
    const input = "Is this working? Yes it is! Great to hear.";
    expect(chunkTranscript(input)).toEqual([
      "Is this working? Yes it is! Great to hear.",
    ]);
  });

  it("returns entire text as one chunk when no punctuation exists", () => {
    const input =
      "hello world um so yeah this is a long sentence without any punctuation";
    expect(chunkTranscript(input)).toEqual([input]);
  });

  it("preserves all content across chunks", () => {
    const sentence =
      "This is sentence number one that is fairly long and takes up space.";
    const input = Array(8).fill(sentence).join(" ");
    const result = chunkTranscript(input);
    expect(result.join(" ")).toBe(input);
  });
});
