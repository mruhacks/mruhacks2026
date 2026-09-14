'use client';

type ScanCue = 'accepted' | 'duplicate' | 'rejected';

const TONES: Record<ScanCue, number[]> = {
  accepted: [880, 1320],
  duplicate: [700, 700],
  rejected: [260, 180],
};

const VIBRATIONS: Record<ScanCue, number[]> = {
  accepted: [45],
  duplicate: [30, 70, 30],
  rejected: [110, 70, 110],
};

const TONE_SECONDS = 0.09;

let context: AudioContext | null = null;

/** Opens the audio device. Must run inside a user gesture for iOS to allow it. */
export function primeScanCue() {
  try {
    context ??= new AudioContext();
    void context.resume();
  } catch {
    context = null;
  }
}

export function playScanCue(cue: ScanCue) {
  navigator.vibrate?.(VIBRATIONS[cue]);

  const audio = context;
  if (!audio || audio.state !== 'running') return;

  TONES[cue].forEach((frequency, index) => {
    const startAt = audio.currentTime + index * TONE_SECONDS;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.15, startAt);
    gain.gain.linearRampToValueAtTime(0, startAt + TONE_SECONDS);

    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + TONE_SECONDS);
  });
}
