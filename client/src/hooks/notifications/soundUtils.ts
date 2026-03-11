export type NotificationSound = "beep" | "chime";

const SAMPLE_RATE = 44100;

function generateTone(
  frequency: number,
  duration: number,
  volume = 0.15,
): Float32Array {
  const length = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const envelope = volume * Math.pow(0.001 / volume, t / duration);
    samples[i] = Math.sin(2 * Math.PI * frequency * t) * envelope;
  }
  return samples;
}

function mixSamples(
  ...tracks: { samples: Float32Array; offsetSamples: number }[]
): Float32Array {
  const length = Math.max(
    ...tracks.map((t) => t.offsetSamples + t.samples.length),
  );
  const mixed = new Float32Array(length);
  for (const { samples, offsetSamples } of tracks) {
    for (let i = 0; i < samples.length; i++) {
      mixed[offsetSamples + i] += samples[i];
    }
  }
  return mixed;
}

function samplesToWavUrl(samples: Float32Array): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); // 16-bit
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    view.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(1, samples[i])) * 0x7fff,
      true,
    );
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

const SOUND_URLS: Record<NotificationSound, string> = {
  beep: samplesToWavUrl(generateTone(440, 0.15)),
  chime: samplesToWavUrl(
    mixSamples(
      { samples: generateTone(523, 0.2), offsetSamples: 0 },
      {
        samples: generateTone(659, 0.3),
        offsetSamples: Math.floor(SAMPLE_RATE * 0.15),
      },
    ),
  ),
};

export function playNotificationSound(sound: NotificationSound): void {
  new Audio(SOUND_URLS[sound]).play().catch(() => {});
}
