import React, { useState, useEffect, useRef } from "react";
import "../styles/premium-luxury.css";

// Types
interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface SystemStatus {
  backend: "connected" | "disconnected";
  voice: "ready" | "listening" | "processing" | "error";
  model: string;
}

export const PremiumLuxuryApp: React.FC = () => {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    backend: "disconnected",
    voice: "ready",
    model: "Loading...",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const API_BASE = "http://localhost:3001";

  /**
   * Initialize and check backend connection
   */
  useEffect(() => {
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Auto-scroll to bottom when new messages arrive
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Check backend connectivity and get model info
   */
  const checkBackendStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/health`);

      if (response.ok) {
        const data = await response.json();
        setSystemStatus((prev) => ({
          ...prev,
          backend: "connected",
          model: data.activeModel || "GPT-4",
        }));
      } else {
        throw new Error("Backend unhealthy");
      }
    } catch (error) {
      setSystemStatus((prev) => ({
        ...prev,
        backend: "disconnected",
        model: "Offline",
      }));
    }
  };

  /**
   * Send message to backend with voice response
   */
  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || inputText;
    if (!text.trim() || isProcessing) return;

    const userMessage: Message = {
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsProcessing(true);
    setSystemStatus((prev) => ({ ...prev, voice: "processing" }));

    try {
      const response = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: messages,
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const data = await response.json();
      const responseText = data.response || "No response received";

      const assistantMessage: Message = {
        role: "assistant",
        content: responseText,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Speak the response using TTS
      await speakResponse(responseText);
    } catch (error) {
      console.error("Error sending message:", error);

      const errorMessage: Message = {
        role: "assistant",
        content:
          "I apologize, but I encountered an error processing your request. Please try again.",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
      setSystemStatus((prev) => ({ ...prev, voice: "ready" }));
      inputRef.current?.focus();
    }
  };

  /**
   * Text-to-Speech using backend
   */
  const speakResponse = async (text: string) => {
    try {
      setIsSpeaking(true);

      const response = await fetch(`${API_BASE}/api/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          provider: "openai",
        }),
      });

      if (!response.ok) throw new Error("TTS failed");

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audioRef.current.play();
    } catch (error) {
      console.error("TTS error:", error);
      setIsSpeaking(false);
    }
  };

  /**
   * Start/Stop voice recording with backend Whisper STT
   */
  const handleVoiceToggle = async () => {
    if (isListening) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  /**
   * Start recording audio
   */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/wav";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await transcribeAudio(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;

      setIsListening(true);
      setSystemStatus((prev) => ({ ...prev, voice: "listening" }));
    } catch (error) {
      console.error("Recording error:", error);
      setSystemStatus((prev) => ({ ...prev, voice: "error" }));
      alert("Microphone access denied or not available");
    }
  };

  /**
   * Stop recording audio
   */
  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setSystemStatus((prev) => ({ ...prev, voice: "processing" }));
    }
  };

  /**
   * Transcribe audio using backend OpenAI Whisper
   */
  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");

      const response = await fetch(`${API_BASE}/api/voice/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Transcription failed");
      }

      const data = await response.json();
      const transcription = data.text?.trim();

      console.log("Whisper API response:", data);
      console.log("Transcription text:", transcription);
      console.log("Transcription length:", transcription?.length);

      if (transcription && transcription.length > 0) {
        console.log("✅ Valid transcription received:", transcription);
        setInputText(transcription);
        setSystemStatus((prev) => ({ ...prev, voice: "ready" }));

        // Auto-send the transcribed message
        setTimeout(() => {
          handleSendMessage(transcription);
        }, 300);
      } else {
        console.warn("❌ Empty or invalid transcription");
        setSystemStatus((prev) => ({ ...prev, voice: "error" }));
      }
    } catch (error) {
      console.error("Transcription error:", error);
      setSystemStatus((prev) => ({ ...prev, voice: "error" }));
      alert("Voice transcription failed. Please try again.");
    } finally {
      setSystemStatus((prev) => ({ ...prev, voice: "ready" }));
    }
  };

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /**
   * Format timestamp
   */
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  /**
   * Get voice button label
   */
  const getVoiceButtonLabel = (): string => {
    if (isListening) return "Recording...";
    if (systemStatus.voice === "processing") return "Processing...";
    return "Click to speak";
  };

  return (
    <div className="luna-app">
      {/* Premium Header */}
      <header className="luna-header">
        <div className="luna-branding">
          <div className="luna-logo">🌙</div>
          <h1 className="luna-title">LUNA</h1>
        </div>

        <div className="luna-status">
          <div
            className="status-indicator"
            style={{
              background:
                systemStatus.backend === "connected" ? "#10b981" : "#ef4444",
            }}
          />
          <span>
            {systemStatus.backend === "connected" ? "Connected" : "Offline"}
          </span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span>{systemStatus.model}</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span>Whisper STT</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="luna-main">
        <div className="conversation-container">
          {/* Messages */}
          <div className="conversation-messages">
            {messages.length === 0 ? (
              <div className="conversation-empty">
                <div className="empty-icon">✨</div>
                <h2 className="empty-title">Welcome to Luna</h2>
                <p className="empty-subtitle">
                  Your premium AI assistant powered by OpenAI Whisper and
                  advanced language models. Speak naturally or type your
                  message.
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div key={idx} className={`message ${msg.role}`}>
                    <div className="message-content">{msg.content}</div>
                    <div className="message-timestamp">
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                ))}
                {isProcessing && (
                  <div className="message assistant">
                    <div className="message-content">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="input-container">
            <div className="input-wrapper">
              <input
                ref={inputRef}
                type="text"
                className="input-field"
                placeholder={
                  isListening ? "Listening..." : "Type or speak your message..."
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isProcessing || isListening}
              />
            </div>

            <button
              className={`btn-voice ${isListening ? "listening" : ""} ${isSpeaking ? "speaking" : ""}`}
              onClick={handleVoiceToggle}
              disabled={isProcessing || systemStatus.backend === "disconnected"}
              title={getVoiceButtonLabel()}
            >
              {isListening ? "⏹" : isSpeaking ? "🔊" : "🎤"}
            </button>

            <button
              className="btn btn-primary"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || isProcessing || isListening}
            >
              {isProcessing ? "Processing..." : "Send"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PremiumLuxuryApp;
