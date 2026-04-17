vi.mock("node:fs", () => ({
  readFileSync: vi.fn<() => string>(),
  writeFileSync: vi.fn<() => void>(),
  mkdirSync: vi.fn<() => void>(),
  existsSync: vi.fn<() => boolean>(),
}));

import { readFileSync, writeFileSync } from "node:fs";
import { patchSettings, msToSeconds } from "./patch-settings";
import type { SyncResult } from "@weaver/shared/sync";

function makeResult(): SyncResult {
  return { patched: [], skipped: [], errors: [] };
}

const HOOK_CMD = "/usr/local/lib/weaver/bindings/claude-code/weaver-log.sh";

function makeSettingsJson(overrides?: {
  stopTimeout?: number;
  postToolUseTimeout?: number;
}): string {
  const settings: Record<string, unknown> = {
    hooks: {
      SessionStart: [
        {
          hooks: [{ type: "command", command: HOOK_CMD, timeout: 10 }],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [{ type: "command", command: HOOK_CMD, timeout: 10 }],
        },
      ],
      PreToolUse: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: HOOK_CMD, timeout: 10 }],
        },
      ],
      PostToolUse: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: HOOK_CMD,
              timeout: overrides?.postToolUseTimeout ?? 10,
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: HOOK_CMD,
              timeout: overrides?.stopTimeout ?? 10,
            },
          ],
        },
      ],
      SessionEnd: [
        {
          hooks: [{ type: "command", command: HOOK_CMD, timeout: 10 }],
        },
      ],
    },
  };
  return JSON.stringify(settings);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("msToSeconds", () => {
  it("converts milliseconds to seconds, rounding up", () => {
    expect(msToSeconds(105_000)).toBe(105);
    expect(msToSeconds(35_500)).toBe(36);
    expect(msToSeconds(3000)).toBe(10); // 3s < min floor of 10s
  });

  it("enforces minimum of 10 seconds", () => {
    expect(msToSeconds(0)).toBe(10);
    expect(msToSeconds(5000)).toBe(10);
    expect(msToSeconds(9999)).toBe(10);
  });
});

describe("patchSettings", () => {
  it("patches stop and postToolUse timeouts", () => {
    vi.mocked(readFileSync).mockReturnValue(makeSettingsJson());
    const result = makeResult();

    patchSettings(
      "/project/.claude/settings.json",
      HOOK_CMD,
      105_000,
      35_000,
      result,
      false,
    );

    expect(result.patched).toEqual(["/project/.claude/settings.json"]);
    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.hooks.Stop[0].hooks[0].timeout).toBe(105);
    expect(written.hooks.PostToolUse[0].hooks[0].timeout).toBe(35);
  });

  it("creates settings file when it does not exist", () => {
    const notFoundError = new Error("ENOENT") as NodeJS.ErrnoException;
    notFoundError.code = "ENOENT";
    vi.mocked(readFileSync).mockImplementation(() => {
      throw notFoundError;
    });
    const result = makeResult();

    patchSettings(
      "/project/.claude/settings.json",
      HOOK_CMD,
      null,
      null,
      result,
      false,
    );

    expect(result.patched).toEqual(["/project/.claude/settings.json"]);
    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.hooks.SessionStart).toHaveLength(1);
    expect(written.hooks.Stop).toHaveLength(1);
    expect(written.hooks.PostToolUse).toHaveLength(1);
    expect(written.hooks.SessionEnd).toHaveLength(1);
  });

  it("preserves non-Weaver hook entries", () => {
    const settings = {
      hooks: {
        Stop: [
          {
            hooks: [
              { type: "command", command: "custom-hook.sh", timeout: 30 },
            ],
          },
        ],
      },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(settings));
    const result = makeResult();

    patchSettings(
      "/settings.json",
      HOOK_CMD,
      null,
      null,
      result,
      false,
    );

    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    // Custom hook preserved, Weaver hook added
    expect(written.hooks.Stop).toHaveLength(2);
    expect(written.hooks.Stop[0].hooks[0].command).toBe("custom-hook.sh");
    expect(written.hooks.Stop[1].hooks[0].command).toBe(HOOK_CMD);
  });

  it("skips when all values already match", () => {
    vi.mocked(readFileSync).mockReturnValue(
      makeSettingsJson({ stopTimeout: 10, postToolUseTimeout: 10 }),
    );
    const result = makeResult();

    patchSettings("/settings.json", HOOK_CMD, null, null, result, false);

    expect(result.skipped).toEqual(["/settings.json"]);
    expect(result.patched).toHaveLength(0);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it("does not write in dry run mode", () => {
    vi.mocked(readFileSync).mockReturnValue("{}");
    const result = makeResult();

    patchSettings("/settings.json", HOOK_CMD, null, null, result, true);

    expect(result.patched).toEqual(["/settings.json"]);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it("records error for invalid JSON", () => {
    vi.mocked(readFileSync).mockReturnValue("not json{");
    const result = makeResult();

    patchSettings("/settings.json", HOOK_CMD, null, null, result, false);

    expect(result.errors).toEqual(["/settings.json: invalid JSON"]);
  });

  it("records error for non-object JSON", () => {
    vi.mocked(readFileSync).mockReturnValue('"just a string"');
    const result = makeResult();

    patchSettings("/settings.json", HOOK_CMD, null, null, result, false);

    expect(result.errors).toEqual(["/settings.json: not a JSON object"]);
  });

  it("updates timeout on existing Weaver entry when value differs", () => {
    vi.mocked(readFileSync).mockReturnValue(
      makeSettingsJson({ stopTimeout: 50 }),
    );
    const result = makeResult();

    patchSettings("/settings.json", HOOK_CMD, 105_000, null, result, false);

    expect(result.patched).toEqual(["/settings.json"]);
    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.hooks.Stop[0].hooks[0].timeout).toBe(105);
  });

  it("adds hooks key when settings file has none", () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ permissions: {} }),
    );
    const result = makeResult();

    patchSettings("/settings.json", HOOK_CMD, null, null, result, false);

    expect(result.patched).toEqual(["/settings.json"]);
    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.permissions).toEqual({});
    expect(written.hooks.SessionStart).toHaveLength(1);
  });
});
