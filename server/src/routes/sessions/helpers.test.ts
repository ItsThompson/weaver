import type { Session } from "@weaver/shared/types";
import {
  toSessionWithStatus,
  safeActiveSkills,
  safeConfiguredSkills,
} from "./helpers";

vi.mock("../../services/log-parser/index", () => ({
  extractActiveSkillPaths: vi.fn().mockReturnValue([]),
}));

vi.mock("../../services/skill-resolver/index", () => ({
  skillNameFromPath: vi.fn((p: string) => p.split("/").at(-2) ?? p),
  resolveConfiguredSkills: vi.fn().mockResolvedValue([]),
}));

import { extractActiveSkillPaths } from "../../services/log-parser/index";
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
    vi.mocked(extractActiveSkillPaths).mockReturnValue([
      "/home/.kiro/skills/coding-practices/SKILL.md",
    ]);
    const result = safeActiveSkills([]);
    expect(result).toEqual(["coding-practices"]);
  });

  it("returns empty array on error", () => {
    vi.mocked(extractActiveSkillPaths).mockImplementation(() => {
      throw new Error("fail");
    });
    expect(safeActiveSkills([])).toEqual([]);
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
