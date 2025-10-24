import { EventEmitter } from "events";

/**
 * Client-side Streaming Voice Service
 * Communicates with backend WebSocket for real-time voice processing
 */

interface VoiceConfig {
  inputSampleRate: number;
  outputSampleRate: number;
  bufferSize: number;
  vadThreshold: number;
  silenceTimeout: number;
  interruptThreshold: number;
}

interface ConversationState {
  isListening: boolean;
  isSpeaking: boolean;
  canInterrupt: boolean;
  lastUserSpeechTime: number;
  lastAISpeechTime: number;
  conversationActive: boolean;
}

export class StreamingVoiceService extends EventEmitter {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectInterval: number = 3000;

  // Audio processing
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioWorklet: AudioWorkletNode | null = null;

  // Configuration
  private defaultConfig: VoiceConfig = {
    inputSampleRate: 24000,
    outputSampleRate: 24000,
    bufferSize: 4096,
    vadThreshold: 0.01,
    silenceTimeout: 1500,
    interruptThreshold: 200,
  };

  constructor() {
    super();
    console.log("[StreamingVoiceClient] Service created");
  }

  /**
   * Initialize the streaming voice service
   */
  public async initialize(): Promise<void> {
    try {
      console.log("[StreamingVoiceClient] Initializing...");

      // Connect to backend WebSocket
      await this.connectToBackend();

      // Initialize audio processing
      await this.initializeAudio();

      console.log("[StreamingVoiceClient] Initialization complete");
      this.emit("initialized");
    } catch (error) {
      console.error("[StreamingVoiceClient] Initialization failed:", error);
      this.emit(
        "error",
        error instanceof Error ? error.message : "Initialization failed",
      );
      throw error;
    }
  }

