# File-Based App Logging

## Overview

Replace the console-only loggers across all three TypeScript packages (server, desktop, hook-handler) with a shared file logger that writes structured JSONL to date-based log files in `~/.weaver/app-logs/`. In the packaged Electron app, console output is lost: this gives us persistent, retrievable logs for debugging user-reported issues.

### Success criteria

- All `log()` calls across server, desktop, and hook-handler write to `~/.weaver/app-logs/YYYY-MM-DD.log`
- Each log line is valid JSON with a `source` field identifying the package
- Log files older than 30 days are deleted on startup
- Console output is preserved for dev mode
- The desktop process captures the server child's raw stdout/stderr to the log file
- Existing tests continue to pass (logger is mocked in tests)

### Assumptions and constraints

- Shell scripts in hook-handler are out of scope (they continue writing to stderr)
- No UI for log retrieval: users share the file path manually
- No log levels: everything is logged
- The shared logger uses synchronous file writes (`appendFileSync`) to match the current synchronous `console.log` pattern and avoid complicating callers with async

## Approach

### Solution design

Create a shared logger factory in `@weaver/shared` that each package wraps with its source name hardcoded. The factory handles file creation, directory creation, and date-based file naming. A separate `pruneAppLogs` function runs on server startup to delete old files.

The desktop process additionally redirects the server child's stdout/stderr streams into the log file, prefixed with `source: "server:stdout"` / `source: "server:stderr"` to capture crashes and unhandled output that bypasses the structured logger.

### Key decisions

1. **Shared module, thin wrappers**: The file-writing logic lives in `shared/logger/`. Each package's existing `logger.ts` becomes a one-liner wrapper. This avoids duplicating the file logic three times.
2. **Synchronous writes**: `appendFileSync` keeps the API synchronous, matching the existing `console.log` pattern. Log writes are small (single lines), so the performance impact is negligible.
3. **Date-based files, not rotation by size**: Simpler to reason about, easy to find logs for a specific day, and the 30-day pruning keeps disk usage bounded.
4. **Console output preserved**: The shared logger writes to both file and console. In dev mode (`npm run dev`), you still see logs in the terminal. In the packaged app, console goes nowhere but the file persists.

### Development workflow

Moderate complexity: touches 3+ packages, introduces a new shared module, has behavioral scenarios around file creation and rotation. Using Levels 1 + 2 (ATDD + BDD).

## Implementation steps

### Step 1: Add `appLogsDir` path to shared paths

Add the `appLogsDir` function to `shared/paths/paths.ts` and export it from the barrel.

**Files:**
- `shared/paths/paths.ts`: add `export const appLogsDir = () => join(weaverDir(), "app-logs");`
- `shared/paths/index.ts`: add `appLogsDir` to the export list

### Step 2: Create the shared logger module

Create `shared/logger/` with the core file-writing logic.

**Files:**
- `shared/logger/logger.ts`: the `createLogger` factory and `pruneAppLogs` function
- `shared/logger/index.ts`: barrel export

The `createLogger` function:
- Accepts a `source` string
- Returns a `log(entry: LogEntry)` function
- On each call: adds `source` to the entry, appends a JSON line to `~/.weaver/app-logs/YYYY-MM-DD.log`, and writes to console
- Creates the `app-logs/` directory on first write (lazy `mkdirSync` with a module-level flag to avoid repeated syscalls)

The `pruneAppLogs` function:
- Reads `~/.weaver/app-logs/`, deletes any `.log` files with a date prefix older than 30 days
- Called once on startup, not on every log write

The `LogEntry` type stays the same as today (timestamp, event, plus arbitrary fields).

**Files:**
- `shared/logger/logger.ts`
- `shared/logger/index.ts`
- `shared/logger/logger.test.ts`

### Step 3: Export the logger from the shared package

Add the `./logger` export to `shared/package.json` so other packages can import it.

**Files:**
- `shared/package.json`: add `"./logger"` export entry

### Step 4: Update server logger

Replace the server's logger implementation with a thin wrapper around the shared logger.

**Files:**
- `server/src/utils/logger.ts`: replace with `createLogger("server")` wrapper, re-export `LogEntry`

### Step 5: Update desktop logger

Replace the desktop's logger implementation with a thin wrapper around the shared logger.

**Files:**
- `desktop/src/utils/logger.ts`: replace with `createLogger("desktop")` wrapper, re-export `LogEntry`

### Step 6: Update hook-handler logger

Replace the hook-handler's logger implementation with a thin wrapper. The hook-handler logger currently writes to `console.error` (stderr) because stdout is reserved for hook output. The shared logger will write to both file and stderr for this package.

**Files:**
- `hook-handler/src/utils/logger.ts`: replace with `createLogger("hook-handler")` wrapper, re-export `LogEntry`

Note: `createLogger` needs a parameter or option to control whether it writes to stdout or stderr for console output. The hook-handler needs stderr; server and desktop use stdout.

### Step 7: Capture server child stdout/stderr in desktop

Update `desktop/src/server.ts` to redirect the forked server's stdout/stderr streams into the log file instead of piping to the desktop's own stdout/stderr (which goes nowhere in the packaged app).

