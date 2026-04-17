import { describe, it, expect } from "vitest";
import { loadAgentConfig } from "./agent-config";

describe("loadAgentConfig", () => {
  it("returns null for any agent name and cwd", async () => {
    expect(await loadAgentConfig("default", "/project")).toBeNull();
  });

  it("returns null for empty inputs", async () => {
    expect(await loadAgentConfig("", "")).toBeNull();
  });
});
