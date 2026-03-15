import { SkillCategory } from "@weaver/shared/types";
import { categorizeSkill } from "./category";

describe("categorizeSkill", () => {
  it("returns static mapping for known skills", () => {
    expect(
      categorizeSkill("coding-practices", { incoming: 0, outgoing: 0 }),
    ).toBe(SkillCategory.CORE);
    expect(
      categorizeSkill("typescript-standards", { incoming: 0, outgoing: 0 }),
    ).toBe(SkillCategory.LANGUAGE);
    expect(
      categorizeSkill("backend-coding-practices", { incoming: 0, outgoing: 0 }),
    ).toBe(SkillCategory.DOMAIN);
    expect(
      categorizeSkill("testing-practices", { incoming: 0, outgoing: 0 }),
    ).toBe(SkillCategory.WORKFLOW);
  });

  it("falls back to CORE for high outgoing edge count", () => {
    expect(categorizeSkill("unknown-skill", { incoming: 0, outgoing: 3 })).toBe(
      SkillCategory.CORE,
    );
  });

  it("falls back to LANGUAGE for high incoming edge count", () => {
    expect(categorizeSkill("unknown-skill", { incoming: 3, outgoing: 0 })).toBe(
      SkillCategory.LANGUAGE,
    );
  });

  it("falls back to DOMAIN for unknown skills with low edge counts", () => {
    expect(categorizeSkill("unknown-skill", { incoming: 1, outgoing: 1 })).toBe(
      SkillCategory.DOMAIN,
    );
  });
});
