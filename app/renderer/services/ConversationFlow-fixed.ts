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
    this.initAudioContext();
  }

  private async initAudioContext() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  async startContinuousListening() {
    try {
      // First check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

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

      // Set up audio analysis for VAD
      const source = this.audioContext!.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext!.createAnalyser();
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

  private startRecording() {
    if (!this.stream) {
      console.error('No stream available for recording');
      return;
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

  private async playResponse(text: string) {
    this.isSpeaking = true;
    this.emit('speaking-start');

    try {
      const audioBlob: Blob = await this.voiceService.synthesize(text);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      // Handle autoplay restrictions
      audio.addEventListener('canplaythrough', () => {
        audio.play().catch(e => {
          console.warn('Autoplay blocked, will play on next interaction');
          this.emit('autoplay-blocked');
        });
      });

      audio.onended = () => {
        this.isSpeaking = false;
        this.emit('speaking-end');
        
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

  async stop() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.emit('listening-stopped');
  }
}
