import { EventEmitter } from 'events';
import { VoiceService } from './VoiceService';

export class ConversationFlow extends EventEmitter {
  private voiceService: VoiceService;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private silenceThreshold = 30;
  private silenceTimeout = 2000; // 2 seconds of silence to stop recording
  private silenceStart: number = Date.now();
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private isProcessing = false;
  private isSpeaking = false;

  constructor() {
    super();
    this.voiceService = new VoiceService();
  }

  private async initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume audio context if it starts in suspended state (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
    }
    return this.audioContext;
  }

  async startContinuousListening() {
    try {
      // First check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      // Initialize audio context first and ensure it's ready
      const audioContext = await this.initAudioContext();

      // Request microphone permission with better error handling
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000, // Specify sample rate
            channelCount: 1    // Mono audio
          } 
        });
      } catch (permissionError: any) {
        if (permissionError.name === 'NotAllowedError') {
          console.error('Microphone permission denied');
          this.emit('error', new Error('Microphone permission denied. Please allow microphone access.'));
          return;
        }
        throw permissionError;
      }

      // Set up audio analysis for VAD (now safe to use audioContext)
      const source = audioContext.createMediaStreamSource(this.stream);
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      // Start recording with better codec support
      this.startRecording();
      
      // Start monitoring for voice activity
      this.monitorVoiceActivity();
      
      this.emit('listening-started');
    } catch (error) {
      console.error('Failed to start listening:', error);
      this.emit('error', error);
    }
  }

  private async startRecording() {
    // Re-acquire mic if stream is missing or ended
    if (!this.stream || this.stream.getTracks().every(track => track.readyState === 'ended')) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        console.error('Failed to acquire microphone stream:', e);
        this.emit('error', e as any);
        return;
      }
    }

    this.chunks = [];
    
    // Try different codec options for better compatibility
    const codecOptions = [
      { mimeType: 'audio/webm;codecs=opus' },
      { mimeType: 'audio/webm' },
      { mimeType: 'audio/ogg;codecs=opus' },
      { mimeType: 'audio/mp4' },
      {} // fallback to default
    ];

    let recorderCreated = false;
    for (const options of codecOptions) {
      try {
        // Check if the codec is supported
        if (options.mimeType && !MediaRecorder.isTypeSupported(options.mimeType)) {
          console.log(`Codec not supported: ${options.mimeType}`);
          continue;
        }

        this.mediaRecorder = new MediaRecorder(this.stream, options);
        console.log(`MediaRecorder created with options:`, options);
        recorderCreated = true;
        break;
      } catch (e) {
        console.warn(`Failed to create MediaRecorder with options:`, options, e);
      }
    }

    if (!recorderCreated) {
      throw new Error('Failed to create MediaRecorder with any codec');
    }
    
    this.mediaRecorder!.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder!.onstop = () => {
      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      const audioBlob = new Blob(this.chunks, { type: mimeType });
      this.chunks = [];
      
      // Only process if we have meaningful audio (not just noise)
      if (audioBlob.size > 5000) {
        this.processAudio(audioBlob);
      } else {
        // Restart recording immediately for continuous operation
        if (!this.isSpeaking && !this.isProcessing) {
          setTimeout(() => this.startRecording(), 100); // Small delay before restart
        }
      }
    };

    this.mediaRecorder!.onerror = (event: any) => {
      console.error('MediaRecorder error:', event.error);
      this.emit('error', event.error);
    };

    try {
      this.mediaRecorder!.start(1000); // Collect data every second
      console.log('MediaRecorder started successfully');
    } catch (startError) {
      console.error('Failed to start MediaRecorder:', startError);
      this.emit('error', startError);
    }
  }

  private monitorVoiceActivity() {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let speechDetected = false;

    const checkAudio = () => {
      if (!this.analyser || this.isSpeaking) {
        requestAnimationFrame(checkAudio);
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      
      if (average > this.silenceThreshold) {
        // Voice detected
        if (!speechDetected) {
          speechDetected = true;
          this.emit('voice-start');
        }
        this.silenceStart = Date.now();
      } else {
        // Silence detected
        if (speechDetected && Date.now() - this.silenceStart > this.silenceTimeout) {
          speechDetected = false;
          this.emit('voice-end');
          
          // Stop and restart recording to process the captured audio
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            // Recording will restart automatically in the onstop handler
          }
        }
      }

      requestAnimationFrame(checkAudio);
    };

    checkAudio();
  }

  private async processAudio(audioBlob: Blob) {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.emit('processing-start');

    try {
      // Convert to text using voice service
      const text = await this.voiceService.transcribe(audioBlob);
      
      if (text && text.trim()) {
        this.emit('transcription', text);
        
        // Process with agent
        const response = await this.sendToAgent(text);
        
        // Play response
        await this.playResponse(response);
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
      this.emit('processing-end');
      
      // Restart recording for continuous conversation
      if (!this.isSpeaking) {
        setTimeout(() => this.startRecording(), 100);
      }
    }
  }

  private async sendToAgent(text: string): Promise<string> {
    // Send to your agent backend
    const response = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    const data = await response.json();
    return data.response;
  }

  public async playResponse(audio: string | Blob) {
    this.isSpeaking = true;
    this.emit('speaking-start');

    try {
      let audioUrl: string;
      let shouldRevoke = false;
      
      if (typeof audio === 'string') {
        // If it's text, synthesize it
        const audioBlob = await this.voiceService.synthesize(audio);
        audioUrl = URL.createObjectURL(audioBlob);
        shouldRevoke = true;
      } else {
        // If it's already a Blob, create URL from it
        audioUrl = URL.createObjectURL(audio);
        shouldRevoke = true;
      }
      
      const audioElement = new Audio(audioUrl);
      
      // Handle autoplay restrictions
      audioElement.addEventListener('canplaythrough', () => {
        audioElement.play().catch(e => {
          console.warn('Autoplay blocked, will play on next interaction');
          this.emit('autoplay-blocked');
        });
      });

      audioElement.onended = () => {
        this.isSpeaking = false;
        this.emit('speaking-end');
        
        // Clean up object URL
        if (shouldRevoke) {
          URL.revokeObjectURL(audioUrl);
        }
        
        // Restart recording after speaking
        if (!this.isProcessing) {
          setTimeout(() => this.startRecording(), 100);
        }
      };
    } catch (error) {
      console.error('Error playing response:', error);
      this.isSpeaking = false;
      this.emit('error', error);
    }
  }

  public interrupt() {
    // Stop any ongoing audio playback or recording
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.isSpeaking = false;
    this.isProcessing = false;
  }

  /**
   * Play any queued audio (useful when autoplay was blocked)
   */
  public playQueuedAudio() {
    // This is a placeholder for handling queued audio
    // In a real implementation, you might maintain a queue of audio to play
    console.log('[ConversationFlow] Playing queued audio if any');
  }

  async stop() {
    // Stop recording first
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    
    // Stop MediaStream tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Clean up analyser
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    // Close audio context last (proper cleanup order)
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch (error) {
        console.warn('Error closing audio context:', error);
      }
      this.audioContext = null;
    }

    // Reset state flags
    this.isProcessing = false;
    this.isSpeaking = false;

    this.emit('listening-stopped');
  }
}
