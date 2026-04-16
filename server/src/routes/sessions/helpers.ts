import type {
  Session,
  SessionWithStatus,
  ActivityStatus,
} from "@weaver/shared/types";
import { Harness } from "@weaver/shared/types";
import { getAdapter } from "@weaver/shared/adapter-registry";
import { extractActiveSkillPaths } from "../../services/log-parser/index";
import {
  skillNameFromPath,
  resolveConfiguredSkills,
} from "../../services/skill-resolver/index";

export function toSessionWithStatus(
  session: Session,
  isOpen: boolean,
  activity?: ActivityStatus,
): SessionWithStatus {
  return { ...session, status: isOpen ? "open" : "closed", activity };
}

export function safeActiveSkills(
  events: Parameters<typeof extractActiveSkillPaths>[0],
): string[] {
  try {
    return extractActiveSkillPaths(events).map(skillNameFromPath);
  } catch {
    return [];
  }
}

export async function safeConfiguredSkills(
  session: Session,
): Promise<string[]> {
  try {
    const adapter = getAdapter(session.harness ?? Harness.KIRO_CLI);
    const skillPaths = adapter
      .skillSearchPaths(session.cwd)
      .map((entry) => entry.path);
    return await resolveConfiguredSkills(session.agentName, skillPaths);
  } catch {
    return [];
  }
}
