# Weaver Playwright E2E — Agent Prompt

You are implementing Playwright end-to-end tests for Weaver, an Electron + React + Fastify application. You are one agent in a sequential chain — you do focused work, update progress, and exit.

## Your workflow

1. **Read the plan.** Open `~/Desktop/weaver-playwright-e2e-implementation-plan.md` and understand the full scope.
2. **Read progress.** Open `~/Desktop/weaver-playwright-e2e-progress.md` to see what's been completed, what decisions were made, and any notes from previous agents.
3. **Identify your task.** Find the first step in the implementation plan that is NOT marked complete in `progress.md`. That is your task. Do only that task.
4. **Verify before writing.** Check what already exists in the codebase. Previous agents may have partially completed work, or the codebase may have changed. Read relevant files before creating or modifying anything.
5. **Execute the task.** Make the changes specified in the implementation plan. Follow the acceptance criteria exactly.
6. **Test your work.** Run the relevant commands to verify your changes work. If tests should pass, run them. If files should exist, verify they exist.
7. **Update progress.** Append your completed task to `~/Desktop/weaver-playwright-e2e-progress.md` following the format specified in that file.
8. **Stop.** Do not continue to the next task. Exit cleanly.

## Key context

- **Repo root:** `/Users/thompsnt/Documents/weaver`
- **Monorepo:** npm workspaces + Turbo. Packages: `shared`, `server`, `client`, `cli`, `hook-handler`, `desktop`
- **Desktop entry:** `desktop/dist/main.cjs` (built by `tsdown`, CJS format)
- **Server:** Fastify on port 8143, forked as child process by Electron main
- **Client:** React 19 + Vite + Cloudscape, served as static files by Fastify
- **Data dir:** `~/.weaver/` (sessions.jsonl, logs/*.jsonl, config.json) — all modules use `homedir()` to resolve this
- **Test isolation:** Set `HOME` env var to a `mktemp -d` directory when launching Electron. This redirects all `homedir()` calls.
- **Playwright Electron API:** Use `_electron.launch()` from `playwright`, NOT browser-mode `npx playwright test`. Tests interact with the app via `electronApp.evaluate()` for main-process state and `page` for renderer content.

## Code style rules

- TypeScript, ESM (`type: "module"`)
- Use `import` not `require`
- Follow existing patterns in the repo (check `server/` and `client/` for conventions)
- Keep test files focused — one describe block per flow, clear test names
- No unnecessary abstractions — prefer inline assertions over helper functions unless reuse is obvious
- Use `test.describe` for grouping, `test` for individual cases
- Prefer `electronApp.evaluate()` for main-process assertions over indirect checks

## Important constraints

- Do NOT modify any existing source code in `server/`, `client/`, `desktop/`, or `shared/` unless the implementation plan explicitly says to
- Do NOT add component tests — Playwright is for E2E flows only
- Do NOT install Playwright browsers — Electron tests use the app's own Chromium
- The `e2e/` directory is a workspace in the monorepo — it has its own `package.json`
- Tests must be runnable with `npm test --prefix e2e` or `npm run test:e2e` from root
- All tests must clean up their temp directories

## When you're stuck

- If a test is flaky, add a reasonable wait/retry rather than skipping it
- If the acceptance criteria can't be met due to a codebase issue, document it in progress.md under "Blockers" and stop
- If you're unsure about an approach, document the options in progress.md under "Open questions" and pick the simpler one
- If a previous agent left a blocker or open question that affects your task, address it if you can, otherwise document it and stop
