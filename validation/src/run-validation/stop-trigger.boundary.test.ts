import "../__test-helpers__/mock-fs";
import "../__test-helpers__/mock-child-process";

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Harness } from "@weaver/shared/types";
import { spawnResult } from "../__test-helpers__/spawn";
import { makeEvent } from "../__test-helpers__/events";
import type { ValidateArgs } from "./parse-args";
import { runStopTrigger } from "./stop-trigger";

const SESSION_LOG = "/logs/sess-1.jsonl";
const args: ValidateArgs = {
  sessionId: "sess-1",
  cwd: "/project",
  trigger: "stop",
  harness: Harness.KIRO_CLI,
};

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch = vi.fn().mockResolvedValue(new Response());
  globalThis.fetch = mockFetch as typeof globalThis.fetch;
});

function setupFs(
  sessionEvents: string[],
  configs: Record<string, object> = {},
) {
  const sessionLog = sessionEvents.join("\n") + "\n";
  vi.mocked(existsSync).mockImplementation((p) => {
    const path = String(p);
    if (path === SESSION_LOG) {
      return true;
    }
    if (path.endsWith(".weaver.json")) {
      return configs[path.replace("/.weaver.json", "")] !== undefined;
    }
    return false;
  });
  vi.mocked(readFileSync).mockImplementation((p) => {
    const path = String(p);
    if (path === SESSION_LOG) {
      return sessionLog;
    }
    if (path.endsWith(".weaver.json")) {
      const dir = path.replace("/.weaver.json", "");
      if (configs[dir]) {
        return JSON.stringify(configs[dir]);
      }
    }
    throw new Error(`ENOENT: ${path}`);
  });
}

describe("runStopTrigger (boundary)", () => {
  it("executes hooks for changed files matching config", () => {
    setupFs(
      [
        makeEvent("userPromptSubmit", { prompt: "fix it" }),
        makeEvent("postToolUse", {
          toolName: "write",
          toolInput: { path: "/project/src/a.ts" },
        }),
      ],
      {
        "/project": {
          validation: {
            stop: [{ name: "lint", command: "eslint {{files}}" }],
          },
        },
      },
    );
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    const result = runStopTrigger(args, SESSION_LOG);
    expect(result.exitCode).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
      "eslint /project/src/a.ts",
      expect.objectContaining({ shell: true, cwd: "/project" }),
    );
  });

  it("skips hooks when no files match run_if_files_match", () => {
    setupFs(
      [
        makeEvent("userPromptSubmit", { prompt: "fix" }),
        makeEvent("postToolUse", {
          toolName: "write",
          toolInput: { path: "/project/src/a.py" },
        }),
      ],
      {
        "/project": {
          validation: {
            stop: [
              {
                name: "lint",
                command: "eslint {{files}}",
                run_if_files_match: "**/*.{ts,tsx}",
              },
            ],
          },
        },
      },
    );

    const result = runStopTrigger(args, SESSION_LOG);
    expect(result.exitCode).toBe(0);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("returns failure when a hook fails", () => {
    setupFs(
      [
        makeEvent("userPromptSubmit", { prompt: "fix" }),
        makeEvent("postToolUse", {
          toolName: "write",
          toolInput: { path: "/project/src/a.ts" },
        }),
      ],
      {
        "/project": {
          validation: {
            stop: [{ name: "tsc", command: "tsc --noEmit" }],
          },
        },
      },
    );
    vi.mocked(spawnSync).mockReturnValue(
      spawnResult({ status: 1, stderr: "type errors" }),
    );

    const result = runStopTrigger(args, SESSION_LOG);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("tsc");
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("sess-1.pending"),
      expect.any(String),
    );
  });

  it("runs each config group independently", () => {
    setupFs(
      [
        makeEvent("userPromptSubmit", { prompt: "fix" }),
        makeEvent("postToolUse", {
          toolName: "write",
          toolInput: { path: "/mono/pkg-a/x.ts" },
        }),
        makeEvent("postToolUse", {
          toolName: "write",
          toolInput: { path: "/mono/pkg-b/y.ts" },
        }),
      ],
      {
        "/mono/pkg-a": {
          validation: {
            stop: [{ name: "lint-a", command: "eslint ." }],
          },
        },
        "/mono/pkg-b": {
          validation: {
            stop: [{ name: "lint-b", command: "eslint ." }],
          },
        },
      },
    );
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    runStopTrigger({ ...args, cwd: "/mono" }, SESSION_LOG);
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it("skips config groups with no stop hooks", () => {
    setupFs(
      [
        makeEvent("userPromptSubmit", { prompt: "fix" }),
        makeEvent("postToolUse", {
          toolName: "write",
          toolInput: { path: "/project/a.ts" },
        }),
      ],
      {
        "/project": { validation: {} },
      },
    );

    const result = runStopTrigger(args, SESSION_LOG);
    expect(result.exitCode).toBe(0);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("exits 0 when session log has no changed files", () => {
    setupFs([
      makeEvent("userPromptSubmit", { prompt: "explain" }),
      makeEvent("stop"),
    ]);

    const result = runStopTrigger(args, SESSION_LOG);
    expect(result.exitCode).toBe(0);
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
