---
name: cloudscape-test-mocks
description: >
  Cloudscape component mock conventions for this project's Jest test suite.
  Apply whenever writing, modifying, or reviewing any client test file (.test.tsx),
  any mock in client/__tests__/mocks/, or any component that uses Cloudscape
  components. Also apply when client tests fail with "Unable to find element"
  errors.
---

# Cloudscape Test Mocks

## Mock Location

All Cloudscape mocks live in `client/__tests__/mocks/` and are wired via `moduleNameMapper` in `client/jest.config.mjs`.

## Component-Specific Mocks

These mocks exist because the components have interactive behavior or structural rendering that tests depend on:

| Mock file | Renders |
|-----------|---------|
| `cloudscape-header.tsx` | `children`, `actions`, `counter`, `description` |
| `cloudscape-button.tsx` | `children` with `onClick` handler |
| `cloudscape-table.tsx` | Iterates `items` through `columnDefinitions[].cell()`, renders `filter` and `empty` |
| `cloudscape-tabs.tsx` | Iterates `tabs` rendering `label` and `content` |
| `cloudscape-text-filter.tsx` | Renders `<input>` with `onChange` wired to `detail.filteringText` |
| `cloudscape-expandable-section.tsx` | Renders `headerText` and `children` |

## Passthrough Mock

`cloudscape-passthrough.tsx` is the catch-all for components without a dedicated mock. It renders all common content-bearing props:

- `label`, `description` (FormField, etc.)
- `header`, `actions`, `footer` (Container, Modal, etc.)
- `content` (AppLayout, Form, etc.)
- `children`

When a test can't find text that should be visible, check whether the text is passed as a **prop** (not children) and whether the relevant mock renders that prop.

## Adding New Mocks

Only create a component-specific mock when:
1. The passthrough mock can't express the component's rendering (e.g., Table iterating items)
2. Tests need to interact with the component (e.g., Button onClick, TextFilter onChange)

Otherwise, rely on the passthrough mock and ensure it renders the prop slot you need.

## ESM Mock Pattern

Client tests use `jest.unstable_mockModule` for API mocks, with dynamic imports after mock registration:

```tsx
jest.unstable_mockModule('../../utils/api', () => ({
  getSessions: jest.fn(),
  // ... other API functions
}));

const api = await import('../../utils/api');
const { MyPage } = await import('./MyPage');
```

Wrap renders in `<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>` to isolate SWR cache between tests.
