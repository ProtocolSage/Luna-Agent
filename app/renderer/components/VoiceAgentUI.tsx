// Fully integrated voice UI with zero-click conversation
import React, { useState, useEffect, useRef } from 'react';
import { ConversationFlow } from '../services/ConversationFlow';
import { sendChatMessage } from '../services/api/agentClient';
import { transcribeBlob } from '../services/api/sttClient';
import { tts } from '../services/api/voiceClient';
import { addMemory } from '../services/api/memoryClient';
import './VoiceAgent.css';

export function VoiceAgentUI() {
  const [status, setStatus] = useState('Initializing...');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{role: string, content: string}>>([]);
  
  const conversationFlow = useRef<ConversationFlow | null>(null);
  const sessionId = useRef(`session-${Date.now()}`);
  const hasStarted = useRef(false);

  useEffect(() => {
    // Initialize on mount
    initializeConversation();

    return () => {
      if (conversationFlow.current) {
        conversationFlow.current.stop();
      }
    };
  }, []);

  const initializeConversation = async () => {
    try {
      // Create conversation flow manager
      conversationFlow.current = new ConversationFlow();

      // Set up event listeners
      conversationFlow.current.on('listening-started', () => {
        setStatus('Listening...');
        setIsListening(true);
      });

      conversationFlow.current.on('voice-start', () => {
        setStatus('Hearing you...');
      });

      conversationFlow.current.on('voice-end', () => {
        setStatus('Processing...');
      });

      conversationFlow.current.on('audio-ready', async (audioBlob: Blob) => {
        await handleAudioInput(audioBlob);
      });

      conversationFlow.current.on('processing-start', () => {
        setIsProcessing(true);
      });

      conversationFlow.current.on('processing-end', () => {
        setIsProcessing(false);
      });

      conversationFlow.current.on('speaking-start', () => {
        setIsSpeaking(true);
        setStatus('Speaking...');
      });

      conversationFlow.current.on('speaking-end', () => {
        setIsSpeaking(false);
        setStatus('Listening...');
      });

      conversationFlow.current.on('error', (error: Error) => {
        console.error('Conversation error:', error);
        setStatus(`Error: ${error.message}`);
      });

      setStatus('Ready - Click to start');
    } catch (error) {
      console.error('Failed to initialize:', error);
      setStatus('Initialization failed');
    }
  };

  const startConversation = async () => {
    if (!conversationFlow.current || hasStarted.current) return;
    
    hasStarted.current = true;
    setStatus('Starting...');
    
    // Start continuous listening
    await conversationFlow.current.startContinuousListening();
    
    // Play any queued audio (in case autoplay was blocked)
    conversationFlow.current.playQueuedAudio();
  };

  const handleAudioInput = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);
      setStatus('Transcribing...');

      // Transcribe audio
      const text = await transcribeBlob(audioBlob);
      
      if (!text || text.trim().length < 2) {
        setIsProcessing(false);
        return;
      }

      setTranscript(text);
      
      // Add to conversation history
      const newHistory = [...conversationHistory, { role: 'user', content: text }];
      setConversationHistory(newHistory);

      // Store in memory
      await addMemory(`User: ${text}`, 'conversation', sessionId.current);

      setStatus('Thinking...');

      // Get AI response
      const aiResponse = await sendChatMessage(text, sessionId.current);

      setResponse(aiResponse.response);
      
      // Add response to history
      newHistory.push({ role: 'assistant', content: aiResponse.response });
      setConversationHistory(newHistory);

      // Store response in memory
      await addMemory(`Assistant: ${aiResponse.response}`, 'conversation', sessionId.current);

      setStatus('Generating speech...');

      // Generate and play TTS
      const audioResponse = await tts(aiResponse.response);
      if (conversationFlow.current) {
        await conversationFlow.current.playResponse(audioResponse);
      }

    } catch (error) {
      console.error('Failed to process audio:', error);
      setStatus('Processing failed');
      
      // Speak error message
      try {
        const errorMessage = "I'm sorry, I encountered an error processing that. Please try again.";
        const errorAudio = await tts(errorMessage);
        if (conversationFlow.current) {
          await conversationFlow.current.playResponse(errorAudio);
        }
      } catch (ttsError) {
        console.error('TTS error:', ttsError);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInterrupt = () => {
    if (conversationFlow.current && isSpeaking) {
      conversationFlow.current.interrupt();
      setStatus('Interrupted - Listening...');
    }
  };

  const stopConversation = () => {
    if (conversationFlow.current) {
      conversationFlow.current.stop();
      hasStarted.current = false;
      setIsListening(false);
      setStatus('Stopped - Click to restart');
    }
  };

  return (
    <div className="voice-agent-container" onClick={!hasStarted.current ? startConversation : undefined}>
      <div className="status-bar">
        <div className={`status-indicator ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''} ${isProcessing ? 'processing' : ''}`}>
          {status}
        </div>
        
        <div className="status-lights">
          <span className={`light ${isListening ? 'active' : ''}`} title="Listening">🎤</span>
          <span className={`light ${isProcessing ? 'active' : ''}`} title="Processing">⚙️</span>
          <span className={`light ${isSpeaking ? 'active' : ''}`} title="Speaking">🔊</span>
        </div>
      </div>

      <div className="conversation-panel">
        <div className="conversation-history">
          {conversationHistory.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              <strong>{msg.role === 'user' ? 'You' : 'Luna'}:</strong> {msg.content}
            </div>
          ))}
          {transcript && !response && (
            <div className="message user pending">
              <strong>You:</strong> {transcript}
            </div>
          )}
        </div>
      </div>

      <div className="controls">
        {hasStarted.current ? (
          <>
            <button 
              className="control-button interrupt" 
              onClick={handleInterrupt}
              disabled={!isSpeaking}
            >
              Interrupt
            </button>
            <button 
              className="control-button stop" 
              onClick={stopConversation}
            >
              Stop
            </button>
          </>
        ) : (
          <button 
            className="control-button start" 
            onClick={startConversation}
          >
            Start Conversation
          </button>
        )}
      </div>

      {!hasStarted.current && (
        <div className="instructions">
          <h3>Welcome to Luna Voice Assistant</h3>
          <p>Click anywhere or press "Start Conversation" to begin.</p>
          <p>Once started, just speak naturally - no buttons needed!</p>
        </div>
      )}
    </div>
  );
}
