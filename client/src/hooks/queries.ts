import useSWR, { mutate } from 'swr';
import { getSessions, getSession, getOrphans, getOrphanCount } from '../utils/api';

export const KEYS = {
  sessions: '/sessions',
  session: (id: string) => `/sessions/${id}`,
  orphans: '/orphans',
  orphanCount: '/orphans/count',
} as const;

export const useSessionsQuery = () => useSWR(KEYS.sessions, getSessions);

export const useSessionQuery = (id: string | undefined) =>
  useSWR(id ? KEYS.session(id) : null, () => getSession(id!));

export const useOrphansQuery = () => useSWR(KEYS.orphans, getOrphans);

export const useOrphanCountQuery = () => useSWR(KEYS.orphanCount, getOrphanCount);

export const revalidateSessions = () => mutate(KEYS.sessions);

export const revalidateSession = (id: string) => mutate(KEYS.session(id));

export const revalidateOrphans = () => {
  mutate(KEYS.orphans);
  mutate(KEYS.orphanCount);
};
