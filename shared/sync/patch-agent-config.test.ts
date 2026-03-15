import "./__test-helpers__/mock-fs";

import { readFileSync, writeFileSync } from "node:fs";
import { patchAgentConfig } from "./patch-agent-config";
import type { SyncResult } from "./sync";

function makeResult(): SyncResult {
  return { patched: [], skipped: [], errors: [] };
}

function makeAgentJson(overrides?: {
  stopTimeout?: number;
  postToolUseTimeout?: number;
  stopCommand?: string;
  postToolUseCommand?: string;
}): string {
  const command =
    overrides?.stopCommand ?? "~/.config/amazonq/global/hooks/weaver-log.sh";
  const ptuCommand =
    overrides?.postToolUseCommand ??
    "~/.config/amazonq/global/hooks/weaver-log.sh";
  return JSON.stringify({
    name: "agent",
    hooks: {
      stop: [
        {
          command,
          ...(overrides?.stopTimeout !== undefined && {
            timeout_ms: overrides.stopTimeout,
          }),
        },
      ],
      postToolUse: [
        {
          matcher: "*",
          command: ptuCommand,
          ...(overrides?.postToolUseTimeout !== undefined && {
            timeout_ms: overrides.postToolUseTimeout,
          }),
        },
      ],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("patchAgentConfig", () => {
  it("patches both stop and postToolUse timeouts", () => {
    vi.mocked(readFileSync).mockReturnValue(makeAgentJson());
    const result = makeResult();

    patchAgentConfig("/agents/a.json", 105_000, 35_000, result, false);

    expect(result.patched).toEqual(["/agents/a.json"]);
    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.hooks.stop[0].timeout_ms).toBe(105_000);
    expect(written.hooks.postToolUse[0].timeout_ms).toBe(35_000);
  });

  it("patches only stop when postToolUseTimeout is null", () => {
    vi.mocked(readFileSync).mockReturnValue(makeAgentJson());
    const result = makeResult();

    patchAgentConfig("/agents/a.json", 105_000, null, result, false);

    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.hooks.stop[0].timeout_ms).toBe(105_000);
    expect(written.hooks.postToolUse[0].timeout_ms).toBeUndefined();
  });

  it("patches only postToolUse when stopTimeout is null", () => {
    vi.mocked(readFileSync).mockReturnValue(makeAgentJson());
    const result = makeResult();

    patchAgentConfig("/agents/a.json", null, 35_000, result, false);

    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.hooks.stop[0].timeout_ms).toBeUndefined();
    expect(written.hooks.postToolUse[0].timeout_ms).toBe(35_000);
  });

  it("skips when values already match", () => {
    vi.mocked(readFileSync).mockReturnValue(
      makeAgentJson({ stopTimeout: 105_000, postToolUseTimeout: 35_000 }),
    );
    const result = makeResult();

    patchAgentConfig("/agents/a.json", 105_000, 35_000, result, false);

    expect(result.skipped).toEqual(["/agents/a.json"]);
    expect(result.patched).toHaveLength(0);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it("skips non-weaver hooks", () => {
    vi.mocked(readFileSync).mockReturnValue(
      makeAgentJson({
        stopCommand: "other-hook.sh",
        postToolUseCommand: "other.sh",
      }),
    );
    const result = makeResult();

    patchAgentConfig("/agents/a.json", 105_000, 35_000, result, false);

    expect(result.skipped).toEqual(["/agents/a.json"]);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it("does not write in dry run mode", () => {
    vi.mocked(readFileSync).mockReturnValue(makeAgentJson());
    const result = makeResult();

    patchAgentConfig("/agents/a.json", 105_000, 35_000, result, true);

    expect(result.patched).toEqual(["/agents/a.json"]);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it("records error for unreadable file", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("EACCES");
    });
    const result = makeResult();

    patchAgentConfig("/agents/a.json", 105_000, 35_000, result, false);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("EACCES");
  });

  it("records error for invalid JSON", () => {
    vi.mocked(readFileSync).mockReturnValue("not json{");
    const result = makeResult();

    patchAgentConfig("/agents/a.json", 105_000, 35_000, result, false);

    expect(result.errors).toEqual(["/agents/a.json: invalid JSON"]);
  });

  it("silently skips file without hooks object", () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: "agent" }));
    const result = makeResult();

    patchAgentConfig("/agents/a.json", 105_000, 35_000, result, false);

    expect(result.patched).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("records error when write fails", () => {
    vi.mocked(readFileSync).mockReturnValue(makeAgentJson());
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw new Error("ENOSPC");
    });
    const result = makeResult();

    patchAgentConfig("/agents/a.json", 105_000, 35_000, result, false);

    expect(result.patched).toEqual(["/agents/a.json"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("write failed");
  });
});
