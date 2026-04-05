import { describe, it, expect } from "vitest";
import { encodeWav } from "./wav-encoder";

describe("encodeWav", () => {
  it("produces a blob with audio/wav type", () => {
    const blob = encodeWav(new Float32Array(160));
    expect(blob.type).toBe("audio/wav");
  });

  it("produces correct file size (44-byte header + 2 bytes per sample)", () => {
    const samples = new Float32Array(100);
    const blob = encodeWav(samples);
    expect(blob.size).toBe(44 + 100 * 2);
  });

  it("writes correct RIFF/WAVE header", async () => {
    const blob = encodeWav(new Float32Array(10));
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    const str = (offset: number, len: number) =>
      String.fromCharCode(...new Uint8Array(buf, offset, len));

    expect(str(0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 10 * 2);
    expect(str(8, 4)).toBe("WAVE");
    expect(str(12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM format
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint32(28, true)).toBe(32000); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(str(36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(10 * 2);
  });

  it("encodes sample values as 16-bit signed integers", async () => {
    const samples = new Float32Array([0, 1, -1, 0.5, -0.5]);
    const blob = encodeWav(samples);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);

    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x7fff);
    expect(view.getInt16(50, true)).toBeCloseTo(0x7fff * 0.5, -1);
    expect(view.getInt16(52, true)).toBeCloseTo(-0x7fff * 0.5, -1);
  });

  it("clamps values outside [-1, 1]", async () => {
    const samples = new Float32Array([2.0, -3.0]);
    const blob = encodeWav(samples);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);

    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x7fff);
  });

  it("handles empty input", () => {
    const blob = encodeWav(new Float32Array(0));
    expect(blob.size).toBe(44);
  });
});
