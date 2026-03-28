# Audit Report: React Component Decomposition

## Summary

The codebase shows a clear split: three pages (CherrypickPage, OrphansPage, SettingsPage) follow the orchestrator/presenter pattern with extracted hooks and sub-components, while three others (SessionDetailPage, SkillDetailPage, SessionsPage) keep state management inline in the page component. SkillGraphPage is the strongest example of the target architecture. The most impactful issues are the missing hook extraction in SkillDetailPage (the most complex page without it), a flat return shape in useOrphansPage that mixes state and actions, and an impossible-state anti-pattern in ActionsCell.

## Findings

### Finding 1: SkillDetailPage is monolithic — no hook extraction, mixed concerns

- **Area**: `client/src/pages/SkillDetailPage/SkillDetailPage.tsx`
- **Observation**: At ~170 lines, this is the most complex page without hook extraction. It mixes:
  - Routing logic (4 router hooks: `useParams`, `useSearchParams`, `useNavigate`, `useLocation`)
  - Three data-fetching queries (`useSkillDetailQuery`, `useConfigQuery`, `useSkillGraphQuery`)
  - Derived state computed inline (`hasNameCollision`, `categoryOptions`, `selectedCategory`, `breadcrumbs`, `queryString`)
  - Mutation logic (`handleCategoryChange`, `handleCreateCategory`, `revalidateAll`)
  - Modal state (`showCreateModal`)
  - A redirect side-effect embedded in the render path:
    ```tsx
    if (error?.message?.includes("not found")) {
      navigate("/skills", { replace: true });
      return null;
    }
    ```
    All of this is in a single function body before the JSX return.
- **Impact**: Untestable without rendering the full component. The test file (`SkillDetailPage.test.tsx`) must mock `useParams`, set up SWR, and render into a MemoryRouter just to test category logic. A `useSkillDetail` hook would let you test state transitions, category updates, and breadcrumb derivation in isolation.
- **Suggestion**: Extract a `hooks/useSkillDetailPage.ts` returning `{ state, actions }`. State includes `isLoading`, `error`, `skill`, `categoryOptions`, `selectedCategory`, `breadcrumbs`, `hasNameCollision`, `showCreateModal`. Actions include `handleCategoryChange`, `handleCreateCategory`, `setShowCreateModal`.
- **Severity**: High

### Finding 2: SessionDetailPage has no hook extraction

- **Area**: `client/src/pages/SessionDetailPage/SessionDetailPage.tsx`
- **Observation**: The component manages two `useState` calls (`showTools`, `expandedTurns`), defines four action handlers (`handleRename`, `handleToggleWebhook`, `togglePageTools`, `toggleTurn`), computes derived state (`displayName`), and calls the data-fetching hook — all inline. The `togglePageTools` function couples two state updates:
  ```tsx
  const togglePageTools = () => {
    setShowTools((prev) => !prev);
    setExpandedTurns(new Set());
  };
  ```
  This is a signal that `showTools` and `expandedTurns` are conceptually linked and should be managed together.
- **Impact**: The test file (`SessionDetailPage.test.tsx`) tests rendering outcomes but cannot test state transitions (e.g., "toggling page tools clears expanded turns") without clicking through the UI. The 7-prop `SessionActions` component receives callbacks that originate from inline state.
- **Suggestion**: Extract `hooks/useSessionDetailPage.ts`. Group `showTools` and `expandedTurns` into a single state object or reducer.
- **Severity**: High

### Finding 3: useOrphansPage returns flat object mixing state and actions

- **Area**: `client/src/pages/OrphansPage/hooks/useOrphansPage.ts`
- **Observation**: The hook's return type `OrphansPageState` includes both data fields (`groups`, `loading`, `error`, `sessionOptions`, `selectedSessions`, `assigning`, `deleteTarget`, `deleting`) and action functions (`handleAssign`, `handleDelete`, `selectSession`, `setDeleteTarget`) in a single flat interface. Compare with `useCherrypick` which returns `{ state, actions }` and `useSettings` which also returns `{ state, actions }`.
  ```typescript
  export interface OrphansPageState {
    groups: OrphanGroup[];
    loading: boolean;
    // ... data fields ...
    handleAssign: (pid: number) => Promise<void>;
    handleDelete: () => Promise<void>;
    // ... action functions ...
  }
  ```
  The OrphansPage component destructures all 12 fields at the call site.
- **Impact**: Inconsistency across the codebase. The `{ state, actions }` pattern makes it clear what's readable vs callable, and enables passing `state` or `actions` independently to sub-components.
- **Suggestion**: Restructure to return `{ state, actions }` matching the pattern in `useCherrypick` and `useSettings`.
- **Severity**: Medium

### Finding 4: ActionsCell has impossible-state anti-pattern

