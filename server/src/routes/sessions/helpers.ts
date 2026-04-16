import type {
  Session,
  SessionWithStatus,
  ActivityStatus,
} from "@weaver/shared/types";
import { globalKiroDir } from "@weaver/shared/paths";
import { join } from "node:path";
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
    const skillPaths = [
      join(session.cwd, ".kiro", "skills"),
      join(globalKiroDir(), "skills"),
    ];
    return await resolveConfiguredSkills(session.agentName, skillPaths);
  } catch {
    return [];
  }
}
