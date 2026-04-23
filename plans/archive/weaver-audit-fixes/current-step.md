# Implementation Plan: Weaver Audit Fixes

## OVERVIEW

Fix 9 high-severity findings from the codebase audit, shipped as a single branch.

### Fixes included

| # | Finding | Category |
|---|---------|----------|
| 1 | Non-atomic file writes to sessions.jsonl, config.json, orphan.jsonl | Data integrity |
| 2 | `execFileSync` blocks the event loop in `isProcessRunning` | Runtime safety |
| 3 | 7 module-level mutable singletons prevent isolated testing | Architecture |
| 4 | 53+ raw `console.log`/`console.error` calls across hook-handler, cli, desktop | Observability |
| 5 | No Zod validation on server route request bodies | Validation |
| 6 | `lifecycle.ts` orchestration functions completely untested | Test coverage |
| 7 | CherrypickPage: 0 test files for the entire feature | Test coverage |
| 8 | SkillDetailPage is monolithic — no hook extraction | Frontend structure |
| 9 | SessionDetailPage has no hook extraction | Frontend structure |

### Success criteria

- All existing tests pass (no regressions)
- `npm test` passes in all workspace packages
- `npm run build` succeeds in all workspace packages
- Each fix has its own acceptance tests as specified per step

### Assumptions and constraints

