# RCA: Mini mode window not resizing to content

**Date:** 2026-03-05
**Severity:** User-facing — mini mode unusable (only first session visible)
**Fixed in:** `fix(desktop): migrate build to tsdown with isolated preload bundle`

## Symptom

The mini mode window was stuck at its minimum height (60px), showing only
the first session. Users could not see or interact with their other open
sessions.

## Root cause

When the desktop build was migrated from `tsc` to `tsdown`, both
`src/main.ts` and `src/preload.ts` were configured as entry points in a
single build config:

```ts
// BROKEN — single config with multiple entries
export default defineConfig({
  entry: ['src/main.ts', 'src/preload.ts'],
  ...
});
```

tsdown treated this as one build and performed code-splitting, generating
a `preload.cjs` that started with `require("./main.cjs")`.

In Electron, the preload script runs in the **renderer** process context,
not the main process. When `preload.cjs` tried to execute `main.cjs`, it
hit main-process-only APIs (`app.whenReady()`, `new BrowserWindow()`,
etc.) that don't exist in the renderer. This threw an error **before**
`contextBridge.exposeInMainWorld()` could run.

The consequence: `window.weaver` was never defined in the renderer. The
`MiniPage` component's `useEffect` bailed out early:

```ts
const weaver = (window as any).weaver;
if (!el || !weaver?.resizeMini) return; // ← always exited here
```

No `ResizeObserver` was ever created, no `mini-resize` IPC was ever sent,
and the window stayed at `MINI_MIN_HEIGHT` (60px) — the fallback size set
by the `did-navigate-in-page` handler.

## Why it wasn't caught

1. **Silent failure** — the preload crash produced no visible error dialog
   or console output in the app window. The mini mode still opened, just
   at the wrong size.
2. **Dev mode unaffected** — in browser dev mode (`npm run dev`),
   `window.weaver` is intentionally undefined (no Electron), so the
   ResizeObserver path is always skipped. The bug only manifests in the
   packaged Electron app.
3. **No test coverage** — the Electron main/preload layer has no tests.

## Fix

Split the tsdown config into an array of two independent builds:

```ts
// FIXED — separate builds, no cross-entry code-splitting
export default defineConfig([
  { entry: ['src/main.ts'], ... },
  { entry: ['src/preload.ts'], ... },
]);
```

This ensures tsdown treats each entry as a standalone bundle with no
shared chunks between them.

## Prevention

- The tsdown config includes a comment explaining **why** the array
  syntax is required, so future contributors don't merge them back.
- Consider adding a smoke test that verifies `window.weaver` is defined
  when running in Electron (e.g., via Playwright or Electron's built-in
  test utilities).
