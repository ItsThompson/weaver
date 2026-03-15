export interface SyncOptions {
  dryRun?: boolean;
}

export interface SyncResult {
  patched: string[];
  skipped: string[];
  errors: string[];
}

export interface TimeoutPatch {
  hookKey: string;
  timeout: number;
}
