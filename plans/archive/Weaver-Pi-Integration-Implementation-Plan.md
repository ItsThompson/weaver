# Weaver Pi Integration: Implementation Plan

## OVERVIEW

### Description

Integrate weaver with [pi](https://github.com/badlogic/pi-mono), a minimal terminal coding harness, as a new binding alongside the existing kiro-cli and Claude Code bindings. This includes a prerequisite refactor to introduce canonical tool names across all harnesses.

### Success Criteria

1. A pi user can install the weaver pi package (`pi install`) and see their sessions in the weaver dashboard
2. Event logging (session start/end, tool use, user prompts) works with feature parity to kiro-cli
3. Validation hooks (stop + postToolUse) run automatically and inject failures into the next prompt
4. `weaver rename`, `weaver view`, and session lifecycle (open/closed status) work from pi sessions
5. Canonical tool names are used across all harnesses: the validation system no longer hardcodes harness-specific tool names
6. All existing kiro-cli and Claude Code functionality remains unbroken

### Assumptions

- Pi's process shows up as `pi` in `ps -o comm=` (verified empirically)
- Pi's `ctx.sessionManager.getSessionId()` returns a stable UUID suitable as weaver session ID (verified: `ReadonlySessionManager` includes `getSessionId(): string`)
- Pi extensions can resolve their own file path to locate `weaver-log.sh` relative to the package
- The weaver desktop app bundles `bindings/pi/` alongside the existing bindings
- Pi loads extensions via jiti (TypeScript JIT): `extension.ts` stays as source, not bundled
- V1 install is local-path only (`pi install /path/to/weaver/bindings/pi`); the npm-published path (`pi install npm:@weaver/binding-pi`) requires additional `ROOT_DIR` resolution work and is deferred to a follow-up

### Constraints

- Must follow the existing shell script architecture: pi extension → `weaver-log.sh` → validation/logging
- Cannot call validation library functions directly from the extension (app is distributed via `npm run dist`)
- V1 scope is observability + validation: feature parity with kiro-cli, not the richer pi-specific data
- Direct reading of pi session files (`~/.pi/agent/sessions/`) is a future enhancement, not in V1

### Breaking Changes

**`.weaver.json` matchers must use canonical tool names.** The `postToolUse` matcher values change from harness-specific names (`fs_write`, `execute_bash`) to canonical names (`write`, `edit`, `bash`). Existing `.weaver.json` files with `"matcher": "fs_write"` will stop matching and must be updated to `"matcher": "write"`.

---

## APPROACH

### High-Level Solution Design

The implementation has two major workstreams:

**Workstream 1: Canonical Tool Names (prerequisite)**

Create a tool name abstraction layer in `@weaver/shared`, analogous to how `WeaverEventName` abstracts harness-specific event names. Each adapter translates native tool names (e.g., `fs_write` in kiro, `Write` in Claude Code, `write` in pi) to canonical names (e.g., `write`). The validation system uses canonical names exclusively. Unknown tool names fall back to the native value.

As part of this workstream, fix `extractChangedFiles` to detect file changes from both `write` and `edit` tools across all harnesses, and handle the `path` vs `file_path` divergence in tool input shapes.

**Workstream 2: Pi Binding**

A new `bindings/pi/` monorepo package that serves dual purposes:
1. **Weaver binding**: Exports a `HarnessAdapter` for the weaver server (session display, skill resolution, lifecycle management)
2. **Pi package**: Installable via `pi install` with an extension that captures pi events, pipes them to `weaver-log.sh`, and handles validation injection

The pi extension subscribes to pi lifecycle events (`session_start`, `session_shutdown`, `tool_call`, `tool_result`, `input`, `agent_end`), constructs event JSON payloads, and spawns `weaver-log.sh` via `child_process.spawn` with JSON piped to stdin. The shell script handles session management, event logging, and validation dispatch: the same architecture as kiro-cli and Claude Code.

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| `child_process.spawn` instead of `pi.exec()` | Pi's `exec()` API lacks stdin support. Embedding JSON in shell strings (`echo '...' \| script`) is fragile: user prompts with quotes, backticks, or `$()` would corrupt or inject commands. Direct spawn gives proper stdin piping with zero escaping issues. |
| Separate `weaver-log.sh` for pi (not reusing kiro's) | Allows extending the pi event JSON format independently in the future. Event names use kebab-case natively (matching weaver's canonical format). |
| Use pi's native session UUID as weaver session ID | Avoids generating a second UUID; creates a natural link between pi and weaver sessions. |
| Treat all `session_start` reasons (startup, resume, fork, reload, new) as session creation | Matches the kiro-cli and Claude Code pattern: the shell script always creates a session entry on the start event. Duplicates are harmless (server deduplicates by ID). |
| `processName: "pi"` for PID-based lifecycle | Verified that `ps -o comm=` returns `pi` for the pi process. |
| Canonical tool names as shared infrastructure | Fixes a cross-harness bug (Claude Code stop-hook validation can't detect changed files because `extractChangedFiles` only checks `fs_write`) and prevents pi from inheriting the same problem. |
| Adapter translates tool names at parse time | Single translation point; logged WeaverEvents always contain canonical names. |
| Extension.ts stays as TypeScript source (not bundled) | Pi loads extensions via jiti at runtime. Only `index.ts` (adapter) and `log-event.ts` are bundled by tsdown. |
| Breaking change for `.weaver.json` matchers | Normalizing only the input side while preserving legacy matchers creates perpetual dual-path complexity. Clean break: matchers must use canonical names. |

### Alternative Approaches Considered

1. **Use `pi.exec()` for shell execution**: Simpler API, but no stdin support. Would require embedding JSON in shell command strings with fragile escaping. Rejected for reliability.
2. **Read pi sessions directly from `~/.pi/agent/sessions/`**: Would eliminate event duplication but requires weaver to parse pi's tree-structured JSONL format: a significant coupling and scope increase. Deferred to future enhancement.
3. **In-process validation**: Cleaner code path but breaks in distributed app form where validation package paths don't resolve.
4. **Reuse kiro-cli's `weaver-log.sh`**: Simpler initially but prevents independent evolution of pi's event format.
5. **Dual-match `.weaver.json` matchers (canonical + legacy)**: Zero-breakage but adds perpetual legacy support in the hot path. Rejected in favor of a clean break.

### Development Workflow

This is a **complex** task:
- **Scope**: Cross-service integration (shared types, validation, new binding, server, CLI, shell scripts)
- **Dependencies**: Spans 6+ packages in the monorepo
- **State**: New session management, event mapping, validation state
- **Logic**: Adapter pattern, tool name normalization, event translation

**Levels**: ATDD + BDD + TDD (Levels 1 + 2 + 3)

---

## IMPLEMENTATION STEPS

### Phase 1: Canonical Tool Names

#### Step 1.1: Define canonical tool name types and mapping

Create the canonical tool name system in `@weaver/shared`.

**Files:**
- **Create** `shared/types/tool-names.ts`
- **Create** `shared/types/tool-names.test.ts`
- **Modify** `shared/types/index.ts` (add export)

**Details:**

```typescript
// shared/types/tool-names.ts

/** Canonical tool names used across all harnesses. */
export enum CanonicalToolName {
  WRITE = "write",
  EDIT = "edit",
  READ = "read",
  BASH = "bash",
}

/**
 * Per-harness mapping of native tool names to canonical names.
 * Only tools relevant to weaver features (validation, session analysis) need mapping.
 */
const TOOL_NAME_MAP: Record<string, CanonicalToolName> = {
  // kiro-cli
  fs_write: CanonicalToolName.WRITE,
  fs_read: CanonicalToolName.READ,
  execute_bash: CanonicalToolName.BASH,
  // Claude Code
  Write: CanonicalToolName.WRITE,
  Edit: CanonicalToolName.EDIT,
  Read: CanonicalToolName.READ,
  Bash: CanonicalToolName.BASH,
  // pi (already canonical)
  write: CanonicalToolName.WRITE,
  edit: CanonicalToolName.EDIT,
  read: CanonicalToolName.READ,
  bash: CanonicalToolName.BASH,
};

/**
 * Resolve a native harness tool name to its canonical form.
 * Returns the canonical name if a mapping exists, otherwise returns
 * the native name unchanged (for extension/custom tools).
 */
export function resolveToolName(nativeToolName: string): string {
  return TOOL_NAME_MAP[nativeToolName] ?? nativeToolName;
}
```

**Acceptance criteria:**
- `resolveToolName("fs_write")` returns `"write"`
- `resolveToolName("Write")` returns `"write"`
- `resolveToolName("write")` returns `"write"`
- `resolveToolName("my_custom_tool")` returns `"my_custom_tool"` (passthrough)

**Unit tests** (`shared/types/tool-names.test.ts`):
- Maps all kiro-cli native names: `fs_write` → `write`, `fs_read` → `read`, `execute_bash` → `bash`
- Maps all Claude Code native names: `Write` → `write`, `Edit` → `edit`, `Read` → `read`, `Bash` → `bash`
- Maps all pi native names (already canonical): `write` → `write`, `edit` → `edit`, `read` → `read`, `bash` → `bash`
- Passes through unknown/custom tool names unchanged

---

#### Step 1.2: Apply tool name resolution in existing adapters

Update kiro-cli and Claude Code adapters to translate tool names in `parseEvent`.

**Files:**
- **Modify** `bindings/kiro/src/adapter.ts`
- **Modify** `bindings/claude-code/src/adapter.ts`
- **Modify** `bindings/kiro/src/adapter.test.ts`
- **Modify** `bindings/claude-code/src/adapter.test.ts`

**Details:**

In each adapter's `parseEvent`, apply `resolveToolName()` to the `toolName` field before returning the WeaverEvent.

kiro adapter (`bindings/kiro/src/adapter.ts`):
```typescript
import { resolveToolName } from "@weaver/shared/types";

// In parseEvent, change:
//   toolName: data.tool_name,
// To:
toolName: data.tool_name ? resolveToolName(data.tool_name) : undefined,
```

Claude Code adapter (`bindings/claude-code/src/adapter.ts`):
```typescript
import { resolveToolName } from "@weaver/shared/types";

// In parseEvent, change:
//   toolName: data.tool_name ? String(data.tool_name) : undefined,
// To:
toolName: data.tool_name ? resolveToolName(String(data.tool_name)) : undefined,
```

Update tests to verify native names are translated. For example, the kiro adapter test for `preToolUse` currently asserts `toolName: "fs_read"`. Update to assert `toolName: "read"`. Add a new test case verifying unknown tool names pass through unchanged.

**Acceptance criteria:**
- kiro adapter: `parseEvent` with `tool_name: "fs_write"` returns event with `toolName: "write"`
- Claude Code adapter: `parseEvent` with `tool_name: "Write"` returns event with `toolName: "write"`
- Unknown tool names pass through unchanged in both adapters

---

#### Step 1.3: Migrate session analysis to canonical names and fix cross-harness bug

Update hardcoded `fs_write` and `execute_bash` references in the session analysis module. Also fix `extractChangedFiles` to handle the `edit` tool and the `path` vs `file_path` divergence in tool input shapes across harnesses.

**Files:**
- **Modify** `validation/src/session-analysis/session-analysis.ts`
- **Modify** `validation/src/session-analysis/__tests__/changed-files.test.ts`
- **Modify** `validation/src/session-analysis/__tests__/agent-tested-dirs.test.ts`

**Details:**

In `extractChangedFiles()`, replace:
```typescript
e.toolName === "fs_write" &&
typeof e.toolInput?.path === "string"
```
with:
```typescript
(e.toolName === CanonicalToolName.WRITE || e.toolName === CanonicalToolName.EDIT) &&
typeof extractFilePath(e.toolInput) === "string"
```

Add a helper to extract the file path from tool input, handling the shape divergence:
```typescript
/**
 * Extract the file path from a tool's input object.
 * Pi and kiro-cli use `path`; Claude Code uses `file_path`.
 */
function extractFilePath(toolInput?: Record<string, unknown>): string | undefined {
  if (!toolInput) return undefined;
  if (typeof toolInput.path === "string") return toolInput.path;
  if (typeof toolInput.file_path === "string") return toolInput.file_path;
  return undefined;
}
```

Use `extractFilePath` wherever `e.toolInput?.path` is currently used:
```typescript
const filePath = extractFilePath(e.toolInput);
if (filePath) {
  acc.add(filePath);
}
```

In `extractAgentTestedDirs()`, replace:
```typescript
e.toolName !== "execute_bash"
```
with:
```typescript
e.toolName !== CanonicalToolName.BASH
```

Update tests to use canonical tool names. Add new test cases:
- `extractChangedFiles` detects files from events with `toolName: "edit"` and `toolInput: { path: "/file.ts" }`
- `extractChangedFiles` detects files from events with `toolName: "write"` and `toolInput: { file_path: "/file.ts" }` (Claude Code shape)
- `extractAgentTestedDirs` works with `toolName: "bash"`

**Acceptance criteria:**
- `extractChangedFiles` detects files from events with `toolName: "write"` and `toolInput: { path: "..." }`
- `extractChangedFiles` detects files from events with `toolName: "write"` and `toolInput: { file_path: "..." }`
- `extractChangedFiles` detects files from events with `toolName: "edit"` and `toolInput: { path: "..." }`
- `extractAgentTestedDirs` detects bash commands from events with `toolName: "bash"`
- All existing test scenarios still pass (with updated tool names)

---

#### Step 1.4: Update postToolUse validation trigger for canonical names

The postToolUse trigger receives the tool name from the shell script's `--tool-name` arg (native format). Apply `resolveToolName` in `parseArgs` so matchers compare against canonical names. Also extend `TRIGGER_MAP` to handle pi's kebab-case trigger values (`post-tool-use`, `pre-tool-use`).

**Files:**
- **Modify** `validation/src/run-validation/parse-args.ts`
- **Modify** `validation/src/run-validation/parse-args.test.ts`
- **Modify** `validation/src/run-validation/post-tool-use-trigger.boundary.test.ts`
- **Modify** `validation/src/run-validation/run-validation.test.ts`
- **Modify** `validation/src/run-validation/stop-trigger.boundary.test.ts`
- **Modify** `.weaver.json`

**Details:**

In `parse-args.ts`, apply `resolveToolName` to the parsed tool name and add kebab-case trigger entries:
```typescript
import { resolveToolName } from "@weaver/shared/types";

/**
 * Normalizes trigger values from all harnesses to the camelCase
 * form the validation pipeline expects. Handles:
 * - camelCase (kiro-cli): stop, postToolUse, preToolUse
 * - PascalCase (Claude Code): Stop, PostToolUse, PreToolUse
 * - kebab-case (pi): stop, post-tool-use, pre-tool-use
 */
const TRIGGER_MAP: Record<string, ValidationTrigger> = {
  stop: "stop",
  Stop: "stop",
  postToolUse: "postToolUse",
  PostToolUse: "postToolUse",
  "post-tool-use": "postToolUse",
  preToolUse: "preToolUse",
  PreToolUse: "preToolUse",
  "pre-tool-use": "preToolUse",
};

// In parseArgs, change:
//   toolName: args["tool-name"],
// To:
toolName: args["tool-name"] ? resolveToolName(args["tool-name"]) : undefined,
```

Update `.weaver.json` in the weaver repo:
```json
"postToolUse": [
  {
    "matcher": "write",
    "name": "eslint",
    "command": "npx eslint --fix {{file}}",
    "timeout_ms": 10000
  },
  {
    "matcher": "write",
    "name": "prettier",
    "command": "npx prettier --write {{file}} --ignore-unknown",
    "timeout_ms": 10000
  }
]
```

Update all test files to use canonical tool names in test data and assertions:
- `parse-args.test.ts`: Add test that `--tool-name fs_write` produces `toolName: "write"`. Add tests that `--trigger post-tool-use` produces `trigger: "postToolUse"` and `--trigger pre-tool-use` produces `trigger: "preToolUse"`. Update existing test expectations from `"fs_write"` to `"write"`.
- `post-tool-use-trigger.boundary.test.ts`: Update config matchers from `"fs_write"` and `"execute_bash"` to `"write"` and `"bash"`. Update `toolName` in `ValidateArgs` from `"fs_write"` to `"write"`.
- `run-validation.test.ts`: Same pattern: update matchers and tool names to canonical.
- `stop-trigger.boundary.test.ts`: Update `toolName` in `makeEvent` calls from `"fs_write"` to `"write"`.

**Acceptance criteria:**
- `parseArgs` with `--tool-name fs_write` produces `toolName: "write"`
- `parseArgs` with `--tool-name Write` produces `toolName: "write"`
- `parseArgs` with `--tool-name write` produces `toolName: "write"`
- `parseArgs` with `--trigger post-tool-use` produces `trigger: "postToolUse"`
- `parseArgs` with `--trigger pre-tool-use` produces `trigger: "preToolUse"`
- `parseArgs` with `--trigger stop` produces `trigger: "stop"` (unchanged)
- postToolUse trigger matches `"write"` matcher against canonical tool name
- Existing validation behavior unchanged for kiro-cli and Claude Code
- All validation tests pass with canonical names

---

### Phase 2: Shared Infrastructure Updates

#### Step 2.1: Add PI to the Harness enum

**Files:**
- **Modify** `shared/types/harness.ts`

**Details:**

```typescript
export enum Harness {
  KIRO_CLI = "kiro-cli",
  CLAUDE_CODE = "claude-code",
  PI = "pi",
}
```

**Acceptance criteria:**
- `Harness.PI` equals `"pi"`
- No compilation errors across the monorepo
- `VALID_HARNESSES` set in `parse-args.ts` (derived from `Object.values(Harness)`) automatically includes `"pi"`

#### Step 2.2: Verify pi event name coverage

Review whether any pi-specific events need new canonical names. For V1 (kiro-cli parity), the existing `WeaverEventName` values cover all needed events:
- `AGENT_SPAWN` (session start)
- `STOP` (agent end / session end)
- `PRE_TOOL_USE`
- `POST_TOOL_USE`
- `USER_PROMPT_SUBMIT`
- `VALIDATION`

No new enum values needed for V1. No code changes required in this step.

---

### Phase 3: Pi Binding Package

#### Step 3.1: Scaffold the binding package

Create the `bindings/pi/` package structure.

**Files to create:**
- `bindings/pi/package.json`
- `bindings/pi/tsconfig.json`
- `bindings/pi/tsconfig.build.json`
- `bindings/pi/tsdown.config.ts`
- `bindings/pi/vitest.config.ts`

**Files to modify:**
- `package.json` (root: add `"bindings/pi"` to workspaces)

**Details:**

`package.json`:
```json
{
  "name": "@weaver/binding-pi",
  "version": "1.6.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./dist/index.mjs"
    }
  },
  "pi": {
    "extensions": ["./src/extension.ts"]
  },
  "scripts": {
    "build": "tsc --noEmit -p tsconfig.build.json && tsdown",
    "test": "vitest run --passWithNoTests && bash weaver-log.test.sh"
  },
  "dependencies": {
    "@weaver/shared": "*"
  },
  "devDependencies": {
    "@types/node": "^22.15.3",
    "tsdown": "^0.21.0",
    "typescript": "^5.8.3",
    "vitest": "^4.0.18"
  }
}
```

Note: `@mariozechner/pi-coding-agent` is a peer dependency (provided by the pi runtime at extension load time). It must NOT appear in `dependencies` to avoid bundling pi into the weaver dist. The `extension.ts` file imports pi types using `import type` only.

`tsdown.config.ts`: Only bundle the adapter and log-event entry points. The extension is loaded as TypeScript by pi's jiti runtime.
```typescript
import { defineConfig } from "tsdown";

const shared = {
  format: "esm" as const,
  platform: "node" as const,
  target: "es2022" as const,
  sourcemap: true,
  deps: { alwaysBundle: [/^@weaver\//] },
};

export default defineConfig([
  { entry: ["src/index.ts"], ...shared },
  { entry: ["src/log-event.ts"], ...shared },
]);
```

Copy `tsconfig.json`, `tsconfig.build.json`, and `vitest.config.ts` from `bindings/claude-code/` as starting points, adjusting the package name.

**Acceptance criteria:**
- `npm install` succeeds from the repo root
- `turbo build --filter=@weaver/binding-pi` succeeds (even with empty source files)

---

#### Step 3.2: Implement the HarnessAdapter

**Files to create:**
- `bindings/pi/src/adapter.ts`
- `bindings/pi/src/adapter.test.ts`
- `bindings/pi/src/index.ts`

**Details:**

```typescript
// bindings/pi/src/adapter.ts
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  HarnessAdapter,
  EventContext,
  SkillSearchPath,
} from "@weaver/shared/types";
import { Harness, WeaverEventName, resolveToolName } from "@weaver/shared/types";
import type { WeaverEvent } from "@weaver/shared/types";
import { loadAgentConfig } from "./skills/agent-config";

const EVENT_NAME_MAP: Record<string, WeaverEventName> = {
  "session-start": WeaverEventName.AGENT_SPAWN,
  stop: WeaverEventName.STOP,
  "pre-tool-use": WeaverEventName.PRE_TOOL_USE,
  "post-tool-use": WeaverEventName.POST_TOOL_USE,
  "user-prompt-submit": WeaverEventName.USER_PROMPT_SUBMIT,
  validation: WeaverEventName.VALIDATION,
};

export const piAdapter: HarnessAdapter = {
  name: Harness.PI,
  processName: "pi",
  providesSessionId: true,

  parseEvent(raw: unknown, context: EventContext): WeaverEvent {
    const data = raw as Record<string, unknown>;
    const hookName = String(data.hook_event_name ?? "");
    const eventName = EVENT_NAME_MAP[hookName];
    if (!eventName) {
      throw new Error(`Unknown pi event: "${hookName}"`);
    }

    return {
      sessionId: String(data.session_id ?? context.sessionId),
      timestamp: context.timestamp,
      harness: Harness.PI,
      eventName,
      cwd: String(data.cwd ?? ""),
      pid: context.pid,
      prompt: data.prompt ? String(data.prompt) : undefined,
      toolName: data.tool_name
        ? resolveToolName(String(data.tool_name))
        : undefined,
      toolInput: data.tool_input as Record<string, unknown> | undefined,
      toolResponse: data.tool_response as
        | { success: boolean; result: unknown[] }
        | undefined,
      raw: data,
    };
  },

  globalConfigDir(): string {
    return join(homedir(), ".pi", "agent");
  },

  skillSearchPaths(cwd: string): SkillSearchPath[] {
    return [
      { path: join(cwd, ".pi", "skills"), source: "workspace" },
      { path: join(homedir(), ".pi", "agent", "skills"), source: "global" },
    ];
  },

  async cleanupSession(): Promise<void> {
    // Pi manages its own sessions natively. No marker files to clean up.
  },

  loadAgentConfig,
};
```

```typescript
// bindings/pi/src/index.ts
export { piAdapter } from "./adapter";
```

Tests follow the same pattern as `bindings/kiro/src/adapter.test.ts` and `bindings/claude-code/src/adapter.test.ts`:

```typescript
// bindings/pi/src/adapter.test.ts
import { describe, it, expect } from "vitest";
import { piAdapter } from "./adapter";
import { Harness, WeaverEventName } from "@weaver/shared/types";
import type { EventContext } from "@weaver/shared/types";

const context: EventContext = {
  sessionId: "fallback-session",
  timestamp: "2026-01-01T00:00:00Z",
  pid: 12345,
};

describe("piAdapter", () => {
  it("has correct metadata", () => {
    expect(piAdapter.name).toBe(Harness.PI);
    expect(piAdapter.processName).toBe("pi");
    expect(piAdapter.providesSessionId).toBe(true);
  });

  describe("parseEvent", () => {
    it("maps session-start and uses native session_id", () => {
      const event = piAdapter.parseEvent(
        {
          hook_event_name: "session-start",
          session_id: "pi-session-abc",
          cwd: "/project",
        },
        context,
      );
      expect(event).toMatchObject({
        sessionId: "pi-session-abc",
        harness: Harness.PI,
        eventName: WeaverEventName.AGENT_SPAWN,
        cwd: "/project",
      });
    });

    it("maps post-tool-use and resolves tool name to canonical", () => {
      const event = piAdapter.parseEvent(
        {
          hook_event_name: "post-tool-use",
          session_id: "s1",
          cwd: "/project",
          tool_name: "write",
          tool_input: { path: "/file.ts", content: "hello" },
          tool_response: { success: true, result: ["ok"] },
        },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.POST_TOOL_USE);
      expect(event.toolName).toBe("write");
      expect(event.toolInput).toEqual({ path: "/file.ts", content: "hello" });
    });

    it("passes through unknown tool names unchanged", () => {
      const event = piAdapter.parseEvent(
        {
          hook_event_name: "post-tool-use",
          session_id: "s1",
          cwd: "/project",
          tool_name: "mcp_builder_mcp__InternalSearch",
        },
        context,
      );
      expect(event.toolName).toBe("mcp_builder_mcp__InternalSearch");
    });

    it("throws for unknown event name", () => {
      expect(() =>
        piAdapter.parseEvent(
          { hook_event_name: "unknownEvent", session_id: "s1", cwd: "/" },
          context,
        ),
      ).toThrow('Unknown pi event: "unknownEvent"');
    });

    // ... additional tests for: stop, pre-tool-use, user-prompt-submit,
    // falls back to context sessionId, omits undefined optional fields
  });

  describe("skillSearchPaths", () => {
    it("returns workspace and global .pi paths", () => {
      const paths = piAdapter.skillSearchPaths("/my/project");
      expect(paths).toHaveLength(2);
      expect(paths[0]).toEqual({
        path: "/my/project/.pi/skills",
        source: "workspace",
      });
      expect(paths[1]).toMatchObject({ source: "global" });
      expect(paths[1].path).toContain(".pi/agent/skills");
    });
  });

  describe("cleanupSession", () => {
    it("is a no-op", async () => {
      await expect(
        piAdapter.cleanupSession({ id: "s1", pid: 123 }),
      ).resolves.toBeUndefined();
    });
  });
});
```

**Acceptance criteria:**
- `piAdapter.name` equals `"pi"`
- `piAdapter.processName` equals `"pi"`
- `piAdapter.providesSessionId` is `true`
- `parseEvent` maps all event names correctly
- `parseEvent` applies `resolveToolName` to tool names
- `skillSearchPaths` returns `.pi/skills` (workspace) and `~/.pi/agent/skills` (global)
- Unknown event names throw
- All test cases pass

---

#### Step 3.3: Implement agent config loading

**Files to create:**
- `bindings/pi/src/skills/agent-config.ts`
- `bindings/pi/src/skills/agent-config.test.ts`

**Details:**

Pi uses `AGENTS.md` files (plain Markdown, no YAML frontmatter like Claude Code, no JSON like kiro-cli). For V1, return `null` since pi agent config is not structured data. This can be extended later to parse Markdown frontmatter if pi adopts that convention.

```typescript
// bindings/pi/src/skills/agent-config.ts
export async function loadAgentConfig(
  _agentName: string,
  _cwd: string,
): Promise<Record<string, unknown> | null> {
  // Pi uses AGENTS.md (unstructured Markdown). No structured config to load.
  return null;
}
```

**Acceptance criteria:**
- `loadAgentConfig` returns `null` for any input

---

#### Step 3.4: Implement log-event entry point and logger

**Files to create:**
- `bindings/pi/src/log-event.ts`
- `bindings/pi/src/utils/logger.ts`

**Details:**

Same pattern as kiro-cli and Claude Code bindings:

```typescript
// bindings/pi/src/log-event.ts
import { logEvent } from "@weaver/shared/log-event";
import { piAdapter } from "./adapter";
import { log } from "./utils/logger";

logEvent(piAdapter, log);
```

```typescript
// bindings/pi/src/utils/logger.ts
import { createLogger } from "@weaver/shared/logger";

export type { LogEntry } from "@weaver/shared/logger";

export const log = createLogger("binding-pi", { stderr: true });
```

**Acceptance criteria:**
- When piped valid event JSON via stdin with `--session-id` and `--pid` args, writes a WeaverEvent to the correct session log file
- Errors are logged to stderr with "binding-pi" prefix

---

#### Step 3.5: Implement the shell scripts

**Files to create:**
- `bindings/pi/weaver-log.sh`
- `bindings/pi/lib/pid.sh`
- `bindings/pi/lib/session.sh`
- `bindings/pi/lib/truncate.sh`
- `bindings/pi/lib/validate.sh`
- `bindings/pi/lib/init.sh`
- `bindings/pi/weaver-log.test.sh`
- `bindings/pi/test/helpers.sh`
- `bindings/pi/test/session.sh`
- `bindings/pi/test/truncation.sh`
- `bindings/pi/test/validation.sh`

**Details:**

The shell scripts follow the Claude Code pattern closely since pi also provides native session IDs.

**`weaver-log.sh`**: Main entry point. Structurally identical to the Claude Code version with these differences:
- Uses `json_string_field` helper (same as Claude Code) for field extraction
- Event names are kebab-case: `session-start`, `stop`, `pre-tool-use`, `post-tool-use`, `user-prompt-submit`
- Includes the `trap` + `LOG_PID` pattern from Claude Code for clean async log-event shutdown
- On missing `session_id`, logs to orphan queue and exits 0 (same as Claude Code)

**`lib/session.sh`**: Uses `session_id` from the event JSON (like Claude Code). On `session-start`, creates session metadata in `sessions.jsonl` with `harness: "pi"`. Extracts agent name from the pi process args if available. Uses `jq` for safe JSON construction (same as Claude Code).

```bash
# Key differences from Claude Code's session.sh:
# - Checks for "session-start" instead of "SessionStart"
# - harness is "pi" instead of "claude-code"
# - Agent name extraction regex targets pi's CLI args format
manage_session() {
  SESSION_ID=$(echo "$EVENT" | jq -r '.session_id // empty' 2>/dev/null || true)

  if [ -z "$SESSION_ID" ]; then
    SESSION_ID="orphan"
    return
  fi

  if [ "$HOOK_EVENT_NAME" = "session-start" ]; then
    local agent_name
    agent_name=$(ps -p "$CALLER_PID" -o args= 2>/dev/null \
      | grep -o '\-\-agent [^ ]*' | awk '{print $2}' || echo "")

    local session_meta
    session_meta=$(jq -nc \
      --arg id "$SESSION_ID" \
      --argjson pid "$CALLER_PID" \
      --arg cwd "$CWD" \
      --arg ts "$TIMESTAMP" \
      --arg agent "$agent_name" \
      '{id:$id, pid:$pid, customName:null, cwd:$cwd, agentName:(if $agent == "" then null else $agent end), startTime:$ts, lastEventTime:$ts, harness:"pi"}')
    echo "$session_meta" >> "$SESSIONS_FILE"
    touch "$LOGS_DIR/$SESSION_ID.jsonl"
  fi
}
```

**`lib/validate.sh`**: Dispatches to `validation/dist/validate.mjs` and `validation/dist/inject.mjs` with `--harness pi`. Event name comparisons use kebab-case.

```bash
run_validation() {
  local validate_script="$ROOT_DIR/validation/dist/validate.mjs"
  local inject_script="$ROOT_DIR/validation/dist/inject.mjs"

  if [ "$HOOK_EVENT_NAME" = "user-prompt-submit" ]; then
    if [ -f "$inject_script" ]; then
      node "$inject_script" --session-id "$SESSION_ID" 2>/dev/null || true
    fi
    return
  fi

  if [ "$HOOK_EVENT_NAME" != "stop" ] && [ "$HOOK_EVENT_NAME" != "post-tool-use" ]; then
    return
  fi

  [ -f "$validate_script" ] || return 0

  local tool_name
  tool_name=$(json_string_field "$EVENT" "tool_name")
  local tool_path
  tool_path=$(echo "$EVENT" | jq -r '.tool_input.path // empty' 2>/dev/null || echo "")
  local validate_exit=0
  local validate_stderr
  validate_stderr=$(node "$validate_script" \
    --harness pi \
    --session-id "$SESSION_ID" \
    --cwd "$CWD" \
    --trigger "$HOOK_EVENT_NAME" \
    --tool-name "$tool_name" \
    --tool-path "$tool_path" 2>&1 1>/dev/null) || validate_exit=$?

  if [ "$validate_exit" -ne 0 ] && echo "$validate_stderr" | grep -q "⚠ weaver:"; then
    echo "$validate_stderr" >&2
    exit "$validate_exit"
  fi
}
```

Note on tool_path extraction: Pi's `write` and `edit` tools both use `.tool_input.path` (not `.tool_input.file_path`). The jq expression is pi-specific: `.tool_input.path // empty`.

**`lib/pid.sh`**: Identical to the other bindings. `get_caller_pid()` walks up the process tree skipping shells.

**`lib/truncate.sh`**: Identical to the other bindings. Truncates large tool responses in the logged copy only.

**`lib/init.sh`**: Minimal for pi: no sync needed (the extension IS the integration). Hook preserved for future use.

```bash
run_init() {
  if [ "$HOOK_EVENT_NAME" != "session-start" ]; then
    return
  fi
  # Pi extension handles integration natively. No config sync needed.
}
```

**Shell script tests** (`weaver-log.test.sh` and `test/` directory): Follow the same structure as `bindings/kiro/weaver-log.test.sh` with test helpers, session tests, truncation tests, and validation tests adapted for pi's kebab-case event names.

**Acceptance criteria:**
- `echo '{"hook_event_name":"session-start","session_id":"abc","cwd":"/tmp"}' | bash weaver-log.sh` creates a session entry in `~/.weaver/sessions.jsonl` with `harness: "pi"`
- Validation runs on `stop` and `post-tool-use` events
- Injection runs on `user-prompt-submit` events
- Missing `session_id` logs to orphan queue and exits 0
- Shell script tests pass

---

#### Step 3.6: Implement the pi extension

**Files to create:**
- `bindings/pi/src/extension.ts`

**Details:**

The extension is the heart of the pi integration. It subscribes to pi events and translates them into `weaver-log.sh` invocations using `child_process.spawn` for proper stdin piping.

```typescript
// bindings/pi/src/extension.ts
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export default function (pi: ExtensionAPI) {
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const hookScript = resolve(extensionDir, "..", "weaver-log.sh");

  let sessionId: string | undefined;
  let cwd: string;

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
  ): Promise<{ stdout: string; stderr: string; code: number }> {
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
      }, 120_000);

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

  function baseEvent(hookEventName: string): Record<string, unknown> {
    return {
      hook_event_name: hookEventName,
      session_id: sessionId,
      cwd,
    };
  }

  // --- Session lifecycle ---

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    cwd = ctx.cwd;
    sessionId = ctx.sessionManager.getSessionId();

    await callHook(baseEvent("session-start"));
  });

  pi.on("session_shutdown", async () => {
    // No explicit stop event needed. The PID lifecycle manager
    // will detect the process exit and mark the session as closed.
  });

  // --- Tool events ---

  pi.on("tool_call", async (event) => {
    if (!sessionId) return;
    await callHook({
      ...baseEvent("pre-tool-use"),
      tool_name: event.toolName,
      tool_input: event.input,
    });
  });

  pi.on("tool_result", async (event) => {
    if (!sessionId) return;
    await callHook({
      ...baseEvent("post-tool-use"),
      tool_name: event.toolName,
      tool_input: event.input,
      tool_response: {
        success: !event.isError,
        result: event.content,
      },
    });
    // If validation failed, the hook exits non-zero and writes a pending
    // file. Injection happens on the next user-prompt-submit event.
  });

  // --- User input ---

  pi.on("input", async (event) => {
    if (!sessionId) return;
    const result = await callHook({
      ...baseEvent("user-prompt-submit"),
      prompt: event.text,
    });

    // If inject.mjs found a pending file, stdout contains the formatted
    // validation failures. Prepend them to the user's message.
    if (result.stdout?.trim()) {
      return {
        action: "transform" as const,
        text: `${result.stdout.trim()}\n\n${event.text}`,
      };
    }
  });

  // --- Agent turn end (stop hook) ---

  pi.on("agent_end", async () => {
    if (!sessionId) return;
    await callHook(baseEvent("stop"));
  });
}
```

Key design decisions:
- **`child_process.spawn`** for stdin piping: JSON is written to the child process's stdin, avoiding all shell escaping issues.
- **Session ID** comes from `ctx.sessionManager.getSessionId()` via the `ExtensionContext` (second argument to handler).
- **Validation injection** uses the `input` event's `transform` return type: if inject.mjs returns stdout, prepend it to the user's message.
- **`tool_call`** fires preToolUse (logging only, no validation).
- **`tool_result`** fires postToolUse (may trigger validation; pending file written on failure).
- **`agent_end`** fires stop (triggers stop validation).
- **`session_start`** fires for all reasons (startup, resume, fork, reload, new). Always creates a weaver session entry, matching the kiro-cli and Claude Code pattern.
- **`session_shutdown`** is a no-op: PID-based lifecycle detection handles session closure.

**Acceptance criteria:**
- Extension loads without errors when pi starts
- `session_start` creates a weaver session via the hook
- `tool_call` logs preToolUse events
- `tool_result` logs postToolUse events and runs postToolUse validation
- `input` injects pending validation failures into the prompt via `transform`
- `agent_end` runs stop validation
- JSON payloads with special characters (quotes, backticks, `$()`) in prompts are piped correctly to the hook script

---

### Phase 4: Server and CLI Updates

#### Step 4.1: Register the pi adapter with the server

**Files:**
- **Modify** `server/src/index.ts`
- **Modify** `server/package.json`
- **Modify** `server/src/__tests__/setup-adapters.ts`

**Details:**

```typescript
// server/src/index.ts
import { piAdapter } from "@weaver/binding-pi";

registerAdapter(piAdapter);
```

Add the pi binding as a dependency in `server/package.json`:
```json
{
  "dependencies": {
    "@weaver/binding-pi": "*"
  }
}
```

```typescript
// server/src/__tests__/setup-adapters.ts
import { piAdapter } from "@weaver/binding-pi";

registerAdapter(piAdapter);
```

**Acceptance criteria:**
- Server starts without errors
- `getAdapter("pi")` returns the piAdapter
- Existing kiro-cli and Claude Code adapters still work

---

#### Step 4.2: Update the weaver CLI harness detection

**Files:**
- **Modify** `bin/weaver`

**Details:**

Update `detect_harness()` to recognize pi:

```bash
detect_harness() {
  local pid="$1"
  local pname
  pname=$(ps -p "$pid" -o comm= 2>/dev/null || echo "")

  case "$pname" in
    claude*) echo "claude-code" ;;
    pi*)     echo "pi" ;;
    *)       echo "kiro-cli" ;;
  esac
}
```

Note: `pi*` must come after `claude*` to avoid false matches. The order matters because `case` matches the first hit.

**Acceptance criteria:**
- Running `weaver rename "test"` from inside a pi session detects harness as `"pi"`
- kiro-cli and Claude Code detection unchanged

---

#### Step 4.3: Verify validation harness enum acceptance

Adding `PI` to the `Harness` enum (Step 2.1) automatically makes `--harness pi` valid in `parseArgs` because `VALID_HARNESSES` is derived from `Object.values(Harness)`.

No code changes required. Verify with a test:

**Files:**
- **Modify** `validation/src/run-validation/parse-args.test.ts`

Add test case:
```typescript
it("accepts pi harness", () => {
  const result = parseArgs([
    "node",
    "validate.js",
    "--harness",
    "pi",
    "--session-id",
    "s1",
    "--cwd",
    "/project",
    "--trigger",
    "stop",
  ]);
  expect(result.harness).toBe("pi");
});
```

**Acceptance criteria:**
- `parseArgs` with `--harness pi` produces `harness: Harness.PI`

---

#### Step 4.4: Update desktop packaging for pi binding

Bundle the pi binding's shell scripts and dist into the packaged Electron app so that local-path installs pointing at the packaged app work correctly.

**Files:**
- **Modify** `desktop/package.json`

**Details:**

Add a new `extraResources` entry for the pi binding:
```json
{
  "from": "../bindings/pi",
  "to": "bindings/pi",
  "filter": [
    "weaver-log.sh",
    "lib/**",
    "dist/**",
    "src/extension.ts",
    "package.json"
  ]
}
```

Note: `src/extension.ts` is included because pi loads extensions as TypeScript source via jiti. The `package.json` is included because it contains the `pi.extensions` field that pi uses to discover the extension entry point.

Unlike kiro and Claude Code, pi does **not** need a symlink entry in `desktop/src/install-hooks.ts`. Kiro and Claude Code require symlinks because their harnesses invoke shell scripts at a well-known path (`/usr/local/lib/weaver/bindings/.../weaver-log.sh`) configured in their hook settings. Pi's extension resolves `weaver-log.sh` relative to its own source file via `import.meta.url`, so no fixed symlink path is needed. The user runs `pi install /path/to/Weaver.app/Contents/Resources/bindings/pi` to point pi at the packaged binding.

**Acceptance criteria:**
- `npm run dist` includes `bindings/pi/` in the packaged app resources
- `pi install /path/to/Weaver.app/Contents/Resources/bindings/pi` successfully loads the extension
- The extension can resolve `weaver-log.sh` and the validation scripts via `ROOT_DIR`

---

### Phase 5: Documentation

#### Step 5.1: Add pi setup instructions

**Files:**
- **Modify** `docs/setup.md`

**Details:**

Add a new "### pi" section alongside the existing "### kiro-cli" and "### Claude Code" sections:

```markdown
### pi

Install the weaver pi package (local path):

\`\`\`bash
pi install /path/to/weaver/bindings/pi
\`\`\`

Or if using the packaged Weaver.app:

\`\`\`bash
pi install /Applications/Weaver.app/Contents/Resources/bindings/pi
\`\`\`

The extension automatically captures events and sends them to weaver.
No manual hook configuration is needed.

> **Note:** npm-published install (`pi install npm:@weaver/binding-pi`) is not yet supported because the validation scripts must be co-located with the weaver installation. This is planned for a future release.

#### What works with pi

- Event logging and session tracking
- Validation hooks (runs on stop and postToolUse)
- Validation failure injection into the next prompt
- Session rename, view, and lifecycle management via `weaver` CLI
- Skill resolution (reads from `.pi/skills/` and `~/.pi/agent/skills/`)

#### What is kiro-cli only

- Cherrypick (interactive code selection UI)
```

Also update the "Prerequisites" section to list pi as a supported harness.

**Acceptance criteria:**
- Setup instructions are clear and complete
- All supported features are listed

---

#### Step 5.2: Update README.md

**Files:**
- **Modify** `README.md`

**Details:**

Add pi to the list of supported AI coding harnesses in the opening description.

**Acceptance criteria:**
- README mentions pi alongside kiro-cli and Claude Code

---

#### Step 5.3: Document the `.weaver.json` breaking change

**Files:**
- **Modify** `docs/setup.md` (or relevant config documentation)

**Details:**

Add a note that `postToolUse` matchers now use canonical tool names:

```markdown
#### Canonical Tool Names (v1.7+)

`postToolUse` matchers use canonical tool names that work across all harnesses:

| Canonical | kiro-cli native | Claude Code native | pi native |
|-----------|-----------------|-------------------|-----------|
| `write`   | `fs_write`      | `Write`           | `write`   |
| `edit`    | (n/a)           | `Edit`            | `edit`    |
| `read`    | `fs_read`       | `Read`            | `read`    |
| `bash`    | `execute_bash`  | `Bash`            | `bash`    |

If your `.weaver.json` uses `fs_write`, update it to `write`:

\`\`\`json
{
  "validation": {
    "postToolUse": [
      { "matcher": "write", "name": "eslint", "command": "npx eslint --fix {{file}}" }
    ]
  }
}
\`\`\`
```

**Acceptance criteria:**
- Breaking change is documented with migration instructions
- Canonical name table is clear

---

## FILES TO MODIFY/CREATE

### New Files

| File | Description |
|------|-------------|
| `shared/types/tool-names.ts` | Canonical tool name enum, mapping, and `resolveToolName()` |
| `shared/types/tool-names.test.ts` | Unit tests for `resolveToolName()`: all native name mappings and passthrough |
| `bindings/pi/package.json` | Package config with pi manifest (`pi.extensions` field) |
| `bindings/pi/tsconfig.json` | TypeScript config |
| `bindings/pi/tsconfig.build.json` | Build-only TypeScript config |
| `bindings/pi/tsdown.config.ts` | Bundle config (index.ts + log-event.ts only; extension.ts stays unbundled) |
| `bindings/pi/vitest.config.ts` | Test config |
| `bindings/pi/src/index.ts` | Public export of piAdapter |
| `bindings/pi/src/adapter.ts` | HarnessAdapter implementation |
| `bindings/pi/src/adapter.test.ts` | Adapter unit tests |
| `bindings/pi/src/extension.ts` | Pi extension entry point (loaded by pi's jiti runtime as TypeScript) |
| `bindings/pi/src/log-event.ts` | STDIN → WeaverEvent logger |
| `bindings/pi/src/utils/logger.ts` | Binding-level logger |
| `bindings/pi/src/skills/agent-config.ts` | Pi agent config loader (stub for V1) |
| `bindings/pi/src/skills/agent-config.test.ts` | Agent config tests |
| `bindings/pi/weaver-log.sh` | Main hook shell script |
| `bindings/pi/weaver-log.test.sh` | Shell script test orchestrator |
| `bindings/pi/lib/pid.sh` | PID resolution |
| `bindings/pi/lib/session.sh` | Session management |
| `bindings/pi/lib/truncate.sh` | Response truncation |
| `bindings/pi/lib/validate.sh` | Validation dispatch (pi-specific: `--harness pi`, kebab-case events, `.tool_input.path` extraction) |
| `bindings/pi/lib/init.sh` | Session init (no-op for V1) |
| `bindings/pi/test/helpers.sh` | Shell test helpers |
| `bindings/pi/test/session.sh` | Shell session tests |
| `bindings/pi/test/truncation.sh` | Shell truncation tests |
| `bindings/pi/test/validation.sh` | Shell validation tests |

### Modified Files

| File | Description |
|------|-------------|
| `shared/types/index.ts` | Add `tool-names` export |
| `shared/types/harness.ts` | Add `PI = "pi"` to Harness enum |
| `bindings/kiro/src/adapter.ts` | Apply `resolveToolName` in parseEvent |
| `bindings/kiro/src/adapter.test.ts` | Update assertions: `"fs_read"` → `"read"`, `"fs_write"` → `"write"`, add passthrough test |
| `bindings/claude-code/src/adapter.ts` | Apply `resolveToolName` in parseEvent |
| `bindings/claude-code/src/adapter.test.ts` | Update assertions: `"Read"` → `"read"`, `"Write"` → `"write"`, `"Bash"` → `"bash"` |
| `validation/src/session-analysis/session-analysis.ts` | Use canonical tool names; add `edit` handling; add `extractFilePath` helper for `path`/`file_path` |
| `validation/src/session-analysis/__tests__/changed-files.test.ts` | Update to canonical names; add `edit` and `file_path` test cases |
| `validation/src/session-analysis/__tests__/agent-tested-dirs.test.ts` | Update to canonical names |
| `validation/src/run-validation/parse-args.ts` | Apply `resolveToolName` to `--tool-name` arg; add kebab-case triggers to `TRIGGER_MAP` |
| `validation/src/run-validation/parse-args.test.ts` | Add canonical name normalization tests; add kebab-case trigger tests; add pi harness acceptance test |
| `validation/src/run-validation/post-tool-use-trigger.boundary.test.ts` | Update matchers and tool names to canonical |
| `validation/src/run-validation/run-validation.test.ts` | Update matchers and tool names to canonical |
| `validation/src/run-validation/stop-trigger.boundary.test.ts` | Update tool names in makeEvent calls to canonical |
| `server/src/index.ts` | Register piAdapter |
| `server/package.json` | Add `@weaver/binding-pi` dependency |
| `server/src/__tests__/setup-adapters.ts` | Register piAdapter |
| `bin/weaver` | Add `pi*` case to `detect_harness` |
| `.weaver.json` | Update `fs_write` matchers to `write` |
| `package.json` (root) | Add `bindings/pi` to workspaces |
| `desktop/package.json` | Add `bindings/pi` to `extraResources` |
| `docs/setup.md` | Add pi setup instructions; document canonical tool name breaking change |
| `README.md` | Mention pi as supported harness |

---

## TESTING STRATEGY

### Development Workflow Level

**Complex** (ATDD + BDD + TDD): Cross-package changes spanning shared types, validation, new binding, server, CLI, and shell scripts.

### Level 1: Acceptance Criteria (ATDD)

| # | Criterion | Verification |
|---|-----------|-------------|
| AC1 | Pi sessions appear in the weaver dashboard | Install pi package, start a session, verify session appears at localhost:8143 |
| AC2 | Tool use events are logged | Use write/read/bash tools in pi, verify events appear in session detail view |
| AC3 | Stop validation runs after agent turns | Configure `.weaver.json` with a stop hook, verify it executes after agent_end |
| AC4 | PostToolUse validation runs after file writes | Configure `.weaver.json` with a `write` matcher, verify it runs after write tool |
| AC5 | Validation failures inject into next prompt | Cause a validation failure, verify the next user prompt includes failure context |
| AC6 | `weaver rename` works from pi | Run `weaver rename "test"` via pi's bash tool, verify session is renamed |
| AC7 | `weaver view` works from pi | Run `weaver view` via pi's bash tool, verify dashboard navigates to session |
| AC8 | Session shows as "open" while pi is running | Check dashboard shows session as open during active pi session |
| AC9 | Session shows as "closed" after pi exits | Exit pi, verify dashboard updates to closed |
| AC10 | Canonical tool names work across all harnesses | Verify `.weaver.json` with `"matcher": "write"` triggers for kiro, CC, and pi |
| AC11 | `extractChangedFiles` detects Claude Code Write events | Claude Code session with Write tool events produces changed files in stop validation |

### Level 2: Behavioral Scenarios (BDD)

**Scenario: Pi session lifecycle**
```
Given a pi session is started with the weaver extension loaded
When the extension receives a session_start event
Then a session entry is created in ~/.weaver/sessions.jsonl with harness "pi"
And the session ID matches pi's native session UUID
And the session appears in the weaver dashboard as "open"
```

**Scenario: Pi session resume**
```
Given a pi session was previously created with ID "abc-123"
When pi fires session_start with reason "resume" and the same session ID
Then a new session entry is created in sessions.jsonl (matching existing behavior)
And the dashboard shows the session
```

**Scenario: Tool name canonicalization across harnesses**
```
Given a kiro-cli session logs a postToolUse event with tool_name "fs_write"
When the event is parsed by the kiro adapter
Then the WeaverEvent.toolName is "write"

Given a Claude Code session logs a PostToolUse event with tool_name "Write"
When the event is parsed by the claude-code adapter
Then the WeaverEvent.toolName is "write"

Given a pi session logs a post-tool-use event with tool_name "write"
When the event is parsed by the pi adapter
Then the WeaverEvent.toolName is "write"
```

**Scenario: extractChangedFiles cross-harness path handling**
```
Given a session log contains a postToolUse event with toolName "write" and toolInput { path: "/a.ts" }
When extractChangedFiles is called
Then "/a.ts" is in the returned list

Given a session log contains a postToolUse event with toolName "write" and toolInput { file_path: "/b.ts" }
When extractChangedFiles is called
Then "/b.ts" is in the returned list

Given a session log contains a postToolUse event with toolName "edit" and toolInput { path: "/c.ts" }
When extractChangedFiles is called
Then "/c.ts" is in the returned list
```

**Scenario: Validation failure injection**
```
Given a pi session with a .weaver.json stop hook that fails
When the agent finishes a turn (agent_end fires)
Then the stop hook runs and writes a pending file
When the user submits their next prompt
Then the validation failure details are prepended to the prompt text via the "transform" action
```

**Scenario: Unknown tool names pass through**
```
Given a pi session where the agent calls a custom MCP tool "mcp_builder_mcp__InternalSearch"
When the event is parsed
Then the WeaverEvent.toolName is "mcp_builder_mcp__InternalSearch" (unchanged)
And no .weaver.json postToolUse matcher matches it
```

**Scenario: Special characters in user prompts**
```
Given a user submits a prompt containing single quotes, backticks, and $() sequences
When the extension pipes the event to weaver-log.sh via child_process.spawn stdin
Then the JSON is received intact by the shell script
And the event is logged correctly
```

**Scenario: Pi kebab-case triggers resolve correctly**
```
Given a pi session where the agent finishes a turn
When validate.sh invokes validate.mjs with --trigger post-tool-use
Then parseArgs resolves the trigger to "postToolUse"
And postToolUse validation hooks execute correctly

Given a pi session where a tool executes
When validate.sh invokes validate.mjs with --trigger pre-tool-use
Then parseArgs resolves the trigger to "preToolUse"
```

### Level 3: Unit Tests (TDD)

| Component | Tests | File |
|-----------|-------|------|
| `resolveToolName()` | Maps all known native names; passes through unknowns | `shared/types/tool-names.test.ts` |
| `extractFilePath()` | Extracts from `path`, `file_path`, handles missing/undefined | `validation/src/session-analysis/__tests__/changed-files.test.ts` |
| `piAdapter.parseEvent()` | All event types; tool name translation; session ID passthrough; unknown event throws | `bindings/pi/src/adapter.test.ts` |
| `piAdapter.skillSearchPaths()` | Returns correct workspace and global paths | `bindings/pi/src/adapter.test.ts` |
| `piAdapter.loadAgentConfig()` | Returns null (V1 stub) | `bindings/pi/src/skills/agent-config.test.ts` |
| `extractChangedFiles()` | Canonical `write` and `edit` names; `path` and `file_path` input shapes | `validation/src/session-analysis/__tests__/changed-files.test.ts` |
| `extractAgentTestedDirs()` | Canonical `bash` name | `validation/src/session-analysis/__tests__/agent-tested-dirs.test.ts` |
| `parseArgs()` | Tool name normalization via resolveToolName; kebab-case trigger resolution (`post-tool-use` → `postToolUse`, `pre-tool-use` → `preToolUse`); pi harness acceptance | `validation/src/run-validation/parse-args.test.ts` |
| Shell scripts | Session creation, event routing, PID detection, truncation, validation dispatch | `bindings/pi/weaver-log.test.sh` |

### Integration Tests

- Install the pi package in a test pi session and verify events flow to the weaver server
- End-to-end validation: configure a failing stop hook, trigger it, verify injection into next prompt

### Manual Testing Steps

1. `cd /path/to/project && pi` (with weaver extension installed via `pi install /path/to/weaver/bindings/pi`)
2. Make changes via the agent (write files, run commands)
3. Open `http://localhost:8143` and verify the session appears with correct events
4. Run `weaver rename "test session"` via pi's bash tool
5. Verify validation hooks run on agent turn completion
6. Cause a validation failure (e.g., introduce a type error) and verify injection on next prompt
7. Exit pi and verify session shows as "closed"
8. Test with prompts containing special characters: `It's a "test" with $(echo bad) and \`backticks\``

---

## RISKS & MITIGATION

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking change**: `.weaver.json` matchers using `fs_write` stop working | Users' postToolUse hooks stop triggering until they update matchers | Document the change prominently. `resolveToolName` normalizes at input, so the fix is a simple find-replace in `.weaver.json` (`fs_write` → `write`). |
| Pi extension can't find `weaver-log.sh` in distributed form | Logging and validation silently fail | Resolve path relative to `import.meta.url`. Test in both dev (`src/`) and installed package modes (`dist/`). The extension stays as TypeScript source, so `import.meta.url` always points to the source directory. |
| Shell script escaping issues with event JSON | Events with special characters in prompts/paths corrupt the JSON | Eliminated by design: `child_process.spawn` pipes JSON directly to stdin. No shell interpolation occurs. |
| `child_process.spawn` timeout kills validation before it completes | Validation results lost | Set generous timeout (120s) matching the existing kiro-cli pattern. The timeout is a safety net; validation commands have their own timeouts via `.weaver.json` `timeout_ms`. |
| Breaking change to WeaverEvent.toolName in existing session logs | Old session logs display with different tool names than new logs | Tool name translation only affects new events. Old logs retain their original tool names (they were written before canonical names existed). Dashboard rendering is unaffected since it displays whatever `toolName` is in the event. |
| `input` event transform for injection changes user message | Could confuse the model if formatting is wrong | Use the same `formatPendingOutput` format proven in kiro-cli/CC. Prepend with clear section header. |
| Pi session resume creates duplicate sessions.jsonl entries | Dashboard shows duplicate sessions | Matches existing Claude Code behavior. Server deduplicates by ID. If this becomes a problem, address with idempotent check in a follow-up. |
| `extractChangedFiles` now matches more events (Claude Code Write, all edit tools) | Stop validation triggers on files that were previously invisible | This is a bug fix, not a regression. Claude Code Write events should always have been detected. |
| **npm install path**: `pi install npm:@weaver/binding-pi` breaks `ROOT_DIR` resolution | Validation and log-event scripts are not found when the pi package is installed as an isolated npm package (outside the weaver directory tree) | V1 is scoped to local-path installs only (`pi install /path/to/weaver/bindings/pi`). Documented in setup instructions. A future enhancement can resolve `ROOT_DIR` via a well-known weaver installation path or environment variable. |

### Rollback Strategy

- Each phase is independently deployable. If canonical tool names cause issues, the pi binding can be shipped without it (using native tool names in the interim).
- The pi extension is opt-in (installed via `pi install`). Removing it restores pi to pre-weaver behavior with zero side effects.
- No database migrations: all data is JSONL append-only.

### Monitoring and Observability

- Weaver's existing `app-logs/*.log` capture server-side errors
- The pi binding logger writes to `~/.weaver/app-logs/binding-pi.log` via stderr
- Shell script errors are logged to `~/.weaver/logs/sync-errors.log`
- Extension-level errors surface in pi's own output (stderr)

---

## DEPENDENCIES

### External Systems

| System | Dependency | Required? |
|--------|-----------|-----------|
| pi (coding agent) | Runtime for the extension | Yes (peer dependency) |
| Weaver server | Must be running for dashboard and notifications | Yes for observability; validation works offline |
| Node.js 20+ | Required for log-event.mjs and validation scripts | Yes |
| jq | Used in shell scripts for JSON parsing | Yes (with regex fallback for basic field extraction) |

### Team Dependencies

- None: this is self-contained within the weaver repo

### Infrastructure Changes

- Add `bindings/pi` to the root `package.json` workspaces array
- Add `@weaver/binding-pi` dependency to `server/package.json`
- Desktop app packaging (`npm run dist`) needs to bundle `bindings/pi/` alongside existing bindings (Step 4.4)
- No new CI/CD pipelines needed (existing turbo build/test covers the new package)

### Sequencing

```
Phase 1 (Canonical Tool Names)  ─ prerequisite for all later phases
  └─► Phase 2 (Shared: Harness enum)
        └─► Phase 3 (Pi Binding Package)
              ├─► Phase 4 (Server + CLI)
              └─► Phase 5 (Documentation)
```

Phase 1 is a strict prerequisite: canonical tool names must land before the pi binding (otherwise pi inherits the hardcoded tool name problem). Phase 2 is a quick enum addition. Phase 3 is the bulk of the work. Phases 4 and 5 can proceed in parallel once Phase 3 is complete.

Within Phase 1, steps are sequential: types (1.1) → adapters (1.2) → session analysis (1.3) → validation trigger (1.4).

Within Phase 3, steps are sequential: scaffold (3.1) → adapter (3.2) → agent config (3.3) → log-event (3.4) → shell scripts (3.5) → extension (3.6). The extension depends on the shell scripts, which depend on log-event.mjs, which depends on the adapter.
