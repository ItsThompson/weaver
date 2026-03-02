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

export function getCallerPid(): number {
  let pid = process.ppid;
  const maxDepth = 10;

  for (let depth = 0; depth < maxDepth; depth++) {
    let pname: string;
    try {
      pname = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf-8' }).trim();
    } catch {
      break;
    }

    if (['sh', 'bash', 'zsh', 'dash', 'fish', '-bash', '-zsh', '-sh'].includes(pname)) {
      let parent: string;
      try {
        parent = execSync(`ps -o ppid= -p ${pid}`, { encoding: 'utf-8' }).trim();
      } catch {
        break;
      }
      if (!parent || parent === '1') break;
      pid = parseInt(parent, 10);
    } else {
      break;
    }
  }

  return pid;
}
