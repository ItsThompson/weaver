# Audit Report: Backend Patterns and Anti-Patterns

### Summary

The server and hook-handler packages are generally well-structured with thin route handlers and clear service decomposition. However, two high-severity issues stand out: `execFileSync` blocking the Node.js event loop inside the server process on recurring intervals, and non-atomic file writes to critical data files (`sessions.jsonl`, `config.json`, `orphan.jsonl`) that risk corruption on crash. The webhook system is slightly over-decomposed with one module (`session-tracker.ts`) that is essentially a Set wrapper, and the orphan assign route has a double-read race condition.

### Findings

---

- **Area**: `server/src/services/storage/lifecycle.ts`
- **Observation**: `isProcessRunning` calls `execFileSync("ps", ["-p", String(pid), "-o", "args="])` which blocks the Node.js event loop. This function is called from two interval-based background services:
  - `cleanStaleSessions` (every 5 minutes) iterates all `.current-session-*` marker files and calls `isProcessRunning` for each.
  - `startPidPolling` (every 30 seconds) iterates all sessions from `readSessions()` and calls `isProcessRunning` for each.

  In `startPidPolling`, the blocking call happens inside an `async` function, but `execFileSync` still blocks the event loop synchronously. With N active sessions, the event loop is blocked N times per poll cycle:

  ```typescript
  // lifecycle.ts:23-29
  try {
    const args = execFileSync("ps", ["-p", String(pid), "-o", "args="], {
      encoding: "utf-8",
    });
    return args.includes("kiro-cli");
  } catch {
    return false;
  }
  ```

  Additionally, there is a TOCTOU race between `process.kill(pid, 0)` (line 18) and the `execFileSync("ps", ...)` call (line 23). The process could die between these two checks, or a new process could take the PID.

- **Impact**: As the number of tracked sessions grows, the cumulative blocking time increases linearly. During each 30-second poll, the server cannot handle HTTP requests while `ps` subprocesses execute. This directly impacts the `/api/events` SSE stream and all API responsiveness.
- **Suggestion**: Replace `execFileSync` with `execFile` (callback or promisified) and make `isProcessRunning` async. The callers are already async, so this is a straightforward change. Consider batching PID checks into a single `ps` call with multiple `-p` arguments.
- **Severity**: High

---

- **Area**: `server/src/services/storage/sessions.ts`, `server/src/services/config/config.ts`, `server/src/services/orphan-storage/helpers.ts`
- **Observation**: All three modules write critical data files using direct `writeFile` without atomic write patterns (write-to-temp-then-rename). If the server process crashes or is killed mid-write, the file will be partially written and corrupt.

  `sessions.ts` (line 45):

  ```typescript
  await writeFile(sessionsPath(), content, "utf-8");
  ```

  `config.ts` (line 66-70):

  ```typescript
  await writeFile(
    configPath(),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );
  ```

  `helpers.ts` (line 57):

  ```typescript
  return writeFile(filePath, lines.length > 0 ? lines.join("\n") + "\n" : "");
  ```

  The `sessions.jsonl` file is the session index — corruption here means all session history is lost. The `config.json` file stores user configuration. The `orphan.jsonl` file stores orphan events.

- **Impact**: Data loss on crash. Since `sessions.jsonl` is rewritten entirely on every session rename, delete, or orphan assign, the window for corruption is proportional to file size. JSONL append operations (`appendSession`) are safer since partial appends only lose the last entry.
- **Suggestion**: Use write-to-temp-then-rename: write to `sessions.jsonl.tmp`, then `rename()` to `sessions.jsonl`. On POSIX systems, `rename` is atomic within the same filesystem. Apply the same pattern to `config.json` and `orphan.jsonl`.
- **Severity**: High

---

- **Area**: `server/src/routes/orphans/orphans.ts` (POST `/api/orphans/assign`)
- **Observation**: The orphan assign handler reads `sessions` twice with an async gap between reads. The first read validates the target session exists (line 33), then `assignOrphanEvents` runs (which reads and writes the orphan file), then sessions are read again (line 47) to update the PID:

  ```typescript
  const sessions = await readSessions();                    // read 1
  const targetSession = sessions.find((s) => s.id === targetSessionId);
  if (!targetSession) { ... }

  await assignOrphanEvents(targetSessionId, pid);           // async gap

  if (pid !== 0 && targetSession.pid !== pid) {
    const allSessions = await readSessions();               // read 2
    const idx = allSessions.findIndex((s) => s.id === targetSessionId);
    if (idx !== -1) {
      allSessions[idx].pid = pid;
      await writeSessions(allSessions);
    }
  }
  ```

  Between read 1 and read 2, another request could modify `sessions.jsonl` (e.g., a rename or delete). The `FileCache` mitigates this somewhat by checking mtime, but the logical race remains: the session validated in read 1 could be deleted before read 2.

