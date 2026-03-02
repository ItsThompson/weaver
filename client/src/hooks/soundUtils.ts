let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    const resume = () => {
      audioCtx?.resume();
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
    };
    document.addEventListener('click', resume);
    document.addEventListener('keydown', resume);
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, startOffset = 0): void {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.value = 0.15;

  osc.connect(gain);
  gain.connect(ctx.destination);

  const start = ctx.currentTime + startOffset;
  osc.start(start);
  gain.gain.setValueAtTime(0.15, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.stop(start + duration);
}

export type NotificationSound = 'chime' | 'beep';

const SOUND_PLAYERS: Record<NotificationSound, () => void> = {
  chime: () => { playTone(523, 0.2); playTone(659, 0.3, 0.15); },
  beep: () => { playTone(440, 0.15); },
};

export function playNotificationSound(sound: NotificationSound): void {
  SOUND_PLAYERS[sound]();
}
