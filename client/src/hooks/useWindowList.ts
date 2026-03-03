import { useMemo } from 'react';
import { useSessionsQuery } from './queries';
import type { WindowEntry } from '../components/CommandPalette/types';

const STATIC_WINDOWS: WindowEntry[] = [
  { label: 'Sessions', href: '/', searchableText: 'Sessions' },
  { label: 'Cherry Pick', href: '/cherrypick', searchableText: 'Cherry Pick' },
  { label: 'Settings', href: '/settings', searchableText: 'Settings' },
];

function dirName(cwd: string): string {
  return cwd.split('/').filter(Boolean).pop() ?? cwd;
}

export function useWindowList(): WindowEntry[] {
  const { data: sessions = [] } = useSessionsQuery();

  return useMemo(() => {
    const sessionWindows = sessions.reduce<WindowEntry[]>((acc, s) => {
      if (s.status !== 'open') return acc;
      const name = s.customName || `Session ${s.id.slice(0, 8)}`;
      const dir = dirName(s.cwd);
      const parts = [name, String(s.pid), dir, s.agentName].filter(Boolean);
      acc.push({
        label: name,
        href: `/sessions/${s.id}`,
        description: `PID ${s.pid} · ${dir}${s.agentName ? ` · ${s.agentName}` : ''}`,
        searchableText: parts.join(' '),
      });
      return acc;
    }, []);

    return [...STATIC_WINDOWS, ...sessionWindows];
  }, [sessions]);
}
