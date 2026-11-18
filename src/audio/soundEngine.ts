import type { BuiltInSoundId } from '../core/settings';

export interface SoundOption {
  id: BuiltInSoundId;
  label: string;
  subtitle: string;
}

export const SOUND_OPTIONS: SoundOption[] = [
  {
    id: 'sad-trombone',
    label: '🎺 Kèn thất bại (Sad Trombone)',
    subtitle: 'Wah-wah-wah-waaaah cà khịa kinh điển',
  },
  {
    id: 'ba-dum-tss',
    label: '🥁 Trống tấu hài (Ba-dum-tss)',
    subtitle: 'Nhịp trống chốt câu bông đùa vui nhộn',
  },
  {
    id: 'siren',
    label: '🚨 Còi báo động khẩn',
    subtitle: 'Còi hú hai tầng cho việc siêu gấp',
  },
  {
    id: 'retro-fail',
    label: '👾 Game Over 8-bit',
    subtitle: 'Âm điện tử cổ điển báo hết giờ',
  },
  {
    id: 'chime',
    label: '🔔 Chuông văn phòng thanh lịch',
    subtitle: 'Nhẹ nhàng, lịch sự khi ngồi cùng đồng nghiệp',
  },
  {
    id: 'custom',
    label: '🎵 File âm thanh riêng (.mp3 / .wav)',
    subtitle: 'Phát nhạc chuông hoặc meme do bạn tự chọn',
  },
];

let sharedAudioCtx: AudioContext | null = null;
let activeHtmlAudio: HTMLAudioElement | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new Ctor();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

function playTone(
  ctx: AudioContext,
  params: {
    freq: number;
    endFreq?: number;
    startOffset: number;
    duration: number;
    type: OscillatorType;
    gain: number;
  },
): void {
  const start = ctx.currentTime + params.startOffset;
  const end = start + params.duration;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = params.type;
  osc.frequency.setValueAtTime(params.freq, start);
  if (params.endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, params.endFreq), end);
  }

  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, params.gain), start + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.01);
}

function playNoiseSplash(
  ctx: AudioContext,
  startOffset: number,
  duration: number,
  gain: number,
): void {
  const sampleCount = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.35));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 3200;

  const gainNode = ctx.createGain();
  const start = ctx.currentTime + startOffset;
  gainNode.gain.setValueAtTime(Math.max(0.001, gain), start);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  noise.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  noise.start(start);
  noise.stop(start + duration);
}

export function playPreDeadlineHeadsUp(volume: number): void {
  const ctx = getAudioContext();
  if (!ctx || volume <= 0) return;
  const v = Math.min(1, Math.max(0.05, volume)) * 0.25;
  playTone(ctx, { freq: 587.33, startOffset: 0, duration: 0.14, type: 'sine', gain: v });
  playTone(ctx, { freq: 880, startOffset: 0.15, duration: 0.22, type: 'sine', gain: v });
}

export function playAlertSound(options: {
  soundId: BuiltInSoundId;
  volume: number;
  customSoundDataUrl?: string | null;
}): void {
  const volume = Math.min(1, Math.max(0, options.volume));
  if (volume <= 0) return;

  if (options.soundId === 'custom' && options.customSoundDataUrl) {
    try {
      if (activeHtmlAudio) {
        activeHtmlAudio.pause();
        activeHtmlAudio.currentTime = 0;
      }
      activeHtmlAudio = new Audio(options.customSoundDataUrl);
      activeHtmlAudio.volume = volume;
      void activeHtmlAudio.play();
      return;
    } catch {
      // Fall back to sad-trombone if custom audio fails to decode
    }
  }

  const ctx = getAudioContext();
  if (!ctx) return;
  const v = volume * 0.42;

  switch (options.soundId) {
    case 'ba-dum-tss': {
      playTone(ctx, {
        freq: 175,
        endFreq: 95,
        startOffset: 0,
        duration: 0.16,
        type: 'triangle',
        gain: v * 1.1,
      });
      playTone(ctx, {
        freq: 140,
        endFreq: 75,
        startOffset: 0.19,
        duration: 0.18,
        type: 'triangle',
        gain: v * 1.1,
      });
      playNoiseSplash(ctx, 0.4, 0.55, v * 0.9);
      break;
    }

    case 'siren': {
      for (let cycle = 0; cycle < 3; cycle += 1) {
        const base = cycle * 0.36;
        playTone(ctx, {
          freq: 660,
          endFreq: 990,
          startOffset: base,
          duration: 0.17,
          type: 'sawtooth',
          gain: v * 0.65,
        });
        playTone(ctx, {
          freq: 990,
          endFreq: 660,
          startOffset: base + 0.18,
          duration: 0.17,
          type: 'sawtooth',
          gain: v * 0.65,
        });
      }
      break;
    }

    case 'retro-fail': {
      const notes = [523.25, 493.88, 466.16, 440, 349.23, 261.63];
      notes.forEach((freq, idx) => {
        playTone(ctx, {
          freq,
          startOffset: idx * 0.11,
          duration: idx === notes.length - 1 ? 0.38 : 0.1,
          type: 'square',
          gain: v * 0.55,
        });
      });
      break;
    }

    case 'chime': {
      const chord = [523.25, 659.25, 783.99, 987.77];
      chord.forEach((freq, idx) => {
        playTone(ctx, {
          freq,
          startOffset: idx * 0.09,
          duration: 0.45,
          type: 'sine',
          gain: v * 0.7,
        });
      });
      break;
    }

    case 'sad-trombone':
    case 'custom':
    default: {
      // Classic descending "wah-wah-wah-waaaah"
      playTone(ctx, {
        freq: 392.0,
        endFreq: 370.0,
        startOffset: 0,
        duration: 0.28,
        type: 'sawtooth',
        gain: v * 0.65,
      });
      playTone(ctx, {
        freq: 369.99,
        endFreq: 349.23,
        startOffset: 0.31,
        duration: 0.28,
        type: 'sawtooth',
        gain: v * 0.65,
      });
      playTone(ctx, {
        freq: 349.23,
        endFreq: 329.63,
        startOffset: 0.62,
        duration: 0.28,
        type: 'sawtooth',
        gain: v * 0.65,
      });
      playTone(ctx, {
        freq: 329.63,
        endFreq: 233.08,
        startOffset: 0.93,
        duration: 0.72,
        type: 'sawtooth',
        gain: v * 0.75,
      });
      break;
    }
  }
}