- macOS-only tool; `rename()` is atomic on POSIX within the same filesystem
- Node.js 18+ (global `fetch` available, `execFile` from `child_process` available)
- Turborepo monorepo with 6 workspace packages: `server`, `client`, `cli`, `hook-handler`, `desktop`, `shared`
- The `shared/sync/` relocation (original finding #3) is explicitly out of scope
- Existing test infrastructure uses Vitest with `vi.mock()` patterns
- The `createPendingTracker()` factory in `server/src/services/webhook/pending-tracker.ts` is the reference pattern for singleton refactors

## APPROACH

### High-level solution design

1. **Atomic writes**: Create a `server/src/utils/atomic-write.ts` utility that writes to a `.tmp` sibling then calls `rename()`. Apply to the 3 write sites.
2. **Async PID checking**: Replace `execFileSync("ps", ...)` with promisified `execFile`. Make `isProcessRunning` async. Update all callers.
3. **Factory pattern for singletons**: Convert 5 modules to factory functions following the `createPendingTracker` pattern. Each factory encapsulates mutable state and returns a controller object. Export a default instance so all existing imports continue to work unchanged.
4. **Structured logging**: Create a `print()` function for CLI user-facing output. Convert `console.error` calls in hook-handler and desktop to structured `log()` calls with context.
5. **Zod route validation**: Add `zod` and `zod-to-json-schema` to the server package. Define Zod schemas for each route body. Wire into Fastify's `schema: { body }` option for automatic 400 responses.
6. **Lifecycle tests**: Test `startPidPolling` and `startStaleSessionCleanup` against the new factory interface using fake timers and injected dependencies.
7. **CherrypickPage tests**: Test `useCherrypick` hook with `renderHook` covering the 3-phase state machine.
8. **SkillDetailPage hook extraction**: Extract `useSkillDetailPage` returning `{ state, actions }`.
9. **SessionDetailPage hook extraction**: Extract `useSessionDetailPage` returning `{ state, actions }`.

### Key architectural decisions

- **Factory pattern preserves backward compatibility**: Each refactored module exports both a `createX()` factory AND destructured exports from a default instance. No existing import statements need to change. Route handlers, server index.ts, and barrel exports remain untouched.
- **Dependency injection via factory params**: Factory functions accept their cross-module dependencies as parameters (e.g., `createLifecycleManager({ readSessions, isProcessRunning })`). Default instances wire in the real implementations. Tests inject mocks.
- **Zod schemas as source of truth**: Zod schemas define the runtime validation. `zod-to-json-schema` converts them for Fastify's built-in Ajv validation. Manual `typeof` checks are removed from handlers.
- **`print()` vs `log()` split**: CLI user-facing output uses `print()` (writes to stdout, human-readable). Diagnostic/error output uses structured `log()` (JSON to stderr). hook-handler and desktop convert all `console.*` to structured logging.

### Development workflow

| Step | Complexity | Levels | Rationale |
|------|-----------|--------|-----------|
| 1 (atomic writes) | Simple | ATDD | Single responsibility, follows data-safety pattern |
| 2 (async isProcessRunning) | Simple | ATDD | Mechanical sync→async conversion |
| 3 (structured logging) | Simple | ATDD | Mechanical replacement, no new logic |
| 4 (factory: event-bus) | Moderate | ATDD + BDD | New state encapsulation pattern, 2 modules touched |
| 5 (factory: storage + lifecycle + tests) | Complex | ATDD + BDD + TDD | Cross-module deps, interval management, PID tracking state machine |
| 6 (factory: keep-awake + log-parser) | Moderate | ATDD + BDD | Same pattern as step 4, 2 modules |
| 7 (Zod route validation) | Moderate | ATDD + BDD | Multiple routes, schema design, Fastify integration |
| 8 (CherrypickPage tests) | Moderate | ATDD + BDD | 3-phase state machine, file parsing, selection logic |
| 9 (SkillDetailPage extraction) | Moderate | ATDD + BDD | Multiple queries, derived state, mutations |
| 10 (SessionDetailPage extraction) | Moderate | ATDD + BDD | Linked state, action handlers |


---

# YOUR TASK — Step 10 (do ONLY this step, then stop)

### Step 10: SessionDetailPage hook extraction

**Workflow**: Moderate → ATDD + BDD

**Depends on**: Nothing

**Goal**: Extract state management from `SessionDetailPage.tsx` into a `useSessionDetailPage` hook returning `{ state, actions }`. Group `showTools` and `expandedTurns` into linked state.

**What to do**:

1. Read `client/src/pages/SessionDetailPage/SessionDetailPage.tsx` (the full file).

2. Create `client/src/pages/SessionDetailPage/hooks/useSessionDetailPage.ts`:
   - Move all hooks, state, derived values, and handlers from the page component into this hook
   - The hook accepts no parameters (reads route params via `useParams`, `useNavigate`)
   - Group `showTools` and `expandedTurns` into a single state concept since `togglePageTools` resets `expandedTurns`:
     ```typescript
     // Internal state — these are conceptually linked
     const [showTools, setShowTools] = useState(true);
     const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());
     ```
   - Return type:
     ```typescript
     interface SessionDetailState {
       id: string | undefined;
       isLoading: boolean;
       error: Error | undefined;
       session: SessionWithStatus | null;
       turns: TurnGroup[];
       webhookEnabled: boolean;
       activeSkills: string[];
       configuredSkills: string[];
       showTools: boolean;
       expandedTurns: Set<number>;
       displayName: string;
     }

     interface SessionDetailActions {
       handleRename: (name: string) => Promise<void>;
       handleToggleWebhook: () => Promise<void>;
       togglePageTools: () => void;
       toggleTurn: (turnId: number) => void;
       refresh: () => void;
       navigate: (href: string) => void;
     }
     ```

3. Update `client/src/pages/SessionDetailPage/SessionDetailPage.tsx`:
   - Import and call `useSessionDetailPage()`
   - Destructure `{ state, actions }`
   - The component becomes a pure renderer
   - Keep the JSX structure identical

4. Create `client/src/pages/SessionDetailPage/hooks/useSessionDetailPage.test.ts`:
   - Mock `useSessionQuery` and router hooks
   - Test state derivation: `displayName` falls back correctly
   - Test `togglePageTools`: resets `expandedTurns` to empty set and toggles `showTools`
   - Test `toggleTurn`: adds/removes turn IDs from `expandedTurns`
   - Test `handleRename`: calls `updateSessionName` and triggers `mutate`
   - Test `handleToggleWebhook`: calls `toggleSessionWebhook` with inverted value

5. Verify existing test `SessionDetailPage.test.tsx` still passes.

**Acceptance criteria**:
- Given `useSessionDetailPage`, when called, then it returns `{ state, actions }` with all state and handlers
- Given the SessionDetailPage component, when rendered, then it contains no `useState`, `useParams`, or `useNavigate` calls
- Given `togglePageTools` is called, when `expandedTurns` has entries, then `expandedTurns` is cleared and `showTools` is toggled
- Given the existing `SessionDetailPage.test.tsx`, when run, then all tests pass unchanged
- All client tests pass: `cd client && npx vitest run`

**BDD scenarios**:

Scenario: Toggle page tools clears expanded turns
- Given `showTools` is true and `expandedTurns` contains `{1, 3}`
- When `togglePageTools` is called
- Then `showTools` is false and `expandedTurns` is empty

Scenario: Toggle individual turn
- Given `expandedTurns` is empty
- When `toggleTurn(5)` is called
- Then `expandedTurns` contains `{5}`
- When `toggleTurn(5)` is called again
- Then `expandedTurns` is empty

Scenario: Display name fallback
- Given a session with `customName: null` and `id: "abc12345-..."`
- When the hook is rendered
- Then `displayName` is "Session abc12345"

Scenario: Display name uses custom name
- Given a session with `customName: "My Project"`
- When the hook is rendered
- Then `displayName` is "My Project"

**Done when**: `useSessionDetailPage` hook exists. `SessionDetailPage.tsx` is a thin orchestrator. Hook tests pass. Existing page tests pass. All client tests pass.

