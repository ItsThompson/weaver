import { parseSkillFile } from "./parse-skill";

describe("parseSkillFile", () => {
  it("parses valid frontmatter and body", () => {
    const content = `---
name: my-skill
description: A test skill
---
# Body content

Some markdown here.`;

    const result = parseSkillFile(content);
    expect(result.frontmatter).toEqual({
      name: "my-skill",
      description: "A test skill",
    });
    expect(result.body).toContain("# Body content");
    expect(result.body).toContain("Some markdown here.");
  });

  it("handles missing frontmatter", () => {
    const content = "Just plain markdown content";
    const result = parseSkillFile(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("Just plain markdown content");
  });

  it("handles empty content", () => {
    const result = parseSkillFile("");
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("");
  });

  it("handles frontmatter with extra fields", () => {
    const content = `---
name: my-skill
description: desc
version: 2
tags:
  - foo
  - bar
---
Body`;

    const result = parseSkillFile(content);
    expect(result.frontmatter).toEqual({
      name: "my-skill",
      description: "desc",
      version: 2,
      tags: ["foo", "bar"],
    });
    expect(result.body).toContain("Body");
  });
});
