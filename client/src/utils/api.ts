import type {
  Session,
  SessionWithStatus,
  TurnGroup,
  OrphanGroup,
  WeaverConfig,
  SkillGraph,
  SkillDetail,
  Snippet,
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

export const patchConfig = (partial: Partial<WeaverConfig>) =>
  apiFetch<{ config: WeaverConfig }>("/config", {
    method: "PATCH",
    body: JSON.stringify(partial),
  });
export const getSkillGraph = () => apiFetch<SkillGraph>("/skills");

export const getSkillDetail = (
  name: string,
  project?: string,
  source?: string,
) => {
  const params = new URLSearchParams();
  if (project) {
    params.set("project", project);
  }
  if (source) {
    params.set("source", source);
  }
  const queryString = params.toString();
  return apiFetch<SkillDetail>(
    queryString ? `/skills/${name}?${queryString}` : `/skills/${name}`,
  );
};

export const getSnippets = () => apiFetch<{ snippets: Snippet[] }>("/snippets");

export const createSnippet = (trigger: string, expansion: string) =>
  apiFetch<{ snippet: Snippet }>("/snippets", {
    method: "POST",
    body: JSON.stringify({ trigger, expansion }),
  });

export const updateSnippet = (id: string, trigger: string, expansion: string) =>
  apiFetch<{ snippet: Snippet }>(`/snippets/${id}`, {
    method: "PUT",
    body: JSON.stringify({ trigger, expansion }),
  });

export const deleteSnippetApi = (id: string) =>
  fetch(`${API_BASE}/snippets/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) {
      throw new Error(`Delete failed: ${r.status}`);
    }
  });

export const getDictationStatus = () =>
  apiFetch<{ whisper: boolean; ollama: boolean; model: string | null }>(
    "/dictation/status",
  );

export const transcribeAudio = (blob: Blob) =>
  fetch(`${API_BASE}/dictation/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: blob,
  }).then(async (r) => {
    if (!r.ok) {
      const body = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(body.error ?? `Transcribe failed: ${r.status}`);
    }
    return r.json() as Promise<{ text: string }>;
  });

export const processTranscript = (transcript: string, snippets: Snippet[]) =>
  apiFetch<{ processedText: string; snippetUsed: string | null }>(
    "/dictation/process",
    {
      method: "POST",
      body: JSON.stringify({ transcript, snippets }),
    },
  );
