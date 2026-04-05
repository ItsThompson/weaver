import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import type { Snippet } from "@weaver/shared/types";
import { snippetsPath } from "@weaver/shared/paths";
import { atomicWriteFile } from "../../utils/atomic-write";
import { parseJsonlFile } from "../file-cache/index";
import { log } from "../../utils/logger";

export async function readSnippets(): Promise<Snippet[]> {
  return parseJsonlFile<Snippet>(snippetsPath(), (line) =>
    log({
      timestamp: new Date().toISOString(),
      event: "malformed_snippet_line",
      line,
    }),
  );
}

export async function writeSnippet(
  snippet: Omit<Snippet, "id">,
): Promise<Snippet> {
  const full: Snippet = { id: randomUUID(), ...snippet };
  await appendFile(snippetsPath(), JSON.stringify(full) + "\n", "utf-8");
  return full;
}

export async function updateSnippet(
  id: string,
  updates: Partial<Omit<Snippet, "id">>,
): Promise<Snippet | null> {
  const snippets = await readSnippets();
  const idx = snippets.findIndex((s) => s.id === id);
  if (idx === -1) {
    return null;
  }
  snippets[idx] = { ...snippets[idx], ...updates };
  const content = snippets.map((s) => JSON.stringify(s)).join("\n") + "\n";
  await atomicWriteFile(snippetsPath(), content);
  return snippets[idx];
}

export async function deleteSnippet(id: string): Promise<boolean> {
  const snippets = await readSnippets();
  const filtered = snippets.filter((s) => s.id !== id);
  if (filtered.length === snippets.length) {
    return false;
  }
  const content =
    filtered.length > 0
      ? filtered.map((s) => JSON.stringify(s)).join("\n") + "\n"
      : "";
  await atomicWriteFile(snippetsPath(), content);
  return true;
}