- **Impact**: In the worst case, a deleted session could be silently re-referenced, or a concurrent `writeSessions` call could overwrite changes from the other request. Low probability in practice (single-user tool), but the pattern is fragile.
- **Suggestion**: Perform the validation and PID update in a single read-modify-write cycle. Read sessions once, validate, update PID, and write back.
- **Severity**: Medium

---

- **Area**: `hook-handler/src/validate/logging.ts`
- **Observation**: The fire-and-forget server notification completely swallows errors:

  ```typescript
  // logging.ts:28-34
  fetch("http://localhost:8143/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, eventName: "validation" }),
    signal: AbortSignal.timeout(1000),
  }).catch(() => {});
  ```

  This is intentionally fire-and-forget, but the empty `.catch(() => {})` means there is zero observability when the server is unreachable. Compare with the server's own fire-and-forget pattern in `events.ts` which logs the error:

  ```typescript
  // events.ts:28-33
  handleWebhookEvent(sessionId, eventName, sessionName, session).catch(
    (err) => log({ ..., error: String(err) }),
  );
  ```

- **Impact**: When the weaver server is down or slow, validation hooks silently fail to notify. Debugging "why didn't the dashboard update?" requires guessing that the notification was swallowed.
- **Suggestion**: Log to stderr on failure (this is a CLI process, so stderr is appropriate): `.catch((err) => console.error("Failed to notify server:", err))`.
- **Severity**: Medium

---

- **Area**: `hook-handler/src/validate/run-validation/parse-args.ts`
- **Observation**: The argument parser has two fragility issues:
  1. The `trigger` field is unsafely cast without validation:

     ```typescript
     trigger: args["trigger"] as "stop" | "postToolUse",
     ```

     If someone passes `--trigger foo`, it becomes `"foo"` typed as `"stop" | "postToolUse"`. The caller (`runValidation`) does check for valid triggers and falls through to `{ exitCode: 0 }`, so this doesn't crash, but it silently succeeds when it should error.

  2. The parser assumes strict `--key value` pairs with step-2 iteration:
     ```typescript
     for (let i = 2; i < argv.length; i += 2) {
       const key = argv[i]?.replace(/^--/, "");
       const val = argv[i + 1];
     ```
     A flag like `--verbose` (no value) would consume the next flag as its value, silently corrupting all subsequent arguments.

- **Impact**: Invalid trigger values silently produce exit code 0 (no validation runs). Unexpected flags corrupt argument parsing. Both are hard to debug in a child-process context where the caller only sees the exit code.
- **Suggestion**: Validate the trigger value explicitly and return exitCode 1 with a descriptive stderr message for unknown triggers. Consider using a minimal arg parser that handles flags without values.
- **Severity**: Medium

---

- **Area**: `server/src/routes/config.ts`
- **Observation**: The PUT and PATCH handlers duplicate the validation-and-write pipeline. Both call `parseAndValidateConfig`, check warnings, call `validatePathsExist`, call `writeConfig`, clear `skillCache`, and emit `configChanged`. The only difference is that PATCH merges with the current config first:

  ```typescript
  // PUT handler (lines 20-33)
  const raw = JSON.stringify(request.body);
  const { config, warnings } = parseAndValidateConfig(raw);
  if (warnings.length > 0) { return reply.status(422)... }
  const pathErrors = await validatePathsExist(config.skill_paths);
  if (pathErrors.length > 0) { return reply.status(422)... }
  await writeConfig(config);
  skillCache.clear();
  emit({ event: "configChanged", data: { ...config } });

  // PATCH handler (lines 37-52) — identical except for the merge line
  const { config: current } = await readConfig();
  const merged = { ...current, ...request.body };
  const raw = JSON.stringify(merged);
  // ... same 7 lines repeated
  ```

- **Impact**: Any change to the validation-write pipeline must be applied in two places. If one is updated and the other isn't, behavior diverges silently.
- **Suggestion**: Extract a `validateAndWriteConfig(config: WeaverConfig, reply)` helper that both handlers call after preparing their input.
- **Severity**: Medium

---

- **Area**: `server/src/routes/sessions/helpers.ts`
- **Observation**: `safeActiveSkills` and `safeConfiguredSkills` catch all errors and return empty arrays:

  ```typescript
  export function safeActiveSkills(...): string[] {
    try {
      return extractActiveSkillPaths(events).map(skillNameFromPath);
    } catch {
      return [];
    }
  }

  export async function safeConfiguredSkills(...): Promise<string[]> {
    try {
      return await resolveConfiguredSkills(session.agentName, session.cwd);
    } catch {
      return [];
    }
  }
  ```

  These are called from the GET `/api/sessions/:id` handler. If skill resolution is broken (e.g., a bug in `resolveConfiguredSkills`), the API silently returns empty skill arrays with no indication of failure.

