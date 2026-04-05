import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAudioCapture } from "../useAudioCapture";
import { playNotificationSound } from "../notifications/soundUtils";
import {
  transcribeAudio,
  processTranscript,
  getSnippets,
} from "../../utils/api";

type Phase = "idle" | "recording" | "processing";

export const HotkeyDictationContext = createContext(false);

export function useHotkeyDictationActive(): boolean {
  return useContext(HotkeyDictationContext);
}

export function useHotkeyDictation(): { active: boolean } {
  const [phase, setPhase] = useState<Phase>("idle");
  const audio = useAudioCapture();
  const transcriptRef = useRef("");
  const pendingRef = useRef<Promise<void>>(Promise.resolve());
  const audioRef = useRef(audio);
  audioRef.current = audio;

  useEffect(() => {
    audio.onChunk((blob: Blob) => {
      pendingRef.current = pendingRef.current.then(async () => {
        try {
          const { text } = await transcribeAudio(blob);
          transcriptRef.current += text;
        } catch {
          /* non-fatal */
        }
      });
    });
  }, [audio]);

  useEffect(() => {
    if (phase !== "processing" || audio.isRecording) {
      return;
    }

    const run = async () => {
      await pendingRef.current;
      const transcript = transcriptRef.current;
      if (!transcript.trim()) {
        window.weaver?.sendDictationComplete("");
        playNotificationSound("dictation-done");
        setPhase("idle");
        return;
      }
      try {
        const { snippets } = await getSnippets();
        const result = await processTranscript(transcript, snippets);
        window.weaver?.sendDictationComplete(result.processedText);
        playNotificationSound("dictation-done");
      } catch (err) {
        window.weaver?.sendDictationError(
          err instanceof Error ? err.message : "Processing failed",
        );
      }
      setPhase("idle");
    };
    run();
  }, [phase, audio.isRecording]);

  useEffect(() => {
    if (!window.weaver?.onDictationCommand) {
      return;
    }

    window.weaver.onDictationCommand((_event, command) => {
      if (command === "start") {
        transcriptRef.current = "";
        pendingRef.current = Promise.resolve();
        setPhase("recording");
        playNotificationSound("dictation-start");
        audioRef.current.startRecording();
      } else if (command === "stop") {
        playNotificationSound("dictation-stop");
        setPhase("processing");
        audioRef.current.stopRecording();
      }
    });
  }, []);

  return { active: phase !== "idle" };
}
