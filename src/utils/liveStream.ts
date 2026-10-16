/**
 * Live Communication & Real-Time Audio Streaming Utility
 * Rakshika AI Women's Safety & Guardian Ecosystem
 *
 * Implements low-latency PCM audio streaming over WebSocket:
 * - Ultra-low latency (~50-100ms)
 * - Zero WebM/container header overhead
 * - Automatic buffer scheduling to prevent audio clipping or stutter
 * - Real-time volume & waveform frequency metering
 */

export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

export function pcmToBase64(bytes: Int16Array): string {
  const uint8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binary = '';
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

export function base64ToPcm(base64: string): Int16Array {
  const binary = attoa(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
}

function attoa(b64: string): string {
  if (typeof window !== 'undefined' && window.atob) {
    return window.atob(b64);
  }
  return '';
}

/**
 * LiveAudioPlayer handles playing sequential PCM chunks received from the network
 * with smooth audio scheduling, volume control, and level metering.
 */
export class LiveAudioPlayer {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextPlayTime: number = 0;
  private sampleRate: number = 16000;
  private isMuted: boolean = true;
  private volume: number = 1.0;
  private currentLevel: number = 0;
  private onLevelChange?: (level: number) => void;

  constructor(sampleRate: number = 16000, onLevelChange?: (level: number) => void) {
    this.sampleRate = sampleRate;
    this.onLevelChange = onLevelChange;
  }

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx({ sampleRate: this.sampleRate });
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
        this.gainNode.connect(this.ctx.destination);
      }
    }
  }

  public async resume(): Promise<void> {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('AudioContext resume failed:', err);
      }
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime);
    }
    if (!muted) {
      this.resume();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.ctx && !this.isMuted) {
      this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public playChunk(pcmBase64: string, sampleRate: number = 16000) {
    if (this.isMuted) {
      // Still calculate level for visual meters even when speaker is muted
      this.calculateLevelFromBase64(pcmBase64);
      return;
    }

    this.initContext();
    if (!this.ctx || !this.gainNode) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    try {
      const pcm16 = base64ToPcm(pcmBase64);
      if (pcm16.length === 0) return;

      // Calculate level
      this.calculateLevel(pcm16);

      const floatData = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        floatData[i] = pcm16[i] / 32768.0;
      }

      const buffer = this.ctx.createBuffer(1, floatData.length, sampleRate);
      buffer.copyToChannel(floatData, 0);

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);

      const now = this.ctx.currentTime;
      // If we fell behind, reset schedule to current time + 20ms buffer
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now + 0.02;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += buffer.duration;
    } catch (e) {
      console.warn('Error playing audio chunk:', e);
    }
  }

  private calculateLevelFromBase64(pcmBase64: string) {
    try {
      const pcm16 = base64ToPcm(pcmBase64);
      this.calculateLevel(pcm16);
    } catch (_) {}
  }

  private calculateLevel(pcm16: Int16Array) {
    let sum = 0;
    const len = pcm16.length;
    for (let i = 0; i < len; i += 4) {
      const val = pcm16[i] / 32768.0;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / (len / 4 || 1));
    const level = Math.min(100, Math.round(rms * 250));
    this.currentLevel = level;
    if (this.onLevelChange) {
      this.onLevelChange(level);
    }
  }

  public getLevel(): number {
    return this.currentLevel;
  }

  public close() {
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch (_) {}
      this.ctx = null;
    }
  }
}

/**
 * LiveAudioCapture captures microphone stream, converts to raw PCM Int16,
 * calculates real-time RMS volume, and invokes callback with Base64 chunks.
 */
export class LiveAudioCapture {
  private ctx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isCapturing: boolean = false;
  private onChunk: (base64: string, volume: number) => void;
  private sampleRate: number = 16000;

  constructor(onChunk: (base64: string, volume: number) => void, sampleRate: number = 16000) {
    this.onChunk = onChunk;
    this.sampleRate = sampleRate;
  }

  public async start(stream: MediaStream): Promise<void> {
    if (this.isCapturing) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx({ sampleRate: this.sampleRate });
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.source = this.ctx.createMediaStreamSource(stream);
      // Buffer size 2048 at 16kHz = ~128ms per packet
      this.processor = this.ctx.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isCapturing) return;
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume RMS
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const volume = Math.min(100, Math.round(rms * 250));

        const pcm16 = floatTo16BitPCM(inputData);
        const base64 = pcmToBase64(pcm16);
        this.onChunk(base64, volume);
      };

      this.source.connect(this.processor);
      // In webkit browsers, processor must be connected to destination for onaudioprocess to fire
      const silentGain = this.ctx.createGain();
      silentGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.processor.connect(silentGain);
      silentGain.connect(this.ctx.destination);

      this.isCapturing = true;
    } catch (err) {
      console.warn('Failed to start LiveAudioCapture:', err);
    }
  }

  public stop() {
    this.isCapturing = false;
    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch (_) {}
      this.processor = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (_) {}
      this.source = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch (_) {}
      this.ctx = null;
    }
  }

  public isActive(): boolean {
    return this.isCapturing;
  }
}
