import { EventEmitter } from 'events';

export class VADManager extends EventEmitter {
  private isActive: boolean = false;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;

  constructor() {
    super();
    this.setMaxListeners(20);
  }

  public async initialize(): Promise<void> {
    // Initialize VAD system if needed
    console.log('VAD Manager initialized');
  }

  public async start(): Promise<void> {
    if (this.isActive) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        const volume = this.calculateVolume(inputBuffer);
        
        // Simple voice activity detection based on volume
        if (volume > 0.01) {
          this.emit('speech_start');
        } else {
          this.emit('speech_end', inputBuffer);
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      
      this.isActive = true;
      this.emit('started');
    } catch (error) {
      this.emit('error', error);
    }
  }

  public async stop(): Promise<void> {
    if (!this.isActive) return;

    try {
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }

      this.isActive = false;
      this.emit('stopped');
    } catch (error) {
      this.emit('error', error);
    }
  }

  private calculateVolume(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  public async destroy(): Promise<void> {
    await this.stop();
    this.removeAllListeners();
  }

  public getStatus(): { isActive: boolean } {
    return { isActive: this.isActive };
  }
}