import React, { useState, useEffect, useRef } from 'react';
import { ConversationView } from './components/ConversationView';
import { VoiceControl } from './components/VoiceControl';
import { ErrorBoundary } from './components/ErrorBoundary';
import { logger } from './utils/logger';

// Types
type VoiceMode = 'idle' | 'listening' | 'processing' | 'speaking';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const LuxuryApp: React.FC = () => {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('idle');
  const [inputText, setInputText] = useState('');

  // Services (initialize once)
  const voiceService = useRef<any>(null);
  const db = useRef<any>(null);
  const wakeWord = useRef<any>(null);

  /**
   * Initialize services on mount
   */
  useEffect(() => {
    logger.info('Luna App starting');

    const initServices = async () => {
      try {
        // Import services dynamically
        const { VoiceService } = await import('./services/VoiceService');
        const { DatabaseService } = await import('./services/DatabaseService');
        const { WakeWordListener } = await import('./services/WakeWordListener');

        voiceService.current = new VoiceService();
        db.current = new DatabaseService();
        wakeWord.current = new WakeWordListener();

        // Initialize all services
        await Promise.all([
          voiceService.current.initialize(),
          db.current.initialize()
        ]);

        logger.info('Services initialized successfully');

        // Load conversation history
        const history = db.current.getMessages();
        if (history && history.length > 0) {
          setMessages(history);
          logger.info('Loaded conversation history', { count: history.length });
        }

        // Initialize wake word if access key available
        const wakeWordKey = process.env.PICOVOICE_ACCESS_KEY;
        if (wakeWordKey) {
          await wakeWord.current.initialize(wakeWordKey, handleWakeWord);
          await wakeWord.current.start();
          logger.info('Wake word detection enabled');
        }

      } catch (error) {
        logger.error('Service initialization failed', { error: error.message });
      }
    };

    initServices();

    // Cleanup on unmount
    return () => {
      logger.info('Luna App shutting down');
      
      voiceService.current?.cleanup();
      db.current?.close();
      wakeWord.current?.release();
    };
  }, []);

  /**
   * Handle wake word detection
   */
  const handleWakeWord = () => {
    logger.info('Wake word detected - starting voice input');
    startListening();
  };

  /**
   * Start voice listening
   */
  const startListening = async () => {
    if (!voiceService.current) {
      logger.error('Voice service not initialized');
      return;
    }

    setVoiceMode('listening');
    logger.info('Voice listening started');

    try {
      const transcript = await voiceService.current.listen();
      
      if (transcript && transcript.trim()) {
        logger.info('Transcript received', { transcript });
        setVoiceMode('processing');
        await sendMessage(transcript);
      } else {
        logger.warn('Empty transcript received');
        setVoiceMode('idle');
      }
    } catch (error) {
      logger.error('Voice listening error', { error: error.message });
      setVoiceMode('idle');
    }
  };

  /**
   * Stop voice listening
   */
  const stopListening = () => {
    if (voiceService.current) {
      voiceService.current.stopListening();
    }
    setVoiceMode('idle');
    logger.info('Voice listening stopped');
  };

  /**
   * Send message to LLM and get response
   */
  const sendMessage = async (text: string) => {
    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp: Date.now()
    };

    // Add user message
    setMessages(prev => [...prev, userMsg]);
    
    // Save to database
    if (db.current) {
      db.current.saveMessage(userMsg);
    }

    try {
      logger.info('Sending message to LLM', { text: text.substring(0, 50) });

      // Call your LLM API endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          history: messages.slice(-10) // Send last 10 messages for context
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: Date.now()
      };

      // Add assistant message
      setMessages(prev => [...prev, assistantMsg]);
      
      // Save to database
      if (db.current) {
        db.current.saveMessage(assistantMsg);
      }

      // Speak response
      await speakResponse(data.response);

    } catch (error) {
      logger.error('Message send error', { error: error.message });
      
      // Add error message
      const errorMsg: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
      
      setVoiceMode('idle');
    }
  };

  /**
   * Speak assistant response using TTS
   */
  const speakResponse = async (text: string) => {
    if (!voiceService.current) {
      setVoiceMode('idle');
      return;
    }

    setVoiceMode('speaking');
    logger.info('Speaking response', { length: text.length });

    try {
      await voiceService.current.speak(text);
      logger.info('Finished speaking');
    } catch (error) {
      logger.error('TTS error', { error: error.message });
    } finally {
      setVoiceMode('idle');
    }
  };

  /**
   * Handle text input submit
   */
  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputText.trim()) return;

    const text = inputText;
    setInputText('');
    setVoiceMode('processing');
    
    await sendMessage(text);
  };

  return (
    <ErrorBoundary>
      <div className="luxury-app">
        <header className="app-header">
          <h1>🌙 Luna Voice Agent</h1>
          <div className="status-indicator">
            <span className={`status-dot ${voiceMode}`}></span>
            <span className="status-text">
              {voiceMode === 'idle' ? 'Ready' : voiceMode}
            </span>
          </div>
        </header>

        <main className="app-main">
          <ConversationView 
            messages={messages}
            isProcessing={voiceMode === 'processing'}
          />
        </main>

        <footer className="app-footer">
          <form onSubmit={handleTextSubmit} className="text-input-form">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message or use voice..."
              className="text-input"
              disabled={voiceMode !== 'idle'}
            />
            <button 
              type="submit" 
              className="send-button"
              disabled={!inputText.trim() || voiceMode !== 'idle'}
            >
              Send
            </button>
          </form>

          <VoiceControl
            mode={voiceMode}
            onStartListening={startListening}
            onStopListening={stopListening}
          />
        </footer>
      </div>
    </ErrorBoundary>
  );
};
