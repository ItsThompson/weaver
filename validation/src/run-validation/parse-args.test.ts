import { parseArgs } from "./parse-args";

describe("parseArgs", () => {
  it("parses all flags", () => {
    const result = parseArgs([
      "node",
      "validate.js",
      "--harness",
      "kiro-cli",
      "--session-id",
      "sess-1",
      "--cwd",
      "/project",
      "--trigger",
      "stop",
      "--tool-name",
      "fs_write",
      "--tool-path",
      "/project/a.ts",
    ]);
    expect(result).toEqual({
      sessionId: "sess-1",
      cwd: "/project",
      trigger: "stop",
      harness: "kiro-cli",
      toolName: "fs_write",
      toolPath: "/project/a.ts",
    });
  });

  it("leaves optional fields undefined when missing", () => {
    const result = parseArgs([
      "node",
      "validate.js",
      "--session-id",
      "sess-1",
      "--cwd",
      "/project",
      "--trigger",
      "postToolUse",
    ]);
    expect(result.toolName).toBeUndefined();
    expect(result.toolPath).toBeUndefined();
    expect(result.harness).toBe("kiro-cli");
  });

  it("returns all undefined for empty argv", () => {
    const result = parseArgs(["node", "validate.js"]);
    expect(result.sessionId).toBeUndefined();
    expect(result.cwd).toBeUndefined();
    expect(result.trigger).toBeUndefined();
  });
});
