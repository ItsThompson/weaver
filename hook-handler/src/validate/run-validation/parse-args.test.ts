import { describe, it, expect } from "@jest/globals";
import { parseArgs } from "./parse-args";

describe("parseArgs", () => {
  it("parses all flags", () => {
    const result = parseArgs([
      "node",
      "validate.js",
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
  });

  it("returns all undefined for empty argv", () => {
    const result = parseArgs(["node", "validate.js"]);
    expect(result.sessionId).toBeUndefined();
    expect(result.cwd).toBeUndefined();
    expect(result.trigger).toBeUndefined();
  });
});
