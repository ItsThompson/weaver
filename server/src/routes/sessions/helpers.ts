import type {
  Session,
  SessionWithStatus,
  ActivityStatus,
} from "@weaver/shared/types";
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
    const adapter = getAdapter(session.harness);
    const skillPaths = adapter
      .skillSearchPaths(session.cwd)
      .map((entry) => entry.path);
    const loader = adapter.loadAgentConfig
      ? (name: string) => adapter.loadAgentConfig!(name, session.cwd)
      : undefined;
    return await resolveConfiguredSkills(
      session.agentName,
      skillPaths,
      loader,
      session.cwd,
    );
  } catch {
    return [];
  }
}