- **Impact**: Bugs in skill resolution are invisible to the user. The dashboard shows "no skills" instead of an error, making it impossible to distinguish "no skills configured" from "skill resolution is broken."
- **Suggestion**: Log the caught error before returning the empty array, so failures are at least visible in server logs.
- **Severity**: Medium

---

- **Area**: `server/src/index.ts` (service startup)
- **Observation**: The initial poll calls in `startPidPolling` and `startKeepAwake` are fire-and-forget async calls that could produce unhandled rejections:

  ```typescript
  // lifecycle.ts:79-80
  export function startPidPolling(onSessionClosed: ...): void {
    const poll = async () => { ... };
    poll();  // not awaited, no .catch()
    pidPollInterval = setInterval(poll, PID_POLL_INTERVAL_MS);
  }

  // keep-awake.ts:30-31
  export function startKeepAwake(scriptPath: string): void {
    const poll = async () => { ... };
    poll();  // not awaited, no .catch()
    interval = setInterval(poll, POLL_INTERVAL_MS);
  }
  ```

  The `poll` functions in both cases do have internal try/catch, so in practice rejections are caught. But if `readSessions()` throws before the try/catch (e.g., in `startPidPolling`), it would be an unhandled rejection. In `keep-awake.ts`, the entire poll body is wrapped in try/catch, so it's safer.

- **Impact**: Low in practice since the internal error handling is present, but the pattern is inconsistent. `startPidPolling`'s `poll` function does not wrap the `readSessions()` call in try/catch — it relies on the `async` function's implicit rejection handling.
- **Suggestion**: Add `.catch()` to the initial `poll()` calls, or ensure the entire poll body is wrapped in try/catch (as `keep-awake.ts` already does).
- **Severity**: Low

---

- **Area**: `server/src/services/webhook/session-tracker.ts`
- **Observation**: This module is 10 lines wrapping a `Set<string>`:

  ```typescript
  const enabledSessions = new Set<string>();
  export const isWebhookEnabled = (sessionId: string) => enabledSessions.has(sessionId);
  export const setWebhookEnabled = (sessionId: string, enabled: boolean) => { ... };
  export const clearAll = () => enabledSessions.clear();
  ```

  The interface is nearly as complex as the implementation. It's imported by `handler.ts` and the route layer (`sessions.ts`), and re-exported through `webhook/index.ts`. The module exists purely for testability (the test file `session-tracker.test.ts` is 30 lines testing Set operations).

- **Impact**: Adds a file, an import, and a re-export for what could be a private `Set` inside `handler.ts`. The test for this module asserts on Set behavior rather than meaningful business logic.
- **Suggestion**: Inline the Set into `handler.ts` and test webhook enable/disable behavior through the `handleWebhookEvent` integration tests instead.
- **Severity**: Low

---

- **Area**: `hook-handler/src/validate/glob.ts`
- **Observation**: The `matchesExtensionGlob` function has a surprising fallback: if the pattern doesn't match the expected formats (`*.{ts,tsx}` or `*.ts`), it returns all files unfiltered:

  ```typescript
  // glob.ts:16
  return files; // unrecognized pattern → don't filter
  ```

  This means a typo in a `run_if_files_match` pattern (e.g., `src/**/*.ts` instead of `**/*.ts`) would silently match everything, running the hook on all changed files instead of the intended subset.

- **Impact**: User configuration errors are silently accepted and produce unexpected behavior (hooks run when they shouldn't). The function name suggests glob matching but only supports extension patterns.
- **Suggestion**: Return an empty array for unrecognized patterns (fail closed), or log a warning. The function name and the config field name (`run_if_files_match`) suggest full glob support, which this doesn't provide.
- **Severity**: Low

### Deepening Candidates

- **Cluster**: `webhook/session-tracker.ts` + `webhook/handler.ts`
- **Why they're coupled**: `session-tracker` is only used by `handler.ts` (to check `isWebhookEnabled`) and the route layer (to call `setWebhookEnabled`). The handler already orchestrates all webhook logic; the session tracker is a private implementation detail exposed as a separate module.
- **Dependency category**: In-process
- **Test impact**: `session-tracker.test.ts` (30 lines testing Set operations) would be replaced by assertions on `handleWebhookEvent` behavior when webhooks are enabled/disabled. The existing `webhook-simple.test.ts` and `webhook-advanced.test.ts` already test the handler with mocked config.

---

- **Cluster**: `config.ts` PUT and PATCH route handlers → shared `validateAndWriteConfig` helper
- **Why they're coupled**: Both handlers share the exact same 7-line validation-write-emit pipeline. They differ only in how the input `WeaverConfig` is prepared (PUT uses the body directly, PATCH merges with current config).
- **Dependency category**: In-process
- **Test impact**: No existing route-level tests would change. The extracted helper could be unit-tested independently, replacing the need to test the pipeline through both HTTP methods.

### Metrics

- Files examined: 42
- Findings: 10 (2 high, 5 medium, 3 low)
- Deepening candidates: 2
