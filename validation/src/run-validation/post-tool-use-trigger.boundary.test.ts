import "../__test-helpers__/mock-fs";
import "../__test-helpers__/mock-child-process";

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { Harness } from "@weaver/shared/types";
import { spawnResult } from "../__test-helpers__/spawn";
import type { ValidateArgs } from "./parse-args";
import { runPostToolUseTrigger } from "./post-tool-use-trigger";

const SESSION_LOG = "/logs/sess-1.jsonl";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch = vi.fn().mockResolvedValue(new Response());
  globalThis.fetch = mockFetch as typeof globalThis.fetch;
});

function setupFs(configs: Record<string, object> = {}) {
  vi.mocked(existsSync).mockImplementation((p) => {
    const path = String(p);
    if (path.endsWith(".weaver.json")) {
      return configs[path.replace("/.weaver.json", "")] !== undefined;
    }
    return false;
  });
  vi.mocked(readFileSync).mockImplementation((p) => {
    const path = String(p);
    if (path.endsWith(".weaver.json")) {
      const dir = path.replace("/.weaver.json", "");
      if (configs[dir]) {
        return JSON.stringify(configs[dir]);
      }
    }
    throw new Error(`ENOENT: ${path}`);
  });
}

describe("runPostToolUseTrigger (boundary)", () => {
  it("matches hooks by tool name and substitutes file", () => {
    setupFs({
      "/project": {
        validation: {
          postToolUse: [
            {
              matcher: "write",
              name: "format",
              command: "prettier --write {{file}}",
            },
          ],
        },
      },
    });
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    const args: ValidateArgs = {
      sessionId: "sess-1",
      cwd: "/project",
      trigger: "postToolUse",
      harness: Harness.KIRO_CLI,
      toolName: "write",
      toolPath: "/project/src/a.ts",
    };
    const result = runPostToolUseTrigger(args, SESSION_LOG);
    expect(result.exitCode).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
      "prettier --write /project/src/a.ts",
      expect.objectContaining({ shell: true, cwd: "/project" }),
    );
  });

  it("exits 0 when no config found", () => {
    setupFs({});
    const args: ValidateArgs = {
      sessionId: "sess-1",
      cwd: "/project",
      trigger: "postToolUse",
      harness: Harness.KIRO_CLI,
      toolName: "write",
      toolPath: "/project/a.ts",
    };
    const result = runPostToolUseTrigger(args, SESSION_LOG);
    expect(result.exitCode).toBe(0);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("exits 0 when no hooks match the tool name", () => {
    setupFs({
      "/project": {
        validation: {
          postToolUse: [
            { matcher: "bash", name: "fmt", command: "echo" },
          ],
        },
      },
    });
    const args: ValidateArgs = {
      sessionId: "sess-1",
      cwd: "/project",
      trigger: "postToolUse",
      harness: Harness.KIRO_CLI,
      toolName: "write",
      toolPath: "/project/a.ts",
    };
    const result = runPostToolUseTrigger(args, SESSION_LOG);
    expect(result.exitCode).toBe(0);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("falls back to args.cwd when toolPath is empty", () => {
    setupFs({
      "/project": {
        validation: {
          postToolUse: [
            { matcher: "write", name: "fmt", command: "echo hi" },
          ],
        },
      },
    });
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    const args: ValidateArgs = {
      sessionId: "sess-1",
      cwd: "/project",
      trigger: "postToolUse",
      harness: Harness.KIRO_CLI,
      toolName: "write",
      toolPath: "",
    };
    const result = runPostToolUseTrigger(args, SESSION_LOG);
    expect(result.exitCode).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
      "echo hi",
      expect.objectContaining({ cwd: "/project" }),
    );
  });

  it("returns failure when hook command fails", () => {
    setupFs({
      "/project": {
        validation: {
          postToolUse: [
            { matcher: "write", name: "lint", command: "eslint {{file}}" },
          ],
        },
      },
    });
    vi.mocked(spawnSync).mockReturnValue(
      spawnResult({ status: 1, stderr: "lint error" }),
    );

    const args: ValidateArgs = {
      sessionId: "sess-1",
      cwd: "/project",
      trigger: "postToolUse",
      harness: Harness.KIRO_CLI,
      toolName: "write",
      toolPath: "/project/a.ts",
    };
    const result = runPostToolUseTrigger(args, SESSION_LOG);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("lint");
  });
});
