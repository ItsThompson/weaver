import type { Session } from "@weaver/shared/types";
import { Harness } from "@weaver/shared/types";

export const SESSION_A: Session = {
  id: "aaa",
  pid: 100,
  customName: null,
  cwd: "/tmp",
  agentName: null,
  harness: Harness.KIRO_CLI,
  startTime: "2026-01-02T00:00:00Z",
  lastEventTime: "2026-01-02T00:01:00Z",
};

export const SESSION_B: Session = {
  id: "bbb",
  pid: 200,
  customName: "my session",
  cwd: "/home",
  agentName: "dev",
  harness: Harness.KIRO_CLI,
  startTime: "2026-01-01T00:00:00Z",
  lastEventTime: "2026-01-01T00:05:00Z",
};
