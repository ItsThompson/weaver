export interface ParsedSkill {
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface SkillEntry {
  name: string;
  source: "workspace" | "global";
  project: string | null;
  parsed: ParsedSkill;
}
