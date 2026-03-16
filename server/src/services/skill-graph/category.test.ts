import { categorizeSkill } from "./category";
import type { SkillGraphCategoryConfig } from "@weaver/shared/types";

const testCategories: Record<string, SkillGraphCategoryConfig> = {
  core: { color: "#ff6b6b", skills: ["coding-practices"] },
  language: { skills: ["typescript-standards"] },
};

describe("categorizeSkill", () => {
  it("returns config category when skill is in config", () => {
    expect(categorizeSkill("coding-practices", testCategories)).toBe("core");
  });

  it("falls back to frontmatter category", () => {
    expect(categorizeSkill("unknown-skill", testCategories, "workflow")).toBe(
      "workflow",
    );
  });

  it("config overrides frontmatter", () => {
    expect(
      categorizeSkill("coding-practices", testCategories, "workflow"),
    ).toBe("core");
  });

  it("returns null when uncategorized", () => {
    expect(categorizeSkill("unknown-skill", testCategories)).toBeNull();
  });

  it("returns null with empty config and no frontmatter", () => {
    expect(categorizeSkill("anything", {})).toBeNull();
  });
});
