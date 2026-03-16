import {
  toRows,
  toConfig,
  isValidHex,
  collectAssignedSkills,
  availableSkillOptions,
  updateRowAt,
} from "./utils";
import type { CategoryRow } from "./utils";

describe("toRows", () => {
  it("converts categories to rows", () => {
    const result = toRows({
      core: { color: "#ff6b6b", skills: ["coding-practices"] },
      language: { skills: ["typescript-standards"] },
    });

    expect(result).toEqual([
      { name: "core", color: "#ff6b6b", skills: ["coding-practices"] },
      { name: "language", color: "", skills: ["typescript-standards"] },
    ]);
  });

  it("returns empty array for empty categories", () => {
    expect(toRows({})).toEqual([]);
  });
});

describe("toConfig", () => {
  it("converts rows to config categories", () => {
    const result = toConfig([
      { name: "core", color: "#ff6b6b", skills: ["coding-practices"] },
      { name: "language", color: "", skills: ["typescript-standards"] },
    ]);

    expect(result).toEqual({
      core: { color: "#ff6b6b", skills: ["coding-practices"] },
      language: { skills: ["typescript-standards"] },
    });
  });

  it("skips rows with empty name", () => {
    const result = toConfig([
      { name: "", color: "#ff6b6b", skills: ["coding-practices"] },
      { name: "core", color: "", skills: [] },
    ]);

    expect(result).toEqual({ core: { skills: [] } });
  });

  it("omits color when empty string", () => {
    const result = toConfig([
      { name: "core", color: "", skills: ["coding-practices"] },
    ]);

    expect(result.core).not.toHaveProperty("color");
  });

  it("returns empty object for empty rows", () => {
    expect(toConfig([])).toEqual({});
  });
});

describe("isValidHex", () => {
  it.each(["#ff6b6b", "#000000", "#ABCDEF"])("accepts %s", (color) => {
    expect(isValidHex(color)).toBe(true);
  });

  it.each(["red", "#fff", "#gggggg", "ff6b6b", ""])("rejects %s", (color) => {
    expect(isValidHex(color)).toBe(false);
  });
});

describe("collectAssignedSkills", () => {
  it("collects all skills across rows", () => {
    const rows: CategoryRow[] = [
      { name: "core", color: "", skills: ["a", "b"] },
      { name: "lang", color: "", skills: ["c"] },
    ];

    expect(collectAssignedSkills(rows)).toEqual(new Set(["a", "b", "c"]));
  });

  it("returns empty set for empty rows", () => {
    expect(collectAssignedSkills([])).toEqual(new Set());
  });
});

describe("availableSkillOptions", () => {
  it("excludes skills assigned to other rows", () => {
    const all = ["a", "b", "c"];
    const assigned = new Set(["a", "b"]);
    const current = ["a"];

    const result = availableSkillOptions(all, assigned, current);

    expect(result).toEqual([
      { label: "a", value: "a" },
      { label: "c", value: "c" },
    ]);
  });

  it("returns all when nothing is assigned", () => {
    const result = availableSkillOptions(["a", "b"], new Set(), []);

    expect(result).toEqual([
      { label: "a", value: "a" },
      { label: "b", value: "b" },
    ]);
  });
});

describe("updateRowAt", () => {
  const rows: CategoryRow[] = [
    { name: "core", color: "#ff6b6b", skills: ["a"] },
    { name: "lang", color: "", skills: ["b"] },
  ];

  it("updates the row at the given index", () => {
    const result = updateRowAt(rows, 0, { name: "foundation" });

    expect(result[0].name).toBe("foundation");
    expect(result[0].color).toBe("#ff6b6b");
    expect(result[1]).toEqual(rows[1]);
  });

  it("does not mutate the original array", () => {
    const result = updateRowAt(rows, 1, { color: "#000000" });

    expect(result).not.toBe(rows);
    expect(rows[1].color).toBe("");
  });
});
