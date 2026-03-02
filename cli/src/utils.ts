import { execSync } from 'node:child_process';

const WEAVER_SERVER = process.env.WEAVER_SERVER ?? 'http://localhost:8143';

export function post(path: string, body: Record<string, unknown>): { ok: boolean; status: number; data: unknown } {
  try {
    const result = execSync(
      `curl -s --max-time 3 -w "\\n%{http_code}" -X POST "${WEAVER_SERVER}${path}" -H "Content-Type: application/json" -d '${JSON.stringify(body)}'`,
      { encoding: 'utf-8' },
    );
    const lines = result.trim().split('\n');
    const status = parseInt(lines.pop()!, 10);
    const data = lines.length > 0 ? JSON.parse(lines.join('\n')) : null;
    return { ok: status >= 200 && status < 300, status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
