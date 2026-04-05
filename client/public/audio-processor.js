// AudioWorklet processor that buffers PCM samples and posts chunks to the main thread.
// Chunk duration: ~4 seconds at 16kHz = 64000 samples.
// Buffer threshold: 2048 samples per process() call accumulation.

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
    this._active = true;
    this.port.onmessage = (e) => {
      if (e.data === "flush") {
        if (this._buffer.length > 0) {
          this.port.postMessage({ type: "chunk", samples: this._buffer });
          this._buffer = new Float32Array(0);
        }
        this.port.postMessage({ type: "flushed" });
        this._active = false;
      }
    };
  }

  process(inputs) {
    if (!this._active) return false;
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const channelData = input[0];
    const merged = new Float32Array(this._buffer.length + channelData.length);
    merged.set(this._buffer);
    merged.set(channelData, this._buffer.length);
    this._buffer = merged;

    // Post chunk every ~4 seconds (64000 samples at 16kHz)
    if (this._buffer.length >= 64000) {
      this.port.postMessage({ type: "chunk", samples: this._buffer });
      this._buffer = new Float32Array(0);
    }

    return true;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
