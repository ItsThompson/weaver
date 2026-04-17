vi.mock("node:fs", () => ({
  existsSync: vi.fn<() => boolean>(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn<() => Promise<string>>(),
}));

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { loadAgentConfig } from "./agent-config";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadAgentConfig", () => {
  it("loads workspace agent config from YAML frontmatter", async () => {
    vi.mocked(existsSync).mockImplementation(
      (p) => String(p) === "/project/.claude/agents/dev.md",
    );
    vi.mocked(readFile).mockResolvedValue(
      [
        "---",
        "name: dev",
        "skills:",
        "  - coding-practices",
        "  - testing-practices",
        "---",
        "",
        "# Dev Agent",
        "",
        "You are a development agent.",
      ].join("\n"),
    );

    const config = await loadAgentConfig("dev", "/project");
    expect(config).toEqual({
      name: "dev",
      skills: ["coding-practices", "testing-practices"],
    });
  });

  it("falls back to global agent config", async () => {
    vi.mocked(existsSync).mockImplementation(
      (p) => String(p) === `${homedir()}/.claude/agents/dev.md`,
    );
    vi.mocked(readFile).mockResolvedValue(
      ["---", "name: dev", "---", "", "Global dev agent."].join("\n"),
    );

    const config = await loadAgentConfig("dev", "/project");
    expect(config).toEqual({ name: "dev" });
  });

  it("returns null when no agent file found", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(await loadAgentConfig("missing", "/project")).toBeNull();
  });

  it("returns null when file content is malformed", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockRejectedValue(new Error("EACCES"));

    expect(await loadAgentConfig("broken", "/project")).toBeNull();
  });

  it("returns empty object when file has no frontmatter", async () => {
    vi.mocked(existsSync).mockImplementation(
      (p) => String(p) === "/project/.claude/agents/plain.md",
    );
    vi.mocked(readFile).mockResolvedValue("# Just a markdown file\n\nNo frontmatter here.");

    const config = await loadAgentConfig("plain", "/project");
    expect(config).toEqual({});
  });

  it("prefers workspace over global when both exist", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      ["---", "name: workspace-dev", "---", ""].join("\n"),
    );

    const config = await loadAgentConfig("dev", "/project");
    expect(config).toEqual({ name: "workspace-dev" });
    // readFile should be called with the workspace path (first match)
    expect(vi.mocked(readFile)).toHaveBeenCalledWith(
      "/project/.claude/agents/dev.md",
      "utf-8",
    );
  });
});
