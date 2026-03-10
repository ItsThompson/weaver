import { resolve, relative } from "node:path";
import { getCurrentTurnEvents } from "./turn-boundary.js";

/** Whitespace-bounded match — stricter than \b so "pytest" won't match inside "my-pytest-wrapper". */
function findRunner(command: string, runner: string): number {
  const idx = command.indexOf(runner);
  if (idx === -1) return -1; // not found at all
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
  if (!testRunners.length) return [];

  return getCurrentTurnEvents(sessionLogPath).reduce<string[]>((dirs, e) => {
    if (
      e.event.hook_event_name !== "postToolUse" ||
      e.event.tool_name !== "execute_bash"
    )
      return dirs;

    const command = e.event.tool_input?.command;
    if (typeof command !== "string") return dirs;

    const runner = testRunners.find((r) => findRunner(command, r) !== -1);
    if (!runner) return dirs;

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
    if (found) return found;

    const isFlag = token.startsWith("-");
    const hasPath = token.includes("/");

    if (!token || isFlag || !hasPath) return "";

    return token.replace(/\/+$/, "");
  }, "");

  return dir || ".";
}
