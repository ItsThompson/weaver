vi.mock("node:fs", () => ({
  readFileSync: vi.fn<() => string>(),
  writeFileSync: vi.fn<() => void>(),
  mkdirSync: vi.fn<() => void>(),
  existsSync: vi.fn<() => boolean>(),
}));

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { syncClaudeCodeHooks } from "./sync";

const HOOK_CMD = "/usr/local/lib/weaver/bindings/claude-code/weaver-log.sh";

const weaverConfig = JSON.stringify({
  validation: {
    stop: [
      { name: "build", command: "npm run build", timeout_ms: 60_000 },
      { name: "lint", command: "eslint .", timeout_ms: 30_000 },
    ],
    postToolUse: [
      { matcher: "Write", name: "fmt", command: "prettier --write", timeout_ms: 10_000 },
    ],
  },
});

function setupFs(existingSettings?: string): void {
  vi.mocked(existsSync).mockImplementation((path) => {
    const pathStr = String(path);
    if (pathStr.endsWith(".weaver.json")) {
      return true;
    }
    return false;
  });
  vi.mocked(readFileSync).mockImplementation((path) => {
    const pathStr = String(path);
    if (pathStr.endsWith(".weaver.json")) {
      return weaverConfig;
    }
    if (pathStr.endsWith("settings.json") && existingSettings !== undefined) {
      return existingSettings;
    }
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncClaudeCodeHooks", () => {
  it("patches both project and global settings files", () => {
    setupFs();

    const result = syncClaudeCodeHooks("/project", HOOK_CMD);

    expect(result.patched).toHaveLength(2);
    expect(result.patched[0]).toContain("/project/.claude/settings.json");
    expect(result.patched[1]).toContain(`${homedir()}/.claude/settings.json`);
  });

  it("calculates correct timeouts from .weaver.json", () => {
    setupFs();

    syncClaudeCodeHooks("/project", HOOK_CMD);

    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    // Stop: sum(60000 + 30000) + 15000 buffer = 105000ms -> 105s
    expect(written.hooks.Stop[0].hooks[0].timeout).toBe(105);
    // PostToolUse: max(10000) + 15000 buffer = 25000ms -> 25s
    expect(written.hooks.PostToolUse[0].hooks[0].timeout).toBe(25);
  });

  it("uses default timeouts when no .weaver.json exists", () => {
    const notFoundError = new Error("ENOENT") as NodeJS.ErrnoException;
    notFoundError.code = "ENOENT";
    vi.mocked(readFileSync).mockImplementation(() => {
      throw notFoundError;
    });

    const result = syncClaudeCodeHooks("/project", HOOK_CMD);

    // Still patches both files (with default 10s timeouts)
    expect(result.patched).toHaveLength(2);
    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.hooks.Stop[0].hooks[0].timeout).toBe(10);
    expect(written.hooks.PostToolUse[0].hooks[0].timeout).toBe(10);
  });

  it("does not write files in dry run mode", () => {
    setupFs();

    const result = syncClaudeCodeHooks("/project", HOOK_CMD, { dryRun: true });

    expect(result.patched).toHaveLength(2);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });
});
