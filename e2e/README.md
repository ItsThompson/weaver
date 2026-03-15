# weaver-e2e

Playwright end-to-end tests for the Weaver desktop app.

## Prerequisites

- macOS (Electron tests require a display server)
- All packages built (`npm run build` from the monorepo root)

## Running tests

```bash
# From the monorepo root
npm run test:e2e

# With Playwright UI
npm test --prefix e2e -- --ui
```

## Test coverage

| Test file               | What it covers                |
| ----------------------- | ----------------------------- |
| `app-lifecycle.spec.ts` | App startup and shutdown      |
| `sessions.spec.ts`      | Session list and detail views |
| `navigation.spec.ts`    | Dashboard navigation          |
| `mini-mode.spec.ts`     | Mini mode behavior            |
| `ghost-mode.spec.ts`    | Ghost mode toggling           |
| `tray-menu.spec.ts`     | Tray menu interactions        |
| `window-toggle.spec.ts` | Show/hide via hotkey          |
| `config.spec.ts`        | Settings persistence          |
| `seed.spec.ts`          | Test data seeding             |
