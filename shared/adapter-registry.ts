import type { HarnessAdapter } from "./types/harness";

const adapters = new Map<string, HarnessAdapter>();

export function registerAdapter(adapter: HarnessAdapter): void {
  adapters.set(adapter.name, adapter);
}

export function getAdapter(harness: string): HarnessAdapter {
  const adapter = adapters.get(harness);
  if (!adapter) {
    throw new Error(
      `Unknown harness: "${harness}". Registered: [${[...adapters.keys()].join(", ")}]`,
    );
  }
  return adapter;
}

export function getRegisteredAdapters(): HarnessAdapter[] {
  return [...adapters.values()];
}