  /**
   * Connect to backend WebSocket
   */
  private async connectToBackend(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/voice/stream`;

      console.log(`[StreamingVoiceClient] Connecting to ${wsUrl}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("[StreamingVoiceClient] Connected to backend");
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit("connected");
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onerror = (error) => {
        console.error("[StreamingVoiceClient] WebSocket error:", error);
        this.emit("connection-error", "WebSocket connection error");
      };

      this.ws.onclose = () => {
        console.log("[StreamingVoiceClient] Disconnected from backend");
        this.isConnected = false;
        this.emit("disconnected");

        // Attempt to reconnect
        this.attemptReconnect();
      };

      // Connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error("Connection timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Attempt to reconnect to backend
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[StreamingVoiceClient] Max reconnection attempts reached");
      this.emit("error", "Failed to reconnect after maximum attempts");
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `[StreamingVoiceClient] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
    );

    setTimeout(async () => {
      try {
        await this.connectToBackend();
      } catch (error) {
        console.error("[StreamingVoiceClient] Reconnection failed:", error);
      }
    }, this.reconnectInterval);
  }

  /**
   * Initialize audio processing in browser
   */
  private async initializeAudio(): Promise<void> {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.defaultConfig.inputSampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create audio context
      this.audioContext = new AudioContext({
        sampleRate: this.defaultConfig.inputSampleRate,
      });

      // Load audio worklet processor
      const workletPath = "/audio-worklet-processor.js";
      await this.audioContext.audioWorklet.addModule(workletPath);

      // Create audio worklet node
      this.audioWorklet = new AudioWorkletNode(
        this.audioContext,
        "streaming-processor",
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          processorOptions: {
            bufferSize: this.defaultConfig.bufferSize,
            sampleRate: this.defaultConfig.inputSampleRate,
          },
        },
      );

      // Connect audio pipeline
      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream,
      );
      source.connect(this.audioWorklet);
      this.audioWorklet.connect(this.audioContext.destination);

      // Handle processed audio data
      this.audioWorklet.port.onmessage = (event) => {
        this.handleAudioData(event.data);
      };

      console.log("[StreamingVoiceClient] Audio system initialized");
    } catch (error) {
      console.error(
        "[StreamingVoiceClient] Failed to initialize audio:",
        error,
      );
      throw error;
    }
  }

  /**
   * Handle processed audio data from worklet
   */
  private handleAudioData(data: any): void {
    if (data.type === "audioData") {
      const { hasVoice, vadLevel, vadConfidence } = data;

      // Emit user speaking events
      if (hasVoice) {
        this.emit("user-speaking", {
          level: vadLevel,
          confidence: vadConfidence,
          timestamp: Date.now(),
        });
      }

      // Forward audio data to backend would happen here
      // For now, we're using OpenAI Real-time API directly in backend
    }
  }

  /**
   * Handle messages from backend WebSocket
   */
  private handleMessage(message: any): void {
    const { type, sessionId } = message;

    // Store session ID
    if (sessionId && !this.sessionId) {
      this.sessionId = sessionId;
    }

    switch (type) {
      case "session-ready":
        console.log("[StreamingVoiceClient] Session ready:", message.sessionId);
        this.sessionId = message.sessionId;
        break;

      case "voice-initialized":
        this.emit("voice-initialized");
        break;

      case "listening-started":
        this.emit("listening-started");
        break;

      case "listening-stopped":
        this.emit("listening-stopped");
        break;

      case "speech-detected":
        this.emit("speech-detected");
        break;

      case "speech-ended":
        this.emit("speech-ended");
        break;

      case "user-speaking":
        this.emit("user-speaking", {
          level: message.level,
          timestamp: message.timestamp,
        });
        break;

      case "transcription":
        this.emit("transcription", message.text);
        break;

      case "ai-response-text":
        this.emit("ai-response-text", message.text);
        break;

      case "ai-speaking":
        this.emit("ai-speaking");
        break;

      case "ai-finished-speaking":
        this.emit("ai-finished-speaking");
        break;

      case "user-interrupted":
        this.emit("user-interrupted");
        break;

      case "response-complete":
        this.emit("response-complete");
        break;

      case "continuous-mode-started":
        this.emit("continuous-mode-started");
        break;

      case "continuous-mode-stopped":
        this.emit("continuous-mode-stopped");
        break;

      case "state-update":
        this.emit("state-update", message.state);
        break;

      case "config-update":
        this.emit("config-update", message.config);
        break;

      case "error":
        this.emit("error", message.error);
        break;

      case "connection-error":
        this.emit("connection-error", message.error);
        break;

      default:
        console.log("[StreamingVoiceClient] Unhandled message type:", type);
    }
  }

  /**
   * Send message to backend
   */
  private sendMessage(message: any): void {
    if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn(
        "[StreamingVoiceClient] Cannot send message - not connected",
      );
    }
  }

  /**
   * Start continuous conversation mode
   */
  public async startContinuousMode(): Promise<void> {
    console.log("[StreamingVoiceClient] Starting continuous mode");
    this.sendMessage({ type: "start-continuous" });
  }

  /**
   * Stop continuous conversation mode
   */
  public async stopContinuousMode(): Promise<void> {
    console.log("[StreamingVoiceClient] Stopping continuous mode");
    this.sendMessage({ type: "stop-continuous" });
  }

  /**
   * Start listening for user input
   */
  public async startListening(): Promise<void> {
    this.sendMessage({ type: "start-listening" });
  }

  /**
   * Stop listening for user input
   */
  public async stopListening(): Promise<void> {
    this.sendMessage({ type: "stop-listening" });
  }

  /**
   * Update voice configuration
   */
  public updateConfig(updates: Partial<VoiceConfig>): void {
    console.log("[StreamingVoiceClient] Updating config:", updates);
    this.sendMessage({
      type: "update-config",
      config: updates,
    });

    // Update audio worklet if needed
    if (this.audioWorklet && updates.vadThreshold !== undefined) {
      this.audioWorklet.port.postMessage({
        type: "updateVADThreshold",
        data: { threshold: updates.vadThreshold },
      });
    }
  }

  /**
   * Get current conversation state
   */
  public getState(): void {
    this.sendMessage({ type: "get-state" });
  }

  /**
   * Get current configuration
   */
  public getConfig(): void {
    this.sendMessage({ type: "get-config" });
  }

  /**
   * Check if service is connected
   */
  public isServiceConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get session ID
   */
  public getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Cleanup and disconnect
   */
  public async cleanup(): Promise<void> {
    console.log("[StreamingVoiceClient] Cleaning up...");

    // Stop audio streams
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
      this.audioContext = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.sessionId = null;

    console.log("[StreamingVoiceClient] Cleanup complete");
  }
}
