import type { SkillGraphCategoryConfig } from "@weaver/shared/types";
import { buildUpdatedCategories } from "./utils";

const testCategories: Record<string, SkillGraphCategoryConfig> = {
  core: { color: "#ff6b6b", skills: ["coding-practices", "testing-practices"] },
  language: { skills: ["typescript-standards"] },
};

describe("buildUpdatedCategories", () => {
  it("moves a skill to a new category", () => {
    const result = buildUpdatedCategories(
      testCategories,
      "typescript-standards",
      "core",
    );

    expect(result.core.skills).toContain("typescript-standards");
    expect(result.language.skills).not.toContain("typescript-standards");
  });

  it("removes skill from old category when moving", () => {
    const result = buildUpdatedCategories(
      testCategories,
      "coding-practices",
      "language",
    );

    expect(result.core.skills).not.toContain("coding-practices");
    expect(result.language.skills).toContain("coding-practices");
  });

  it("removes skill from all categories when set to uncategorized", () => {
    const result = buildUpdatedCategories(
      testCategories,
      "coding-practices",
      "__uncategorized__",
    );

    expect(result.core.skills).not.toContain("coding-practices");
    expect(result.language.skills).not.toContain("coding-practices");
  });

  it("preserves color on categories that have one", () => {
    const result = buildUpdatedCategories(
      testCategories,
      "coding-practices",
      "language",
    );

    expect(result.core.color).toBe("#ff6b6b");
    expect(result.language).not.toHaveProperty("color");
  });

  it("preserves other skills in the source category", () => {
    const result = buildUpdatedCategories(
      testCategories,
      "coding-practices",
      "language",
    );

    expect(result.core.skills).toEqual(["testing-practices"]);
  });

  it("does not add skill if target category does not exist", () => {
    const result = buildUpdatedCategories(
      testCategories,
      "coding-practices",
      "nonexistent",
    );

    expect(result.core.skills).not.toContain("coding-practices");
    expect(result).not.toHaveProperty("nonexistent");
  });
});
