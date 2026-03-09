export interface WeaverProjectConfig {
  validation?: ValidationConfig;
}

export interface ValidationConfig {
  stop?: StopValidationHook[];
  postToolUse?: PostToolValidationHook[];
}

export interface StopValidationHook {
  name: string;
  command: string;
  scope?: 'file' | 'parent' | 'cwd' | number;
  run_if_files_match?: string;
  working_dir?: string;
  timeout_ms?: number;
}

export interface PostToolValidationHook {
  matcher: string;
  name: string;
  command: string;
  timeout_ms?: number;
}

export interface ValidationResult {
  name: string;
  passed: boolean;
  output: string;
  duration_ms: number;
  timed_out: boolean;
  skipped_reason?: string;
}

export interface ValidationEvent {
  hook_event_name: 'validation';
  trigger: 'stop' | 'postToolUse';
  results: ValidationResult[];
  changed_files: string[];
  agent_tested_dirs: string[];
}

export const DEFAULT_STOP_TIMEOUT_MS = 30_000;
export const DEFAULT_POST_TOOL_TIMEOUT_MS = 10_000;
export const MAX_OUTPUT_LENGTH = 5_000;
