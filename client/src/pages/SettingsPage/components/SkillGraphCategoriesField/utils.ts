import type { SkillGraphCategoryConfig } from "@weaver/shared/types";

export interface CategoryRow {
  name: string;
  color: string;
  skills: string[];
}

export function toRows(
  categories: Record<string, SkillGraphCategoryConfig>,
): CategoryRow[] {
  return Object.entries(categories).map(([name, entry]) => ({
    name,
    color: entry.color ?? "",
    skills: entry.skills,
  }));
}

export function toConfig(
  rows: CategoryRow[],
): Record<string, SkillGraphCategoryConfig> {
  return rows.reduce<Record<string, SkillGraphCategoryConfig>>((acc, row) => {
    if (!row.name) {
      return acc;
    }
    acc[row.name] = {
      ...(row.color ? { color: row.color } : {}),
      skills: row.skills,
    };
    return acc;
  }, {});
}

export function isValidHex(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

export function collectAssignedSkills(rows: CategoryRow[]): Set<string> {
  const assigned = new Set<string>();
  rows.forEach((row) => row.skills.forEach((skill) => assigned.add(skill)));
  return assigned;
}

export function availableSkillOptions(
  allSkillNames: string[],
  assigned: Set<string>,
  currentSkills: string[],
): { label: string; value: string }[] {
  const currentSet = new Set(currentSkills);
  return allSkillNames.reduce<{ label: string; value: string }[]>(
    (acc, name) => {
      if (!assigned.has(name) || currentSet.has(name)) {
        acc.push({ label: name, value: name });
      }
      return acc;
    },
    [],
  );
}

export function updateRowAt(
  rows: CategoryRow[],
  index: number,
  patch: Partial<CategoryRow>,
): CategoryRow[] {
  return rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
}
