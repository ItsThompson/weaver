import { describe, it, expect } from "vitest";
import { resolveToolName, CanonicalToolName } from "./tool-names";

describe("resolveToolName", () => {
  describe("kiro-cli native names", () => {
    it("maps fs_write to write", () => {
      expect(resolveToolName("fs_write")).toBe(CanonicalToolName.WRITE);
    });

    it("maps fs_read to read", () => {
      expect(resolveToolName("fs_read")).toBe(CanonicalToolName.READ);
    });

    it("maps execute_bash to bash", () => {
      expect(resolveToolName("execute_bash")).toBe(CanonicalToolName.BASH);
    });
  });

  describe("Claude Code native names", () => {
    it("maps Write to write", () => {
      expect(resolveToolName("Write")).toBe(CanonicalToolName.WRITE);
    });

    it("maps Edit to edit", () => {
      expect(resolveToolName("Edit")).toBe(CanonicalToolName.EDIT);
    });

    it("maps Read to read", () => {
      expect(resolveToolName("Read")).toBe(CanonicalToolName.READ);
    });

    it("maps Bash to bash", () => {
      expect(resolveToolName("Bash")).toBe(CanonicalToolName.BASH);
    });
  });

  describe("pi native names (already canonical)", () => {
    it("maps write to write", () => {
      expect(resolveToolName("write")).toBe(CanonicalToolName.WRITE);
    });

    it("maps edit to edit", () => {
      expect(resolveToolName("edit")).toBe(CanonicalToolName.EDIT);
    });

    it("maps read to read", () => {
      expect(resolveToolName("read")).toBe(CanonicalToolName.READ);
    });

    it("maps bash to bash", () => {
      expect(resolveToolName("bash")).toBe(CanonicalToolName.BASH);
    });
  });

  describe("unknown/custom tool names", () => {
    it("passes through unknown tool names unchanged", () => {
      expect(resolveToolName("my_custom_tool")).toBe("my_custom_tool");
    });

    it("passes through MCP tool names unchanged", () => {
      expect(resolveToolName("mcp_builder_mcp__InternalSearch")).toBe(
        "mcp_builder_mcp__InternalSearch",
      );
    });
  });
});
