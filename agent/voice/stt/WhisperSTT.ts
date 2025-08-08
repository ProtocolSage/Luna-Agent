import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import type { STTEngine, STTTranscript } from './STTEngine';
import path from 'path';

export class WhisperSTT extends EventEmitter implements STTEngine {
  #proc?: ChildProcessWithoutNullStreams;
  #micStream?: MediaStream;
  #mediaRecorder?: MediaRecorder;
  #isRunning = false;

  async start() {
    if (this.#isRunning) return;
    
    try {
      await this.#setupMicrophone();
      await this.#startWhisperProcess();
      this.#isRunning = true;
      console.log('[WhisperSTT] Started successfully');
    } catch (err) {
      this.emit('fatal', err as Error);
    }
  }

  async stop() {
    this.#isRunning = false;
    this.#stopMicrophone();
    this.#proc?.kill();
    this.#proc = undefined;
  }

  /* ---------- private helpers ---------- */

  async #setupMicrophone() {
    if (this.#micStream) return;

    this.#micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: false, // Better for Whisper
        noiseSuppression: false,
        autoGainControl: false
      }
    });
  }

  #stopMicrophone() {
    if (this.#mediaRecorder && this.#mediaRecorder.state !== 'inactive') {
      this.#mediaRecorder.stop();
    }
    if (this.#micStream) {
      this.#micStream.getTracks().forEach(track => track.stop());
      this.#micStream = undefined;
    }
  }

  async #startWhisperProcess() {
    // In an Electron app, we need to handle this differently
    // For now, we'll use a simplified approach that could work with whisper.cpp
    
    const whisperPath = this.#getWhisperPath();
    const modelPath = this.#getModelPath();
    
    if (!whisperPath || !modelPath) {
      throw new Error('Whisper executable or model not found. Please ensure Whisper is installed.');
    }

    /* Start Whisper process with streaming support */
    this.#proc = spawn(whisperPath, [
      '-m', modelPath,
      '-f', '-',                 // read from stdin
      '-t', '4',                 // 4 threads (adjust for your CPU)
      '--no-prints',             // suppress extra output
      '--no-timestamps',         // we don't need timestamps
      '--output-json',           // JSON output format
      '--stream'                 // streaming mode if supported
    ], { 
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: path.dirname(whisperPath)
    });

    // Set up audio streaming to Whisper
    this.#setupAudioPipeline();

    this.#proc.stdout.setEncoding('utf8');
    this.#proc.stdout.on('data', (data: string) => {
      this.#parseWhisperOutput(data);
    });

    this.#proc.on('exit', (code) => {
      console.warn('[WhisperSTT] Process exited with code:', code);
      this.emit('fatal', new Error(`whisper-exit-${code}`));
    });

    this.#proc.on('error', (err) => {
      console.error('[WhisperSTT] Process error:', err);
      this.emit('fatal', err);
    });
  }

  #setupAudioPipeline() {
    if (!this.#micStream || !this.#proc) return;

    // Use MediaRecorder to capture audio data
    this.#mediaRecorder = new MediaRecorder(this.#micStream, {
      mimeType: 'audio/webm; codecs=opus'
    });

    this.#mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && this.#proc && this.#proc.stdin.writable) {
        // Convert WebM to WAV/PCM for Whisper
        // This is a simplified approach - in production you might want to use ffmpeg
        try {
          const arrayBuffer = await event.data.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Write audio data to Whisper's stdin
          this.#proc.stdin.write(buffer);
        } catch (err) {
          console.error('[WhisperSTT] Error writing audio data:', err);
        }
      }
    };

    // Start recording with small chunks for real-time processing
    this.#mediaRecorder.start(500); // 500ms chunks
  }

  #parseWhisperOutput(data: string) {
    const lines = data.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        // Try to parse as JSON first
        const obj = JSON.parse(line.trim()) as STTTranscript;
        if (obj.text && obj.text.trim()) {
          this.emit('transcript', obj);
        }
      } catch {
        // If not JSON, treat as plain text output
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('[') && !trimmed.startsWith('whisper.cpp')) {
          this.emit('transcript', {
            text: trimmed,
            isFinal: true // Whisper typically provides final results
          });
        }
      }
    }
  }

  #getWhisperPath(): string | null {
    // Check multiple possible locations for Whisper executable
    const possiblePaths = [
      // Bundled with the app
      path.join(process.resourcesPath || '', 'whisper', 'whisper.exe'),
      path.join(process.resourcesPath || '', 'whisper', 'whisper'),
      // System installation
      'whisper',
      'whisper.exe',
      // Common installation paths
      'C:\\Program Files\\whisper\\whisper.exe',
      '/usr/local/bin/whisper',
      '/opt/whisper/whisper'
    ];

    for (const whisperPath of possiblePaths) {
      try {
        // In a real implementation, you'd check if the file exists
        // For now, we'll assume the first bundled path
        if (whisperPath.includes('resources')) {
          return whisperPath;
        }
      } catch (err) {
        continue;
      }
    }

    // Fallback: try system PATH
    return process.platform === 'win32' ? 'whisper.exe' : 'whisper';
  }

  #getModelPath(): string | null {
    // Check for model files
    const possibleModels = [
      // Bundled models
      path.join(process.resourcesPath || '', 'whisper', 'ggml-tiny.en.bin'),
      path.join(process.resourcesPath || '', 'whisper', 'ggml-tiny.bin'),
      path.join(process.resourcesPath || '', 'whisper', 'tiny.en.bin'),
      // Default model locations
      path.join(process.cwd(), 'models', 'ggml-tiny.en.bin'),
      // User's home directory
      path.join(require('os').homedir(), '.whisper', 'ggml-tiny.en.bin')
    ];

    for (const modelPath of possibleModels) {
      try {
        // In production, you'd check fs.existsSync(modelPath)
        // For now, return the first bundled model path
        if (modelPath.includes('resources')) {
          return modelPath;
        }
      } catch (err) {
        continue;
      }
    }

    // If no model found, this will cause Whisper to fail and trigger fallback
    return null;
  }
}
