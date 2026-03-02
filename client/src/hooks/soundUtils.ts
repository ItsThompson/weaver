import type { ActivityStatus } from '@weaver/shared/types';

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

// Two-tone ascending chime for idle — the "session done" alert
function playIdleChime(): void {
  playTone(523, 0.2);       // C5
  playTone(659, 0.3, 0.15); // E5
}

// Short single beep for other notifications
function playDefaultBeep(): void {
  playTone(440, 0.15); // A4
}

export function playNotificationSound(activity: ActivityStatus): void {
  if (activity === 'idle') {
    playIdleChime();
  } else {
    playDefaultBeep();
  }
}
