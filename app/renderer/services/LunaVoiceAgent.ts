// Complete Luna Voice Agent Integration (renderer-only, browser-safe)
import { ConversationFlow } from "./ConversationFlow";
import { apiFetch } from "./config";
import { extractText, SttResponse } from "./voiceContracts";
import { API } from "../config/endpoints";

export class LunaVoiceAgent {
  private conversationFlow: ConversationFlow;
  private sessionId: string;
  private conversationContext: any[] = [];
  private isActive: boolean = false;
  private wakeWordEnabled: boolean = false;
  private wakeWord: string = "luna";

  constructor() {
    this.sessionId = `luna-${Date.now()}`;
    this.conversationFlow = new ConversationFlow();

    // Renderer uses backend HTTP endpoints; skip direct OpenAI client init
    this.setupEventHandlers();
  }

  // No direct OpenAI initialization in renderer; all handled by backend

  private setupEventHandlers() {
    this.conversationFlow.on("audio-ready", async (audioBlob: Blob) => {
      await this.processUserAudio(audioBlob);
    });

    this.conversationFlow.on("voice-start", () => {
      this.onUserStartedSpeaking();
    });

    this.conversationFlow.on("voice-end", () => {
      this.onUserStoppedSpeaking();
    });

    this.conversationFlow.on("error", (error: Error) => {
      this.handleError(error);
    });
  }

  async start() {
    if (this.isActive) return;

    this.isActive = true;

    // Start with wake word detection if enabled
    if (this.wakeWordEnabled) {
      await this.startWakeWordDetection();
    } else {
      // Start continuous conversation immediately
      await this.conversationFlow.startContinuousListening();
    }
  }

  async stop() {
    this.isActive = false;
    this.conversationFlow.stop();
  }

  private async startWakeWordDetection() {
    // Simple wake word detection using continuous transcription
    // For production, use Porcupine or similar
    const wakeWordListener = async (audioBlob: Blob) => {
      try {
        const transcript = await this.transcribeAudio(audioBlob);
        if (transcript.toLowerCase().includes(this.wakeWord)) {
          console.log("Wake word detected!");
          this.conversationFlow.off("audio-ready", wakeWordListener);
          this.conversationFlow.on("audio-ready", async (blob: Blob) => {
            await this.processUserAudio(blob);
          });

          // Play acknowledgment sound
          this.playSound("wake");
        }
      } catch (error) {
        console.error("Wake word detection error:", error);
      }
    };

    this.conversationFlow.on("audio-ready", wakeWordListener);
    await this.conversationFlow.startContinuousListening();
  }

  private async processUserAudio(audioBlob: Blob) {
    try {
      // Standard pipeline via backend endpoints
      const transcript = await this.transcribeAudio(audioBlob);
      const response = await this.getAIResponse(transcript);
      const audioResponse = await this.generateTTS(response);

      await this.conversationFlow.playResponse(audioResponse);

      // Update context
      this.conversationContext.push(
        { role: "user", content: transcript },
        { role: "assistant", content: response },
      );

      // Keep context window manageable
      if (this.conversationContext.length > 20) {
        this.conversationContext = this.conversationContext.slice(-20);
      }

      return { transcript, response };
    } catch (error) {
      console.error("Failed to process audio:", error);
      this.handleError(error);
      return { transcript: "", response: "" }; // Return default values on error
    }
  }

  private async transcribeAudio(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");

    const response = await apiFetch(API.STT_TRANSCRIBE, {
      method: "POST",
      body: formData,
    });

    const result = (await response.json()) as SttResponse;
    const text = extractText(result);
    if (!text) throw new Error("transcription missing");
    return text;
  }

  private async getAIResponse(message: string): Promise<string> {
    const response = await apiFetch("/api/agent/chat", {
      method: "POST",
      body: {
        message,
        sessionId: this.sessionId,
        useTools: true,
        context: this.conversationContext,
      },
    });

    const result = await response.json();
    return result.response || result.content || result.message;
  }

  private async generateTTS(text: string): Promise<Blob> {
    const response = await apiFetch(API.TTS_SYNTHESIZE, {
      method: "POST",
      body: { text },
    });

    return response.blob();
  }

  private async playAudioResponse(audioBlob: Blob) {
    await this.conversationFlow.playResponse(audioBlob);
  }

  private playSound(type: "wake" | "error" | "success") {
    const sounds = {
      wake: "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH1Oy9diMFl2+z2y4AAhnT7+Wa2+PxaDEEWYb05Zog8QLLnQD2bkgGHNA0ANOiA+0hBPgCyBIEwScAhgSQPQdQSAepCwBuO+4K+BX4IQ",
      error:
        "data:audio/wav;base64,UklGRl4CAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToCAAA=",
      success:
        "data:audio/wav;base64,UklGRl4CAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToCAAA=",
    };

    const audio = new Audio(sounds[type]);
    audio.play().catch(console.error);
  }

  private onTextChunk(chunk: string) {
    // Stream text to UI as it arrives
    window.dispatchEvent(new CustomEvent("luna-text-chunk", { detail: chunk }));
  }

  private onUserStartedSpeaking() {
    window.dispatchEvent(
      new CustomEvent("luna-user-speaking", { detail: true }),
    );
  }

  private onUserStoppedSpeaking() {
    window.dispatchEvent(
      new CustomEvent("luna-user-speaking", { detail: false }),
    );
  }

  private handleError(error: any) {
    console.error("Luna Voice Agent Error:", error);
    this.playSound("error");

    // Attempt to recover
    if (this.isActive) {
      setTimeout(() => {
        this.conversationFlow.startContinuousListening();
      }, 2000);
    }
  }

  // Public API
  interrupt() {
    this.conversationFlow.interrupt();
  }

  setWakeWord(word: string) {
    this.wakeWord = word.toLowerCase();
  }

  enableWakeWord(enabled: boolean) {
    this.wakeWordEnabled = enabled;
    if (enabled && this.isActive) {
      this.stop();
      this.start();
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getConversationHistory(): any[] {
    return this.conversationContext;
  }

  clearContext() {
    this.conversationContext = [];
  }
}

// Export singleton instance
export const lunaAgent = new LunaVoiceAgent();
