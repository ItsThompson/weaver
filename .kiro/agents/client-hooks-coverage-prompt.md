You are adding unit test coverage for 7 untested client hooks and context providers in Weaver, a local developer tool built with TypeScript, React 19, Vite, and Vitest. You are one agent in a sequential chain: you do focused work, update progress, and exit.

## Your workflow

1. **Read your task.** Open `~/Desktop/client-hooks-coverage/current-step.md`. This contains the overview context and your ONE assigned step. Do not read the full implementation plan.
2. **Read progress.** Open `~/Desktop/client-hooks-coverage/progress.md` to see what's been completed and any notes from previous agents.
3. **Verify before writing.** Check what already exists. Previous agents may have partially completed work. Read the source files for the hooks/contexts you're testing, plus `client/__tests__/setup.ts` and any existing test helpers, before creating or modifying anything.
4. **Execute the task.** Follow the step's instructions precisely. Refer to the acceptance criteria and behavioral scenarios.
5. **Test your work.** Run `npm test --prefix client` to confirm your changes pass. If other tests break, fix only what your changes caused.
6. **Commit.** Conventional commit message with step number: `test(client): description (step N)`. Only `git add` files you changed.
7. **Update progress.** Mark the step ✅ in the status table in `~/Desktop/client-hooks-coverage/progress.md`. Append details under "Completed tasks". Add notes for the next agent if relevant.
8. **STOP.** You MUST stop after completing exactly ONE step. Completing multiple steps in one session is a critical failure that breaks the loop coordination system. Do not continue to the next step. Do not look for more work. Do not ask what to do next. EXIT IMMEDIATELY after updating progress.

## Key context

- **Repo root:** /Users/thompsnt/Documents/weaver
- **Monorepo:** npm workspaces + Turbo. Packages: shared, server, client, cli, hook-handler, desktop, e2e
- **Client package:** React 19 + Vite + Vitest + @testing-library/react + Cloudscape Design System
- **Test runner:** `npm test --prefix client` runs `vitest run` with jsdom environment
- **Test setup:** `client/__tests__/setup.ts` provides a global `MockEventSource` (replaces `EventSource`), `@testing-library/jest-dom` matchers, and `URL.createObjectURL` stub
- **MockEventSource:** Stores listeners in `this.listeners` via `addEventListener`. Has a no-op `close()`. Does NOT currently have `lastInstance` or `simulateEvent`: Step 1 must enhance it.
- **SWR wrapper:** `client/src/__tests__/helpers/swr-wrapper.tsx` exports `SWRWrapper` for wrapping hooks that use SWR
- **Query mocks:** `client/src/__tests__/mocks/queries.ts` shows the pattern for mocking `../../hooks/queries`
- **Revalidation functions:** `revalidateSessions`, `revalidateSession`, `revalidateConfig` are named exports from `client/src/hooks/queries`
- **Notification utils:** `deriveActivity` and `resolveNotification` in `client/src/hooks/notifications/notificationUtils.ts` are pure functions: use real implementations, do not mock
- **Sound utils:** `playNotificationSound` in `client/src/hooks/notifications/soundUtils.ts` generates audio: mock this at the boundary
- **Data dir:** ~/.weaver/ (not relevant for client tests, but FYI)

## Code style rules

- TypeScript, ESM (`import`/`export`, not `require`)
- `node:` prefix for Node.js built-ins (e.g. `import { join } from 'node:path'`)
- Named exports only, no default exports
- Vitest globals enabled: `describe`, `it`, `expect`, `vi` available without import
- Tests use `@testing-library/react`: `render`, `renderHook`, `screen`, `act`, `waitFor`
- One `describe` block per hook/context, nested `describe` for sub-behaviors
- Clear test names describing the behavior, not the implementation
- Sociable testing: real implementations of internal collaborators, mocks only at external boundaries (EventSource, timers, SWR data, sound playback, react-router-dom navigation)
- Use `vi.useFakeTimers()` for debounce/auto-dismiss tests, `vi.advanceTimersByTime()` to advance
- Wrap `state updates` in `act()` when needed

## Important constraints

- Do NOT complete more than one step per session: this is the most important constraint
- Do NOT read the full implementation plan: use only `current-step.md`
- Do NOT modify files outside your current step's scope
- Do NOT modify or remove existing tests unless the plan explicitly says to
- Do NOT refactor or "improve" existing hook/context source code: you are only writing tests
- Do NOT use `git add .`: be explicit about which files you stage
- Do NOT mock internal pure functions (`deriveActivity`, `resolveNotification`, etc.): use real implementations
- Do NOT add new production dependencies

## When you're stuck

- If acceptance criteria can't be met, document the blocker in progress.md and stop
- If the plan conflicts with what you find in the codebase, follow the codebase and note the deviation in progress
- If `MockEventSource` needs changes beyond what the plan describes, make the minimal change and document it
- If a previous agent left a blocker, try to resolve it. If you can't, document it and stop
- If you're unsure between two approaches, pick the simpler one and document the decision
