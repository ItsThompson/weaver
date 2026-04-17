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

  it("defaults trigger to 'stop' when missing", () => {
    const result = parseArgs(["node", "validate.js"]);
    expect(result.sessionId).toBeUndefined();
    expect(result.cwd).toBeUndefined();
    expect(result.trigger).toBe("stop");
  });

  it("normalizes PascalCase trigger 'Stop' to 'stop'", () => {
    const result = parseArgs([
      "node",
      "validate.js",
      "--session-id",
      "sess-1",
      "--cwd",
      "/project",
      "--trigger",
      "Stop",
    ]);
    expect(result.trigger).toBe("stop");
  });

  it("normalizes PascalCase trigger 'PostToolUse' to 'postToolUse'", () => {
    const result = parseArgs([
      "node",
      "validate.js",
      "--session-id",
      "sess-1",
      "--cwd",
      "/project",
      "--trigger",
      "PostToolUse",
    ]);
    expect(result.trigger).toBe("postToolUse");
  });

  it("passes through already-camelCase triggers unchanged", () => {
    const result = parseArgs([
      "node",
      "validate.js",
      "--trigger",
      "stop",
      "--cwd",
      "/project",
      "--session-id",
      "s1",
    ]);
    expect(result.trigger).toBe("stop");
  });

  it("accepts claude-code harness", () => {
    const result = parseArgs([
      "node",
      "validate.js",
      "--harness",
      "claude-code",
      "--session-id",
      "s1",
      "--cwd",
      "/project",
      "--trigger",
      "Stop",
    ]);
    expect(result.harness).toBe("claude-code");
    expect(result.trigger).toBe("stop");
  });
});
