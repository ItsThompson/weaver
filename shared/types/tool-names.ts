/** Canonical tool names used across all harnesses. */
export enum CanonicalToolName {
  WRITE = "write",
  EDIT = "edit",
  READ = "read",
  BASH = "bash",
}

/**
 * Per-harness mapping of native tool names to canonical names.
 * Only tools relevant to weaver features (validation, session analysis) need mapping.
 */
const TOOL_NAME_MAP: Record<string, CanonicalToolName> = {
  // kiro-cli
  fs_write: CanonicalToolName.WRITE,
  fs_read: CanonicalToolName.READ,
  execute_bash: CanonicalToolName.BASH,
  // Claude Code
  Write: CanonicalToolName.WRITE,
  Edit: CanonicalToolName.EDIT,
  Read: CanonicalToolName.READ,
  Bash: CanonicalToolName.BASH,
  // pi (already canonical)
  write: CanonicalToolName.WRITE,
  edit: CanonicalToolName.EDIT,
  read: CanonicalToolName.READ,
  bash: CanonicalToolName.BASH,
};

/**
 * Resolve a native harness tool name to its canonical form.
 * Returns the canonical name if a mapping exists, otherwise returns
 * the native name unchanged (for extension/custom tools).
 */
export function resolveToolName(nativeToolName: string): string {
  return TOOL_NAME_MAP[nativeToolName] ?? nativeToolName;
}
