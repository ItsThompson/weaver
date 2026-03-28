# Audit Brief: Architectural Depth and Coupling

## Your role

You are a codebase auditor focused on: evaluating module boundaries, dependency direction, interface depth, and coupling between the six workspace packages in this Turborepo monorepo.

## What to look for

- **Cross-package coupling**: Trace how `server`, `client`, `hook-handler`, `cli`, and `desktop` depend on `shared`. Are there cases where packages import from each other outside of `shared`? Does `shared` contain logic that belongs in a specific package?
- **Module-level mutable state**: The server uses module-level `Set`s and `setInterval` handles in `server/src/services/storage/lifecycle.ts` and `server/src/services/event-bus.ts`. Assess whether this state creates hidden coupling between modules or makes testing harder.
- **Shallow vs deep modules**: Identify modules that expose many methods with little implementation behind them (shallow) vs modules with small interfaces hiding complex logic (deep). Pay special attention to barrel `index.ts` files that re-export everything — are they creating a useful abstraction or just forwarding?
- **Server entry point coupling**: `server/src/index.ts` creates the Fastify instance at module level and wires all routes and services together. Evaluate whether this creates tight coupling that makes individual services hard to test or replace.
- **Desktop ↔ Server communication**: The desktop package (`desktop/src/main.ts`) communicates with the server via HTTP and SSE. Assess whether this boundary is clean or if there are implicit contracts (e.g., hardcoded URLs, assumed response shapes) that could break silently.
- **Sync logic placement**: `shared/sync/` contains file-patching logic (`patch-agent-config.ts`, `project-config.ts`) that reads/writes to disk. Evaluate whether this belongs in `shared` or should live closer to its consumers (`cli` and `hook-handler`).
- **Event bus design**: `server/src/services/event-bus.ts` is a pub/sub system using a module-level `Set<Listener>`. Assess whether this is a deep module with a clean interface or a leaky abstraction.

## Exploration guidance

Start with the dependency graph:

- Read `package.json` in each workspace (`server/`, `client/`, `cli/`, `hook-handler/`, `desktop/`, `shared/`) to map inter-package dependencies.
- Read `shared/types/index.ts` and all files it re-exports (`session.ts`, `events.ts`, `config.ts`, `validation.ts`, `skills.ts`) to understand the shared type surface.
- Read `shared/sync/` — this is the most logic-heavy part of `shared` and the most likely coupling concern.

Then trace the server's internal architecture:

- `server/src/index.ts` — entry point, wires everything together.
- `server/src/services/event-bus.ts` — the SSE pub/sub system.
- `server/src/services/storage/lifecycle.ts` — module-level state, interval management, PID polling.
- `server/src/services/storage/sessions.ts` — session CRUD.
- `server/src/routes/sessions/sessions.ts` — route handler that orchestrates multiple services.

For desktop coupling:

- `desktop/src/main.ts` — Electron entry, calls server APIs.
- `desktop/src/config.ts` — fetches/puts config via HTTP.
- `desktop/src/sse.ts` — subscribes to server SSE stream.

Grep for cross-package imports: `from "@weaver/` to see which packages import what.

## Report format

Write your report as a markdown file with this structure:

### Summary

2-3 sentence overview of what you found.

### Findings

For each finding, include:

- **Area**: Which modules/files are involved
- **Observation**: What you found (be specific: quote code, name files, show structure)
- **Impact**: Why this matters (testability, maintainability, coupling, correctness)
- **Suggestion**: What could be improved (directional, not a full design)
- **Severity**: High / Medium / Low

Order findings by severity (high first).

### Deepening Candidates

If you identified modules that would benefit from deepening (merging shallow modules into a deep module with a small interface hiding complex implementation), list them here:

- **Cluster**: Which modules/concepts are involved
- **Why they're coupled**: Shared types, call patterns, co-ownership of a concept
- **Dependency category**: In-process / Local-substitutable / Remote but owned / True external
- **Test impact**: What existing tests would be replaced by boundary tests

### Metrics

- Files examined: N
- Findings: N (H high, M medium, L low)
- Deepening candidates: N
