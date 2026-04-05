import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioCapture } from "../useAudioCapture";
import {
  getDictationStatus,
  transcribeAudio,
  processTranscript,
  getSnippets,
} from "../../utils/api";
import type { DictationState, DictationActions } from "./types";

const INITIAL_STATE: DictationState = {
  phase: "idle",
  rawTranscript: "",
  processedText: "",
  error: null,
  whisperStatus: false,
  ollamaStatus: false,
  hasModel: false,
  f4Active: false,
};

export function useDictation(): {
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

  // F4 IPC awareness
  useEffect(() => {
    if (!window.weaver?.onDictationCommand) {
      return;
    }
    window.weaver.onDictationCommand((_event, command) => {
      if (command === "start" || command === "stop") {
        setState((s) => ({ ...s, f4Active: true }));
      }
    });
  }, []);

  const checkServices = useCallback(async () => {
    setState((s) => ({ ...s, phase: "preflight_checking" }));
    try {
      const status = await getDictationStatus();
      const whisperOk = status.whisper;
      const ollamaOk = status.ollama;
      setState((s) => ({
        ...s,
        whisperStatus: whisperOk,
        ollamaStatus: ollamaOk,
        hasModel: !!status.model,
        phase: whisperOk && ollamaOk ? "ready" : "error",
        error: !ollamaOk
          ? "Ollama is not available"
          : !whisperOk
            ? "No whisper model downloaded"
            : null,
      }));
    } catch {
      setState((s) => ({
        ...s,
        phase: "error",
        error: "Failed to check services",
      }));
    }
  }, []);

  const startDictation = useCallback(async () => {
    transcriptRef.current = "";
    pendingRef.current = Promise.resolve();
    setState((s) => ({
      ...s,
      phase: "starting",
      rawTranscript: "",
      processedText: "",
      error: null,
    }));
    try {
      await audio.startRecording();
      setState((s) => ({ ...s, phase: "recording" }));
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: err instanceof Error ? err.message : "Microphone access failed",
      }));
    }
  }, [audio]);

  const stopDictation = useCallback(() => {
    setState((s) => ({ ...s, phase: "processing" }));
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
    actions: {
      checkServices,
      startDictation,
      stopDictation,
      copyToClipboard,
      reset,
    },
  };
}
