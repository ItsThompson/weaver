import type { FastifyInstance } from "fastify";
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { HookEvent, OrphanGroup, ApiError } from "@weaver/shared/types";
import { readSessions, writeSessions } from "../../services/storage/index";
import { groupEventsByTurn } from "../../services/log-parser/index";
import { log } from "../../utils/logger";

const ORPHAN_PATH = () => join(homedir(), ".weaver", "logs", "orphan.jsonl");
const LOGS_DIR = () => join(homedir(), ".weaver", "logs");

async function readOrphanEvents(): Promise<HookEvent[]> {
  const filePath = ORPHAN_PATH();
  if (!existsSync(filePath)) {
    return [];
  }
  const content = await readFile(filePath, "utf-8");
  return content
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .reduce<HookEvent[]>((events, line) => {
      try {
        events.push(JSON.parse(line));
      } catch (e) {
        log({
          timestamp: new Date().toISOString(),
          event: "orphan_parse_error",
          error: String(e),
        });
      }
      return events;
    }, []);
}

function groupByPid(events: HookEvent[]): OrphanGroup[] {
  const byPid = new Map<number, HookEvent[]>();
  for (const event of events) {
    const pid = event.pid ?? 0;
    const group = byPid.get(pid) ?? [];
    group.push(event);
    byPid.set(pid, group);
  }

  return Array.from(byPid.entries()).map(([pid, pidEvents]) => ({
    pid,
    turns: groupEventsByTurn(pidEvents),
    eventCount: pidEvents.length,
    timeRange: {
      start: pidEvents[0].timestamp,
      end: pidEvents[pidEvents.length - 1].timestamp,
    },
  }));
}

export function registerOrphanRoutes(server: FastifyInstance): void {
  server.get<{ Reply: { groups: OrphanGroup[] } }>("/api/orphans", async () => {
    const events = await readOrphanEvents();
    return { groups: groupByPid(events) };
  });

  server.get<{ Reply: { count: number } }>("/api/orphans/count", async () => {
    const events = await readOrphanEvents();
    return { count: events.length };
  });

  server.post<{
    Body: { targetSessionId: string; pid: number };
    Reply: { ok: true } | ApiError;
  }>("/api/orphans/assign", async (request, reply) => {
    const { targetSessionId, pid } = request.body ?? {};
    if (!targetSessionId || typeof pid !== "number") {
      return reply
        .status(400)
        .send({ error: "targetSessionId and pid are required" });
    }

    const sessions = await readSessions();
    const targetSession = sessions.find((s) => s.id === targetSessionId);
    if (!targetSession) {
      return reply.status(404).send({ error: "Target session not found" });
    }

    const targetLog = join(LOGS_DIR(), `${targetSessionId}.jsonl`);
    if (!existsSync(targetLog)) {
      return reply.status(404).send({ error: "Target session log not found" });
    }

    const filePath = ORPHAN_PATH();
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: "No orphan log found" });
    }

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const toMove: string[] = [];
    const toKeep: string[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line) as HookEvent;
        if ((event.pid ?? 0) === pid) {
          const { pid: _, ...clean } = event;
          toMove.push(JSON.stringify(clean));
        } else {
          toKeep.push(line);
        }
      } catch (e) {
        log({
          timestamp: new Date().toISOString(),
          event: "orphan_assign_parse_error",
          error: String(e),
        });
        toKeep.push(line);
      }
    }

    if (toMove.length === 0) {
      return reply
        .status(404)
        .send({ error: `No orphan events found for PID ${pid}` });
    }

    await appendFile(targetLog, toMove.join("\n") + "\n");
    await writeFile(
      filePath,
      toKeep.length > 0 ? toKeep.join("\n") + "\n" : "",
    );

    // Update the session's PID to the orphan group's PID since it's the current process
    if (pid !== 0 && targetSession.pid !== pid) {
      const allSessions = await readSessions();
      const idx = allSessions.findIndex((s) => s.id === targetSessionId);
      if (idx !== -1) {
        allSessions[idx].pid = pid;
        await writeSessions(allSessions);
      }
    }

    log({
      timestamp: new Date().toISOString(),
      event: "orphans_assigned",
      pid,
      targetSessionId,
      count: toMove.length,
    });
    return { ok: true };
  });

  server.delete<{ Params: { pid: string }; Reply: { ok: true } | ApiError }>(
    "/api/orphans/:pid",
    async (request, reply) => {
      const pid = Number(request.params.pid);
      if (!Number.isFinite(pid)) {
        return reply.status(400).send({ error: "Invalid PID" });
      }

      const filePath = ORPHAN_PATH();
      if (!existsSync(filePath)) {
        return reply.status(404).send({ error: "No orphan log found" });
      }

      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      const toKeep: string[] = [];
      let deleted = 0;

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as HookEvent;
          if ((event.pid ?? 0) === pid) {
            deleted++;
          } else {
            toKeep.push(line);
          }
        } catch (e) {
          log({
            timestamp: new Date().toISOString(),
            event: "orphan_delete_parse_error",
            error: String(e),
          });
          toKeep.push(line);
        }
      }

      if (deleted === 0) {
        return reply
          .status(404)
          .send({ error: `No orphan events found for PID ${pid}` });
      }

      await writeFile(
        filePath,
        toKeep.length > 0 ? toKeep.join("\n") + "\n" : "",
      );

      log({
        timestamp: new Date().toISOString(),
        event: "orphans_deleted",
        pid,
        count: deleted,
      });
      return { ok: true };
    },
  );
}
