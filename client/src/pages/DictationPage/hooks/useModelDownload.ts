import { useCallback, useEffect, useState } from "react";
import type { WhisperModel } from "@weaver/shared/types";
import { getModels } from "../../../utils/api";

export function useModelDownload(onComplete: () => void) {
  const [available, setAvailable] = useState<WhisperModel[]>([]);
  const [local, setLocal] = useState<string[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    try {
      const data = await getModels();
      setAvailable(data.available);
      setLocal(data.local);
    } catch {
      setError("Failed to fetch models");
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleDownload = useCallback(
    async (filename: string) => {
      setDownloading(filename);
      setProgress(0);
      setError(null);

      try {
        const response = await fetch("/api/dictation/models/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename }),
        });

        if (!response.ok || !response.body) {
          setError("Download request failed");
          setDownloading(null);
          return;
        }

        const reader = response.body.getReader();
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
            const match = line.match(/^data: (.+)$/m);
            if (!match) {
              continue;
            }
            const event = JSON.parse(match[1]);

            if (event.progress !== undefined) {
              setProgress(event.progress);
            } else if (event.complete) {
              setDownloading(null);
              onComplete();
              return;
            } else if (event.error) {
              setError(event.error);
              setDownloading(null);
              return;
            }
          }
        }
      } catch {
        setError("Download failed");
        setDownloading(null);
      }
    },
    [onComplete],
  );

  return {
    available,
    local,
    downloading,
    progress,
    error,
    fetchModels,
    handleDownload,
  };
}