**Files:**
- `desktop/src/server.ts`: replace `child.stdout?.pipe(process.stdout)` with a line-by-line reader that writes each line to the log file as `{ source: "server:stdout", ... }` / `{ source: "server:stderr", ... }`

### Step 8: Prune old logs on server startup

Call `pruneAppLogs` during server startup, alongside the existing `ensureDataDir`.

**Files:**
- `server/src/index.ts`: call `pruneAppLogs()` after `ensureDataDir()`

### Step 9: Document the log file location

Add the `app-logs/` directory to the data directory table in the README and configuration docs.

**Files:**
- `README.md`: add `app-logs/*.log` row to the data directory table
- `docs/configuration.md`: mention the log file path if there's a troubleshooting or data section

## Files to modify/create

| File | Change |
|------|--------|
| `shared/paths/paths.ts` | Add `appLogsDir` |
| `shared/paths/index.ts` | Export `appLogsDir` |
| `shared/logger/logger.ts` | **New**: `createLogger` factory, `pruneAppLogs`, `LogEntry` type |
| `shared/logger/index.ts` | **New**: barrel export |
| `shared/logger/logger.test.ts` | **New**: tests for file writing, pruning, directory creation |
| `shared/package.json` | Add `"./logger"` export |
| `server/src/utils/logger.ts` | Replace with shared logger wrapper |
| `desktop/src/utils/logger.ts` | Replace with shared logger wrapper |
| `hook-handler/src/utils/logger.ts` | Replace with shared logger wrapper |
| `desktop/src/server.ts` | Redirect child stdout/stderr to log file |
| `server/src/index.ts` | Call `pruneAppLogs()` on startup |
| `README.md` | Add `app-logs/` to data directory table |
| `docs/configuration.md` | Document log file path |

## Testing strategy

### Development workflow: Moderate (Levels 1 + 2: ATDD + BDD)

Touches 3+ packages, introduces a new shared module with file I/O, has clear behavioral scenarios around file creation, rotation, and cross-package integration.

### Level 1: Acceptance criteria (ATDD)

1. When the app runs, `~/.weaver/app-logs/YYYY-MM-DD.log` exists and contains JSONL entries
2. Each log line has `source`, `timestamp`, and `event` fields
3. On startup, log files older than 30 days are deleted
4. Existing tests pass without modification (logger is mocked)

### Level 2: Behavioral scenarios (BDD)

**Scenario: First log write creates directory and file**
- Given `~/.weaver/app-logs/` does not exist
- When `log({ timestamp: "...", event: "test" })` is called
- Then `~/.weaver/app-logs/YYYY-MM-DD.log` is created with one JSONL line containing `source`

**Scenario: Subsequent writes append to existing file**
- Given a log file for today already exists with 1 line
- When `log()` is called again
- Then the file has 2 lines

**Scenario: Source field identifies the package**
- Given loggers created with `createLogger("server")` and `createLogger("desktop")`
- When each logs an event
- Then the file contains lines with `"source":"server"` and `"source":"desktop"`

**Scenario: Date rollover creates a new file**
- Given a logger that wrote to `2026-04-05.log` yesterday
- When a log is written today (2026-04-06)
- Then a new `2026-04-06.log` file is created

**Scenario: Pruning deletes old logs**
- Given log files `2026-03-01.log`, `2026-03-06.log`, and `2026-04-06.log` exist
- When `pruneAppLogs()` runs on 2026-04-06
- Then `2026-03-01.log` and `2026-03-06.log` are deleted, `2026-04-06.log` remains

**Scenario: Pruning ignores non-date files**
- Given `app-logs/` contains `2026-03-01.log` and `notes.txt`
- When `pruneAppLogs()` runs
- Then `notes.txt` is not deleted

**Scenario: Server child stdout captured**
- Given the desktop process forks the server
- When the server child writes to stdout
- Then the log file contains a line with `"source":"server:stdout"`

**Scenario: Hook-handler writes to stderr and file**
- Given the hook-handler logger is initialized
- When `log()` is called
- Then the entry is written to both stderr and the log file

### Manual testing

1. Run `npm run app`, trigger some actions, verify `~/.weaver/app-logs/` contains today's log file with structured entries
2. Kill the server process to trigger an error, verify the crash is captured in the log
3. Create a fake old log file, restart the app, verify it's pruned

## Risks and mitigation

| Risk | Mitigation |
|------|------------|
| Synchronous file writes block the event loop | Log lines are small (< 1KB). `appendFileSync` for small writes is standard practice in Node.js loggers. Monitor if this becomes an issue under heavy logging. |
| Concurrent writes from multiple processes | `appendFileSync` with the `O_APPEND` flag is atomic for writes under the OS pipe buffer size (~4KB on macOS). Our JSONL lines are well under this. Multiple processes (server, desktop, hook-handler) can safely append to the same file. |
| Log directory doesn't exist on first run | Lazy `mkdirSync({ recursive: true })` on first write, guarded by a module-level flag. |
| Pruning deletes a file being written to | Pruning only targets files with dates older than 30 days. The current day's file is never pruned. |

## Dependencies

- No external libraries needed
- No infrastructure changes
- No new environment variables
- Shared package build must run before dependent packages (already handled by the monorepo's turbo pipeline)
