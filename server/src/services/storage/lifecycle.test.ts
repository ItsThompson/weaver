import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/child-process";
import "../../__tests__/mocks/logger";

import { readdir, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { cleanStaleSessions, isProcessRunning } from "./lifecycle";

beforeEach(() => {
  vi.clearAllMocks();
});

/** Helper: make the mocked execFile invoke its callback with the given stdout */
function mockExecFileOutput(stdout: string) {
  vi.mocked(execFile).mockImplementation(((
    _cmd: unknown,
    _args: unknown,
    cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    cb(null, { stdout, stderr: "" });
  }) as any);
}

describe("cleanStaleSessions", () => {
  it("deletes marker files for dead PIDs", async () => {
    const deadPid = 999999;
    vi.mocked(readdir).mockResolvedValue([
      `.current-session-${deadPid}`,
    ] as any);

    await cleanStaleSessions();
    expect(vi.mocked(unlink)).toHaveBeenCalledWith(
      expect.stringContaining(`.current-session-${deadPid}`),
    );
  });

  it("leaves marker files for live PIDs", async () => {
    const livePid = process.pid;
    vi.mocked(readdir).mockResolvedValue([
      `.current-session-${livePid}`,
    ] as any);
    mockExecFileOutput(`/path/to/kiro-cli chat\n`);

    await cleanStaleSessions();
    expect(vi.mocked(unlink)).not.toHaveBeenCalled();
  });

  it("skips files with non-numeric PID suffixes", async () => {
    vi.mocked(readdir).mockResolvedValue([".current-session-abc"] as any);

    await cleanStaleSessions();
    expect(vi.mocked(unlink)).not.toHaveBeenCalled();
  });

  it("handles readdir failure gracefully", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("no such directory"));

    await expect(cleanStaleSessions()).resolves.toBeUndefined();
  });
});

describe("isProcessRunning", () => {
  it("returns true for a running kiro-cli process", async () => {
    mockExecFileOutput(`/path/to/kiro-cli chat --agent dev\n`);
    await expect(isProcessRunning(process.pid)).resolves.toBe(true);
  });

  it("returns false for a non-existent process", async () => {
    await expect(isProcessRunning(999999)).resolves.toBe(false);
  });

  it("returns false when PID is alive but not kiro-cli (PID reuse)", async () => {
    mockExecFileOutput(`/usr/bin/some-other-process\n`);
    await expect(isProcessRunning(process.pid)).resolves.toBe(false);
  });
});
