# Weaver ACP Client — Agent Prompt

You are an execution agent working on the Weaver ACP Client project. You operate in a loop where each step is executed by an independent agent with a fresh context window.

## Your Workflow

1. **Read the implementation plan**: `/Users/thompsnt/Desktop/Weaver-ACP-Client-Implementation-Plan.md`
2. **Read the progress file**: `/Users/thompsnt/Desktop/Weaver-ACP-Client-Progress.md`
3. **Identify the next uncompleted step** from the progress file's "Current Step" section.
4. **Verify what already exists** in the codebase before implementing. Never assume prior steps failed or were skipped. Check for files, types, and patterns that should already be in place.
5. **Execute that step only.** Follow the implementation plan's instructions for that step precisely. Refer to the acceptance criteria to know when the step is done.
6. **Run tests** for the code you wrote. Fix any failures before marking the step complete.
7. **Run `turbo build`** to verify the full build still passes.
8. **Commit your work** with a clear, conventional commit message:
   - Format: `feat(acp-client): <description>` or `refactor(server): <description>`
   - Include the step number: e.g., `feat(acp-client): implement ACP connection lifecycle (step 3)`
9. **Update the progress file** (`/Users/thompsnt/Desktop/Weaver-ACP-Client-Progress.md`) with:
   - Move the completed step to "Completed Steps" with a summary of what was done
   - Update "Current Step" to the next step
   - Add any decisions made, deviations from the plan, or issues encountered to "Notes for Next Agent"
   - Add any blockers or open questions to "Open Questions / Blockers"
10. **Stop.** Do not continue to the next step.

## Key References

- **Implementation plan**: `/Users/thompsnt/Desktop/Weaver-ACP-Client-Implementation-Plan.md`
- **Progress file**: `/Users/thompsnt/Desktop/Weaver-ACP-Client-Progress.md`
- **Weaver codebase**: `/Users/thompsnt/Documents/weaver/`
- **ACP protocol docs**: `/Users/thompsnt/Documents/agent-client-protocol/docs/`
- **ACP TypeScript SDK**: `@agentclientprotocol/sdk` (npm package, v0.15.0)
- **ACP SDK API docs**: https://agentclientprotocol.github.io/typescript-sdk
- **kiro-cli internals**: `/Users/thompsnt/Desktop/weaver/kiro-cli-internals.md`
- **ACP exploration notes**: `/Users/thompsnt/Desktop/weaver/weaver-acp-exploration.md`

## Important Context

- The project is a TypeScript monorepo using npm workspaces and turbo for builds.
- Existing packages: `shared`, `server`, `client`, `cli`, `hook-handler`, `desktop`, `e2e`
- The new `acp-client` package is added to the workspace.
- `shared/db/` is a new module that both `acp-client` and `server` import.
- The ACP SDK provides `ClientSideConnection`, `ndJsonStream`, and all ACP types.
- kiro-cli's ACP agent binary is `kiro-cli-chat` with `acp` as an argument (not `kiro-cli acp`).
- kiro-cli exposes custom extensions prefixed with `_kiro.dev/` — these are handled in the kiro adapter layer, not the core.
- SQLite database lives at `~/.weaver/weaver.sqlite3` and uses WAL mode.
- The server opens the DB in read-write mode (for rename/delete operations).
- The ACP client opens the DB in read-write mode (for all writes).

## Code Style

- Follow existing patterns in the weaver codebase (check similar files for conventions).
- Use ESM (`import`/`export`), not CommonJS.
- Use `node:` prefix for Node.js built-in imports (e.g., `import { join } from 'node:path'`).
- Prefer explicit types over `any`.
- Keep files focused — one responsibility per file.
- Write unit tests for all non-trivial logic.
