import "../../__test-helpers__/mock-fs";

import { existsSync, readFileSync } from "node:fs";
import { makeEvent } from "../../__test-helpers__/index";
import { extractAgentTestedDirs } from "../session-analysis";

const DEFAULT_RUNNERS = [
  "jest",
  "vitest",
  "mocha",
  "pytest",
  "rspec",
  "cargo test",
  "npm test",
  "npx test",
  "bundle exec rspec",
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractAgentTestedDirs", () => {
  it("detects npx jest with directory arg", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "npx jest src/features/auth/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["src/features/auth"]);
  });

  it("detects npm test as CWD", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "npm test" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["."]);
  });

  it("detects vitest run with directory arg", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "vitest run src/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["src"]);
  });

  it("detects pytest with directory arg", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "pytest tests/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["tests"]);
  });

  it("detects cargo test as CWD", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "cargo test" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["."]);
  });

  it("detects rspec with directory arg", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "bundle exec rspec spec/models/order/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["spec/models/order"]);
  });

  it("detects custom test runner from config", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "mix test test/models/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", ["mix test"]),
    ).toEqual(["test/models"]);
  });

  it("ignores non-test execute_bash commands", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "ls -la" },
        }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "cat foo.ts" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual([]);
  });

  it("returns [] when no execute_bash events in turn", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "fs_write",
          toolInput: { path: "/project/a.ts" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual([]);
  });

  it("returns [] when command has no parseable input", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(
      extractAgentTestedDirs("/missing.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual([]);
  });

  it("does not match runner embedded in another word (e.g. my-pytest-wrapper)", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "my-pytest-wrapper src/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual([]);
  });

  it("matches runner with special characters like c++ test", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "c++ test src/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", ["c++ test"]),
    ).toEqual(["src"]);
  });

  it("returns [] when test runners list is empty", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          toolName: "execute_bash",
          toolInput: { command: "npx jest src/" },
        }),
      ].join("\n"),
    );

    expect(extractAgentTestedDirs("/log.jsonl", "/project", [])).toEqual([]);
  });
});
