import React, { useEffect, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface Props {
  messages: Message[];
  isProcessing: boolean;
}

export const ConversationView: React.FC<Props> = ({
  messages,
  isProcessing,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  return (
    <div className="conversation-container">
      {messages.length === 0 && (
        <div className="empty-state">
          <h2>👋 Hello! I'm Luna</h2>
          <p>Click the microphone or type a message to get started.</p>
        </div>
      )}

      {messages.map((msg, idx) => (
        <div key={idx} className={`message ${msg.role}`}>
          <div className="message-avatar">
            {msg.role === "user" ? "👤" : "🤖"}
          </div>
          <div className="message-bubble">
            <div className="message-content">{msg.content}</div>
            <div className="message-time">
              {new Date(msg.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      ))}

      {isProcessing && (
        <div className="message assistant">
          <div className="message-avatar">🤖</div>
          <div className="message-bubble">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      )}

      <div ref={scrollRef} />
    </div>
  );
};
