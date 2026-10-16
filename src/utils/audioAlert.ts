/**
 * Web Audio API Emergency Siren Service
 * Provides loud, authentic dual-tone wailing siren and reliable mute/unmute controls
 * across all modern browsers and mobile web views.
 */

class AudioAlertService {
  private ctx: AudioContext | null = null;
  private carrierOsc: OscillatorNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private currentVolume: number = 0.35;
  private isRunning: boolean = false;

  public getContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    return this.ctx;
  }

  public async resume(): Promise<void> {
    const context = this.getContext();
    if (context && context.state === 'suspended') {
      try {
        await context.resume();
      } catch (e) {
        console.warn('AudioContext resume error:', e);
      }
    }
  }

  public async startSiren(volume: number = 0.35): Promise<void> {
    this.currentVolume = volume;
    this.isMuted = false;

    try {
      const context = this.getContext();
      if (!context) return;

      if (context.state === 'suspended') {
        await context.resume();
      }

      // Stop any existing sound first to avoid overlapping oscillators
      this.stopSirenNodesOnly();

      // Master Gain
      const master = context.createGain();
      master.gain.setValueAtTime(this.currentVolume, context.currentTime);
      master.connect(context.destination);
      this.masterGain = master;

      // Carrier Oscillator (Wailing siren base ~880 Hz)
      const carrier = context.createOscillator();
      carrier.type = 'sawtooth';
      carrier.frequency.setValueAtTime(880, context.currentTime);

      // LFO to oscillate frequency between ~600 Hz and 1160 Hz
      const lfo = context.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(2.2, context.currentTime); // 2.2 cycles per second

      // LFO Gain: depth of oscillation
      const lfoGain = context.createGain();
      lfoGain.gain.setValueAtTime(280, context.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(carrier.frequency);

      carrier.connect(master);

      carrier.start();
      lfo.start();

      this.carrierOsc = carrier;
      this.lfoOsc = lfo;
      this.lfoGain = lfoGain;
      this.isRunning = true;
    } catch (e) {
      console.warn('Failed to play emergency siren:', e);
    }
  }

  public mute(): void {
    this.isMuted = true;
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      } catch (e) {}
    }
  }

  public unmute(): void {
    this.isMuted = false;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.masterGain && this.ctx && this.isRunning) {
      try {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(this.currentVolume, this.ctx.currentTime);
      } catch (e) {}
    } else {
      this.startSiren(this.currentVolume);
    }
  }

  public toggleMute(): boolean {
    if (this.isMuted) {
      this.unmute();
      return false; // Now unmuted
    } else {
      this.mute();
      return true; // Now muted
    }
  }

  public setVolume(vol: number): void {
    this.currentVolume = vol;
    if (!this.isMuted && this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.setValueAtTime(vol, this.ctx.currentTime);
      } catch (e) {}
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsPlaying(): boolean {
    return this.isRunning && !this.isMuted;
  }

  private stopSirenNodesOnly(): void {
    if (this.carrierOsc) {
      try {
        this.carrierOsc.stop();
        this.carrierOsc.disconnect();
      } catch (e) {}
      this.carrierOsc = null;
    }
    if (this.lfoOsc) {
      try {
        this.lfoOsc.stop();
        this.lfoOsc.disconnect();
      } catch (e) {}
      this.lfoOsc = null;
    }
    if (this.lfoGain) {
      try {
        this.lfoGain.disconnect();
      } catch (e) {}
      this.lfoGain = null;
    }
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch (e) {}
      this.masterGain = null;
    }
    this.isRunning = false;
  }

  public stopSiren(): void {
    this.stopSirenNodesOnly();
  }
}

export const audioAlert = new AudioAlertService();
