# Dictation History UI — Implementation Plan

## Overview

Add a Dictation History page that displays all past dictations from `~/.weaver/dictations.jsonl`, refactor the DictationPage header to use an ActionDropdown (replacing the inline "Manage Snippets" link), and compact the preflight checks into a single summary with a click-to-expand Popover.

### Success Criteria

- A new `/dictation/history` route renders a page listing all dictation log entries, newest first
- Each entry displays as a card: timestamp heading, processed text visible, raw transcript behind an ExpandableSection
- The DictationPage header has an ActionDropdown with "Manage Snippets" and "Dictation History" items
- The "Manage Snippets" link is removed from DictationControls
- Preflight checks display as a compact "✓ X/Y checks passed" summary; clicking opens a Popover with the full breakdown and failure details
- Breadcrumb navigation: `Dictation > Dictation History`

### Assumptions & Constraints

- The dictation history file (`dictations.jsonl`) is small enough to load entirely (no pagination for now)
- The history page is read-only: no delete, edit, or copy actions
- The page is only available in Electron mode (same gate as the existing `/dictation` route)
- Follows existing patterns: `parseJsonlFile` for JSONL reading, SWR for client data fetching, Cloudscape components for UI

## Approach

### High-Level Design

The feature follows the established vertical slice pattern in the codebase:

1. **Server**: Add a `readDictationHistory` service function (mirrors `readSnippets`) and a `GET /api/dictation/history` route
2. **Client API layer**: Add `getDictationHistory` fetch function and `useDictationHistoryQuery` SWR hook
3. **New page**: `DictationHistoryPage` following the component-decomposition pattern (orchestrator + hook + card component)
4. **DictationPage modifications**: ActionDropdown in header, compact PreflightCheck with Popover

### Key Decisions

- **Reuse `parseJsonlFile`**: The existing utility handles file-not-found, malformed lines, and parsing. No need for a new parser.
- **Reverse on the server**: Return entries in reverse chronological order from the API so the client doesn't need to sort.
- **Cloudscape Popover**: First use in the codebase, but it's the right component for click-to-reveal detail on a compact summary. The project already depends on `@cloudscape-design/components`.
- **ActionDropdown reuse**: The existing `ActionDropdown` component (used by SessionDetailPage) handles the dropdown pattern. Navigation items will use `useNavigate` in the action callbacks.

### Development Workflow

**Assessed complexity: Moderate**
- Scope: new page + modified page + new API endpoint across 3 packages
- Logic: follows existing patterns closely (JSONL read, SWR query, Cloudscape cards)
- State: minimal new state (fetch + display)
- Dependencies: server, client, shared types
- Ambiguity: requirements are clear

**Levels: 1 + 2 (ATDD → BDD)**

Rationale: the feature introduces multiple user-facing flows (new page, modified controls, compact preflight) but the underlying logic is straightforward pattern replication. ATDD defines what "done" looks like, BDD covers the behavioral scenarios for each UI change. TDD is not needed since there's no complex algorithmic logic: the server function is a one-liner delegating to `parseJsonlFile`, and the client is standard fetch-and-render.

## Implementation Steps

### Step 1: Server — `readDictationHistory` service function

Add a read function to `server/src/services/dictation/history.ts` that uses `parseJsonlFile` to read `dictations.jsonl` and returns entries in reverse order. Export it from `server/src/services/dictation/index.ts`.

**Depends on**: nothing

**Files**:
- `server/src/services/dictation/history.ts` — add `readDictationHistory()`
- `server/src/services/dictation/index.ts` — add export
- `server/src/services/dictation/history.test.ts` — add tests for the new function

### Step 2: Server — `GET /api/dictation/history` route

Add the endpoint inside `registerDictationRoutes` in `server/src/routes/dictation/dictation.ts`. Returns `{ entries: DictationLogEntry[] }`.

**Depends on**: Step 1

**Files**:
- `server/src/routes/dictation/dictation.ts` — add route handler
- `server/src/routes/dictation/dictation.test.ts` — add route tests
- `server/docs/dictation.md` — add endpoint documentation

### Step 3: Client API + query hook

Add `getDictationHistory` to the API module and `useDictationHistoryQuery` to the queries module.

**Depends on**: Step 2

**Files**:
- `client/src/utils/api.ts` — add `getDictationHistory()`
- `client/src/hooks/queries/queries.ts` — add `KEYS.dictationHistory`, `useDictationHistoryQuery`, `revalidateDictationHistory`

