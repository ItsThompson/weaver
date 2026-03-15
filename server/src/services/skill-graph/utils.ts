export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findReferences(body: string, knownNames: string[]): string[] {
  if (knownNames.length === 0) {
    return [];
  }

  const pattern = new RegExp(
    `\`(${knownNames.map(escapeRegex).join("|")})\``,
    "g",
  );
  return [...new Set([...body.matchAll(pattern)].map((match) => match[1]))];
}

export function extractFrontmatterString(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" ? value : fallback;
}
