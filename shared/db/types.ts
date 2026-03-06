export interface SessionRow {
  id: string;
  agent_session_id: string | null;
  pid: number | null;
  cwd: string;
  agent_name: string | null;
  custom_name: string | null;
  model: string | null;
  status: string;
  context_usage_percent: number | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  session_id: string;
  role: string;
  type: string;
  content: string | null;
  metadata: string | null;
  created_at: string;
}

export interface ToolCallRow {
  id: string;
  session_id: string;
  message_id: number | null;
  tool_name: string;
  kind: string | null;
  status: string;
  input: string | null;
  output: string | null;
  permission_response: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface EventRow {
  id: number;
  session_id: string;
  event_type: string;
  data: string | null;
  created_at: string;
}
