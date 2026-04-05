import { useMemo } from "react";
import { useSessionsQuery, useSkillGraphQuery } from "../queries";
import type { WindowEntry } from "../../components/CommandPalette/types";
import { isElectron } from "../../utils/isElectron";

function getSkillSuffix(
  project: string | null,
  showGlobalSuffix: boolean,
): string {
  if (project !== null) {
    return ` (${project})`;
  }
  if (showGlobalSuffix) {
    return " (global)";
  }
  return "";
}

const BASE_WINDOWS: WindowEntry[] = [
  { label: "Sessions", href: "/", searchableText: "Sessions" },
  { label: "Skills", href: "/skills", searchableText: "Skills skill graph" },
  { label: "Cherry Pick", href: "/cherrypick", searchableText: "Cherry Pick" },
  { label: "Settings", href: "/settings", searchableText: "Settings" },
];

const ELECTRON_WINDOWS: WindowEntry[] = [
  {
    label: "Dictation",
    href: "/dictation",
    searchableText: "Dictation voice speech text",
  },
  {
    label: "Snippets",
    href: "/snippets",
    searchableText: "Snippets triggers expansion",
  },
];

function dirName(cwd: string): string {
  return cwd.split("/").filter(Boolean).pop() ?? cwd;
}

export function useWindowList(): WindowEntry[] {
  const { data: sessions = [] } = useSessionsQuery();
  const { data: skillGraph } = useSkillGraphQuery();

  return useMemo(() => {
    const staticWindows = isElectron()
      ? [...BASE_WINDOWS, ...ELECTRON_WINDOWS]
      : BASE_WINDOWS;

    const sessionWindows = sessions.reduce<WindowEntry[]>((acc, session) => {
      if (session.status !== "open") {
        return acc;
      }
      const name = session.customName || `Session ${session.id.slice(0, 8)}`;
      const dir = dirName(session.cwd);
      const parts = [name, String(session.pid), dir, session.agentName].filter(
        Boolean,
      );
      acc.push({
        label: name,
        href: `/sessions/${session.id}`,
        description: `PID ${session.pid} · ${dir}${session.agentName ? ` · ${session.agentName}` : ""}`,
        searchableText: parts.join(" "),
      });
      return acc;
    }, []);

    const nodes = skillGraph?.nodes ?? [];
    const workspaceSkillNames = new Set(
      nodes.reduce<string[]>((acc, skill) => {
        if (skill.source === "workspace") {
          acc.push(skill.skillName);
        }
        return acc;
      }, []),
    );

    const skillWindows = nodes.map((skill) => {
      const query =
        skill.project !== null
          ? `?project=${encodeURIComponent(skill.project)}`
          : `?source=global`;
      const showGlobalSuffix =
        skill.source === "global" && workspaceSkillNames.has(skill.skillName);
      const suffix = getSkillSuffix(skill.project, showGlobalSuffix);
      return {
        label: `Skill: ${skill.name}${suffix}`,
        href: `/skills/${skill.skillName}${query}`,
        searchableText: `${skill.name} ${skill.skillName} ${skill.category} ${skill.project ?? ""} skill`,
      };
    });

    return [...staticWindows, ...sessionWindows, ...skillWindows];
  }, [sessions, skillGraph]);
}
