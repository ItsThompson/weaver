import { useMemo } from "react";
import { useSessionsQuery, useSkillGraphQuery } from "../queries";
import type { WindowEntry } from "../../components/CommandPalette/types";

const STATIC_WINDOWS: WindowEntry[] = [
  { label: "Sessions", href: "/", searchableText: "Sessions" },
  { label: "Skills", href: "/skills", searchableText: "Skills skill graph" },
  { label: "Cherry Pick", href: "/cherrypick", searchableText: "Cherry Pick" },
  { label: "Settings", href: "/settings", searchableText: "Settings" },
];

function dirName(cwd: string): string {
  return cwd.split("/").filter(Boolean).pop() ?? cwd;
}

export function useWindowList(): WindowEntry[] {
  const { data: sessions = [] } = useSessionsQuery();
  const { data: skillGraph } = useSkillGraphQuery();

  return useMemo(() => {
    const sessionWindows = sessions.reduce<WindowEntry[]>((acc, s) => {
      if (s.status !== "open") {
        return acc;
      }
      const name = s.customName || `Session ${s.id.slice(0, 8)}`;
      const dir = dirName(s.cwd);
      const parts = [name, String(s.pid), dir, s.agentName].filter(Boolean);
      acc.push({
        label: name,
        href: `/sessions/${s.id}`,
        description: `PID ${s.pid} · ${dir}${s.agentName ? ` · ${s.agentName}` : ""}`,
        searchableText: parts.join(" "),
      });
      return acc;
    }, []);

    const skillWindows = (skillGraph?.nodes ?? []).flatMap((skill) => {
      if (skill.variants.length <= 1) {
        return [
          {
            label: `Skill: ${skill.name}`,
            href: `/skills/${skill.name}`,
            searchableText: `${skill.name} ${skill.category} skill`,
          },
        ];
      }

      return skill.variants.map((variant) => {
        const suffix = variant.project ?? "Global";
        const query = variant.project
          ? `?project=${variant.project}`
          : "?source=global";
        return {
          label: `Skill: ${skill.name} (${suffix})`,
          href: `/skills/${skill.name}${query}`,
          description: suffix,
          searchableText: `${skill.name} ${suffix} ${skill.category} skill`,
        };
      });
    });

    return [...STATIC_WINDOWS, ...sessionWindows, ...skillWindows];
  }, [sessions, skillGraph]);
}
