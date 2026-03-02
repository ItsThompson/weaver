# WEAVER-001: Architecture Implementation Plan

## Overview

Stand up the foundational project structure, tooling, and shared infrastructure for Weaver — a local developer tool that provides observability and conversation editing capabilities on top of kiro-cli.

### Success Criteria

- `npm run dev` from root starts both client and server with hot reload
- Client loads Cloudscape-styled shell at `http://localhost:5173` (Vite default) and proxies API calls to the server
- Server responds to health check at `http://localhost:8143/api/health`
- Shared TypeScript types are importable by both client and server
- Hook handler exists in `hook-handler/` with README instructions for manual installation
- `~/.weaver/` directory is created on first server start

### Assumptions & Constraints

- Single-developer local tool — no auth, no multi-user
- No monorepo tooling — just co-located packages
- All data is file-based (JSON/JSONL), no database
- macOS is the primary target environment
- `package-lock.json` is committed to version control
- A resumed kiro-cli chat session (via `/chat load`) is treated as a separate Weaver session because it spawns a new process with a new PID. This is acceptable because kiro-cli auto-summarizes the loaded conversation, so the new session's logs will contain that summary context.

---

## Approach

### Directory Structure

```
weaver/
├── client/                          # React + Vite + Cloudscape
│   ├── src/
│   │   ├── main.tsx                 # Entry point
│   │   ├── App.tsx                  # Root component with Cloudscape AppLayout
│   │   ├── pages/                   # Route-level components (empty shells for now)
│   │   ├── components/              # Shared UI components
│   │   ├── types/                   # Client-specific types
│   │   └── utils/                   # Client utilities (API client, etc.)
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── server/                          # Fastify + TypeScript
│   ├── src/
│   │   ├── index.ts                 # Server entry point
│   │   ├── routes/
│   │   │   └── health.ts            # Health check route
│   │   ├── services/
│   │   │   └── storage.ts           # ~/.weaver/ file operations
│   │   ├── types/                   # Server-specific types
│   │   └── utils/                   # Server utilities
│   ├── __tests__/                   # Jest unit tests (mirrors src/ structure)
│   │   └── services/
│   │       └── storage.test.ts
│   ├── jest.config.mjs              # Jest config with ts-jest
│   ├── tsconfig.json
│   └── package.json
├── shared/                          # Shared TypeScript types
│   ├── package.json                 # Minimal package for module resolution
│   ├── types.ts                     # Shared interfaces (session, conversation, etc.)
│   └── tsconfig.json
├── hook-handler/                    # Kiro CLI hook handler (manual install)
│   ├── weaver-log.sh                # Main hook handler script
│   └── README.md                    # Installation instructions
├── .gitignore                       # Git ignore rules
├── package.json                     # Root: dev scripts, concurrently
├── tsconfig.base.json               # Shared TS config
└── README.md                        # Project overview + setup instructions
```

### Key Decisions

- **Shared types via path aliases**: Both `client/` and `server/` reference `../shared/types.ts` via TypeScript path aliases. No publishing or build step needed for shared code. `shared/` includes a minimal `package.json` for tooling compatibility.
- **Vite proxy**: Client's `vite.config.ts` proxies `/api/*` to `http://localhost:8143` during development, avoiding CORS issues. No CORS middleware on the server — not needed without a production deployment.
- **tsx for server dev**: Use `tsx watch` for server hot reload during development — no separate build step needed for dev.
- **tsc-alias for production builds**: `tsc-alias` runs as a post-build step to rewrite path aliases in emitted JS, ensuring builds work without `tsx`.
- **Cloudscape**: `@cloudscape-design/components` + `@cloudscape-design/global-styles` for all UI. Use `AppLayout` as the shell with side navigation.
- **JSONL everywhere**: Both session index (`sessions.jsonl`) and per-session logs (`<session-id>.jsonl`) use JSONL format for atomic bash `>>` appends.
- **Session identification via kiro-cli PID**: Hook scripts use the parent process PID (`$PPID`) to uniquely identify each kiro-cli session. Empirically verified: kiro-cli spawns hooks as direct child processes (no intermediate shell), so `$PPID` is the stable kiro-cli PID across all hook invocations within a session. A shell-skipping process tree walk is included as a safety fallback. Session files are stored as `~/.weaver/.current-session-<CALLER_PID>`, fully supporting multiple simultaneous sessions in the same cwd.

