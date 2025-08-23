import React, { useState, useEffect, useCallback } from 'react';
import { getVoiceService } from '../services/VoiceService';
import '../styles/voice.css';

interface VoiceControlsProps {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  className?: string;
  showTranscript?: boolean;
  showVisualizer?: boolean;
}

interface VoiceState {
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
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  onTranscript,
  onError,
  className = '',
}) => {
  const [state, setState] = useState<VoiceState>({
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
    webSpeechFailed: false
  });

  const voiceService = getVoiceService();

  // Initialize STT listeners and IPC listeners (mic permission, transcripts)
  useEffect(() => {
    let unsubscribeTranscript: undefined | (() => void);
    let unsubscribeEngineSwitch: undefined | (() => void);
    let offMicPermission: undefined | (() => void);

    if (window.stt) {
      // Increase max listeners to prevent warnings
      window.stt.setMaxListeners?.(20);

      // Listen for hybrid STT transcriptions
      unsubscribeTranscript = window.stt.onTranscript(({ text, isFinal }: { text: string; isFinal: boolean }) => {
        console.log('[VoiceControls] Hybrid STT transcript:', { text, isFinal });
        if (isFinal && text.trim()) {
          onTranscript?.(text);
        }
      });

      // Listen for STT engine switches
      unsubscribeEngineSwitch = window.stt.onEngineSwitch((info: { engine: string; isCloud: boolean }) => {
        console.log('[VoiceControls] STT engine switched:', info);
        setState(prev => ({ 
          ...prev, 
          sttEngine: info.engine,
          isUsingCloud: info.isCloud,
          error: null // Clear errors on successful switch
        }));
      });

      // Get initial STT status
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

    // Also listen for hybrid STT state changes and mic permission via voiceIPC
    let offIpcListeningStarted: undefined | (() => void);
    let offIpcListeningStopped: undefined | (() => void);
    let offIpcSttTranscript: undefined | (() => void);
    if (window.voiceIPC) {
      if (typeof window.voiceIPC.onSttTranscript === 'function') {
        window.voiceIPC.onSttTranscript((transcript: { text: string; isFinal: boolean }) => {
          console.log('[VoiceControls] STT transcript via IPC:', transcript);
          if (transcript.isFinal && transcript.text.trim()) {
            onTranscript?.(transcript.text);
          }
        });
        offIpcSttTranscript = () => {}; // Placeholder cleanup
      }

      if (typeof window.voiceIPC.onListeningStarted === 'function') {
        window.voiceIPC.onListeningStarted(() => {
          console.log('[VoiceControls] Voice listening started via IPC');
          setState(prev => ({ ...prev, isListening: true, error: null }));
        });
        offIpcListeningStarted = () => {}; // Placeholder cleanup
      }

      if (typeof window.voiceIPC.onListeningStopped === 'function') {
        window.voiceIPC.onListeningStopped(() => {
          console.log('[VoiceControls] Voice listening stopped via IPC');
          setState(prev => ({ ...prev, isListening: false }));
        });
        offIpcListeningStopped = () => {}; // Placeholder cleanup
      }

      if (typeof window.voiceIPC.onMicPermission === 'function') {
        window.voiceIPC.onMicPermission((data: { granted: boolean }) => {
          if (!data.granted) {
            setState(prev => ({ ...prev, isListening: false, error: 'Microphone permission denied' }));
            onError?.('Microphone permission denied');
          } else {
            // Clear mic-related error if previously shown
            setState(prev => ({ ...prev, error: prev.error?.includes('Microphone') ? null : prev.error }));
          }
        });
        offMicPermission = () => {}; // Placeholder cleanup
      }
    }

    // Cleanup
    return () => {
      if (typeof unsubscribeTranscript === 'function') unsubscribeTranscript();
      if (typeof unsubscribeEngineSwitch === 'function') unsubscribeEngineSwitch();
      if (typeof offMicPermission === 'function') offMicPermission();
      if (typeof offIpcListeningStarted === 'function') offIpcListeningStarted();
      if (typeof offIpcListeningStopped === 'function') offIpcListeningStopped();
      if (typeof offIpcSttTranscript === 'function') offIpcSttTranscript();
    };
  }, [onTranscript, onError]);

  // Set up voice service event listeners  
  useEffect(() => {
    const handleListeningStarted = () => {
      console.log('VoiceControls: Listening started event');
      setState(prev => ({ ...prev, isListening: true, error: null, isSpeaking: false, webSpeechFailed: false }));
    };

    const handleListeningStopped = () => {
      console.log('VoiceControls: Listening stopped event');
      setState(prev => ({ ...prev, isListening: false }));
    };

    const handleTranscription = (result: any) => {
      if (result.isFinal && result.text) {
        onTranscript?.(result.text);
      }
    };

    const handleTTSStarted = () => {
      setState(prev => ({ ...prev, isSpeaking: true }));
    };

    const handleTTSEnded = () => {
      setState(prev => ({ ...prev, isSpeaking: false }));
    };

    const handleError = (error: string) => {
      console.log('VoiceControls: Error event:', error);
      
      // Check if this is a Web Speech API failure
      if (error.includes('network') || error.includes('Speech recognition')) {
        setState(prev => ({ 
          ...prev, 
          webSpeechFailed: true,
          error: 'Web Speech failed - Hybrid STT will take over',
          isListening: false, 
          isSpeaking: false 
        }));
        
        // Automatically start hybrid STT after Web Speech failure
        setTimeout(() => {
          if (window.stt) {
            console.log('VoiceControls: Starting Hybrid STT after Web Speech failure');
            window.stt.start().catch(console.error);
          }
        }, 1000);
      } else {
        setState(prev => ({ ...prev, error, isListening: false, isSpeaking: false }));
      }
      
      onError?.(error);
    };

    const handleOfflineModeEnabled = (message: string) => {
      console.log('VoiceControls: Offline mode enabled:', message);
      setState(prev => ({ 
        ...prev, 
        offlineModeEnabled: true, 
        circuitBreakerOpen: true,
        error: message,
        isListening: false, 
        isSpeaking: false 
      }));
    };

    const handleCircuitBreakerReset = (message: string) => {
      console.log('VoiceControls: Circuit breaker reset:', message);
      setState(prev => ({ 
        ...prev, 
        offlineModeEnabled: false, 
        circuitBreakerOpen: false,
        error: null
      }));
    };

    voiceService.on('listening-started', handleListeningStarted);
    voiceService.on('listening-stopped', handleListeningStopped);
    voiceService.on('transcription', handleTranscription);
    voiceService.on('tts-started', handleTTSStarted);
    voiceService.on('tts-ended', handleTTSEnded);
    voiceService.on('voice-input-error', handleError);
    voiceService.on('tts-error', handleError);
    voiceService.on('offline-mode-enabled', handleOfflineModeEnabled);
    voiceService.on('circuit-breaker-reset', handleCircuitBreakerReset);

    return () => {
      voiceService.off('listening-started', handleListeningStarted);
      voiceService.off('listening-stopped', handleListeningStopped);
      voiceService.off('transcription', handleTranscription);
      voiceService.off('tts-started', handleTTSStarted);
      voiceService.off('tts-ended', handleTTSEnded);
      voiceService.off('voice-input-error', handleError);
      voiceService.off('tts-error', handleError);
      voiceService.off('offline-mode-enabled', handleOfflineModeEnabled);
      voiceService.off('circuit-breaker-reset', handleCircuitBreakerReset);
    };
  }, [voiceService, onTranscript, onError]);

  const handleToggleListening = useCallback(async () => {
    try {
      if (state.isListening) {
        console.log('VoiceControls: Stopping listening...');
        
        // Stop both Web Speech (legacy) and Hybrid STT
        await voiceService.stopListening().catch(console.warn);
        if (window.stt) {
          await window.stt.stop().catch(console.warn);
        }
        
        setTimeout(() => {
          setState(prev => ({ ...prev, isListening: false, error: null }));
        }, 100);
      } else {
        console.log('VoiceControls: Starting listening...');
        setState(prev => ({ ...prev, error: null }));
        
        // USE HYBRID STT AS PRIMARY METHOD
        if (window.stt) {
          console.log('VoiceControls: Starting Hybrid STT (production method)');
          const result = await window.stt.start();
          if (!result.success) {
            throw new Error(result.error || 'Hybrid STT failed to start - check cloud API keys or Whisper installation');
          }
          // Don't set listening state manually - let hybrid STT events handle it
        } else {
          throw new Error('Hybrid STT system not available. Please check configuration and restart Luna Agent.');
        }
      }
    } catch (error) {
      console.error('Voice toggle error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown voice error';
      setState(prev => ({ 
        ...prev, 
        error: errorMessage, 
        isListening: false, 
        isSpeaking: false 
      }));
      onError?.(errorMessage);
    }
  }, [state.isListening, voiceService, onError]);

  const switchToCloud = useCallback(async () => {
    try {
      if (window.stt) {
        const result = await window.stt.switchToCloud();
        if (result.success) {
          setState(prev => ({ 
            ...prev, 
            sttEngine: 'CloudSTT', 
            isUsingCloud: true,
            error: null,
            webSpeechFailed: false
          }));
        } else {
          throw new Error(result.error || 'Failed to switch to cloud STT');
        }
      }
    } catch (error) {
      console.error('Error switching to cloud STT:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMessage }));
      onError?.(errorMessage);
    }
  }, [onError]);

  const switchToWhisper = useCallback(async () => {
    try {
      if (window.stt) {
        const result = await window.stt.switchToWhisper();
        if (result.success) {
          setState(prev => ({ 
            ...prev, 
            sttEngine: 'WhisperSTT', 
            isUsingCloud: false,
            error: null 
          }));
        } else {
          throw new Error(result.error || 'Failed to switch to Whisper STT');
        }
      }
    } catch (error) {
      console.error('Error switching to Whisper STT:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, error: errorMessage }));
      onError?.(errorMessage);
    }
  }, [onError]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const resetCircuitBreaker = useCallback(async () => {
    try {
      console.log('VoiceControls: Manually resetting circuit breaker');
      // Access VoiceInputService through VoiceService
      const voiceInputService = (voiceService as any).voiceInputService;
      if (voiceInputService && voiceInputService.resetCircuitBreaker) {
        voiceInputService.resetCircuitBreaker();
      }
    } catch (error) {
      console.error('Error resetting circuit breaker:', error);
    }
  }, [voiceService]);

  // Force reset function for stuck states
  const forceReset = useCallback(() => {
    console.log('VoiceControls: Force reset triggered');
    setState(prev => ({
      ...prev,
      isListening: false,
      isSpeaking: false,
      error: null,
      webSpeechFailed: false
    }));
    try {
      voiceService.stopListening();
      if (window.stt) {
        window.stt.stop();
      }
    } catch (error) {
      console.error('Error during force reset:', error);
    }
  }, [voiceService]);

  return (
    <div className={`voice-controls ${className}`}>
      {/* Main Control Button */}
      <button
        className={`voice-btn ${state.isListening ? 'listening' : ''} ${state.isSpeaking ? 'speaking' : ''} ${state.circuitBreakerOpen ? 'circuit-breaker-open' : ''}`}
        onClick={handleToggleListening}
        disabled={state.isSpeaking || state.offlineModeEnabled}
        title={
          state.offlineModeEnabled 
            ? 'Voice recognition temporarily disabled (circuit breaker open)'
            : state.isListening ? 'Stop listening' 
            : 'Start voice input'
        }
        onDoubleClick={forceReset}
      >
        <span className="voice-btn-icon">
          {state.offlineModeEnabled ? '🚫' : state.isListening ? '⏹️' : state.isSpeaking ? '🔊' : '🎤'}
        </span>
        <span className="voice-btn-text">
          {state.offlineModeEnabled ? 'Offline' : state.isListening ? 'Stop' : state.isSpeaking ? 'Speaking' : 'Voice'}
        </span>
      </button>

      {/* STT Engine Indicator */}
      {state.sttEngine && (
        <div className="stt-indicator">
          <span className={`stt-badge ${state.isUsingCloud ? 'cloud' : 'local'}`}>
            {state.isUsingCloud ? '☁️' : '🏠'} {state.sttEngine.replace('STT', '')}
          </span>
        </div>
      )}

      {/* Status Indicator */}
      <div className="voice-status">
        <span className={`status-dot ${
          state.offlineModeEnabled ? 'offline' :
          state.isListening ? 'listening' : 
          state.isSpeaking ? 'speaking' : 
          state.error ? 'error' : 'ready'
        }`}></span>
        <span className="status-text">
          {state.offlineModeEnabled ? 'Offline Mode' :
           state.isListening ? 'Listening...' : 
           state.isSpeaking ? 'Speaking...' : 
           state.error ? 'Error' : 'Ready'}
        </span>
      </div>

      {/* STT Engine Switching Controls */}
      {state.sttEngine && (
        <div className="stt-controls">
          <button 
            className={`stt-switch ${state.isUsingCloud ? 'active' : ''}`}
            onClick={switchToCloud}
            disabled={state.isListening}
            title="Switch to Cloud STT (Azure/Deepgram)"
          >
            ☁️ Cloud
          </button>
          <button 
            className={`stt-switch ${!state.isUsingCloud ? 'active' : ''}`}
            onClick={switchToWhisper}
            disabled={state.isListening}
            title="Switch to Local Whisper STT"
          >
            🏠 Whisper
          </button>
        </div>
      )}

      {/* Error Display */}
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
                onClick={resetCircuitBreaker}
                title="Reset circuit breaker and try again"
              >
                Reset
              </button>
            )}
            {state.webSpeechFailed && (
              <span className="error-help" title="Web Speech API failed - using Hybrid STT instead">
                Using backup STT
              </span>
            )}
            <button 
              className="error-dismiss"
              onClick={clearError}
              title="Dismiss error"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceControls;