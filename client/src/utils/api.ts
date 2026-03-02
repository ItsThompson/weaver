import type { Session, SessionWithStatus, TurnGroup } from '@shared/types';

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
