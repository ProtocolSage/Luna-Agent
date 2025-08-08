import React, { useState, useEffect, useRef, useCallback } from 'react';
import ParticleField from './ParticleField';
import VoiceControls from './VoiceControls';
import { VoiceErrorBoundary } from './ErrorBoundary';
import { getVoiceService } from '../services/VoiceService';
import '../styles/luxury.css';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  audioUrl?: string;
  duration?: number;
  tokens?: number;
}

interface VoiceState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  wakeWordActive: boolean;
  noiseLevel: number;
  transcript: string;
}

const LuxuryApp: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    wakeWordActive: false,
    noiseLevel: 0,
    transcript: ''
  });
  const [isTyping, setIsTyping] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4-turbo');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoListen, setAutoListen] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [errorRecoveryCount, setErrorRecoveryCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioVisualizerRef = useRef<HTMLCanvasElement>(null);
  const voiceServiceRef = useRef(getVoiceService());
  const recoveryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize voice service and IPC listeners
  useEffect(() => {
    let mounted = true;
    
    const initVoice = async () => {
      try {
        await voiceServiceRef.current.initialize();
        if (mounted) {
          console.log('Voice service initialized in LuxuryApp');
        }
      } catch (error) {
        console.error('Failed to initialize voice service:', error);
        if (mounted) {
          // Set error state or show notification
          setVoiceState(prev => ({ 
            ...prev, 
            isListening: false,
            isProcessing: false,
            isSpeaking: false
          }));
        }
      }
    };
    
    // Initialize with error handling
    initVoice().catch(error => {
      console.error('Voice initialization failed:', error);
    });

    // Setup voice service event listeners
    voiceServiceRef.current.on('tts-started', () => {
      setVoiceState(prev => ({ ...prev, isSpeaking: true }));
    });

    voiceServiceRef.current.on('tts-ended', () => {
      setVoiceState(prev => ({ ...prev, isSpeaking: false }));
    });

    voiceServiceRef.current.on('listening-started', () => {
      console.log('Voice service: listening started');
      setVoiceState(prev => ({ ...prev, isListening: true, isProcessing: false }));
    });

    voiceServiceRef.current.on('listening-stopped', () => {
      console.log('Voice service: listening stopped');
      setVoiceState(prev => ({ ...prev, isListening: false, transcript: '' }));
    });

    voiceServiceRef.current.on('transcription', (result: any) => {
      if (result.isFinal) {
        setInputValue(result.text);
        setVoiceState(prev => ({ ...prev, transcript: result.text }));
        // Auto-send message if transcript is received
        if (result.text.trim() && autoListen) {
          setTimeout(() => {
            handleSendMessage();
          }, 500);
        }
      } else {
        // Show interim results
        setVoiceState(prev => ({ ...prev, transcript: result.text }));
      }
    });

    voiceServiceRef.current.on('volume-level', (level: number) => {
      setVoiceState(prev => ({ ...prev, noiseLevel: level * 100 }));
      updateAudioVisualizer(level * 100);
    });

    voiceServiceRef.current.on('voice-input-error', (error: any) => {
      console.error('Voice input error:', error);
      setVoiceState(prev => ({ 
        ...prev, 
        isListening: false, 
        isProcessing: false, 
        transcript: ''
      }));
    });

    // Cleanup function - always return this regardless of window state
    return () => {
      mounted = false;
      if (recoveryTimeoutRef.current) {
        clearTimeout(recoveryTimeoutRef.current);
      }
      try {
        voiceServiceRef.current.destroy();
      } catch (error) {
        console.error('Error during voice service cleanup:', error);
      }
    };
  }, []);

  // Audio visualizer
  const updateAudioVisualizer = (level: number) => {
    const canvas = audioVisualizerRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas with fade effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, width, height);

    // Draw audio bars
    const barCount = 32;
    const barWidth = width / barCount;
    const barHeight = (level / 100) * height;

    for (let i = 0; i < barCount; i++) {
      const hue = (i / barCount) * 60 + 200;
      const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
      gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.8)`);
      gradient.addColorStop(1, `hsla(${hue}, 100%, 70%, 0.2)`);

      ctx.fillStyle = gradient;
      const randomHeight = barHeight * (0.5 + Math.random() * 0.5);
      ctx.fillRect(i * barWidth, height - randomHeight, barWidth - 2, randomHeight);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    const messageContent = inputValue; // Store before clearing
    setInputValue('');
    setIsTyping(true);
    setVoiceState(prev => ({ ...prev, isProcessing: true }));

    try {
      // Send message and get response with TTS
      const response = await voiceServiceRef.current.chatWithTTS(messageContent);
      
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Add error message to chat
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process message'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setVoiceState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [inputValue]);

  const toggleVoiceRecording = useCallback(async () => {
    try {
      if (voiceState.isListening) {
        console.log('Stopping voice recording...');
        await voiceServiceRef.current.stopListening();
        // Force state cleanup after a brief delay
        setTimeout(() => {
          setVoiceState(prev => ({ 
            ...prev, 
            isListening: false, 
            isProcessing: false,
            transcript: ''
          }));
        }, 100);
      } else {
        console.log('Starting voice recording...');
        await voiceServiceRef.current.startListening();
      }
    } catch (error) {
      console.error('Voice recording toggle error:', error);
      // Force reset state on error
      setVoiceState(prev => ({ 
        ...prev, 
        isListening: false, 
        isProcessing: false,
        transcript: ''
      }));
    }
  }, [voiceState.isListening]);

  // Error recovery system
  const handleVoiceRecovery = useCallback(() => {
    console.log('Initiating voice recovery...');
    setErrorRecoveryCount(prev => prev + 1);
    
    // Clear any existing timeout
    if (recoveryTimeoutRef.current) {
      clearTimeout(recoveryTimeoutRef.current);
    }
    
    // Reset voice state
    setVoiceState({
      isListening: false,
      isProcessing: false,
      isSpeaking: false,
      wakeWordActive: false,
      noiseLevel: 0,
      transcript: ''
    });
    
    // Attempt to reinitialize voice service
    recoveryTimeoutRef.current = setTimeout(async () => {
      try {
        await voiceServiceRef.current.initialize();
        console.log('Voice service recovery successful');
      } catch (error) {
        console.error('Voice service recovery failed:', error);
      }
    }, 1000);
  }, []);

  // Automatic recovery for stuck states
  useEffect(() => {
    let stuckStateTimeout: NodeJS.Timeout;
    
    if (voiceState.isListening || voiceState.isProcessing) {
      // If voice is stuck in listening/processing state for more than 30 seconds, trigger recovery
      stuckStateTimeout = setTimeout(() => {
        console.log('Detected stuck voice state, triggering recovery');
        handleVoiceRecovery();
      }, 30000);
    }
    
    return () => {
      if (stuckStateTimeout) {
        clearTimeout(stuckStateTimeout);
      }
    };
  }, [voiceState.isListening, voiceState.isProcessing, handleVoiceRecovery]);

  const toggleWakeWord = () => {
    setVoiceState(prev => ({ ...prev, wakeWordActive: !prev.wakeWordActive }));
  };

  const clearChat = () => {
    setMessages([]);
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  return (
    <div className={`luxury-app ${darkMode ? 'dark' : 'light'} ${voiceState.isListening ? 'listening' : ''}`}>
      <ParticleField />
      
      {/* Premium Header */}
      <header className="luxury-header">
        <div className="header-content">
          <div className="brand">
            <div className="brand-icon">
              <div className="icon-glow"></div>
              <svg width="40" height="40" viewBox="0 0 40 40" className="luna-logo">
                <defs>
                  <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00d4ff" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#ff6b35" />
                  </linearGradient>
                </defs>
                <circle cx="20" cy="20" r="18" fill="none" stroke="url(#logoGradient)" strokeWidth="2" />
                <circle cx="20" cy="20" r="8" fill="url(#logoGradient)" opacity="0.8" />
              </svg>
            </div>
            <div className="brand-text">
              <h1 className="brand-title">LUNA</h1>
              <span className="brand-subtitle">Premium AI Assistant</span>
            </div>
          </div>

          <nav className="header-controls">
            {/* Model Selector */}
            <div className="control-group">
              <select 
                className="model-selector glass-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="claude-3">Claude 3</option>
                <option value="llama-2">Llama 2</option>
              </select>
            </div>

            {/* Emergency Recovery Button */}
            {errorRecoveryCount > 0 && (
              <button 
                className="recovery-btn glass-btn"
                onClick={handleVoiceRecovery}
                title="Force voice system recovery"
              >
                <span className="recovery-icon">🔄</span>
                <span className="recovery-count">{errorRecoveryCount}</span>
              </button>
            )}

            {/* Voice Controls Component */}
            {voiceEnabled && (
              <VoiceErrorBoundary 
                onVoiceError={(error) => {
                  console.error('Voice error boundary caught:', error);
                  setVoiceState(prev => ({ 
                    ...prev, 
                    isListening: false, 
                    isProcessing: false 
                  }));
                }}
              >
                <VoiceControls
                  onTranscript={(transcript) => {
                    setInputValue(transcript);
                    setVoiceState(prev => ({ ...prev, transcript }));
                    // Auto-send if in auto mode
                    if (autoListen && transcript) {
                      handleSendMessage().catch(error => {
                        console.error('Auto-send failed:', error);
                      });
                    }
                  }}
                  onError={(error) => {
                    console.error('Voice error:', error);
                    setVoiceState(prev => ({ 
                      ...prev, 
                      isListening: false, 
                      isProcessing: false 
                    }));
                  }}
                  showTranscript={false}
                  showVisualizer={false}
                  className="header-voice-controls"
                />
              </VoiceErrorBoundary>
            )}

            {/* Settings */}
            <button 
              className="settings-btn glass-btn"
              onClick={() => setShowSettings(!showSettings)}
            >
              <span className="settings-icon">⚙️</span>
            </button>
          </nav>
        </div>

        {/* Audio Visualizer */}
        {voiceState.isListening && (
          <canvas 
            ref={audioVisualizerRef}
            className="audio-visualizer"
            width={800}
            height={60}
          />
        )}
      </header>

      {/* Messages Container */}
      <main className="messages-container">
        <div className="messages-wrapper">
          {messages.length === 0 && (
            <div className="welcome-message glass-card">
              <h2 className="welcome-title">Welcome to Luna</h2>
              <p className="welcome-text">Your premium AI assistant with voice capabilities</p>
              <div className="feature-pills">
                <span className="feature-pill">Voice Recognition</span>
                <span className="feature-pill">Multi-Model Support</span>
                <span className="feature-pill">Real-time Processing</span>
                <span className="feature-pill">Wake Word Detection</span>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div 
              key={message.id}
              className={`message-bubble ${message.role} glass-card`}
            >
              <div className="message-header">
                <span className="message-role">
                  {message.role === 'user' ? '👤' : '🤖'} {message.role}
                </span>
                <span className="message-time">{formatTime(message.timestamp)}</span>
              </div>
              <div className="message-content">{message.content}</div>
              {message.tokens && (
                <div className="message-meta">
                  <span className="token-count">{message.tokens} tokens</span>
                  {message.duration && (
                    <span className="duration">{message.duration}ms</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="typing-indicator glass-card">
              <div className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="typing-text">Luna is thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="input-area">
        <div className="input-container glass-card">
          {voiceState.isListening && (
            <div className="voice-indicator animate-in">
              <div className="voice-wave"></div>
              <span className="voice-status">Listening...</span>
              {voiceState.transcript && (
                <span className="live-transcript">{voiceState.transcript}</span>
              )}
            </div>
          )}

          <div className="input-wrapper">
            <textarea
              className="message-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !voiceState.isProcessing) {
                  e.preventDefault();
                  handleSendMessage().catch(error => {
                    console.error('Enter key send error:', error);
                  });
                }
              }}
              placeholder={voiceState.isListening ? "Listening..." : "Type your message or use voice..."}
              rows={1}
            />

            <div className="input-actions">
              <button 
                className={`voice-btn glass-btn ${voiceState.isListening ? 'recording' : ''} ${voiceState.isProcessing ? 'processing' : ''}`}
                onClick={() => {
                  toggleVoiceRecording().catch(error => {
                    console.error('Voice button click error:', error);
                  });
                }}
                disabled={voiceState.isProcessing || voiceState.isSpeaking}
                title={voiceState.isListening ? 'Stop listening' : voiceState.isProcessing ? 'Processing...' : 'Start voice input'}
              >
                <div className="mic-icon">
                  {voiceState.isListening ? '🔴' : voiceState.isProcessing ? '⏳' : voiceState.isSpeaking ? '🔊' : '🎤'}
                </div>
                <span className="mic-status">
                  {voiceState.isListening ? 'Stop' : voiceState.isProcessing ? 'Processing' : voiceState.isSpeaking ? 'Speaking' : 'Voice'}
                </span>
              </button>

              <button 
                className="send-btn glass-btn primary"
                onClick={() => {
                  handleSendMessage().catch(error => {
                    console.error('Send button click error:', error);
                  });
                }}
                disabled={!inputValue.trim() || voiceState.isProcessing}
              >
                <span className="send-icon">✨</span>
                <span className="send-text">Send</span>
              </button>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="status-bar glass-card">
          <div className="status-item">
            <span className="status-dot" style={{
              backgroundColor: voiceState.wakeWordActive ? '#00ff88' : '#666'
            }}></span>
            Wake Word {voiceState.wakeWordActive ? 'Active' : 'Inactive'}
          </div>
          <div className="status-item">
            <span className="status-dot" style={{
              backgroundColor: voiceState.isProcessing ? '#ff6b35' : '#666'
            }}></span>
            {voiceState.isProcessing ? 'Processing' : 'Ready'}
          </div>
          <div className="status-item">
            Model: {selectedModel}
          </div>
          <div className="status-item">
            Messages: {messages.length}
          </div>
        </div>
      </footer>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel glass-card">
          <h3 className="settings-title">Settings</h3>
          <div className="settings-content">
            <div className="setting-item">
              <label>Dark Mode</label>
              <button 
                className={`toggle-btn ${darkMode ? 'active' : ''}`}
                onClick={() => setDarkMode(!darkMode)}
              >
                {darkMode ? '🌙' : '☀️'}
              </button>
            </div>
            <div className="setting-item">
              <label>Clear Chat</label>
              <button className="action-btn glass-btn" onClick={clearChat}>
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LuxuryApp;