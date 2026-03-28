import http from "node:http";
import { log } from "./utils/logger";

type EventHandler = (event: string, data: unknown) => void;

export function subscribeSSE(baseUrl: string, onEvent: EventHandler): void {
  function connect() {
    http
      .get(`${baseUrl}/api/events`, (res) => {
        let buffer = "";

        res.on("data", (chunk: string) => {
          buffer += chunk;
          const parts = buffer.split("\n\n");
          buffer = parts.pop()!;

          parts.forEach((part) => {
            const eventMatch = part.match(/^event: (.+)$/m);
            const dataMatch = part.match(/^data: (.+)$/m);
            if (eventMatch && dataMatch) {
              try {
                onEvent(eventMatch[1], JSON.parse(dataMatch[1]));
              } catch (e) {
                log({
                  timestamp: new Date().toISOString(),
                  event: "sse_parse_error",
                  error: String(e),
                });
              }
            }
          });
        });

        res.on("end", () => setTimeout(connect, 1000));
        res.on("error", () => setTimeout(connect, 1000));
      })
      .on("error", () => setTimeout(connect, 1000));
  }

  connect();
}
