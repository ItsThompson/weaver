vi.mock("node:fs", () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn<() => string[]>(),
  unlinkSync: vi.fn(),
}));

vi.mock("../paths/paths", () => ({
  appLogsDir: () => "/home/user/.weaver/app-logs",
}));

import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { createLogger, pruneAppLogs, _resetDirCreated } from "./logger";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  _resetDirCreated();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createLogger", () => {
  it("writes JSON line with source to file and console", () => {
    vi.setSystemTime(new Date("2026-04-06T12:00:00Z"));
    const log = createLogger("server");

    log({ timestamp: "2026-04-06T12:00:00Z", event: "test" });

    const expectedLine = JSON.stringify({
      timestamp: "2026-04-06T12:00:00Z",
      event: "test",
      source: "server",
    });
    expect(console.log).toHaveBeenCalledWith(expectedLine);
    expect(appendFileSync).toHaveBeenCalledWith(
      "/home/user/.weaver/app-logs/2026-04-06.log",
      expectedLine + "\n",
    );
  });

  it("creates the app-logs directory on first write", () => {
    vi.setSystemTime(new Date("2026-04-06T12:00:00Z"));
    const log = createLogger("server");

    log({ timestamp: "t", event: "e" });
    log({ timestamp: "t", event: "e" });

    expect(mkdirSync).toHaveBeenCalledTimes(1);
    expect(mkdirSync).toHaveBeenCalledWith("/home/user/.weaver/app-logs", {
      recursive: true,
    });
  });

  it("writes to stderr when stderr option is set", () => {
    vi.setSystemTime(new Date("2026-04-06T12:00:00Z"));
    const log = createLogger("hook-handler", { stderr: true });

    log({ timestamp: "t", event: "e" });

    expect(console.error).toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it("uses date-based filename from system clock", () => {
    vi.setSystemTime(new Date("2026-05-15T08:00:00Z"));
    const log = createLogger("desktop");

    log({ timestamp: "t", event: "e" });

    expect(appendFileSync).toHaveBeenCalledWith(
      "/home/user/.weaver/app-logs/2026-05-15.log",
      expect.any(String),
    );
  });

  it("logs error to stderr when file write fails", () => {
    vi.setSystemTime(new Date("2026-04-06T12:00:00Z"));
    vi.mocked(mkdirSync).mockImplementation(() => {
      throw new Error("EACCES");
    });
    const log = createLogger("server");

    log({ timestamp: "t", event: "e" });

    expect(console.log).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("EACCES"),
    );
  });
});

describe("pruneAppLogs", () => {
  it("deletes log files older than 30 days", () => {
    vi.setSystemTime(new Date("2026-04-06T12:00:00Z"));
    vi.mocked(readdirSync).mockReturnValue([
      "2026-03-01.log",
      "2026-03-06.log",
      "2026-04-06.log",
    ] as unknown as ReturnType<typeof readdirSync>);

    pruneAppLogs();

    expect(unlinkSync).toHaveBeenCalledWith(
      "/home/user/.weaver/app-logs/2026-03-01.log",
    );
    expect(unlinkSync).toHaveBeenCalledWith(
      "/home/user/.weaver/app-logs/2026-03-06.log",
    );
    expect(unlinkSync).toHaveBeenCalledTimes(2);
  });

  it("keeps files within the retention window", () => {
    vi.setSystemTime(new Date("2026-04-06T12:00:00Z"));
    vi.mocked(readdirSync).mockReturnValue([
      "2026-04-06.log",
      "2026-03-08.log",
    ] as unknown as ReturnType<typeof readdirSync>);

    pruneAppLogs();

    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("ignores non-date files", () => {
    vi.setSystemTime(new Date("2026-04-06T12:00:00Z"));
    vi.mocked(readdirSync).mockReturnValue([
      "notes.txt",
      "2026-03-01.log",
    ] as unknown as ReturnType<typeof readdirSync>);

    pruneAppLogs();

    expect(unlinkSync).toHaveBeenCalledTimes(1);
    expect(unlinkSync).toHaveBeenCalledWith(
      "/home/user/.weaver/app-logs/2026-03-01.log",
    );
  });

  it("handles missing directory gracefully", () => {
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(() => pruneAppLogs()).not.toThrow();
  });
});
