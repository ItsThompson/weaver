// Pi extension entry point: loaded by pi's jiti runtime as TypeScript source.
// @mariozechner/pi-coding-agent is a peer dependency provided at runtime.

import { spawn } from "node:child_process";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// --- Pi extension API types ---
// Minimal interface covering only the surface area weaver uses.
// Pi's actual API is broader; extend as needed when new hooks are wired.

interface SessionContext {
  cwd: string;
  sessionManager: { getSessionId(): string };
}

interface ToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
}

interface ToolResultEvent {
  toolName: string;
  input: Record<string, unknown>;
  isError: boolean;
  content: unknown[];
}

interface InputEvent {
  text: string;
}

interface InputTransform {
  action: "transform";
  text: string;
}

interface PiExtensionAPI {
  on(event: "session_start", cb: (event: unknown, ctx: SessionContext) => Promise<void>): void;
  on(event: "session_shutdown", cb: () => Promise<void>): void;
  on(event: "tool_call", cb: (event: ToolCallEvent) => Promise<void>): void;
  on(event: "tool_result", cb: (event: ToolResultEvent) => Promise<void>): void;
  on(event: "input", cb: (event: InputEvent) => Promise<InputTransform | void>): void;
  on(event: "agent_end", cb: () => Promise<void>): void;
}

interface HookResult {
  stdout: string;
  stderr: string;
  code: number;
}

export default function (pi: PiExtensionAPI) {
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const hookScript = resolvePath(extensionDir, "..", "weaver-log.sh");

  let sessionId: string | undefined;
  let cwd: string = "";

  /**
   * Pipe event JSON to weaver-log.sh via stdin using child_process.spawn.
   *
   * We use spawn instead of pi.exec() because pi's exec API lacks stdin
   * support. Embedding JSON in shell strings (echo '...' | script) is
   * fragile: user prompts with quotes, backticks, or $() would corrupt
   * or inject commands.
   */
  function callHook(
    event: Record<string, unknown>,
  ): Promise<HookResult> {
    return new Promise((resolve, reject) => {
      const child = spawn("bash", [hookScript], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
      }, 60_000);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? 1 });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.stdin.write(JSON.stringify(event));
      child.stdin.end();
    });
  }

  /**
   * Call the hook script, swallowing spawn failures so a broken hook
   * never crashes the user's coding session.
   */
  async function safeCallHook(
    event: Record<string, unknown>,
  ): Promise<HookResult | null> {
    try {
      return await callHook(event);
    } catch {
      return null;
    }
  }

  function baseEvent(hookEventName: string): Record<string, unknown> {
    return {
      hook_event_name: hookEventName,
      session_id: sessionId,
      cwd,
    };
  }

  // --- Session lifecycle ---

  pi.on("session_start", async (_event, ctx) => {
    cwd = ctx.cwd;
    sessionId = ctx.sessionManager.getSessionId();

    await safeCallHook(baseEvent("session-start"));
  });

  pi.on("session_shutdown", async () => {
    // No explicit stop event needed. The PID lifecycle manager
    // will detect the process exit and mark the session as closed.
  });

  // --- Tool events ---

  pi.on("tool_call", async (event) => {
    if (!sessionId) {
      return;
    }
    await safeCallHook({
      ...baseEvent("pre-tool-use"),
      tool_name: event.toolName,
      tool_input: event.input,
    });
  });

  pi.on("tool_result", async (event) => {
    if (!sessionId) {
      return;
    }
    await safeCallHook({
      ...baseEvent("post-tool-use"),
      tool_name: event.toolName,
      tool_input: event.input,
      tool_response: {
        success: !event.isError,
        result: event.content,
      },
    });
  });

  // --- User input ---

  pi.on("input", async (event) => {
    if (!sessionId) {
      return;
    }
    const result = await safeCallHook({
      ...baseEvent("user-prompt-submit"),
      prompt: event.text,
    });

    // If inject.mjs found a pending file, stdout contains the formatted
    // validation failures. Prepend them to the user's message.
    if (result?.stdout?.trim()) {
      return {
        action: "transform" as const,
        text: `${result.stdout.trim()}\n\n${event.text}`,
      };
    }
  });

  // --- Agent turn end (stop hook) ---

  pi.on("agent_end", async () => {
    if (!sessionId) {
      return;
    }
    await safeCallHook(baseEvent("stop"));
  });
}
