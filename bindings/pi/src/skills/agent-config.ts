/**
 * Pi uses AGENTS.md (unstructured Markdown). No structured config to load in V1.
 * Returns null for any input. Can be extended to parse Markdown frontmatter
 * if pi adopts that convention.
 */
export async function loadAgentConfig(
  _agentName: string,
  _cwd: string,
): Promise<Record<string, unknown> | null> {
  return null;
}