- **Area**: `client/src/pages/SessionsPage/components/ActionsCell.tsx`
- **Observation**: The component uses three independent boolean states:
  ```tsx
  const [renameVisible, setRenameVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  ```
  `renameVisible` and `deleteVisible` can theoretically both be `true` simultaneously, which is an impossible UI state (you can't have both modals open). This should be a discriminated union:
  ```typescript
  type ModalState =
    | { modal: null }
    | { modal: "rename" }
    | { modal: "delete"; deleting: boolean };
  ```
  The `deleting` boolean is also only meaningful when `deleteVisible` is true, creating another impossible combination (`deleting: true, deleteVisible: false`).
- **Impact**: Low risk of actual bugs today since the actions are user-initiated, but the state space is 8 combinations when only 3 are valid. This makes reasoning about the component harder than necessary.
- **Suggestion**: Replace with a single `modalState` discriminated union.
- **Severity**: Medium

### Finding 5: SessionTable syncs server config to local state via useEffect

- **Area**: `client/src/pages/SessionsPage/components/SessionTable.tsx`
- **Observation**: The component maintains local `contentDisplay` and `pageSize` state, then syncs from server config via useEffect:

  ```tsx
  const [contentDisplay, setContentDisplay] = useState<ContentDisplayItem[]>(
    defaultContentDisplay,
  );
  const [pageSize, setPageSize] = useState(DEFAULT_CONFIG.page_size);

  useEffect(() => {
    if (!configData?.config) return;
    const stored = configData.config[configKey];
    if (stored?.length) {
      setContentDisplay(toContentDisplay(stored, defaultContentDisplay));
    }
    if (configData.config.page_size) {
      setPageSize(configData.config.page_size);
    }
  }, [configData, configKey, defaultContentDisplay]);
  ```

  This is the "sync external state to local state" anti-pattern. The local state exists only because the component needs to optimistically update preferences before the server round-trip completes. But the effect creates a frame where the component renders with defaults before the config arrives.

- **Impact**: Flash of default preferences on initial load. If config changes externally (e.g., via SSE `configChanged` event), the effect re-runs and overwrites any in-progress local edits.
- **Suggestion**: Derive `contentDisplay` and `pageSize` from `configData` with fallbacks, and only use local state for the optimistic update window during `handleConfirm`. Or extract this into a `useTablePreferences` hook.
- **Severity**: Medium

### Finding 6: OrphansPage has no barrel index.ts

- **Area**: `client/src/pages/OrphansPage/` and `client/src/App.tsx`
- **Observation**: Every other page has an `index.ts` or `index.tsx` barrel export. OrphansPage does not. App.tsx imports it directly:
  ```tsx
  import { OrphansPage } from "./pages/OrphansPage/OrphansPage";
  ```
  Compare with all other pages:
  ```tsx
  import { SessionsPage } from "./pages/SessionsPage";
  import { SessionDetailPage } from "./pages/SessionDetailPage";
  import { CherrypickPage } from "./pages/CherrypickPage";
  import { SettingsPage } from "./pages/SettingsPage";
  import { SkillGraphPage } from "./pages/SkillGraphPage";
  import { SkillDetailPage } from "./pages/SkillDetailPage";
  ```
- **Impact**: Minor inconsistency, but it means renaming the internal file would require updating App.tsx. The barrel pattern decouples the internal file structure from consumers.
- **Suggestion**: Add `index.ts` with `export { OrphansPage } from "./OrphansPage"`.
- **Severity**: Low

### Finding 7: RenameModal has dead code — unused handleOpen function

- **Area**: `client/src/components/RenameModal/RenameModal.tsx`
- **Observation**: The component defines a `handleOpen` function that is never called:

  ```tsx
  const [value, setValue] = useState(currentName ?? "");

  // Sync value when modal opens with a new name
  const handleOpen = () => setValue(currentName ?? "");
  ```

  The comment says "Sync value when modal opens with a new name" but nothing invokes `handleOpen`. This means if `currentName` changes while the modal is closed, the input will show the stale value when reopened. The `value` state is initialized once from `currentName` and never re-synced.

- **Impact**: Bug: if a session is renamed externally (e.g., via another tab), reopening the rename modal shows the old name. The fix was started (the function exists) but never wired up.
- **Suggestion**: Either call `handleOpen` via a `useEffect` keyed on `visible`, or reset `value` when `visible` transitions from `false` to `true`.
- **Severity**: Low

### Finding 8: Cross-page dependency via utility import

- **Area**: `client/src/pages/SkillDetailPage/components/CreateCategoryModal.tsx` → `client/src/pages/SettingsPage/components/SkillGraphCategoriesField/utils.ts`
- **Observation**: CreateCategoryModal imports `isValidHex` from deep inside the SettingsPage directory:
  ```tsx
  import { isValidHex } from "../../SettingsPage/components/SkillGraphCategoriesField/utils";
  ```
  This creates a cross-page coupling where SkillDetailPage depends on an internal utility of SettingsPage.
- **Impact**: Refactoring SkillGraphCategoriesField's internal structure would break SkillDetailPage. The dependency direction is wrong — shared utilities should live in a shared location.
- **Suggestion**: Move `isValidHex` to a shared utility (e.g., `client/src/utils/color.ts`) or to a shared `types/` or `utils/` directory.
- **Severity**: Low

### Finding 9: MiniPage doesn't follow directory structure conventions

- **Area**: `client/src/pages/MiniPage/`
- **Observation**: MiniPage has `MiniActivityLog.tsx` as a sibling file rather than in a `components/` subdirectory. There is no `hooks/` directory. The directory contains:
  ```
  MiniPage/
    index.ts
    MiniPage.tsx
    MiniPage.test.tsx
    MiniActivityLog.tsx
    MiniActivityLog.test.tsx
  ```
  While MiniPage is small enough that this is defensible, it breaks the convention established by other pages.
- **Impact**: Minor inconsistency. As MiniPage grows (e.g., adding session actions), the flat structure will become harder to navigate.
- **Suggestion**: Move `MiniActivityLog.tsx` into `components/MiniActivityLog/`.
- **Severity**: Low

### Finding 10: SessionsPage has no hook extraction despite stateful logic

- **Area**: `client/src/pages/SessionsPage/SessionsPage.tsx`
- **Observation**: The page is relatively thin (~80 lines) but still mixes data fetching with derived state computation inline:

  ```tsx
  const { data: sessions = [], error, isLoading } = useSessionsQuery();
  const { data: orphanData } = useOrphanCountQuery();
  const navigate = useNavigate();

  const orphanCount = orphanData?.count ?? 0;
  const open = sessions.filter((s) => s.status === "open");
  const closed = sessions.filter((s) => s.status === "closed");
  ```

  The `open` and `closed` arrays are recomputed on every render without memoization. For large session lists this is wasteful.

- **Impact**: Low — the filtering is cheap for typical session counts. But the lack of a hook means the page can't be tested without rendering.
- **Suggestion**: Extract a `useSessionsPage` hook. Memoize the `open`/`closed` splits with `useMemo`.
- **Severity**: Low

## Deepening Candidates

### Candidate 1: Category Management Cluster

- **Cluster**: `SkillGraphCategoriesField` (SettingsPage), `CreateCategoryModal` (SkillDetailPage), `buildUpdatedCategories` (SkillDetailPage/utils), `isValidHex` (SettingsPage/utils), `useCategoryColors` (SkillGraphPage/hooks)
- **Why they're coupled**: All operate on the same `skill_graph.categories` config shape. `isValidHex` is imported cross-page. `buildUpdatedCategories` and the SettingsPage's `toConfig`/`toRows` both transform the same `Record<string, SkillGraphCategoryConfig>` structure. `useCategoryColors` reads the same config to resolve colors.
- **Dependency category**: In-process (all client-side, same config shape)
- **Test impact**: `SkillGraphCategoriesField.test.tsx`, `utils.test.ts` (SettingsPage), `SkillDetailPage.test.tsx`, and `useSkillGraph.test.ts` all test aspects of category management. A unified category module with its own boundary tests would replace the scattered coverage.

### Candidate 2: Session Action Patterns

- **Cluster**: `ActionsCell` (SessionsPage), `SessionActions` (SessionDetailPage), `ActionDropdown` (shared component), `RenameModal` (shared component)
- **Why they're coupled**: Both `ActionsCell` and `SessionActions` construct similar action lists (rename, copy name, copy PID), manage rename modal visibility, and call the same API functions (`updateSessionName`, `revalidateSessions`). They share `ActionDropdown` and `RenameModal` as presentation components.
- **Dependency category**: In-process
- **Test impact**: Currently `ActionsCell` has no dedicated test file. `SessionActions` is tested indirectly through `SessionDetailPage.test.tsx`. A shared `useSessionActions` hook would centralize the action logic and be independently testable.

### Candidate 3: Notification Pipeline

- **Cluster**: `ActivityLogContext`, `NotificationContext`, `useSessionNotifications`, `notificationUtils`, `soundUtils`
- **Why they're coupled**: `ActivityLogContext` receives SSE events and produces `ActivityLogEntry` objects. `useSessionNotifications` reads entries from `ActivityLogContext` and forwards them to `NotificationContext` with sound. `notificationUtils` provides `deriveActivity` and `resolveNotification` used by `ActivityLogContext`. The data flows: SSE → ActivityLogContext → useSessionNotifications → NotificationContext → NotificationBar.
- **Dependency category**: In-process (SSE is local-substitutable via EventSource mock)
- **Test impact**: `ActivityLogContext.test.tsx`, `useSessionNotifications.test.tsx`, `NotificationContext.test.tsx`, and `notificationUtils.test.ts` each test one link in the chain. A unified notification service with a single boundary test (SSE event in → notification displayed) would be more meaningful than testing each link independently.

## Metrics

- Files examined: 52
- Findings: 10 (2 high, 3 medium, 5 low)
- Deepening candidates: 3
