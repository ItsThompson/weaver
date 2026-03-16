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

Eliminated both layers of duplicated state:

1. **`useSettings`**: replaced the `useState` + `useEffect` + `ready` pattern with a `draft` state that starts as `null`. Config is derived as `draft ?? serverConfig ?? DEFAULT_CONFIG`. Before any user edits, the hook reads SWR data directly with no intermediate copy. The first edit forks into `draft`, and `handleSave` resets `draft` to `null` so the hook falls back to freshly revalidated SWR data. No `useEffect`, no timing gap.

2. **`SkillGraphCategoriesField`**: converted from uncontrolled to fully controlled. Removed the internal `rows` `useState`. Rows are now derived via `useMemo` from `config.skill_graph.categories` on every render. Mutations go through `setConfig`, which updates the parent's draft, which re-derives rows on the next render. No local snapshot means no stale data regardless of mount timing.

## Files changed

- `client/src/pages/SettingsPage/hooks/useSettings.ts`: replaced `useState`/`useEffect`/`ready` with `draft` pattern
- `client/src/pages/SettingsPage/components/SkillGraphCategoriesField/SkillGraphCategoriesField.tsx`: removed internal `rows` state, derive from config via `useMemo`
- `client/src/pages/SettingsPage/hooks/useSettings.test.tsx`: replaced `ready` flag test with draft fork/reset tests
- `client/src/pages/SettingsPage/components/SkillGraphCategoriesField/SkillGraphCategoriesField.test.tsx`: removed UI assertion that depended on internal state