---

## Implementation Steps

### Step 1: Root package.json, base config, and .gitignore

Create the root `package.json` with dev scripts, shared TypeScript base config, and `.gitignore`.

**Files:**
- `package.json` — root scripts using `concurrently` to run client + server
- `tsconfig.base.json` — shared compiler options (strict, ES2022, module resolution)
- `.gitignore` — `node_modules/`, `dist/`, `*.tsbuildinfo`, `.env`

**Dependencies:**
- `concurrently` (dev)

**Install workflow:** Each package (`client/`, `server/`, `shared/`) runs `npm install` independently — no npm workspaces. The root `package.json` also requires `npm install` for `concurrently`. The root `dev` script assumes all packages have been installed.

### Step 2: Shared types

Define the core TypeScript interfaces used by both client and server.

**Files:**
- `shared/package.json` — minimal package (`"name": "shared"`) with no `main` field (resolution is handled entirely via TypeScript path aliases)
- `shared/types.ts` — interfaces for:
  - `Session` (id, pid, customName, cwd, agentName, startTime, lastEventTime). The `pid` field stores the kiro-cli process ID for liveness checks.
  - `SessionWithStatus` — extends `Session` with a computed `status: "open" | "closed"` field (not stored in JSONL, derived at runtime by checking if `pid` is still running)
  - `HookEvent` (timestamp, event with hook_event_name, cwd, and optional tool fields)
  - `ConversationTurn`, `ConversationExchange`, `SavedConversation` (from WEAVER-CONTEXT.md)
  - `TangentState` (main_history, main_transcript, tangent_start_time)
- `shared/tsconfig.json`

### Step 3: Server scaffold

Set up the Fastify server with health check and the storage service.

**Files:**
- `server/package.json` — dependencies: `fastify`; dev: `tsx`, `typescript`, `tsc-alias`, `@types/node`, `jest`, `ts-jest`, `@types/jest`
- `server/tsconfig.json` — extends base, path alias for `shared/`
- `server/jest.config.mjs` — uses `ts-jest` ESM preset, maps `@shared/*` path alias and `.js` -> `.ts` extensions, sets `testMatch` to `__tests__/**/*.test.ts`
- `server/src/index.ts` — Fastify server on port 8143, register routes, global `setErrorHandler` returning `{ error: string, statusCode: number }` for consistent error responses
- `server/src/routes/health.ts` — `GET /api/health` returning `{ status: "ok" }`
- `server/src/services/storage.ts` — ensures `~/.weaver/` and `~/.weaver/logs/` exist on startup; read/write helpers for `sessions.jsonl` (parses JSONL into array on read); `cleanStaleSessions()` function that scans `~/.weaver/.current-session-*` files, checks if each PID is still running via `process.kill(pid, 0)`, and deletes stale marker files only — entries in `sessions.jsonl` are preserved to maintain session history. Runs on server startup and on a 5-minute interval.
- `server/__tests__/services/storage.test.ts` — unit tests for storage service (see Testing Strategy)

### Step 4: Client scaffold

Set up the Vite + React + Cloudscape client with routing shell.

**Files:**
- `client/package.json` — dependencies: `react`, `react-dom`, `react-router-dom`, `@cloudscape-design/components`, `@cloudscape-design/global-styles`; dev: `vite`, `@vitejs/plugin-react`, `typescript`, `tsc-alias`, `@types/react`, `@types/react-dom`
- `client/tsconfig.json` — extends base, path alias for `shared/`
- `client/vite.config.ts` — React plugin, proxy `/api` to `http://localhost:8143`
- `client/index.html` — standard Vite entry
- `client/src/main.tsx` — render App with BrowserRouter
- `client/src/App.tsx` — Cloudscape `AppLayout` with `SideNavigation` (two links: "Sessions" and "Cherrypick"), `Routes` for page placeholders
- `client/src/utils/api.ts` — thin fetch wrapper for `/api/*` calls
- `client/src/pages/SessionsPage.tsx` — placeholder
- `client/src/pages/CherrypickPage.tsx` — placeholder