### Step 4: DictationHistoryPage — new page

Create the page following the component-decomposition pattern:
- Orchestrator fetches data via the query hook and renders cards
- `DictationHistoryCard` displays timestamp heading, processed text, and raw transcript in an ExpandableSection
- Breadcrumb: `Dictation > Dictation History`

**Depends on**: Step 3

**Files**:
- `client/src/pages/DictationHistoryPage/index.ts` — barrel export
- `client/src/pages/DictationHistoryPage/DictationHistoryPage.tsx` — orchestrator
- `client/src/pages/DictationHistoryPage/components/DictationHistoryCard.tsx` — card component
- `client/src/pages/DictationHistoryPage/DictationHistoryPage.test.tsx` — page tests

### Step 5: Route registration

Add `/dictation/history` to `App.tsx` inside the Electron conditional block, and import the new page.

**Depends on**: Step 4

**Files**:
- `client/src/App.tsx` — add route, add import

### Step 6: DictationPage — ActionDropdown in header

Replace the "Manage Snippets" link in `DictationControls` with an `ActionDropdown` in the `DictationPage` header actions area. Dropdown items: "Manage Snippets" (navigates to `/snippets`) and "Dictation History" (navigates to `/dictation/history`).

**Depends on**: Step 5

**Files**:
- `client/src/pages/DictationPage/DictationPage.tsx` — add ActionDropdown to Header actions, add `useNavigate`
- `client/src/pages/DictationPage/components/DictationControls.tsx` — remove "Manage Snippets" button
- `client/src/pages/DictationPage/types.ts` — remove `onManageSnippets` if it exists (it doesn't currently, but verify)
- `client/src/pages/DictationPage/DictationPage.test.tsx` — update tests for new dropdown

### Step 7: DictationPage — Compact PreflightCheck with Popover

Replace the three `StatusIndicator` lines in `PreflightCheck` with a single summary line (e.g., "✓ 3/3 checks passed"). Clicking it opens a Cloudscape `Popover` showing the detailed breakdown: each check's status and failure reason.

**Depends on**: nothing (can be done in parallel with Steps 1-5)

**Files**:
- `client/src/pages/DictationPage/components/PreflightCheck.tsx` — rewrite to compact summary + Popover
- `client/src/pages/DictationPage/DictationPage.test.tsx` — update preflight-related tests

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `server/src/services/dictation/history.ts` | Modify | Add `readDictationHistory()` |
| `server/src/services/dictation/history.test.ts` | Modify | Add tests for `readDictationHistory()` |
| `server/src/services/dictation/index.ts` | Modify | Export `readDictationHistory` |
| `server/src/routes/dictation/dictation.ts` | Modify | Add `GET /api/dictation/history` route |
| `server/src/routes/dictation/dictation.test.ts` | Modify | Add route tests |
| `server/docs/dictation.md` | Modify | Document new endpoint |
| `client/src/utils/api.ts` | Modify | Add `getDictationHistory()` |
| `client/src/hooks/queries/queries.ts` | Modify | Add dictation history query + key |
| `client/src/pages/DictationHistoryPage/index.ts` | Create | Barrel export |
| `client/src/pages/DictationHistoryPage/DictationHistoryPage.tsx` | Create | Page orchestrator |
| `client/src/pages/DictationHistoryPage/components/DictationHistoryCard.tsx` | Create | Card component |
| `client/src/pages/DictationHistoryPage/DictationHistoryPage.test.tsx` | Create | Page tests |
| `client/src/App.tsx` | Modify | Add `/dictation/history` route |
| `client/src/pages/DictationPage/DictationPage.tsx` | Modify | Add ActionDropdown to header |
| `client/src/pages/DictationPage/components/DictationControls.tsx` | Modify | Remove "Manage Snippets" link |
| `client/src/pages/DictationPage/components/PreflightCheck.tsx` | Modify | Compact summary + Popover |
| `client/src/pages/DictationPage/DictationPage.test.tsx` | Modify | Update for dropdown + compact preflight |

## Testing Strategy

### Development Workflow: Moderate → Levels 1 + 2 (ATDD → BDD)

No complex algorithmic logic warrants TDD (Level 3). The server function delegates to an existing utility, and the client is standard data fetching and rendering.

### Level 1 — Acceptance Criteria (ATDD)

| # | Criterion |
|---|-----------|
| AC1 | `GET /api/dictation/history` returns all entries from `dictations.jsonl` in reverse chronological order |
| AC2 | `GET /api/dictation/history` returns `{ entries: [] }` when the file doesn't exist |
| AC3 | Navigating to `/dictation/history` renders a page with breadcrumb `Dictation > Dictation History` |
| AC4 | Each dictation entry renders as a card with timestamp heading and processed text visible |
| AC5 | Raw transcript is hidden by default and revealed via ExpandableSection |
| AC6 | DictationPage header contains an ActionDropdown with "Manage Snippets" and "Dictation History" items |
| AC7 | "Manage Snippets" navigates to `/snippets`, "Dictation History" navigates to `/dictation/history` |
| AC8 | The "Manage Snippets" link no longer appears in DictationControls |
| AC9 | Preflight checks display as a compact summary showing pass count (e.g., "3/3 checks passed") |
| AC10 | Clicking the preflight summary opens a Popover with individual check statuses and failure details |

### Level 2 — Behavioral Scenarios (BDD)

**Feature: Dictation History Page**

```
Scenario: User views dictation history with entries
  Given the dictation log contains 3 entries
  When the user navigates to /dictation/history
  Then they see 3 cards in reverse chronological order
  And each card shows the timestamp as the heading
  And each card shows the processed text

Scenario: User views dictation history with no entries
  Given the dictation log is empty or doesn't exist
  When the user navigates to /dictation/history
  Then they see an empty state message

Scenario: User expands raw transcript
  Given the user is on the dictation history page with entries
  When they click the raw transcript ExpandableSection on a card
  Then the raw transcript text becomes visible

Scenario: History page shows loading state
  Given the API request is in progress
  When the user navigates to /dictation/history
  Then they see a loading spinner

Scenario: History page shows error state
  Given the API request fails
  When the user navigates to /dictation/history
  Then they see an error message
```

**Feature: DictationPage ActionDropdown**

```
Scenario: User opens the Actions dropdown
  Given the user is on the Dictation page
  When they click the "Actions" dropdown
  Then they see "Manage Snippets" and "Dictation History" items

Scenario: User navigates to Snippets via dropdown
  Given the Actions dropdown is open
  When the user clicks "Manage Snippets"
  Then they are navigated to /snippets

Scenario: User navigates to History via dropdown
  Given the Actions dropdown is open
  When the user clicks "Dictation History"
  Then they are navigated to /dictation/history
```

**Feature: Compact Preflight Check**

```
Scenario: All checks pass
  Given Whisper, Ollama, and Microphone are all healthy
  When the preflight check renders
  Then the summary shows "3/3 checks passed" with a success indicator

Scenario: Some checks fail
  Given Whisper is healthy but Ollama is not installed
  When the preflight check renders
  Then the summary shows "2/3 checks passed" with a warning/error indicator

Scenario: User clicks summary to see details
  Given the compact preflight summary is visible
  When the user clicks on it
  Then a Popover opens showing each check's status
  And failed checks show the reason (e.g., "Install Ollama from ollama.com")

Scenario: Preflight in loading state
  Given services are still being checked
  When the preflight check renders
  Then the summary shows a loading/checking state
```

### Integration Tests

- Verify the full flow: server reads JSONL → API returns data → client renders cards
- Verify malformed JSONL lines are skipped without crashing

### Manual Testing

1. Start the Electron app, navigate to Dictation, verify the ActionDropdown appears in the header
2. Click "Dictation History" in the dropdown, verify the history page loads with breadcrumb
3. Perform a dictation, navigate to history, verify the new entry appears at the top
4. Expand a raw transcript section, verify it shows the unprocessed text
5. Verify the compact preflight check shows the correct count and Popover details
6. Verify "Manage Snippets" still navigates to the Snippets page

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large `dictations.jsonl` file causes slow page load | Degraded UX | Load all for now; the API shape (`{ entries: [] }`) supports adding pagination params later without breaking clients |
| Popover is new to the codebase: unfamiliar component | Minor dev friction | Cloudscape Popover is well-documented; behavior is straightforward (trigger + content) |
| Removing "Manage Snippets" from DictationControls could break existing tests | Test failures | Update `DictationPage.test.tsx` in the same step |

### Rollback Strategy

All changes are additive (new page, new route) or localized modifications (DictationPage header, PreflightCheck). Each step can be reverted independently via git. No database migrations or infrastructure changes.

## Dependencies

- No external systems or APIs beyond what already exists
- No new npm packages: Cloudscape `Popover`, `ExpandableSection`, `BreadcrumbGroup` are already available in the project's dependency tree
- No infrastructure or configuration changes
