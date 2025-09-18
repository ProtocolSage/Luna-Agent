// Natural conversation flow manager with zero-click operation
import { EventEmitter } from 'events';

export class ConversationFlow extends EventEmitter {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private silenceStart: number = 0;
  private isSpeaking: boolean = false;
  private isProcessing: boolean = false;
  private audioQueue: HTMLAudioElement[] = [];
  private silenceThreshold: number = 30;
  private silenceDuration: number = 1500; // 1.5 seconds of silence = end of speech
  private chunks: Blob[] = [];

  constructor() {
    super();
    this.initAudioContext();
  }

  private async initAudioContext() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  async startContinuousListening() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Set up audio analysis for VAD
      const source = this.audioContext!.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext!.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      // Start recording
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
    if (!this.stream) return;

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.chunks, { type: 'audio/webm' });
      this.chunks = [];
      
      // Only process if we have meaningful audio (not just noise)
      if (audioBlob.size > 5000) {
        this.processAudio(audioBlob);
      } else {
        // Restart recording immediately for continuous operation
        if (!this.isSpeaking && !this.isProcessing) {
          this.startRecording();
        }
      }
    };

    this.mediaRecorder.start();
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
        if (speechDetected && Date.now() - this.silenceStart > this.silenceDuration) {
          // End of speech detected
          speechDetected = false;
          this.emit('voice-end');
          
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
          }
        }
      }

      requestAnimationFrame(checkAudio);
    };

    checkAudio();
  }

  private async processAudio(audioBlob: Blob) {
    this.isProcessing = true;
    this.emit('processing-start');

    try {
      // Emit audio for transcription
      this.emit('audio-ready', audioBlob);
    } catch (error) {
      console.error('Audio processing error:', error);
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
      this.emit('processing-end');
      
      // Restart recording for continuous operation
      if (!this.isSpeaking) {
        setTimeout(() => this.startRecording(), 100);
      }
    }
  }

  async playResponse(audioBlob: Blob) {
    this.isSpeaking = true;
    this.emit('speaking-start');

    // Stop recording while speaking
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    const audio = new Audio(URL.createObjectURL(audioBlob));
    
    // Auto-play with proper error handling
    try {
      await audio.play();
    } catch (error) {
      console.log('Autoplay blocked, will play on next interaction');
      // Store for later playback
      this.audioQueue.push(audio);
    }

    audio.onended = () => {
      URL.revokeObjectURL(audio.src);
      this.isSpeaking = false;
      this.emit('speaking-end');
      
      // Resume listening after speaking
      setTimeout(() => this.startRecording(), 200);
    };

    return audio;
  }

  // Play any queued audio on user interaction
  playQueuedAudio() {
    while (this.audioQueue.length > 0) {
      const audio = this.audioQueue.shift();
      if (audio) audio.play().catch(console.error);
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    this.emit('stopped');
  }

  // Allow interruption during speech
  interrupt() {
    // Stop all playing audio
    this.audioQueue.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    this.audioQueue = [];
    
    this.isSpeaking = false;
    this.emit('interrupted');
    
    // Resume listening
    this.startRecording();
  }
}
