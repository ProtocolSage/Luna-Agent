import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StreamingVoiceService } from '../services/StreamingVoiceClient';

interface ConversationState {
  isListening: boolean;
  isSpeaking: boolean;
  canInterrupt: boolean;
  lastUserSpeechTime: number;
  lastAISpeechTime: number;
  conversationActive: boolean;
}

interface VoiceConfig {
  inputSampleRate: number;
  outputSampleRate: number;
  bufferSize: number;
  vadThreshold: number;
  silenceTimeout: number;
  interruptThreshold: number;
}

interface StreamingVoiceInterfaceProps {
  onTranscription?: (text: string) => void;
  onAIResponse?: (text: string) => void;
  onError?: (error: string) => void;
  autoStart?: boolean;
  className?: string;
}

export const StreamingVoiceInterface: React.FC<StreamingVoiceInterfaceProps> = ({
  onTranscription,
  onAIResponse,
  onError,
  autoStart = true,
  className = ''
}) => {
  // Service reference
  const voiceServiceRef = useRef<StreamingVoiceService | null>(null);
  
  // State management
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>({
    isListening: false,
    isSpeaking: false,
    canInterrupt: false,
    lastUserSpeechTime: 0,
    lastAISpeechTime: 0,
    conversationActive: false
  });
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    inputSampleRate: 24000,
    outputSampleRate: 24000,
    bufferSize: 4096,
    vadThreshold: 0.01,
    silenceTimeout: 1500,
    interruptThreshold: 200
  });
  
  // UI State
  const [currentTranscription, setCurrentTranscription] = useState('');
  const [currentAIResponse, setCurrentAIResponse] = useState('');
  const [vadLevel, setVadLevel] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState<string | null>(null);
  
  // Audio visualization
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  
  /**
   * Initialize the streaming voice service
   */
  const initializeVoiceService = useCallback(async () => {
    try {
      console.log('[StreamingVoiceUI] Initializing voice service...');
      setConnectionStatus('connecting');
      
      // Create voice service instance
      const voiceService = new StreamingVoiceService();
      voiceServiceRef.current = voiceService;
      
      // Set up event listeners
      setupEventListeners(voiceService);
      
      // Initialize the service
      await voiceService.initialize();
      
      setIsInitialized(true);
      setIsConnected(true);
      setConnectionStatus('connected');
      
      console.log('[StreamingVoiceUI] Voice service initialized successfully');
      
    } catch (error) {
      console.error('[StreamingVoiceUI] Failed to initialize voice service:', error);
      setError(error instanceof Error ? error.message : 'Failed to initialize voice service');
      setConnectionStatus('error');
      onError?.(error instanceof Error ? error.message : 'Failed to initialize voice service');
    }
  }, [onError]);
  
  /**
   * Setup event listeners for voice service
   */
  const setupEventListeners = useCallback((voiceService: StreamingVoiceService) => {
    // Connection events
    voiceService.on('initialized', () => {
      console.log('[StreamingVoiceUI] Voice service initialized');
      setIsInitialized(true);
    });
    
    voiceService.on('connected', () => {
      console.log('[StreamingVoiceUI] Connected to voice service');
      setIsConnected(true);
      setConnectionStatus('connected');
    });
    
    voiceService.on('disconnected', () => {
      console.log('[StreamingVoiceUI] Disconnected from voice service');
      setIsConnected(false);
      setConnectionStatus('disconnected');
    });
    
    // Listening state
    voiceService.on('listening-started', () => {
      setConversationState(prev => ({ ...prev, isListening: true }));
    });
    
    voiceService.on('listening-stopped', () => {
      setConversationState(prev => ({ ...prev, isListening: false }));
    });
    
    // Speech detection
    voiceService.on('speech-detected', () => {
      console.log('[StreamingVoiceUI] Speech detected');
    });
    
    voiceService.on('speech-ended', () => {
      console.log('[StreamingVoiceUI] Speech ended');
    });
    
    voiceService.on('user-speaking', (data: { level: number; timestamp: number }) => {
      setVadLevel(data.level);
    });
    
    // Transcription
    voiceService.on('transcription', (text: string) => {
      console.log('[StreamingVoiceUI] Transcription:', text);
      setCurrentTranscription(text);
      onTranscription?.(text);
    });
    
    // AI responses
    voiceService.on('ai-response-text', (text: string) => {
      setCurrentAIResponse(prev => prev + text);
    });
    
    voiceService.on('ai-speaking', () => {
      setConversationState(prev => ({ ...prev, isSpeaking: true }));
    });
    
    voiceService.on('ai-finished-speaking', () => {
      setConversationState(prev => ({ ...prev, isSpeaking: false }));
      
      // Send complete AI response
      if (currentAIResponse) {
        onAIResponse?.(currentAIResponse);
        setCurrentAIResponse('');
      }
    });
    
    // Conversation flow
    voiceService.on('user-interrupted', () => {
      console.log('[StreamingVoiceUI] User interrupted AI');
      setCurrentAIResponse(''); // Clear interrupted response
    });
    
    voiceService.on('response-complete', () => {
      console.log('[StreamingVoiceUI] AI response complete');
    });
    
    voiceService.on('continuous-mode-started', () => {
      setConversationState(prev => ({ ...prev, conversationActive: true }));
    });
    
    voiceService.on('continuous-mode-stopped', () => {
      setConversationState(prev => ({ ...prev, conversationActive: false }));
    });
    
    // State updates
    voiceService.on('state-update', (state: ConversationState) => {
      setConversationState(state);
    });
    
    voiceService.on('config-update', (config: VoiceConfig) => {
      setVoiceConfig(config);
    });
    
    // Errors
    voiceService.on('error', (error: string) => {
      console.error('[StreamingVoiceUI] Voice service error:', error);
      setError(error);
      onError?.(error);
    });
    
    voiceService.on('connection-error', (error: string) => {
      console.error('[StreamingVoiceUI] Connection error:', error);
      setConnectionStatus('error');
      setError(error);
      onError?.(error);
    });
  }, [onTranscription, onAIResponse, onError, currentAIResponse]);
  
  /**
   * Start continuous conversation mode
   */
  const startContinuousMode = useCallback(async () => {
    const voiceService = voiceServiceRef.current;
    if (!voiceService || !isConnected) return;
    
    try {
      await voiceService.startContinuousMode();
    } catch (error) {
      console.error('[StreamingVoiceUI] Failed to start continuous mode:', error);
    }
  }, [isConnected]);
  
  /**
   * Stop continuous conversation mode
   */
  const stopContinuousMode = useCallback(async () => {
    const voiceService = voiceServiceRef.current;
    if (!voiceService) return;
    
    try {
      await voiceService.stopContinuousMode();
    } catch (error) {
      console.error('[StreamingVoiceUI] Failed to stop continuous mode:', error);
    }
  }, []);
  
  /**
   * Update voice configuration
   */
  const updateConfig = useCallback((updates: Partial<VoiceConfig>) => {
    const voiceService = voiceServiceRef.current;
    if (!voiceService) return;
    
    voiceService.updateConfig(updates);
  }, []);
  
  /**
   * Audio visualization
   */
  const drawVisualization = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw VAD level indicator
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(canvas.width, canvas.height) / 3;
    
    // Background circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, maxRadius, 0, 2 * Math.PI);
    ctx.fillStyle = conversationState.isListening ? 'rgba(0, 255, 0, 0.1)' : 'rgba(128, 128, 128, 0.1)';
    ctx.fill();
    
    // VAD level visualization
    if (vadLevel > 0) {
      const vadRadius = (vadLevel * maxRadius);
      ctx.beginPath();
      ctx.arc(centerX, centerY, vadRadius, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(0, 255, 0, ${Math.min(0.8, vadLevel * 5)})`;
      ctx.fill();
    }
    
    // Speaking indicator
    if (conversationState.isSpeaking) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, maxRadius * 0.8, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255, 100, 0, 0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    
    // Status text
    ctx.fillStyle = '#333';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    let statusText = 'Disconnected';
    if (conversationState.conversationActive) {
      statusText = conversationState.isListening ? 'Listening...' : 
                  conversationState.isSpeaking ? 'AI Speaking...' : 'Ready';
    } else if (isConnected) {
      statusText = 'Connected';
    }
    ctx.fillText(statusText, centerX, centerY + maxRadius + 20);
    
    animationFrameRef.current = requestAnimationFrame(drawVisualization);
  }, [vadLevel, conversationState, isConnected]);
  
  // Initialize on mount
  useEffect(() => {
    if (autoStart) {
      initializeVoiceService();
    }
    
    return () => {
      // Cleanup on unmount
      const voiceService = voiceServiceRef.current;
      if (voiceService) {
        voiceService.cleanup();
      }
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [autoStart, initializeVoiceService]);
  
  // Start visualization
  useEffect(() => {
    if (isConnected) {
      drawVisualization();
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isConnected, drawVisualization]);
  
  return (
    <div className={`streaming-voice-interface ${className}`}>
      {/* Status Header */}
      <div className="voice-status-header">
        <div className="connection-status">
          <span className={`status-indicator ${connectionStatus}`}></span>
          <span className="status-text">{connectionStatus}</span>
        </div>
        
        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}
      </div>
      
      {/* Audio Visualization */}
      <div className="voice-visualization">
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          className="visualization-canvas"
        />
      </div>
      
      {/* Control Buttons */}
      <div className="voice-controls">
        {!isInitialized ? (
          <button
            onClick={initializeVoiceService}
            className="btn btn-primary"
            disabled={connectionStatus === 'connecting'}
          >
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Initialize Voice'}
          </button>
        ) : (
          <>
            <button
              onClick={conversationState.conversationActive ? stopContinuousMode : startContinuousMode}
              className={`btn ${conversationState.conversationActive ? 'btn-danger' : 'btn-success'}`}
              disabled={!isConnected}
            >
              {conversationState.conversationActive ? 'Stop Conversation' : 'Start Conversation'}
            </button>
          </>
        )}
      </div>
      
      {/* Configuration Panel */}
      <div className="voice-config-panel">
        <details>
          <summary>Voice Settings</summary>
          
          <div className="config-item">
            <label>VAD Threshold:</label>
            <input
              type="range"
              min="0.001"
              max="0.1"
              step="0.001"
              value={voiceConfig.vadThreshold}
              onChange={(e) => updateConfig({ vadThreshold: parseFloat(e.target.value) })}
            />
            <span>{voiceConfig.vadThreshold.toFixed(3)}</span>
          </div>
          
          <div className="config-item">
            <label>Silence Timeout (ms):</label>
            <input
              type="range"
              min="500"
              max="3000"
              step="100"
              value={voiceConfig.silenceTimeout}
              onChange={(e) => updateConfig({ silenceTimeout: parseInt(e.target.value) })}
            />
            <span>{voiceConfig.silenceTimeout}ms</span>
          </div>
          
          <div className="config-item">
            <label>Interrupt Threshold (ms):</label>
            <input
              type="range"
              min="100"
              max="500"
              step="50"
              value={voiceConfig.interruptThreshold}
              onChange={(e) => updateConfig({ interruptThreshold: parseInt(e.target.value) })}
            />
            <span>{voiceConfig.interruptThreshold}ms</span>
          </div>
        </details>
      </div>
      
      {/* Transcription Display */}
      <div className="voice-transcription">
        {currentTranscription && (
          <div className="transcription-text">
            <strong>You:</strong> {currentTranscription}
          </div>
        )}
        
        {currentAIResponse && (
          <div className="ai-response-text">
            <strong>Luna:</strong> {currentAIResponse}
          </div>
        )}
      </div>
      
      <style>{`
        .streaming-voice-interface {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          padding: 20px;
          background: linear-gradient(145deg, #f0f0f0, #ffffff);
          border-radius: 15px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          max-width: 500px;
          margin: 0 auto;
        }
        
        .voice-status-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }
        
        .connection-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .status-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: gray;
        }
        
        .status-indicator.connected {
          background: #00ff00;
          animation: pulse 2s infinite;
        }
        
        .status-indicator.connecting {
          background: #ffaa00;
          animation: blink 1s infinite;
        }
        
        .status-indicator.error {
          background: #ff0000;
        }
        
        .error-message {
          color: #ff4444;
          font-size: 12px;
          padding: 4px 8px;
          background: rgba(255, 68, 68, 0.1);
          border-radius: 4px;
        }
        
        .voice-visualization {
          position: relative;
        }
        
        .visualization-canvas {
          border: 2px solid #e0e0e0;
          border-radius: 50%;
          background: radial-gradient(circle, #fafafa, #f0f0f0);
        }
        
        .voice-controls {
          display: flex;
          gap: 15px;
        }
        
        .btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .btn-primary {
          background: linear-gradient(145deg, #007bff, #0056b3);
          color: white;
        }
        
        .btn-success {
          background: linear-gradient(145deg, #28a745, #1e7e34);
          color: white;
        }
        
        .btn-danger {
          background: linear-gradient(145deg, #dc3545, #bd2130);
          color: white;
        }
        
        .btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        .voice-config-panel {
          width: 100%;
        }
        
        .voice-config-panel details {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 15px;
        }
        
        .voice-config-panel summary {
          cursor: pointer;
          font-weight: 600;
          margin-bottom: 10px;
        }
        
        .config-item {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        
        .config-item label {
          min-width: 140px;
          font-size: 12px;
        }
        
        .config-item input[type="range"] {
          flex: 1;
        }
        
        .config-item span {
          min-width: 60px;
          font-size: 12px;
          color: #666;
        }
        
        .voice-transcription {
          width: 100%;
          min-height: 80px;
          background: #f8f9fa;
          border-radius: 8px;
          padding: 15px;
          font-size: 14px;
        }
        
        .transcription-text {
          color: #007bff;
          margin-bottom: 10px;
        }
        
        .ai-response-text {
          color: #28a745;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default StreamingVoiceInterface;