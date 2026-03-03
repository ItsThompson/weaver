import type { Session, SessionWithStatus, TurnGroup, OrphanGroup, WeaverConfig } from '@weaver/shared/types';

const API_BASE = '/api';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const getSessions = () => apiFetch<SessionWithStatus[]>('/sessions');

export const getSession = (id: string) =>
  apiFetch<{ session: SessionWithStatus; turns: TurnGroup[] }>(`/sessions/${id}`);

export const updateSessionName = (id: string, customName: string) =>
  apiFetch<Session>(`/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ customName }),
  });

export const getOrphans = () => apiFetch<{ groups: OrphanGroup[] }>('/orphans');

export const getOrphanCount = () => apiFetch<{ count: number }>('/orphans/count');

export const assignOrphans = (targetSessionId: string, pid: number) =>
  apiFetch<{ ok: true }>('/orphans/assign', {
    method: 'POST',
    body: JSON.stringify({ targetSessionId, pid }),
  });

export const getConfig = () => apiFetch<{ config: WeaverConfig; warnings: string[] }>('/config');

export const updateConfig = (config: WeaverConfig) =>
  apiFetch<{ config: WeaverConfig }>('/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
