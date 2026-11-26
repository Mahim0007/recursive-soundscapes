import * as Tone from "tone";
import { clamp, type MusicalEvent } from "./recursion.ts";

interface VoiceNode {
  synth: Tone.Synth;
  panner: Tone.Panner;
  lastStartTime: number;
}

const VOICE_POOL_SIZE = 12;
const PAD_MIN_INTERVAL_MS = 2800;

export class AmbientAudioEngine {
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private voiceIndex = 0;
  private lastPadMs = 0;

  private voicePool: VoiceNode[] = [];
  private chimeSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private padSynth: Tone.PolySynth<Tone.Synth> | null = null;
  private filter: Tone.Filter | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private reverb: Tone.Reverb | null = null;
  private masterGain: Tone.Gain | null = null;
  private limiter: Tone.Limiter | null = null;
  private recorder: Tone.Recorder | null = null;

  async init(volume: number): Promise<void> {
    await Tone.start();
    if (this.initialized) {
      this.setVolume(volume);
      return;
    }
    if (this.initPromise) {
      await this.initPromise;
      this.setVolume(volume);
      return;
    }

    this.initPromise = (async () => {
      try {
        const isMobile =
          typeof window !== "undefined" &&
          (window.matchMedia("(pointer: coarse)").matches ||
            (navigator.hardwareConcurrency ?? 8) <= 4);
        const poolSize = isMobile ? 8 : VOICE_POOL_SIZE;
        const reverbDecay = isMobile ? 4.5 : 7.5;

        this.limiter = new Tone.Limiter(-2).toDestination();
        this.masterGain = new Tone.Gain(clamp(volume, 0, 1, 0.78)).connect(this.limiter);
        this.reverb = new Tone.Reverb({ decay: reverbDecay, preDelay: 0.08, wet: 0.62 }).connect(
          this.masterGain
        );
        this.delay = new Tone.FeedbackDelay({ delayTime: "4n.", feedback: 0.32, wet: 0.26 }).connect(
          this.reverb
        );
        this.filter = new Tone.Filter({ frequency: 1800, type: "lowpass", rolloff: -12 }).connect(
          this.delay
        );

        this.voicePool = Array.from({ length: poolSize }, (_, idx) => {
          const panner = new Tone.Panner(0).connect(this.filter!);
          const synth = new Tone.Synth({
            oscillator: { type: idx % 2 === 0 ? "sine" : "triangle" },
            envelope: { attack: 0.22, decay: 0.6, sustain: 0.35, release: 2.6 },
            volume: -14,
          }).connect(panner);
          return { synth, panner, lastStartTime: 0 };
        });

        this.chimeSynth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "sine" },
          envelope: { attack: 0.08, decay: 0.9, sustain: 0.12, release: 4.2 },
          volume: -21,
        }).connect(this.reverb);

        this.padSynth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 1.8, decay: 1.4, sustain: 0.55, release: 5.2 },
          volume: -24,
        }).connect(this.reverb);

        if (Tone.Recorder.supported) {
          try {
            this.recorder = new Tone.Recorder();
            this.limiter.connect(this.recorder);
          } catch {
            this.recorder = null;
          }
        }

        await this.reverb.ready;
        this.initialized = true;
      } catch (err) {
        this.dispose();
        throw err;
      } finally {
        this.initPromise = null;
      }
    })();

    await this.initPromise;
    this.setVolume(volume);
  }

  setVolume(volume: number): void {
    if (!this.masterGain) return;
    this.masterGain.gain.rampTo(clamp(volume, 0, 1, 0.78), 0.1);
  }

  playStep(event: MusicalEvent): void {
    if (!this.initialized || !this.filter || !this.reverb || this.voicePool.length === 0) {
      return;
    }

    const now = Tone.now();
    this.filter.frequency.rampTo(event.filterHz, 0.25);
    this.reverb.wet.rampTo(event.reverbWet, 0.25);

    const voice = this.voicePool[this.voiceIndex % this.voicePool.length];
    this.voiceIndex += 1;

    // Ensure strictly increasing start times per monophonic voice for Tone.Source.
    const startTime = Math.max(now + 0.02, voice.lastStartTime + 0.01);
    voice.lastStartTime = startTime;

    voice.panner.pan.rampTo(event.pan, 0.04);
    voice.synth.triggerAttackRelease(event.note, event.durationSec, startTime, event.velocity);

    if (event.chimeNote && this.chimeSynth) {
      this.chimeSynth.triggerAttackRelease(event.chimeNote, "2n", now + 0.06, 0.25);
    }

    if (event.chord && this.padSynth) {
      const perfNow = performance.now();
      if (perfNow - this.lastPadMs >= PAD_MIN_INTERVAL_MS) {
        this.lastPadMs = perfNow;
        this.padSynth.triggerAttackRelease([...event.chord], "2m", now + 0.04, 0.22);
      }
    }
  }

  startRecording(): boolean {
    if (!this.initialized || !this.recorder) return false;
    if (this.recorder.state !== "started") {
      try {
        void this.recorder.start().catch(() => {});
      } catch {
        return false;
      }
    }
    return this.recorder.state === "started";
  }

  pauseRecording(): void {
    if (this.recorder?.state === "started") {
      try {
        this.recorder.pause();
      } catch {
        // Ignore if MediaRecorder transitioned concurrently.
      }
    }
  }

  async stopRecording(): Promise<Blob | null> {
    if (!this.recorder || this.recorder.state === "stopped") return null;
    try {
      return await this.recorder.stop();
    } catch {
      return null;
    }
  }

  releaseAll(): void {
    this.chimeSynth?.releaseAll();
    this.padSynth?.releaseAll();
    for (const voice of this.voicePool) {
      voice.synth.triggerRelease();
    }
  }

  dispose(): void {
    this.initPromise = null;
    if (this.recorder && this.recorder.state !== "stopped") {
      void this.recorder.stop().catch(() => {});
    }
    this.recorder?.dispose();
    this.recorder = null;
    for (const voice of this.voicePool) {
      voice.synth.dispose();
      voice.panner.dispose();
    }
    this.voicePool = [];
    this.chimeSynth?.dispose();
    this.chimeSynth = null;
    this.padSynth?.dispose();
    this.padSynth = null;
    this.filter?.dispose();
    this.filter = null;
    this.delay?.dispose();
    this.delay = null;
    this.reverb?.dispose();
    this.reverb = null;
    this.masterGain?.dispose();
    this.masterGain = null;
    this.limiter?.dispose();
    this.limiter = null;
    this.initialized = false;
  }
}
