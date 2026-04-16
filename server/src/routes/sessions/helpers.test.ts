import "../../__tests__/mocks/services";

import type { Session } from "@weaver/shared/types";
import { SKILL_READ_EVENTS } from "../../__tests__/fixtures/events";
import {
  toSessionWithStatus,
  safeActiveSkills,
  safeConfiguredSkills,
} from "./helpers";

import { skillNameFromPath } from "../../services/skill-resolver/index";
import { resolveConfiguredSkills } from "../../services/skill-resolver/index";

beforeEach(() => vi.clearAllMocks());

const session: Session = {
  id: "aaa",
  pid: 100,
  customName: null,
  cwd: "/tmp",
  agentName: null,
  startTime: "2026-01-01T00:00:00Z",
  lastEventTime: "2026-01-01T00:01:00Z",
};

describe("toSessionWithStatus", () => {
  it("adds open status when isOpen is true", () => {
    const result = toSessionWithStatus(session, true, "starting");
    expect(result.status).toBe("open");
    expect(result.activity).toBe("starting");
  });

  it("adds closed status when isOpen is false", () => {
    const result = toSessionWithStatus(session, false);
    expect(result.status).toBe("closed");
    expect(result.activity).toBeUndefined();
  });
});

describe("safeActiveSkills", () => {
  it("returns mapped skill names", () => {
    const result = safeActiveSkills(SKILL_READ_EVENTS);
    expect(result).toEqual(["coding-practices"]);
  });

  it("returns empty array on error", () => {
    vi.mocked(skillNameFromPath).mockImplementation(() => {
      throw new Error("fail");
    });
    expect(safeActiveSkills(SKILL_READ_EVENTS)).toEqual([]);
  });
});

describe("safeConfiguredSkills", () => {
  it("returns resolved skills", async () => {
    vi.mocked(resolveConfiguredSkills).mockResolvedValue(["coding", "testing"]);
    const result = await safeConfiguredSkills(session);
    expect(result).toEqual(["coding", "testing"]);
  });

  it("returns empty array on error", async () => {
    vi.mocked(resolveConfiguredSkills).mockRejectedValue(new Error("fail"));
    expect(await safeConfiguredSkills(session)).toEqual([]);
  });
});
