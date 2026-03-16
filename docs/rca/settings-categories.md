# RCA: Skill graph categories not loading on Settings page

## Symptom

Navigating directly to `/settings` showed "No categories configured" in the skill graph categories editor, even though `~/.weaver/config.json` had five categories defined and the skill graph page rendered them correctly.

Navigating to `/skills` first and then to `/settings` made the categories appear.

## Root cause

A timing gap between SWR resolving and `useEffect` applying the data.

`useSettings` fetched config via SWR and synced it into local state with `useEffect`:

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

`SettingsPage` had no loading gate, so the form rendered immediately. `SkillGraphCategoriesField` mounted during that render and initialized its local `rows` state via `useState`:

```typescript
const [rows, setRows] = useState<CategoryRow[]>(() =>
  toRows(config.skill_graph?.categories ?? {}),
);
```

`useState` only runs its initializer once. `config` was `DEFAULT_CONFIG` at that point, so `rows` locked in as `[]`. When `useEffect` fired on the next render and `config` updated to the real data, `rows` stayed empty.

## Why `/skills` first made it work

`GraphControls` and `useSkillGraph` on the `/skills` page both call `useConfigQuery()`. SWR caches the response. When the user then navigated to `/settings`, the cache was already warm, so `data` was available on the very first render. The `useEffect` fired immediately, and `SkillGraphCategoriesField` mounted with real config.

## Why tests didn't catch it

Existing tests mocked `getConfig` to resolve immediately and flushed everything with `await act(async () => {})`. This collapsed the async gap into a single pass: by the time any assertion ran, `useEffect` had already fired and `config` was populated. The real browser renders the intermediate state; the tests skipped over it.

## Fix

Two changes:

1. `useSettings`: added a `ready` flag set inside the same `useEffect` as `setConfig`. React batches both updates, so the next render sees `config = real data` and `ready = true` simultaneously. `isLoading` is now `isLoading || !ready`, which keeps the page in loading state until config is actually set.

2. `SettingsPage`: added an early return with a spinner while `isLoading` is true. The form only renders after config is populated, so `SkillGraphCategoriesField` always mounts with real data.

One test was added to `useSettings.test.tsx` that asserts `isLoading` stays true until `config` reflects the API response. It fails without the `ready` flag.

## Files changed

- `client/src/pages/SettingsPage/hooks/useSettings.ts`: added `ready` state, gated `isLoading` on it
- `client/src/pages/SettingsPage/SettingsPage.tsx`: added spinner gate on `isLoading`, added `Spinner` import
- `client/src/pages/SettingsPage/hooks/useSettings.test.tsx`: added regression test
