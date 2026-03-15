import { parseSkillFile } from "./parse-skill";
import {
  SKILL_VALID_CONTENT,
  SKILL_EXTRA_FIELDS_CONTENT,
} from "../../__tests__/fixtures/skills";

describe("parseSkillFile", () => {
  it("parses valid frontmatter and body", () => {
    const result = parseSkillFile(SKILL_VALID_CONTENT);
    expect(result.frontmatter).toEqual({
      name: "my-skill",
      description: "A test skill",
    });
    expect(result.body).toContain("# Body content");
    expect(result.body).toContain("Some markdown here.");
  });

  it("handles missing frontmatter", () => {
    const result = parseSkillFile("Just plain markdown content");
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("Just plain markdown content");
  });

  it("handles empty content", () => {
    const result = parseSkillFile("");
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("");
  });

  it("handles frontmatter with extra fields", () => {
    const result = parseSkillFile(SKILL_EXTRA_FIELDS_CONTENT);
    expect(result.frontmatter).toEqual({
      name: "my-skill",
      description: "desc",
      version: 2,
      tags: ["foo", "bar"],
    });
    expect(result.body).toContain("Body");
  });
});
