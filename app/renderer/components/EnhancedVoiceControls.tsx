// app/renderer/components/EnhancedVoiceControls.tsx
// This component ENHANCES your existing VoiceControls with new features

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getEnhancedVoiceService, EnhancedVoiceMode, AudioMetrics, VoiceDebugInfo } from '../services/EnhancedVoiceService';
import { getVoiceService } from '../services/VoiceService';
import '../styles/voice.css';
import '../styles/enhanced-voice.css'; // New styles

interface EnhancedVoiceControlsProps {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  className?: string;
  showTranscript?: boolean;
  showVisualizer?: boolean;
  enableDebugPanel?: boolean;
}

interface EnhancedVoiceState {
  // Base state (from your existing component)
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
  mode: 'auto' | 'push' | 'manual';
  offlineModeEnabled: boolean;
  circuitBreakerOpen: boolean;
  networkStatus: {
    isOnline: boolean;
    isNetworkAvailable: boolean;
  };
  sttEngine: string | null;
  isUsingCloud: boolean;
  webSpeechFailed: boolean;
  
  // Enhanced state
  enhancedMode: EnhancedVoiceMode;
  audioMetrics: AudioMetrics;
  debugInfo: VoiceDebugInfo | null;
  showDebugPanel: boolean;
  confidence: number;
  recordingDuration: number;
}

