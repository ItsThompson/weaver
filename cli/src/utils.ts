import { execSync } from "node:child_process";
import { WEAVER_SERVER_URL } from "@weaver/shared/paths";

const WEAVER_SERVER = process.env.WEAVER_SERVER ?? WEAVER_SERVER_URL;

type HttpResult = { ok: boolean; status: number; data: unknown };

function curl(args: string): HttpResult {
  try {
    const result = execSync(
      `curl -s --max-time 3 -w "\\n%{http_code}" ${args}`,
      { encoding: "utf-8" },
    );
    const lines = result.trim().split("\n");
    const status = parseInt(lines.pop()!, 10);
    const data = lines.length > 0 ? JSON.parse(lines.join("\n")) : null;
    return { ok: status >= 200 && status < 300, status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export function get(path: string): HttpResult {
  return curl(`"${WEAVER_SERVER}${path}"`);
}

export function post(path: string, body: Record<string, unknown>): HttpResult {
  return curl(
    `-X POST "${WEAVER_SERVER}${path}" -H "Content-Type: application/json" -d '${JSON.stringify(body)}'`,
  );
}

export function patch(path: string, body: Record<string, unknown>): HttpResult {
  return curl(
    `-X PATCH "${WEAVER_SERVER}${path}" -H "Content-Type: application/json" -d '${JSON.stringify(body)}'`,
  );
}
