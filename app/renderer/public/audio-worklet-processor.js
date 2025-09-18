/**
 * Audio Worklet Processor for Real-time Voice Processing
 * 
 * This runs in the AudioWorklet thread for minimal latency audio processing:
 * - Real-time VAD (Voice Activity Detection)
 * - Audio buffering and streaming
 * - Noise gate and basic filtering
 * - Volume normalization
 */

class StreamingAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // Configuration from options
    this.bufferSize = options.processorOptions?.bufferSize || 4096;
    this.sampleRate = options.processorOptions?.sampleRate || 24000;
    
    // Audio processing state
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    // VAD (Voice Activity Detection) parameters
    this.vadThreshold = 0.01;
    this.vadSmoothingFactor = 0.1;
    this.currentVadLevel = 0;
    this.vadHistory = new Array(10).fill(0);
    this.vadHistoryIndex = 0;
    
    // Noise gate
    this.noiseGateThreshold = 0.002;
    this.noiseFloor = 0.001;
    
    // Audio normalization
    this.maxAmplitude = 0;
    this.amplitudeDecay = 0.999;
    this.targetLevel = 0.5;
    
    // Timing
    this.lastProcessTime = performance.now();
    this.frameCount = 0;
    
    console.log('[AudioWorklet] StreamingAudioProcessor initialized');
  }
  
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (input.length > 0) {
      const inputChannel = input[0];
      const outputChannel = output[0];
      
      // Process each sample
      for (let i = 0; i < inputChannel.length; i++) {
        let sample = inputChannel[i];
        
        // 1. Apply noise gate
        sample = this.applyNoiseGate(sample);
        
        // 2. Update VAD
        this.updateVAD(sample);
        
        // 3. Normalize audio
        sample = this.normalizeAudio(sample);
        
        // 4. Store in buffer
        this.inputBuffer[this.bufferIndex] = sample;
        this.bufferIndex++;
        
        // 5. Pass through to output (for monitoring)
        if (outputChannel) {
          outputChannel[i] = sample * 0.1; // Lower volume for monitoring
        }
        
        // 6. Send buffer when full
        if (this.bufferIndex >= this.bufferSize) {
          this.sendAudioData();
          this.bufferIndex = 0;
        }
      }
    }
    
    this.frameCount++;
    return true; // Keep processor alive
  }
  
  /**
   * Apply noise gate to reduce background noise
   */
  applyNoiseGate(sample) {
    const amplitude = Math.abs(sample);
    
    if (amplitude < this.noiseGateThreshold) {
      // Below threshold - apply gate
      return sample * (amplitude / this.noiseGateThreshold) * 0.1;
    }
    
    return sample;
  }
  
  /**
   * Update Voice Activity Detection
   */
  updateVAD(sample) {
    // Calculate instantaneous energy
    const energy = sample * sample;
    
    // Update VAD level with smoothing
    this.currentVadLevel = this.currentVadLevel * (1 - this.vadSmoothingFactor) + 
                          energy * this.vadSmoothingFactor;
    
    // Update VAD history for temporal smoothing
    this.vadHistory[this.vadHistoryIndex] = this.currentVadLevel;
    this.vadHistoryIndex = (this.vadHistoryIndex + 1) % this.vadHistory.length;
  }
  
  /**
   * Normalize audio to target level
   */
  normalizeAudio(sample) {
    const amplitude = Math.abs(sample);
    
    // Track maximum amplitude with decay
    if (amplitude > this.maxAmplitude) {
      this.maxAmplitude = amplitude;
    } else {
      this.maxAmplitude *= this.amplitudeDecay;
    }
    
    // Apply normalization if we have a good max amplitude estimate
    if (this.maxAmplitude > 0.01) {
      const gain = this.targetLevel / this.maxAmplitude;
      return sample * Math.min(gain, 3.0); // Cap gain to prevent distortion
    }
    
    return sample;
  }
  
  /**
   * Calculate current VAD confidence
   */
  getVADConfidence() {
    // Average VAD history for smoother detection
    const avgVAD = this.vadHistory.reduce((sum, val) => sum + val, 0) / this.vadHistory.length;
    
    // Convert to confidence score (0-1)
    return Math.min(1.0, avgVAD / this.vadThreshold);
  }
  
  /**
   * Send processed audio data to main thread
   */
  sendAudioData() {
    const now = performance.now();
    const vadConfidence = this.getVADConfidence();
    const hasVoice = vadConfidence > 0.3;
    
    // Create a copy of the buffer to send
    const bufferCopy = new Float32Array(this.inputBuffer);
    
    this.port.postMessage({
      type: 'audioData',
      inputBuffer: bufferCopy,
      timestamp: now,
      vadLevel: this.currentVadLevel,
      vadConfidence: vadConfidence,
      hasVoice: hasVoice,
      maxAmplitude: this.maxAmplitude,
      frameCount: this.frameCount
    });
    
    this.lastProcessTime = now;
  }
  
  /**
   * Handle messages from main thread
   */
  handleMessage(event) {
    const { type, data } = event.data;
    
    switch (type) {
      case 'updateVADThreshold':
        this.vadThreshold = data.threshold;
        console.log('[AudioWorklet] VAD threshold updated:', this.vadThreshold);
        break;
        
      case 'updateNoiseGate':
        this.noiseGateThreshold = data.threshold;
        console.log('[AudioWorklet] Noise gate updated:', this.noiseGateThreshold);
        break;
        
      case 'updateNormalization':
        this.targetLevel = data.targetLevel;
        console.log('[AudioWorklet] Normalization target updated:', this.targetLevel);
        break;
        
      case 'reset':
        this.currentVadLevel = 0;
        this.maxAmplitude = 0;
        this.vadHistory.fill(0);
        this.bufferIndex = 0;
        console.log('[AudioWorklet] Processor reset');
        break;
        
      default:
        console.log('[AudioWorklet] Unknown message type:', type);
    }
  }
}

// Handle messages from main thread
globalThis.addEventListener('message', (event) => {
  if (globalThis.processor) {
    globalThis.processor.handleMessage(event);
  }
});

// Register the processor
registerProcessor('streaming-processor', StreamingAudioProcessor);