export const EnhancedVoiceControls: React.FC<EnhancedVoiceControlsProps> = ({
  onTranscript,
  onError,
  className = '',
  showTranscript = false,
  showVisualizer = true,
  enableDebugPanel = false
}) => {
  const [state, setState] = useState<EnhancedVoiceState>({
    // Base state
    isListening: false,
    isSpeaking: false,
    error: null,
    mode: 'manual',
    offlineModeEnabled: false,
    circuitBreakerOpen: false,
    networkStatus: {
      isOnline: navigator.onLine,
      isNetworkAvailable: true
    },
    sttEngine: null,
    isUsingCloud: false,
    webSpeechFailed: false,
    
    // Enhanced state
    enhancedMode: 'voice-activity',
    audioMetrics: {
      audioLevel: -100,
      noiseFloor: -100,
      speechDetected: false,
      confidence: 0,
      snr: 0
    },
    debugInfo: null,
    showDebugPanel: false,
    confidence: 0,
    recordingDuration: 0
  });

  const enhancedVoiceService = useRef(getEnhancedVoiceService());
  const baseVoiceService = useRef(getVoiceService());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  // Initialize enhanced voice service
  useEffect(() => {
    const initializeEnhanced = async () => {
      try {
        await enhancedVoiceService.current.initialize();
        console.log('[EnhancedVoiceControls] Enhanced voice service initialized');
        
        // Set initial mode
        enhancedVoiceService.current.setVoiceMode(state.enhancedMode);
        
      } catch (error) {
        console.error('[EnhancedVoiceControls] Failed to initialize enhanced service:', error);
        onError?.(`Enhanced voice features unavailable: ${error.message}`);
      }
    };

    initializeEnhanced();
  }, []);

  // Set up enhanced voice service listeners
  useEffect(() => {
    const service = enhancedVoiceService.current;

    const handleAudioMetrics = (metrics: AudioMetrics) => {
      setState(prev => ({ 
        ...prev, 
        audioMetrics: metrics,
        confidence: metrics.confidence
      }));
    };

    const handleDebugInfoUpdate = (debugInfo: VoiceDebugInfo) => {
      setState(prev => ({ 
        ...prev, 
        debugInfo,
        recordingDuration: debugInfo.recordingDuration
      }));
    };

    const handleModeChanged = ({ to }: { from: EnhancedVoiceMode; to: EnhancedVoiceMode }) => {
      setState(prev => ({ ...prev, enhancedMode: to }));
    };

    const handleEnhancedListeningStarted = () => {
      setState(prev => ({ ...prev, isListening: true, error: null }));
    };

    const handleEnhancedListeningStopped = () => {
      setState(prev => ({ ...prev, isListening: false }));
    };

    const handlePTTStarted = () => {
      console.log('[EnhancedVoiceControls] PTT started');
    };

    const handlePTTStopped = () => {
      console.log('[EnhancedVoiceControls] PTT stopped');
    };

    // Enhanced service listeners
    service.on('audio-metrics', handleAudioMetrics);
    service.on('debug-info-updated', handleDebugInfoUpdate);
    service.on('mode-changed', handleModeChanged);
    service.on('enhanced-listening-started', handleEnhancedListeningStarted);
    service.on('enhanced-listening-stopped', handleEnhancedListeningStopped);
    service.on('ptt-started', handlePTTStarted);
    service.on('ptt-stopped', handlePTTStopped);

    // Forward enhanced service events to base listeners
    service.on('listening_started', () => {
      setState(prev => ({ ...prev, isListening: true, error: null }));
    });

    service.on('listening_stopped', () => {
      setState(prev => ({ ...prev, isListening: false }));
    });

    service.on('transcription_received', (text: string) => {
      onTranscript?.(text);
    });

    service.on('tts_started', () => {
      setState(prev => ({ ...prev, isSpeaking: true }));
    });

    service.on('tts_ended', () => {
      setState(prev => ({ ...prev, isSpeaking: false }));
    });

    service.on('error', (error: string) => {
      setState(prev => ({ ...prev, error, isListening: false }));
      onError?.(error);
    });

    return () => {
      service.removeAllListeners();
    };
  }, [onTranscript, onError]);

  // Set up your existing STT listeners (maintain compatibility)
  useEffect(() => {
    let unsubscribeTranscript: undefined | (() => void);
    let unsubscribeEngineSwitch: undefined | (() => void);

    if (window.stt) {
      window.stt.setMaxListeners?.(20);

      unsubscribeTranscript = window.stt.onTranscript(({ text, isFinal }: { text: string; isFinal: boolean }) => {
        if (isFinal && text.trim()) {
          onTranscript?.(text);
        }
      });

      unsubscribeEngineSwitch = window.stt.onEngineSwitch((info: { engine: string; isCloud: boolean }) => {
        setState(prev => ({ 
          ...prev, 
          sttEngine: info.engine,
          isUsingCloud: info.isCloud,
          error: null
        }));
      });

      window.stt.getStatus().then((status: any) => {
        if (status && !status.error) {
          setState(prev => ({
            ...prev,
            sttEngine: status.currentEngine,
            isUsingCloud: status.isCloud
          }));
        }
      }).catch(console.error);
    }

    return () => {
      if (unsubscribeTranscript) unsubscribeTranscript();
      if (unsubscribeEngineSwitch) unsubscribeEngineSwitch();
    };
  }, [onTranscript]);

  // Audio visualization
  useEffect(() => {
    if (!showVisualizer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      const { audioLevel, noiseFloor, speechDetected } = state.audioMetrics;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw audio level bar
      const level = Math.max(0, Math.min(100, (audioLevel + 100) * 2));
      const barHeight = (level / 100) * canvas.height;
      
      // Color based on speech detection
      ctx.fillStyle = speechDetected ? '#4CAF50' : '#2196F3';
      ctx.fillRect(10, canvas.height - barHeight, 30, barHeight);
      
      // Draw noise floor indicator
      const noiseLevel = Math.max(0, Math.min(100, (noiseFloor + 100) * 2));
      const noiseHeight = (noiseLevel / 100) * canvas.height;
      
      ctx.strokeStyle = '#FF9800';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(5, canvas.height - noiseHeight);
      ctx.lineTo(45, canvas.height - noiseHeight);
      ctx.stroke();
      
      // Draw threshold line
      const thresholdLevel = Math.max(0, Math.min(100, (-50 + 100) * 2));
      const thresholdHeight = (thresholdLevel / 100) * canvas.height;
      
      ctx.strokeStyle = '#f44336';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(5, canvas.height - thresholdHeight);
      ctx.lineTo(45, canvas.height - thresholdHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [showVisualizer, state.audioMetrics]);

  // Voice mode handling
  const handleModeChange = useCallback((mode: EnhancedVoiceMode) => {
    enhancedVoiceService.current.setVoiceMode(mode);
  }, []);

  // Toggle listening with enhanced features
  const handleToggleListening = useCallback(async () => {
    try {
      if (state.isListening) {
        await enhancedVoiceService.current.stopListening();
        if (window.stt) {
          await window.stt.stop().catch(console.warn);
        }
      } else {
        setState(prev => ({ ...prev, error: null }));
        
        // Use enhanced service which will coordinate with base service
        if (state.enhancedMode === 'hybrid' && window.stt) {
          const result = await window.stt.start();
          if (!result.success) {
            throw new Error(result.error || 'Hybrid STT failed to start');
          }
        } else {
          await enhancedVoiceService.current.startListening();
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown voice error';
      setState(prev => ({ ...prev, error: errorMessage, isListening: false }));
      onError?.(errorMessage);
    }
  }, [state.isListening, state.enhancedMode, onError]);

  // Debug panel toggle
  const toggleDebugPanel = useCallback(() => {
    setState(prev => ({ ...prev, showDebugPanel: !prev.showDebugPanel }));
  }, []);

  // Get mode display info
  const getModeDisplayInfo = (mode: EnhancedVoiceMode) => {
    switch (mode) {
      case 'voice-activity': return { icon: '🤖', label: 'Auto Detect' };
      case 'push-to-talk': return { icon: '🎯', label: 'Push-to-Talk' };
      case 'continuous': return { icon: '🔄', label: 'Always On' };
      case 'wake-word': return { icon: '👂', label: 'Wake Word' };
      case 'hybrid': return { icon: '⚡', label: 'Hybrid STT' };
      default: return { icon: '🎤', label: 'Voice' };
    }
  };

  const currentModeInfo = getModeDisplayInfo(state.enhancedMode);

  return (
    <div className={`enhanced-voice-controls ${className}`}>
      {/* Main Voice Interface */}
      <div className="voice-interface-container">
        
        {/* Primary Voice Button */}
        <div className="voice-button-container">
          <button
            className={`enhanced-voice-btn ${state.isListening ? 'listening' : ''} ${state.isSpeaking ? 'speaking' : ''} ${state.circuitBreakerOpen ? 'circuit-breaker-open' : ''}`}
            onClick={handleToggleListening}
            disabled={state.isSpeaking || state.offlineModeEnabled}
            title={`${currentModeInfo.label} - ${state.isListening ? 'Stop' : 'Start'} voice input`}
          >
            <div className="voice-btn-inner">
              <span className="voice-btn-icon">
                {state.offlineModeEnabled ? '🚫' : 
                 state.isListening ? '⏹️' : 
                 state.isSpeaking ? '🔊' : '🎤'}
              </span>
              <span className="voice-btn-mode">{currentModeInfo.icon}</span>
            </div>
            
            {/* Audio level indicator */}
            {state.isListening && (
              <div className="audio-level-ring">
                <div 
                  className="audio-level-fill"
                  style={{
                    height: `${Math.max(10, Math.min(100, (state.audioMetrics.audioLevel + 100) * 2))}%`,
                    backgroundColor: state.audioMetrics.speechDetected ? '#4CAF50' : '#2196F3'
                  }}
                />
              </div>
            )}
          </button>
          
          {/* Confidence indicator */}
          {state.confidence > 0 && (
            <div className="confidence-indicator">
              {Math.round(state.confidence * 100)}%
            </div>
          )}
        </div>

        {/* Mode Selector */}
        <div className="enhanced-mode-selector">
          <div className="mode-dropdown">
            <button className="mode-toggle" title="Change voice mode">
              {currentModeInfo.icon} {currentModeInfo.label} ▼
            </button>
            <div className="mode-options">
              <button 
                className={state.enhancedMode === 'voice-activity' ? 'active' : ''}
                onClick={() => handleModeChange('voice-activity')}
              >
                🤖 Auto Detect
              </button>
              <button 
                className={state.enhancedMode === 'push-to-talk' ? 'active' : ''}
                onClick={() => handleModeChange('push-to-talk')}
              >
                🎯 Push-to-Talk (Space)
              </button>
              <button 
                className={state.enhancedMode === 'continuous' ? 'active' : ''}
                onClick={() => handleModeChange('continuous')}
              >
                🔄 Always Listen
              </button>
              <button 
                className={state.enhancedMode === 'hybrid' ? 'active' : ''}
                onClick={() => handleModeChange('hybrid')}
              >
                ⚡ Hybrid STT
              </button>
            </div>
          </div>
        </div>

        {/* Audio Visualizer */}
        {showVisualizer && (
          <div className="audio-visualizer">
            <canvas 
              ref={canvasRef}
              width={50}
              height={100}
              className="audio-canvas"
            />
            <div className="visualizer-labels">
              <span className="label-speech">🟢 Speech</span>
              <span className="label-noise">🟠 Noise</span>
              <span className="label-threshold">🔴 Threshold</span>
            </div>
          </div>
        )}
      </div>

      {/* Status Row */}
      <div className="voice-status-row">
        {/* STT Engine Indicator (your existing feature) */}
        {state.sttEngine && (
          <div className="stt-indicator">
            <span className={`stt-badge ${state.isUsingCloud ? 'cloud' : 'local'}`}>
              {state.isUsingCloud ? '☁️' : '🏠'} {state.sttEngine.replace('STT', '')}
            </span>
          </div>
        )}

        {/* Voice Status */}
        <div className="voice-status">
          <span className={`status-dot ${
            state.offlineModeEnabled ? 'offline' :
            state.isListening ? 'listening' : 
            state.isSpeaking ? 'speaking' : 
            state.error ? 'error' : 'ready'
          }`}></span>
          <span className="status-text">
            {state.offlineModeEnabled ? 'Offline Mode' :
             state.isListening ? `Listening... (${Math.round(state.recordingDuration / 1000)}s)` : 
             state.isSpeaking ? 'Speaking...' : 
             state.error ? 'Error' : 'Ready'}
          </span>
        </div>

        {/* Audio Metrics Display */}
        <div className="audio-metrics">
          <span className="metric">
            Level: {state.audioMetrics.audioLevel.toFixed(0)}dB
          </span>
          <span className="metric">
            SNR: {state.audioMetrics.snr.toFixed(0)}dB
          </span>
          {state.audioMetrics.speechDetected && (
            <span className="speech-indicator">🟢 Speech</span>
          )}
        </div>

        {/* Debug Panel Toggle */}
        {enableDebugPanel && (
          <button 
            className="debug-toggle"
            onClick={toggleDebugPanel}
            title="Toggle debug panel (Ctrl+Shift+D)"
          >
            🔧
          </button>
        )}
      </div>

      {/* Your existing STT Engine Switching Controls */}
      {state.sttEngine && (
        <div className="stt-controls">
          <button 
            className={`stt-switch ${state.isUsingCloud ? 'active' : ''}`}
            onClick={() => window.stt?.switchToCloud()}
            disabled={state.isListening}
            title="Switch to Cloud STT (Azure/Deepgram)"
          >
            ☁️ Cloud
          </button>
          <button 
            className={`stt-switch ${!state.isUsingCloud ? 'active' : ''}`}
            onClick={() => window.stt?.switchToWhisper()}
            disabled={state.isListening}
            title="Switch to Local Whisper STT"
          >
            🏠 Whisper
          </button>
        </div>
      )}

      {/* Error Display (enhanced) */}
      {state.error && (
        <div className={`voice-error ${state.circuitBreakerOpen ? 'circuit-breaker-error' : ''} ${state.webSpeechFailed ? 'webspeech-failed' : ''}`}>
          <span className="error-icon">
            {state.circuitBreakerOpen ? '🔧' : state.webSpeechFailed ? '🔄' : '⚠️'}
          </span>
          <span className="error-text">{state.error}</span>
          <div className="error-actions">
            {state.circuitBreakerOpen && (
              <button 
                className="error-action reset-circuit-breaker"
                onClick={() => {
                  // Your existing circuit breaker reset logic
                  const voiceInputService = (baseVoiceService.current as any).voiceInputService;
                  if (voiceInputService?.resetCircuitBreaker) {
                    voiceInputService.resetCircuitBreaker();
                  }
                }}
                title="Reset circuit breaker and try again"
              >
                Reset
              </button>
            )}
            <button 
              className="error-dismiss"
              onClick={() => setState(prev => ({ ...prev, error: null }))}
              title="Dismiss error"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      {state.showDebugPanel && state.debugInfo && (
        <div className="voice-debug-panel">
          <div className="debug-header">
            <h4>🔧 Voice Debug Panel</h4>
            <button onClick={toggleDebugPanel}>×</button>
          </div>
          <div className="debug-content">
            <div className="debug-row">
              <span>Mode:</span>
              <span className="debug-value">{state.debugInfo.mode}</span>
            </div>
            <div className="debug-row">
              <span>Listening:</span>
              <span className={`debug-value ${state.debugInfo.isListening ? 'active' : ''}`}>
                {state.debugInfo.isListening ? '🟢' : '🔴'}
              </span>
            </div>
            <div className="debug-row">
              <span>Processing:</span>
              <span className={`debug-value ${state.debugInfo.isProcessing ? 'active' : ''}`}>
                {state.debugInfo.isProcessing ? '🟢' : '🔴'}
              </span>
            </div>
            <div className="debug-row">
              <span>Audio Level:</span>
              <span className="debug-value">{state.debugInfo.metrics.audioLevel.toFixed(1)} dB</span>
            </div>
            <div className="debug-row">
              <span>Noise Floor:</span>
              <span className="debug-value">{state.debugInfo.metrics.noiseFloor.toFixed(1)} dB</span>
            </div>
            <div className="debug-row">
              <span>SNR:</span>
              <span className="debug-value">{state.debugInfo.metrics.snr.toFixed(1)} dB</span>
            </div>
            <div className="debug-row">
              <span>Speech Detected:</span>
              <span className={`debug-value ${state.debugInfo.metrics.speechDetected ? 'active' : ''}`}>
                {state.debugInfo.metrics.speechDetected ? '🟢 Yes' : '🔴 No'}
              </span>
            </div>
            <div className="debug-row">
              <span>Confidence:</span>
              <span className="debug-value">{Math.round(state.debugInfo.metrics.confidence * 100)}%</span>
            </div>
            <div className="debug-row">
              <span>Recording Duration:</span>
              <span className="debug-value">{Math.round(state.debugInfo.recordingDuration / 1000)}s</span>
            </div>
            <div className="debug-row">
              <span>Provider:</span>
              <span className="debug-value">{state.debugInfo.currentProvider}</span>
            </div>
          </div>
        </div>
      )}

      {/* Push-to-Talk Instructions */}
      {state.enhancedMode === 'push-to-talk' && (
        <div className="ptt-instructions">
          Hold <kbd>Space</kbd> to talk or click microphone
        </div>
      )}
    </div>
  );
};

export default EnhancedVoiceControls;
