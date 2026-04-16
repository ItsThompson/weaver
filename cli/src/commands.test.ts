vi.mock("./utils", () => ({
  post: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("@weaver/binding-kiro/sync", () => ({
  syncAgentTimeouts: vi.fn(),
}));

import { post, get, patch } from "./utils";
import { syncAgentTimeouts } from "@weaver/binding-kiro/sync";
import { view } from "./commands/view";
import { session } from "./commands/session";
import { rename } from "./commands/rename";
import { toggle } from "./commands/toggle";
import { config } from "./commands/config";
import { sync } from "./commands/sync";

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => logSpy.mockRestore());

describe("view", () => {
  it.each([
    [200, true, "Opening session in Weaver dashboard"],
    [404, false, "No Weaver session found for PID 12345"],
    [0, false, "Weaver server not running"],
    [500, false, "Weaver server error (500)"],
  ])('status %i → "%s"', (status, ok, expected) => {
    vi.mocked(post).mockReturnValue({ ok, status, data: null });
    view(12345, []);
    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/view", { pid: 12345 });
    expect(logSpy).toHaveBeenCalledWith(expected);
  });
});

describe("session", () => {
  describe("list (default)", () => {
    it.each([
      [[], "Opening sessions list in Weaver dashboard"],
      [["list"], "Opening sessions list in Weaver dashboard"],
    ])("navigates to sessions list with args %j", (args, expected) => {
      vi.mocked(post).mockReturnValue({ ok: true, status: 200, data: null });
      session(12345, args);
      expect(vi.mocked(post)).toHaveBeenCalledWith("/api/navigate", {
        page: "sessions",
      });
      expect(logSpy).toHaveBeenCalledWith(expected);
    });

    it("prints server not running when status is 0", () => {
      vi.mocked(post).mockReturnValue({ ok: false, status: 0, data: null });
      session(12345, []);
      expect(logSpy).toHaveBeenCalledWith("Weaver server not running");
    });
  });

  describe("<PID>", () => {
    it.each([
      [200, true, "Opening session for PID 67890 in Weaver dashboard"],
      [404, false, "No session found for PID 67890"],
      [0, false, "Weaver server not running"],
    ])('status %i → "%s"', (status, ok, expected) => {
      vi.mocked(post).mockReturnValue({ ok, status, data: null });
      session(12345, ["67890"]);
      if (status === 200) {
        expect(vi.mocked(post)).toHaveBeenCalledWith("/api/view", {
          pid: 67890,
        });
      }
      expect(logSpy).toHaveBeenCalledWith(expected);
    });
  });
});

describe("rename", () => {
  it.each([
    [200, true, 'Session renamed to "my feature"'],
    [404, false, "No Weaver session found for PID 12345"],
    [0, false, "Weaver server not running"],
    [500, false, "Weaver server error (500)"],
  ])('status %i → "%s"', (status, ok, expected) => {
    vi.mocked(post).mockReturnValue({ ok, status, data: null });
    rename(12345, ["my", "feature"]);
    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/rename", {
      pid: 12345,
      customName: "my feature",
    });
    expect(logSpy).toHaveBeenCalledWith(expected);
  });

  it("exits with error when no name provided", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    rename(12345, []);
    expect(errorSpy).toHaveBeenCalledWith("Usage: weaver rename <name>");
    expect(exitSpy).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe("toggle", () => {
  it.each([
    [200, true, "Toggled Weaver mode"],
    [0, false, "Weaver server not running"],
    [500, false, "Weaver server error (500)"],
  ])('status %i → "%s"', (status, ok, expected) => {
    vi.mocked(post).mockReturnValue({ ok, status, data: null });
    toggle(12345, []);
    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/navigate", {
      page: "toggle",
      pid: 12345,
    });
    expect(logSpy).toHaveBeenCalledWith(expected);
  });
});

describe("config", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("toggles ghost_mode via GET then PATCH", () => {
    vi.mocked(get).mockReturnValue({
      ok: true,
      status: 200,
      data: { config: { ghost_mode: false } },
    });
    vi.mocked(patch).mockReturnValue({
      ok: true,
      status: 200,
      data: { config: { ghost_mode: true } },
    });

    config(123, ["ghost"]);

    expect(vi.mocked(get)).toHaveBeenCalledWith("/api/config");
    expect(vi.mocked(patch)).toHaveBeenCalledWith("/api/config", {
      ghost_mode: true,
    });
    expect(logSpy).toHaveBeenCalledWith("ghost: on");
  });

  it("sets ghost_mode on without GET", () => {
    vi.mocked(patch).mockReturnValue({
      ok: true,
      status: 200,
      data: { config: { ghost_mode: true } },
    });

    config(123, ["ghost", "on"]);

    expect(vi.mocked(get)).not.toHaveBeenCalled();
    expect(vi.mocked(patch)).toHaveBeenCalledWith("/api/config", {
      ghost_mode: true,
    });
    expect(logSpy).toHaveBeenCalledWith("ghost: on");
  });

  it("sets ghost_mode off without GET", () => {
    vi.mocked(patch).mockReturnValue({
      ok: true,
      status: 200,
      data: { config: { ghost_mode: false } },
    });

    config(123, ["ghost", "off"]);

    expect(vi.mocked(get)).not.toHaveBeenCalled();
    expect(vi.mocked(patch)).toHaveBeenCalledWith("/api/config", {
      ghost_mode: false,
    });
    expect(logSpy).toHaveBeenCalledWith("ghost: off");
  });

  it("sets ghost opacity", () => {
    vi.mocked(patch).mockReturnValue({ ok: true, status: 200, data: null });

    config(123, ["ghost", "opacity", "0.7"]);

    expect(vi.mocked(patch)).toHaveBeenCalledWith("/api/config", {
      ghost_opacity: 0.7,
    });
    expect(logSpy).toHaveBeenCalledWith("ghost opacity: 0.7");
  });

  it("exits with error when ghost opacity value missing", () => {
    config(123, ["ghost", "opacity"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "Usage: weaver config ghost opacity <0-1>",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with error when ghost opacity out of range", () => {
    config(123, ["ghost", "opacity", "1.5"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "ghost_opacity must be a number between 0 and 1",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("toggles dark_mode", () => {
    vi.mocked(get).mockReturnValue({
      ok: true,
      status: 200,
      data: { config: { dark_mode: true } },
    });
    vi.mocked(patch).mockReturnValue({
      ok: true,
      status: 200,
      data: { config: { dark_mode: false } },
    });

    config(123, ["dark"]);

    expect(vi.mocked(patch)).toHaveBeenCalledWith("/api/config", {
      dark_mode: false,
    });
    expect(logSpy).toHaveBeenCalledWith("dark: off");
  });

  it("sets sounds on explicitly", () => {
    vi.mocked(patch).mockReturnValue({
      ok: true,
      status: 200,
      data: { config: { enable_notification_sounds: true } },
    });

    config(123, ["sounds", "on"]);

    expect(vi.mocked(patch)).toHaveBeenCalledWith("/api/config", {
      enable_notification_sounds: true,
    });
    expect(logSpy).toHaveBeenCalledWith("enable notification sounds: on");
  });

  it("prints server not running when GET returns status 0", () => {
    vi.mocked(get).mockReturnValue({ ok: false, status: 0, data: null });

    config(123, ["ghost"]);

    expect(logSpy).toHaveBeenCalledWith("Weaver server not running");
  });

  it("prints server not running when PATCH returns status 0", () => {
    vi.mocked(patch).mockReturnValue({ ok: false, status: 0, data: null });

    config(123, ["ghost", "on"]);

    expect(logSpy).toHaveBeenCalledWith("Weaver server not running");
  });

  it("prints validation error on 422", () => {
    vi.mocked(patch).mockReturnValue({
      ok: false,
      status: 422,
      data: { error: "ghost_mode must be a boolean" },
    });

    config(123, ["ghost", "on"]);

    expect(logSpy).toHaveBeenCalledWith(
      "Invalid value: ghost_mode must be a boolean",
    );
  });

  it("exits with usage error when no subcommand given", () => {
    config(123, []);

    expect(errorSpy).toHaveBeenCalledWith(
      "Usage: weaver config <ghost|dark|sounds> [on|off]",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with error for unknown subcommand", () => {
    config(123, ["foo"]);

    expect(errorSpy).toHaveBeenCalledWith(
      "Unknown config: foo\nUsage: weaver config <ghost|dark|sounds> [on|off]",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with error for unknown modifier", () => {
    config(123, ["ghost", "maybe"]);

    expect(errorSpy).toHaveBeenCalledWith(
      'Unknown modifier: maybe. Use "on" or "off".',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("sync", () => {
  it("logs patched files", () => {
    vi.mocked(syncAgentTimeouts).mockReturnValue({
      patched: ["/project/.kiro/agents/agent.json"],
      skipped: [],
      errors: [],
    });

    sync(123, []);

    expect(syncAgentTimeouts).toHaveBeenCalledWith(process.cwd(), {
      dryRun: false,
    });
    expect(logSpy).toHaveBeenCalledWith(
      "patched: /project/.kiro/agents/agent.json",
    );
  });

  it("logs 'already in sync' when no changes", () => {
    vi.mocked(syncAgentTimeouts).mockReturnValue({
      patched: [],
      skipped: ["/project/.kiro/agents/agent.json"],
      errors: [],
    });

    sync(123, []);

    expect(logSpy).toHaveBeenCalledWith("All agent configs already in sync");
  });

  it("logs errors", () => {
    vi.mocked(syncAgentTimeouts).mockReturnValue({
      patched: [],
      skipped: [],
      errors: ["bad.json: invalid JSON"],
    });

    sync(123, []);

    expect(logSpy).toHaveBeenCalledWith("error: bad.json: invalid JSON");
  });

  it("passes dryRun when --dry-run flag is present", () => {
    vi.mocked(syncAgentTimeouts).mockReturnValue({
      patched: ["/project/.kiro/agents/agent.json"],
      skipped: [],
      errors: [],
    });

    sync(123, ["--dry-run"]);

    expect(syncAgentTimeouts).toHaveBeenCalledWith(process.cwd(), {
      dryRun: true,
    });
    expect(logSpy).toHaveBeenCalledWith(
      "would patch: /project/.kiro/agents/agent.json",
    );
  });
});
