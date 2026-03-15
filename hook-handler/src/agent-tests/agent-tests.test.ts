vi.mock("node:fs", () => ({
  existsSync: vi.fn<() => boolean>(),
  readFileSync: vi.fn<() => string>(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  realpathSync: vi.fn<(p: string) => string>(),
}));

import { existsSync, readFileSync } from "node:fs";
import { makeEvent } from "../__test-helpers__/index";
import { extractAgentTestedDirs } from "./agent-tests";

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
          tool_name: "execute_bash",
          tool_input: { command: "npx jest src/features/auth/" },
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
          tool_name: "execute_bash",
          tool_input: { command: "npm test" },
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
          tool_name: "execute_bash",
          tool_input: { command: "vitest run src/" },
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
          tool_name: "execute_bash",
          tool_input: { command: "pytest tests/" },
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
          tool_name: "execute_bash",
          tool_input: { command: "cargo test" },
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
          tool_name: "execute_bash",
          tool_input: { command: "bundle exec rspec spec/models/order/" },
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
          tool_name: "execute_bash",
          tool_input: { command: "mix test test/models/" },
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
          tool_name: "execute_bash",
          tool_input: { command: "ls -la" },
        }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "cat foo.ts" },
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
          tool_name: "fs_write",
          tool_input: { path: "/project/a.ts" },
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
          tool_name: "execute_bash",
          tool_input: { command: "my-pytest-wrapper src/" },
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
          tool_name: "execute_bash",
          tool_input: { command: "c++ test src/" },
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
          tool_name: "execute_bash",
          tool_input: { command: "npx jest src/" },
        }),
      ].join("\n"),
    );

    expect(extractAgentTestedDirs("/log.jsonl", "/project", [])).toEqual([]);
  });
});
