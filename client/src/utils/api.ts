import type {
  Session,
  SessionWithStatus,
  TurnGroup,
  OrphanGroup,
  WeaverConfig,
} from "@weaver/shared/types";

const API_BASE = "/api";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const getSessions = () => apiFetch<SessionWithStatus[]>("/sessions");

export const getSession = (id: string) =>
  apiFetch<{
    session: SessionWithStatus;
    turns: TurnGroup[];
    webhookEnabled: boolean;
    activeSkills: string[];
    configuredSkills: string[];
  }>(`/sessions/${id}`);

export const toggleSessionWebhook = (id: string, enabled: boolean) =>
  apiFetch<{ ok: true; enabled: boolean }>(`/sessions/${id}/webhook`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });

export const updateSessionName = (id: string, customName: string) =>
  apiFetch<Session>(`/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ customName }),
  });

export const deleteSession = (id: string) =>
  fetch(`${API_BASE}/sessions/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) {
      throw new Error(`Delete failed: ${r.status}`);
    }
    return r.json() as Promise<{ ok: true }>;
  });

export const getOrphans = () => apiFetch<{ groups: OrphanGroup[] }>("/orphans");

export const getOrphanCount = () =>
  apiFetch<{ count: number }>("/orphans/count");

export const assignOrphans = (targetSessionId: string, pid: number) =>
  apiFetch<{ ok: true }>("/orphans/assign", {
    method: "POST",
    body: JSON.stringify({ targetSessionId, pid }),
  });

export const deleteOrphans = (pid: number) =>
  fetch(`${API_BASE}/orphans/${pid}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) {
      throw new Error(`Delete failed: ${r.status}`);
    }
    return r.json() as Promise<{ ok: true }>;
  });

export const getConfig = () =>
  apiFetch<{ config: WeaverConfig; warnings: string[] }>("/config");

export const updateConfig = (config: WeaverConfig) =>
  apiFetch<{ config: WeaverConfig }>("/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
