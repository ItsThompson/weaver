# RCA: Skill graph categories not loading on Settings page

## Symptom

Navigating directly to `/settings` showed "No categories configured" in the skill graph categories editor, even though `~/.weaver/config.json` had five categories defined and the skill graph page rendered them correctly.

Navigating to `/skills` first and then to `/settings` made the categories appear.

## Root cause

Two layers of duplicated state created a timing gap that caused `SkillGraphCategoriesField` to mount with stale data.

**Layer 1: `useSettings` copied SWR data into local state via `useEffect`.**

```typescript
const { data, isLoading } = useConfigQuery();
const [config, setConfig] = useState<WeaverConfig>(DEFAULT_CONFIG);

useEffect(() => {
  if (data?.config) setConfig(data.config);
}, [data]);
```

`isLoading` and `data` update during the render. `setConfig` inside `useEffect` runs after the render. This creates one render where:

- `isLoading` = false
- `data` = API response with categories
- `config` = still `DEFAULT_CONFIG` (empty categories)

**Layer 2: `SkillGraphCategoriesField` copied config into its own local `rows` state.**

```typescript
const [rows, setRows] = useState<CategoryRow[]>(() =>
  toRows(config.skill_graph?.categories ?? {}),
);
```

`useState` only runs its initializer once. `config` was `DEFAULT_CONFIG` at that point, so `rows` locked in as `[]`. When `useEffect` fired on the next render and `config` updated to the real data, `rows` stayed empty because nothing re-synced them.

The underlying issue was component architecture: two levels of state duplication meant the child snapshotted stale parent state at mount time.

## Why `/skills` first made it work

`GraphControls` and `useSkillGraph` on the `/skills` page both call `useConfigQuery()`. SWR caches the response. When the user then navigated to `/settings`, the cache was already warm, so `data` was available on the very first render. The `useEffect` fired immediately, and `SkillGraphCategoriesField` mounted with real config.

## Why tests didn't catch it

Existing tests mocked `getConfig` to resolve immediately and flushed everything with `await act(async () => {})`. This collapsed the async gap into a single pass: by the time any assertion ran, `useEffect` had already fired and `config` was populated. The real browser renders the intermediate state; the tests skipped over it.

## Initial fix (superseded)

The first fix added a `ready` flag inside the same `useEffect` as `setConfig`, gating `isLoading` on it. This worked but was a bandaid: it papered over the timing gap without addressing the duplicated state that caused it. If any future field used the same snapshot-at-mount pattern, the same class of bug could reappear.

## Final fix

Addressed both layers of the problem:

1. **`useSettings`**: removed the `ready` flag. Kept `useState` + `useEffect` for form state (the form needs mutable local state for in-progress edits), but changed `isLoading` to `fetching || !serverConfig`. This gates the form on actual data availability: the form never mounts until `serverConfig` exists, so the `useEffect` sync is guaranteed to fire before any child component reads `config`. The `useEffect` here is not syncing derived state (an antipattern): it is initializing local form state from a one-time server fetch, which is a legitimate use.

2. **`SkillGraphCategoriesField`**: converted from uncontrolled to fully controlled. Removed the internal `rows` `useState`. Rows are now derived via `useMemo` from `config.skill_graph.categories` on every render. Mutations go through `setConfig`, which updates the parent state, which re-derives rows on the next render. No local snapshot means no stale data regardless of mount timing.

3. **`SettingsPage.test.tsx`**: added an integration test that renders the full page with async config containing categories and asserts the category values appear in the form. This test would have caught the original bug.

## Files changed

- `client/src/pages/SettingsPage/hooks/useSettings.ts`: removed `ready` flag, gated `isLoading` on `!serverConfig`
- `client/src/pages/SettingsPage/components/SkillGraphCategoriesField/SkillGraphCategoriesField.tsx`: removed internal `rows` state, derive from config via `useMemo`
- `client/src/pages/SettingsPage/hooks/useSettings.test.tsx`: updated tests for simplified hook
- `client/src/pages/SettingsPage/components/SkillGraphCategoriesField/SkillGraphCategoriesField.test.tsx`: removed UI assertion that depended on internal state
- `client/src/pages/SettingsPage/SettingsPage.test.tsx`: added regression test for categories rendering from async config
