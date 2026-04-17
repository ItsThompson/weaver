import { existsSync, readFileSync, readdirSync } from "node:fs";

export const weaverConfig = JSON.stringify({
  validation: {
    stop: [
      { name: "build", command: "npm run build", timeout_ms: 60_000 },
      { name: "test", command: "npm test", timeout_ms: 30_000 },
    ],
    postToolUse: [
      {
        matcher: "fs_write",
        name: "eslint",
        command: "eslint",
        timeout_ms: 10_000,
      },
      {
        matcher: "fs_write",
        name: "prettier",
        command: "prettier",
        timeout_ms: 10_000,
      },
    ],
  },
});

// stop: 60k + 30k + 15k buffer = 105_000
// postToolUse: 10k + 10k + 15k buffer = 35_000

export function makeAgentConfig(
  stopTimeout?: number,
  postToolUseTimeout?: number,
): string {
  return JSON.stringify({
    name: "test-agent",
    hooks: {
      stop: [
        {
          command: "~/.config/amazonq/global/hooks/weaver-log.sh",
          ...(stopTimeout !== undefined && { timeout_ms: stopTimeout }),
        },
      ],
      postToolUse: [
        {
          matcher: "*",
          command: "~/.config/amazonq/global/hooks/weaver-log.sh",
          ...(postToolUseTimeout !== undefined && {
            timeout_ms: postToolUseTimeout,
          }),
        },
      ],
    },
  });
}

export function setupFs(
  agentConfigs: Record<string, string>,
  weaverJson: string | null = weaverConfig,
): void {
  vi.mocked(existsSync).mockImplementation((path) => {
    const pathStr = String(path);
    if (pathStr.endsWith(".weaver.json")) {
      return weaverJson !== null;
    }
    if (pathStr.endsWith("/agents")) {
      return true;
    }
    return false;
  });

  vi.mocked(readFileSync).mockImplementation((path) => {
    const pathStr = String(path);
    if (pathStr.endsWith(".weaver.json")) {
      return weaverJson!;
    }
    const filename = pathStr.split("/").pop()!;
    if (agentConfigs[filename]) {
      return agentConfigs[filename];
    }
    throw new Error(`ENOENT: ${pathStr}`);
  });

  vi.mocked(readdirSync).mockImplementation(
    () =>
      Object.keys(agentConfigs) as unknown as ReturnType<typeof readdirSync>,
  );
}
