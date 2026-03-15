import { homedir } from "node:os";
import { skillNameFromPath } from "./skill-name";

describe("skillNameFromPath", () => {
  it("extracts directory name from absolute path", () => {
    expect(
      skillNameFromPath("/Users/me/.kiro/skills/coding-practices/SKILL.md"),
    ).toBe("coding-practices");
  });

  it("extracts directory name from home-relative path", () => {
    expect(
      skillNameFromPath(
        `${homedir()}/.config/amazonq/global/skills/typescript-standards/SKILL.md`,
      ),
    ).toBe("typescript-standards");
  });

  it("extracts directory name from workspace path", () => {
    expect(skillNameFromPath("/project/.kiro/skills/my-skill/SKILL.md")).toBe(
      "my-skill",
    );
  });
});
