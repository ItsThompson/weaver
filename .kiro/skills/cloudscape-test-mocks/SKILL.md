---
name: cloudscape-test-mocks
description: >
  Cloudscape component testing conventions for this project's Vitest test suite.
  Apply whenever writing, modifying, or reviewing any client test file (.test.tsx)
  or any component that uses Cloudscape components. Also apply when client tests
  fail with "Unable to find element" errors.
---

# Cloudscape Test Conventions

## No Special Configuration Required

Cloudscape components render natively in Vitest with jsdom. No jest-preset, no module aliasing, and no component mocks are needed. Tests interact with real Cloudscape components.

## Querying Components

Use `@testing-library/react` queries (`screen.getByText`, `screen.getByRole`, `fireEvent`) for most assertions.

For Cloudscape-specific queries (finding a component by type, accessing sub-elements), use the DOM test utilities:

```tsx
import createWrapper from "@cloudscape-design/components/test-utils/dom";

const { container } = render(<MyPage />);
const wrapper = createWrapper(container);

const autosuggest = wrapper.findAutosuggest()!;
const breadcrumbs = wrapper.findBreadcrumbGroup()!;
const links = breadcrumbs.findBreadcrumbLinks();
```

Each Cloudscape component has a corresponding `findX` / `findAllX` method on the wrapper. Use `data-testid` attributes for targeted selection:

```tsx
wrapper.findButton('[data-testid="submit-button"]')!.click();
```

Do not use optional chaining (`?.`) on wrapper results in tests: it silently swallows missing elements. Use non-null assertion (`!`) so the test fails if the element is absent.

## Avoid Internal Selectors

Do not query Cloudscape components by internal class names (`awsui_*`). These change between versions. Use `data-testid`, `findX` utilities, or visible text instead.
