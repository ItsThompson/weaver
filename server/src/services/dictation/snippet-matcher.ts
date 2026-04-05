import type { Snippet } from "@weaver/shared/types";

const normalize = (s: string): string =>
  s.replace(/[^a-zA-Z]/g, "").toLowerCase();

export const matchSnippet = (
  transcript: string,
  snippets: Snippet[],
): Snippet | null => {
  const normalized = normalize(transcript);
  if (!normalized) {
    return null;
  }

  const matches = snippets.filter((s) => normalize(s.trigger) === normalized);
  return matches.length === 1 ? matches[0] : null;
};
