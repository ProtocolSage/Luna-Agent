/**
 * Audio Utility for STT Integration
 * Handles microphone access and audio streaming for both renderer and main processes
 */

export class AudioStream {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private isActive: boolean = false;
  private volumeCallback: ((level: number) => void) | null = null;
  private dataCallback: ((data: Float32Array) => void) | null = null;

  async initialize(config: {
    sampleRate?: number;
    channels?: number;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  } = {}): Promise<void> {
    const audioConfig = {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...config
    };

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConfig
      });

      // Set up audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: audioConfig.sampleRate
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Set up analyser for volume monitoring
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      
      // Set up script processor for raw audio data
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      // Connect audio nodes
      source.connect(this.analyser);
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Set up audio processing
      this.processor.onaudioprocess = (event) => {
        if (!this.isActive) return;

        const inputBuffer = event.inputBuffer.getChannelData(0);
        
        // Calculate volume level
        if (this.volumeCallback) {
          let sum = 0;
          for (let i = 0; i < inputBuffer.length; i++) {
            sum += inputBuffer[i] * inputBuffer[i];
          }
          const rms = Math.sqrt(sum / inputBuffer.length);
          this.volumeCallback(Math.min(rms * 50, 1)); // Normalize to 0-1
        }

        // Send raw audio data to callback
        if (this.dataCallback) {
          this.dataCallback(new Float32Array(inputBuffer));
        }
      };

      console.log('AudioStream initialized successfully');
    } catch (error: any) {
      console.error('Failed to initialize AudioStream:', error);
      throw new Error(`AudioStream initialization failed: ${error.message}`);
    }
  }

  start(): void {
    if (!this.audioContext || !this.mediaStream) {
      throw new Error('AudioStream not initialized');
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.isActive = true;
    console.log('AudioStream started');
  }

  stop(): void {
    this.isActive = false;
    console.log('AudioStream stopped');
  }

  destroy(): void {
    this.stop();

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.volumeCallback = null;
    this.dataCallback = null;
    console.log('AudioStream destroyed');
  }

  // Get current volume level (0-1)
  getVolumeLevel(): number {
    if (!this.analyser) return 0;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / (dataArray.length * 255);
  }

  // Set volume monitoring callback
  onVolumeChange(callback: (level: number) => void): void {
    this.volumeCallback = callback;
  }

  // Set audio data callback
  onAudioData(callback: (data: Float32Array) => void): void {
    this.dataCallback = callback;
  }

  // Get audio stream for MediaRecorder
  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  // Convert Float32Array to PCM16 buffer (useful for Whisper)
  static float32ToPCM16(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    
    return buffer;
  }

  // Create WAV header (useful for Whisper)
  static createWAVHeader(sampleRate: number, numChannels: number, bitsPerSample: number, dataLength: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    
    const blockAlign = numChannels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    
    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataLength, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    
    // Format chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Chunk size
    view.setUint16(20, 1, true); // Audio format (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // Data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataLength, true);
    
    return buffer;
  }

  // Check if audio context is available
  static isSupported(): boolean {
    return !!(window.AudioContext || (window as any).webkitAudioContext);
  }

  // Get supported audio constraints
  static async getSupportedConstraints(): Promise<MediaTrackSupportedConstraints> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getSupportedConstraints) {
      throw new Error('Media devices not supported');
    }
    return navigator.mediaDevices.getSupportedConstraints();
  }
}

// Global audio stream instance
let globalAudioStream: AudioStream | null = null;

export function getAudioStream(): AudioStream {
  if (!globalAudioStream) {
    globalAudioStream = new AudioStream();
  }
  return globalAudioStream;
}

export function destroyAudioStream(): void {
  if (globalAudioStream) {
    globalAudioStream.destroy();
    globalAudioStream = null;
  }
}
