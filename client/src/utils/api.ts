import type {
  Session,
  SessionWithStatus,
  TurnGroup,
  OrphanGroup,
  WeaverConfig,
  SkillGraph,
  SkillDetail,
} from "@weaver/shared/types";

const API_BASE = "/api";

export class ApiResponseError extends Error {
  fieldErrors?: Record<string, Record<string, string>>;

  constructor(
    message: string,
    fieldErrors?: Record<string, Record<string, string>>,
  ) {
    super(message);
    this.name = "ApiResponseError";
    this.fieldErrors = fieldErrors;
  }
}

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
    throw new ApiResponseError(
      body.error ?? `Request failed: ${response.status}`,
      body.fieldErrors,
    );
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
  apiFetch<{
    config: WeaverConfig;
    warnings: string[];
    fieldErrors: Record<string, Record<string, string>>;
  }>("/config");

export const updateConfig = (config: WeaverConfig) =>
  apiFetch<{ config: WeaverConfig }>("/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });

export const patchConfig = (partial: Partial<WeaverConfig>) =>
  apiFetch<{ config: WeaverConfig }>("/config", {
    method: "PATCH",
    body: JSON.stringify(partial),
  });

export const getSkillGraph = () => apiFetch<SkillGraph>("/skills");

export const getSkillDetail = (
  name: string,
  options?: { project?: string; source?: string },
) => {
  const params = new URLSearchParams();
  if (options?.project) {
    params.set("project", options.project);
  }
  if (options?.source) {
    params.set("source", options.source);
  }
  const query = params.toString();
  return apiFetch<SkillDetail>(`/skills/${name}${query ? `?${query}` : ""}`);
};