Note: `AppContext.tsx` is deferred to WEAVER-002 when session state shape is defined.

### Step 5: Hook scripts

Create the improved hook script with cwd-hashed session ID handling, orphan fallback, and log truncation.

**Files:**
- `hook-handler/weaver-log.sh` — the main hook handler script:
  - Uses `$PPID` to identify the calling kiro-cli process. Includes a shell-skipping process tree walk as fallback (walks up from `$PPID`, skips `sh`/`bash`/`zsh`/`dash`/`fish`, returns first non-shell ancestor PID). Verified empirically: kiro-cli spawns hooks directly, so `$PPID` is the kiro-cli PID.
  - On `agentSpawn`: generate UUID via `uuidgen`, write session ID to `~/.weaver/.current-session-<CALLER_PID>`, append session metadata line (including `pid` field) to `~/.weaver/sessions.jsonl`, create `~/.weaver/logs/<session-id>.jsonl`
  - On all other events: read session ID from `~/.weaver/.current-session-<CALLER_PID>`. If missing, fall back to `SESSION_ID=orphan`, log warning to STDERR, and exit 0 (don't disrupt user workflow)
  - Append timestamped event to `~/.weaver/logs/<session-id>.jsonl`
  - Truncate `tool_response.result` entries longer than 500 chars (configurable via `WEAVER_MAX_RESPONSE_LENGTH` env var). Applies to all tool responses for simplicity — may be revisited per-tool based on real-world usage.
- `hook-handler/README.md` — step-by-step instructions for:
  - Copying `weaver-log.sh` to `~/.config/amazonq/global/hooks/`
  - Making it executable
  - Adding hook entries to agent config JSON
  - Example agent config snippet

### Step 6: Root README

**Files:**
- `README.md` — project overview, prerequisites (Node 20+, kiro-cli), setup instructions, data directory explanation (`~/.weaver/`), development commands

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `.gitignore` | Create | Git ignore rules (node_modules, dist, tsbuildinfo, .env) |
| `package.json` | Create | Root scripts (dev, build) with concurrently |
| `tsconfig.base.json` | Create | Shared TypeScript compiler options |
| `shared/package.json` | Create | Minimal package for module resolution |
| `shared/types.ts` | Create | Shared interfaces for sessions, hooks, conversations |
| `shared/tsconfig.json` | Create | Extends base config |
| `server/package.json` | Create | Server dependencies (fastify, tsx, tsc-alias, jest, ts-jest) |
| `server/tsconfig.json` | Create | Server TS config with shared path alias |
| `server/jest.config.mjs` | Create | Jest config with ts-jest preset and path alias mapping |
| `server/src/index.ts` | Create | Fastify entry point, port 8143, global error handler |
| `server/src/routes/health.ts` | Create | Health check endpoint |
| `server/src/services/storage.ts` | Create | ~/.weaver/ file operations (JSONL read/write) |
| `server/__tests__/services/storage.test.ts` | Create | Unit tests for storage service |
| `client/package.json` | Create | Client dependencies (react, vite, cloudscape, tsc-alias) |
| `client/tsconfig.json` | Create | Client TS config with shared path alias |
| `client/vite.config.ts` | Create | Vite config with API proxy |
| `client/index.html` | Create | Vite HTML entry |
| `client/src/main.tsx` | Create | React entry point |
| `client/src/App.tsx` | Create | Cloudscape AppLayout shell with routing |
| `client/src/utils/api.ts` | Create | API client utility |
| `client/src/pages/SessionsPage.tsx` | Create | Placeholder for observability |
| `client/src/pages/CherrypickPage.tsx` | Create | Placeholder for cherrypick |
| `hook-handler/weaver-log.sh` | Create | Hook handler script with PID-based session ID and orphan fallback |
| `hook-handler/README.md` | Create | Hook handler installation instructions |
| `README.md` | Create | Project README |

---

## Testing Strategy

### Framework & Configuration

- **Jest** with **ts-jest** for all server-side tests. Jest is the team's preferred runner and provides strong mocking support for file system interactions in `storage.ts`.
- Jest config lives in each package that has tests (initially `server/jest.config.ts`). Client-side tests will be added in WEAVER-002/003 as UI logic materializes.
- `ts-jest` handles TypeScript compilation — no separate build step needed to run tests.
- Path alias (`@shared/*`) is mapped in `jest.config.ts` via `moduleNameMapper` so shared types resolve correctly in test files.

### Test Structure

Tests live in a `__tests__/` directory at the package root, mirroring the `src/` structure:

```
server/
├── src/
│   └── services/
│       └── storage.ts
└── __tests__/
    └── services/
        └── storage.test.ts
```

### Conventions

- Test files use the `.test.ts` suffix.
- Each test file corresponds to one source module.
- Use `jest.mock()` for file system operations (`fs/promises`) — tests should never touch the real `~/.weaver/` directory.
- Use `beforeEach` to reset mocks and set up clean state.
- Group related assertions with `describe` blocks matching the function or behavior under test.

### Unit Tests

- **`server/__tests__/services/storage.test.ts`**:
  - `ensureDataDir()` — creates `~/.weaver/` and `~/.weaver/logs/` when missing, no-ops when they exist
  - `readSessions()` — parses `sessions.jsonl` into `Session[]`, returns empty array when file doesn't exist, handles malformed lines gracefully
  - `appendSession()` — appends a JSON line to `sessions.jsonl`
  - `cleanStaleSessions()` — deletes `.current-session-*` files for dead PIDs (mocking `process.kill`), leaves files for live PIDs, does NOT modify `sessions.jsonl`
- **`shared/types.ts`** — type-only, no runtime tests needed

### Integration Tests

- Server starts and responds to `GET /api/health` with `{ status: "ok" }`
- Vite proxy forwards `/api/health` to server

### Manual Testing

1. Run `npm run dev` — both client and server start
2. Visit `http://localhost:5173` — Cloudscape shell renders with side nav
3. `curl http://localhost:8143/api/health` — returns `{ "status": "ok" }`
4. Run hook script manually with piped JSON — verify `~/.weaver/logs/` and `sessions.jsonl` are created correctly
5. Run hook script without prior agentSpawn — verify orphan fallback and STDERR warning

---

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Shared types path alias breaks in production build | `tsc-alias` runs as post-build step in both `server/` and `client/` to rewrite path aliases in emitted JS. Added as dev dependency. |
| Hook script fails silently (exit code swallowed by kiro-cli) | Add error logging to STDERR in hook script; test with malformed input. Missing session file falls back to `orphan.jsonl` with STDERR warning. |
| `~/.weaver/` permissions issues | Storage service logs clear error on startup if directory creation fails |
| Concurrent hook writes corrupt JSONL | Bash `>>` append is atomic for lines under PIPE_BUF (4KB on macOS). Both `sessions.jsonl` and per-session log files use JSONL format to ensure atomic appends. |
| Multiple agents in same cwd overwrite session file | Session files are keyed by kiro-cli PID (`~/.weaver/.current-session-<CALLER_PID>`), verified empirically to be unique per kiro-cli instance. Fully supports multiple simultaneous sessions in the same cwd. Stale session files (from exited kiro-cli processes) are harmless — `cleanStaleSessions()` removes the marker files but preserves `sessions.jsonl` entries so past session history is retained. |
| Blanket 500-char truncation loses useful tool response data | Threshold is configurable via `WEAVER_MAX_RESPONSE_LENGTH` env var. May be revisited to apply per-tool truncation rules based on real-world usage. |

---

## Dependencies

- Node.js 20+
- kiro-cli installed and configured
- `uuidgen` available (ships with macOS)
- No external services or APIs

---

## Follow-ups (out of scope for WEAVER-001)

- **Linting & formatting**: Add ESLint + Prettier config at the root to enforce consistency as the codebase grows across WEAVER-002 and WEAVER-003.
