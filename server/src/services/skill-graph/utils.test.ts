import { escapeRegex, findReferences, extractFrontmatterString } from "./utils";

describe("escapeRegex", () => {
  it("escapes special regex characters", () => {
    expect(escapeRegex("foo.bar+baz")).toBe("foo\\.bar\\+baz");
  });

  it("returns plain strings unchanged", () => {
    expect(escapeRegex("coding-practices")).toBe("coding-practices");
  });
});

describe("findReferences", () => {
  it("finds backtick-wrapped skill names", () => {
    const body = "Use `skill-a` and `skill-b` for this.";
    const refs = findReferences(body, ["skill-a", "skill-b", "skill-c"]);
    expect(refs).toEqual(["skill-a", "skill-b"]);
  });

  it("deduplicates repeated references", () => {
    const body = "Use `skill-a` then `skill-a` again.";
    expect(findReferences(body, ["skill-a"])).toEqual(["skill-a"]);
  });

  it("returns empty array when no names match", () => {
    expect(findReferences("no refs here", ["skill-a"])).toEqual([]);
  });

  it("returns empty array when knownNames is empty", () => {
    expect(findReferences("`skill-a`", [])).toEqual([]);
  });

  it("does not match names without backticks", () => {
    expect(findReferences("plain skill-a text", ["skill-a"])).toEqual([]);
  });
});

describe("extractFrontmatterString", () => {
  it("returns value when it is a string", () => {
    expect(extractFrontmatterString("hello", "fallback")).toBe("hello");
  });

  it("returns fallback for number value", () => {
    expect(extractFrontmatterString(42, "fallback")).toBe("fallback");
  });

  it("returns fallback for undefined", () => {
    expect(extractFrontmatterString(undefined, "fallback")).toBe("fallback");
  });

  it("returns fallback for object value", () => {
    expect(extractFrontmatterString({}, "fallback")).toBe("fallback");
  });
});
