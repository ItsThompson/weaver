import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import type { HookEvent } from "@weaver/shared/types";

function getCurrentTurnEvents(sessionLogPath: string): HookEvent[] {
  if (!existsSync(sessionLogPath)) {
    return [];
  }

  let raw: string;
  try {
    raw = readFileSync(sessionLogPath, "utf-8");
  } catch {
    return [];
  }

  const events: HookEvent[] = raw
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as HookEvent];
      } catch {
        return [];
      }
    });

  if (events.length === 0) {
    return [];
  }

  const boundaryIndex = events.findLastIndex(
    (e) =>
      e.event.hook_event_name === "userPromptSubmit" ||
      e.event.hook_event_name === "agentSpawn",
  );

  return boundaryIndex === -1 ? events : events.slice(boundaryIndex);
}

export function extractChangedFiles(sessionLogPath: string): string[] {
  const events = getCurrentTurnEvents(sessionLogPath);
  const files = events.reduce((acc, e) => {
    if (
      e.event.hook_event_name === "postToolUse" &&
      e.event.tool_name === "fs_write" &&
      typeof e.event.tool_input?.path === "string"
    ) {
      acc.add(e.event.tool_input.path);
    }
    return acc;
  }, new Set<string>());

  return [...files];
}

/** Whitespace-bounded match — stricter than \b so "pytest" won't match inside "my-pytest-wrapper". */
function findRunner(command: string, runner: string): number {
  const idx = command.indexOf(runner);
  if (idx === -1) {
    return -1;
  } // not found at all
  const before = idx === 0 || /\s/.test(command[idx - 1]); // start of string or whitespace before
  const after =
    idx + runner.length >= command.length ||
    /\s/.test(command[idx + runner.length]); // end of string or whitespace after
  return before && after ? idx : -1;
}

export function extractAgentTestedDirs(
  sessionLogPath: string,
  cwd: string,
  testRunners: string[],
): string[] {
  if (!testRunners.length) {
    return [];
  }

  return getCurrentTurnEvents(sessionLogPath).reduce<string[]>((dirs, e) => {
    if (
      e.event.hook_event_name !== "postToolUse" ||
      e.event.tool_name !== "execute_bash"
    ) {
      return dirs;
    }

    const command = e.event.tool_input?.command;
    if (typeof command !== "string") {
      return dirs;
    }

    const runner = testRunners.find((r) => findRunner(command, r) !== -1);
    if (!runner) {
      return dirs;
    }

    const afterRunner = command
      .slice(findRunner(command, runner) + runner.length)
      .trim();
    dirs.push(relative(cwd, resolve(cwd, extractDirArg(afterRunner))) || ".");
    return dirs;
  }, []);
}

function extractDirArg(args: string): string {
  const tokens = args.split(/\s+/);

  const dir = tokens.reduceRight((found, token) => {
    if (found) {
      return found;
    }

    const isFlag = token.startsWith("-");
    const hasPath = token.includes("/");

    if (!token || isFlag || !hasPath) {
      return "";
    }

    return token.replace(/\/+$/, "");
  }, "");

  return dir || ".";
}

export function isWithinDir(filePath: string, dir: string): boolean {
  const rel = relative(dir, resolve(filePath));
  return !rel.startsWith("..") && !isAbsolute(rel);
}
