import { useCallback, useEffect, useState } from "react";
import type { WhisperModel } from "@weaver/shared/types";
import { getModels } from "../../../utils/api";

interface DownloadStatus {
  filename: string | null;
  progress: number;
  error: string | null;
}

const IDLE_STATUS: DownloadStatus = {
  filename: null,
  progress: 0,
  error: null,
};

type SSEResult =
  | { type: "progress"; progress: number }
  | { type: "complete" }
  | { type: "error"; error: string };

function parseSSEEvent(line: string): SSEResult | null {
  const match = line.match(/^data: (.+)$/m);
  if (!match) {
    return null;
  }
  const event = JSON.parse(match[1]);
  if (event.progress !== undefined) {
    return { type: "progress", progress: event.progress };
  }
  if (event.complete) {
    return { type: "complete" };
  }
  if (event.error) {
    return { type: "error", error: event.error };
  }
  return null;
}

type StreamResult =
  | { type: "complete" }
  | { type: "error"; error: string }
  | { type: "done" };

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onProgress: (progress: number) => void,
): Promise<StreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const result = parseSSEEvent(line);
      if (!result) {
        continue;
      }
      if (result.type === "progress") {
        onProgress(result.progress);
      } else if (result.type === "complete") {
        return { type: "complete" };
      } else if (result.type === "error") {
        return { type: "error", error: result.error };
      }
    }
  }
  return { type: "done" };
}

export function useModelDownload(onComplete: () => void) {
  const [available, setAvailable] = useState<WhisperModel[]>([]);
  const [local, setLocal] = useState<string[]>([]);
  const [download, setDownload] = useState<DownloadStatus>(IDLE_STATUS);

  const fetchModels = useCallback(async () => {
    try {
      const data = await getModels();
      setAvailable(data.available);
      setLocal(data.local);
    } catch {
      setDownload((prev) => ({ ...prev, error: "Failed to fetch models" }));
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleDownload = useCallback(
    async (filename: string) => {
      setDownload({ filename, progress: 0, error: null });

      try {
        const response = await fetch("/api/dictation/models/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename }),
        });

        if (!response.ok || !response.body) {
          setDownload({ ...IDLE_STATUS, error: "Download request failed" });
          return;
        }

        const streamResult = await readSSEStream(response.body, (progress) =>
          setDownload((prev) => ({ ...prev, progress })),
        );
        if (streamResult.type === "error") {
          setDownload({ ...IDLE_STATUS, error: streamResult.error });
        } else if (streamResult.type === "complete") {
          setDownload(IDLE_STATUS);
          onComplete();
        }
      } catch {
        setDownload({ ...IDLE_STATUS, error: "Download failed" });
      }
    },
    [onComplete],
  );

  return {
    available,
    local,
    downloading: download.filename,
    progress: download.progress,
    error: download.error,
    fetchModels,
    handleDownload,
  };
}
