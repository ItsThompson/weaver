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
  it("loads workspace agent config", async () => {
    vi.mocked(existsSync).mockImplementation(
      (p) => String(p) === "/project/.kiro/agents/dev.json",
    );
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ name: "dev", resources: [] }),
    );

    const config = await loadAgentConfig("dev", "/project");
    expect(config).toEqual({ name: "dev", resources: [] });
  });

  it("falls back to global agent config", async () => {
    vi.mocked(existsSync).mockImplementation(
      (p) => String(p) === `${homedir()}/.kiro/agents/dev.json`,
    );
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ name: "dev", resources: [] }),
    );

    const config = await loadAgentConfig("dev", "/project");
    expect(config).toEqual({ name: "dev", resources: [] });
  });

  it("returns null when no config found", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(await loadAgentConfig("missing", "/project")).toBeNull();
  });

  it("returns null when config is malformed JSON", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue("not json");

    expect(await loadAgentConfig("bad", "/project")).toBeNull();
  });
});
