import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioCapture } from "../useAudioCapture";
import { resolveDeviceId } from "../useAudioDevices";
import {
  transcribeAudio,
  processTranscript,
  getSnippets,
} from "../../utils/api";
import { playNotificationSound } from "../notifications/soundUtils";
import type { DictationState, DictationActions } from "./types";

const INITIAL_STATE: DictationState = {
  phase: "idle",
  rawTranscript: "",
  processedText: "",
  error: null,
  deviceWarning: null,
  hotkeyActive: false,
};

export function useDictation(deviceId?: string): {
  state: DictationState;
  actions: DictationActions;
} {
  const [state, setState] = useState<DictationState>(INITIAL_STATE);
  const audio = useAudioCapture();
  const transcriptRef = useRef("");
  const pendingRef = useRef<Promise<void>>(Promise.resolve());
  const stoppingRef = useRef(false);

  useEffect(() => {
    audio.onChunk((blob: Blob) => {
      pendingRef.current = pendingRef.current.then(async () => {
        try {
          const { text } = await transcribeAudio(blob);
          transcriptRef.current += text;
          setState((s) => ({
            ...s,
            rawTranscript: transcriptRef.current,
          }));
        } catch {
          /* transcription errors are non-fatal; next chunk retries */
        }
      });
    });
  }, [audio]);

  // Process after recording stops and all chunks are transcribed
  useEffect(() => {
    if (!stoppingRef.current) {
      return;
    }
    if (audio.isRecording) {
      return;
    }
    stoppingRef.current = false;

    const run = async () => {
      await pendingRef.current;
      const transcript = transcriptRef.current;
      if (!transcript.trim()) {
        setState((s) => ({ ...s, phase: "done", processedText: "" }));
        playNotificationSound("dictation-done");
        return;
      }
      try {
        const { snippets } = await getSnippets();
        const result = await processTranscript(transcript, snippets);
        setState((s) => ({
          ...s,
          phase: "done",
          processedText: result.processedText,
        }));
        playNotificationSound("dictation-done");
      } catch (err) {
        setState((s) => ({
          ...s,
          phase: "error",
          error: err instanceof Error ? err.message : "Processing failed",
        }));
      }
    };
    run();
  }, [audio.isRecording]);

  // Hotkey IPC awareness
  useEffect(() => {
    if (!window.weaver?.onDictationCommand) {
      return;
    }
    window.weaver.onDictationCommand((_event, command) => {
      if (command === "start" || command === "stop") {
        setState((s) => ({ ...s, hotkeyActive: true }));
      }
    });
  }, []);

  const startDictation = useCallback(async () => {
    transcriptRef.current = "";
    pendingRef.current = Promise.resolve();
    setState((prev) => ({
      ...prev,
      phase: "starting",
      rawTranscript: "",
      processedText: "",
      error: null,
      deviceWarning: null,
    }));
    try {
      const resolved = await resolveDeviceId(deviceId ?? "");
      if (resolved.isStale) {
        setState((prev) => ({
          ...prev,
          deviceWarning:
            "Previously selected microphone is no longer available. Using system default.",
        }));
      }
      await audio.startRecording(resolved.deviceId);
      setState((prev) => ({ ...prev, phase: "recording" }));
      playNotificationSound("dictation-start");
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: err instanceof Error ? err.message : "Microphone access failed",
      }));
    }
  }, [audio, deviceId]);

  const stopDictation = useCallback(() => {
    setState((s) => ({ ...s, phase: "processing" }));
    playNotificationSound("dictation-stop");
    stoppingRef.current = true;
    audio.stopRecording();
  }, [audio]);

  const copyToClipboard = useCallback(() => {
    if (window.weaver) {
      window.weaver.copyToClipboard(state.processedText);
    } else {
      navigator.clipboard.writeText(state.processedText);
    }
  }, [state.processedText]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    transcriptRef.current = "";
    pendingRef.current = Promise.resolve();
    stoppingRef.current = false;
  }, []);

  return {
    state,
    actions: { startDictation, stopDictation, copyToClipboard, reset },
  };
}
