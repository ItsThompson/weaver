import { useCallback, useRef, useState } from "react";
import { encodeWav } from "./wav-encoder";

const TARGET_SAMPLE_RATE = 16000;

export function useAudioCapture() {
  const [isRecording, setIsRecording] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callbackRef = useRef<((blob: Blob) => void) | null>(null);

  const handleChunk = useCallback((samples: Float32Array) => {
    const ctx = ctxRef.current;
    if (!ctx || !callbackRef.current) {
      return;
    }

    const deviceRate = ctx.sampleRate;
    const resampled =
      deviceRate === TARGET_SAMPLE_RATE
        ? samples
        : resample(samples, deviceRate, TARGET_SAMPLE_RATE);

    callbackRef.current(encodeWav(resampled));
  }, []);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: TARGET_SAMPLE_RATE, channelCount: 1 },
    });
    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    ctxRef.current = ctx;

    await ctx.audioWorklet.addModule("/audio-processor.js");
    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const worklet = new AudioWorkletNode(ctx, "audio-capture-processor");
    workletRef.current = worklet;

    worklet.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === "chunk") {
        handleChunk(e.data.samples);
      }
    };

    source.connect(worklet);
    worklet.connect(ctx.destination);
    setIsRecording(true);
  }, [handleChunk]);

  const stopRecording = useCallback(() => {
    const worklet = workletRef.current;
    if (worklet) {
      // Replace handler to catch flush
      worklet.port.onmessage = (e: MessageEvent) => {
        if (e.data.type === "chunk") {
          handleChunk(e.data.samples);
        }
        if (e.data.type === "flushed") {
          cleanup();
        }
      };
      worklet.port.postMessage("flush");
    } else {
      cleanup();
    }
    setIsRecording(false);
  }, [handleChunk]);

  const cleanup = useCallback(() => {
    sourceRef.current?.disconnect();
    workletRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.suspend();
    }
    sourceRef.current = null;
    workletRef.current = null;
    streamRef.current = null;
  }, []);

  const onChunk = useCallback((callback: (blob: Blob) => void) => {
    callbackRef.current = callback;
  }, []);

  return { isRecording, startRecording, stopRecording, onChunk };
}

/** Linear interpolation resampling from one sample rate to another. */
function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  const ratio = fromRate / toRate;
  const outLength = Math.round(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, samples.length - 1);
    const frac = srcIdx - lo;
    out[i] = samples[lo] * (1 - frac) + samples[hi] * frac;
  }
  return out;
}
